/**
 * Claude Adapter - Runtime switch between Anthropic SDK and Claude CLI
 *
 * Usage:
 *   process.env.USE_CLAUDE_CLI='on'  → Route through `claude` CLI (Max OAuth, $0 cost)
 *   process.env.USE_CLAUDE_CLI='off' → Route through Anthropic SDK (API key, normal cost)
 *   unset                              → Default to SDK
 */

import Anthropic from '@anthropic-ai/sdk';
import { spawn } from 'child_process';
import { EventEmitter } from 'events';

/**
 * Map SDK model names to CLI model flags
 */
function mapModelToCLI(sdkModel) {
  if (!sdkModel) return 'sonnet';

  const lower = sdkModel.toLowerCase();
  if (lower.includes('opus')) return 'opus';
  if (lower.includes('haiku')) return 'haiku';
  if (lower.includes('sonnet')) return 'sonnet';

  // Default to sonnet for unknown models
  return 'sonnet';
}

/**
 * Build CLI arguments from SDK message.create() options
 */
function buildCLIArgs(opts) {
  const args = [
    '-p',  // print mode (non-interactive)
    '--output-format', 'stream-json',
    '--verbose',
    '--include-partial-messages',  // Get streaming deltas
    '--tools', '',  // Disable all tools for synthesis tasks
    // Note: NOT using --bare because it disables OAuth authentication
  ];

  // Model mapping
  if (opts.model) {
    args.push('--model', mapModelToCLI(opts.model));
  }

  // System prompt
  if (opts.system) {
    args.push('--system-prompt', opts.system);
  }

  // Note: CLI doesn't support --max-tokens, it uses effort levels instead
  // We omit this to use CLI defaults

  return args;
}

/**
 * Extract user message content from SDK messages array
 */
function extractPrompt(messages) {
  if (!messages || !messages.length) return '';

  // Find the user message (typically the last one)
  const userMsg = messages.find(m => m.role === 'user') || messages[messages.length - 1];

  if (!userMsg || !userMsg.content) return '';

  // Content can be string or array of content blocks
  if (typeof userMsg.content === 'string') {
    return userMsg.content;
  }

  if (Array.isArray(userMsg.content)) {
    return userMsg.content
      .filter(block => block.type === 'text')
      .map(block => block.text)
      .join('\n');
  }

  return '';
}

/**
 * CLI-based streaming implementation
 * Returns an async iterable that emits SDK-compatible chunks
 */
class CLIStream {
  constructor(opts) {
    this.opts = opts;
    this.chunks = [];
    this.finalMsg = null;
    this.emitter = new EventEmitter();
    this.accumulatedText = '';
    this.usage = {
      input_tokens: 0,
      output_tokens: 0,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
    };
    this.stopReason = 'end_turn';
    this.started = false;
    this.done = false;
  }

  async start() {
    if (this.started) return;
    this.started = true;

    const args = buildCLIArgs(this.opts);
    const prompt = extractPrompt(this.opts.messages);

    return new Promise((resolve, reject) => {
      const proc = spawn('claude', args, {
        env: { ...process.env },
      });

      let buffer = '';
      let lineCount = 0;
      let resultReceived = false;

      proc.stdout.on('data', (chunk) => {
        buffer += chunk.toString();
        const lines = buffer.split('\n');

        // Keep the last incomplete line in the buffer
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim()) continue;
          lineCount++;

          try {
            const parsed = JSON.parse(line);

            // CLI wraps SDK events in {"type":"stream_event","event":{...}}
            // Extract the inner event
            let event = parsed;
            if (parsed.type === 'stream_event' && parsed.event) {
              event = parsed.event;
            }

            // Parse different event types
            if (event.type === 'content_block_delta') {
              // Text delta from streaming - check for text_delta type
              if (event.delta?.type === 'text_delta' && event.delta.text) {
                const delta = event.delta.text;
                this.accumulatedText += delta;
                this.chunks.push({
                  type: 'content_block_delta',
                  delta: { type: 'text_delta', text: delta }
                });
                this.emitter.emit('chunk', {
                  type: 'content_block_delta',
                  delta: { type: 'text_delta', text: delta }
                });
              }
            } else if (event.type === 'message_delta' && event.delta) {
              // Message delta with stop_reason
              if (event.delta.stop_reason) {
                this.stopReason = event.delta.stop_reason;
              }
              // Also update usage if present
              if (event.usage) {
                this.usage = {
                  input_tokens: event.usage.input_tokens || this.usage.input_tokens,
                  output_tokens: event.usage.output_tokens || this.usage.output_tokens,
                  cache_creation_input_tokens: event.usage.cache_creation_input_tokens || 0,
                  cache_read_input_tokens: event.usage.cache_read_input_tokens || 0,
                };
              }
            } else if (parsed.type === 'assistant' && parsed.message) {
              // Final message snapshot from CLI (type "assistant" is top-level, not wrapped in stream_event)
              const msg = parsed.message;

              // Build content array from message content blocks (skip thinking blocks)
              const textContent = msg.content?.filter(block => block.type === 'text') || [];
              if (textContent.length > 0) {
                this.accumulatedText = textContent.map(b => b.text).join('');
              }

              this.stopReason = msg.stop_reason || this.stopReason;

              if (msg.usage) {
                this.usage = {
                  input_tokens: msg.usage.input_tokens || 0,
                  output_tokens: msg.usage.output_tokens || 0,
                  cache_creation_input_tokens: msg.usage.cache_creation_input_tokens || 0,
                  cache_read_input_tokens: msg.usage.cache_read_input_tokens || 0,
                };
              }

              this.finalMsg = {
                content: [{ type: 'text', text: this.accumulatedText }],
                usage: this.usage,
                stop_reason: this.stopReason,
                model: this.opts.model,
                role: 'assistant',
              };
            } else if (event.type === 'message_stop') {
              // Stream is complete - finalize message
              if (!this.finalMsg) {
                this.finalMsg = {
                  content: [{ type: 'text', text: this.accumulatedText }],
                  usage: this.usage,
                  stop_reason: this.stopReason,
                  model: this.opts.model,
                  role: 'assistant',
                };
              }
            } else if (parsed.type === 'result') {
              // Session result with final usage (top-level)
              if (parsed.usage) {
                this.usage = {
                  input_tokens: parsed.usage.input_tokens || this.usage.input_tokens,
                  output_tokens: parsed.usage.output_tokens || this.usage.output_tokens,
                  cache_creation_input_tokens: parsed.usage.cache_creation_input_tokens || 0,
                  cache_read_input_tokens: parsed.usage.cache_read_input_tokens || 0,
                };

                if (this.finalMsg) {
                  this.finalMsg.usage = this.usage;
                }
              }

              // Result event signals completion - kill the CLI process
              resultReceived = true;
              proc.kill('SIGTERM');
            }
          } catch (err) {
            // Skip invalid JSON lines (hooks, debug output)
            if (lineCount < 20) {
              // Only log parse errors for first few lines (debugging)
              console.error('[claude-adapter] JSON parse error:', err.message, 'line:', line.substring(0, 100));
            }
          }
        }
      });

      let stderrBuffer = '';
      proc.stderr.on('data', (chunk) => {
        const text = chunk.toString();
        stderrBuffer += text;
        // Log errors and important messages
        if (text.includes('ERROR') || text.includes('FATAL') || text.includes('Not logged in')) {
          console.error('[claude-adapter] CLI stderr:', text.trim());
        }
      });

      proc.on('close', (code) => {
        if (code !== 0 && code !== 143 && !resultReceived) {  // 143 = SIGTERM, allow clean exit after result
          const errMsg = stderrBuffer ? stderrBuffer.substring(0, 500) : 'unknown error';
          reject(new Error(`Claude CLI exited with code ${code}: ${errMsg}`));
        } else {
          // Build final message if not already set
          if (!this.finalMsg) {
            this.finalMsg = {
              content: [{ type: 'text', text: this.accumulatedText }],
              usage: this.usage,
              stop_reason: this.stopReason,
              model: this.opts.model,
              role: 'assistant',
            };
          }
          this.done = true;
          this.emitter.emit('done');
          resolve();
        }
      });

      proc.on('error', (err) => {
        reject(new Error(`Claude CLI spawn error: ${err.message}`));
      });

      // Send prompt via stdin
      proc.stdin.write(prompt);
      proc.stdin.end();
    });
  }

  // Async iterator interface for `for await (const chunk of stream)`
  async *[Symbol.asyncIterator]() {
    await this.start();

    let index = 0;
    const getNextChunk = () => {
      return new Promise((resolve) => {
        // If already done and no more chunks, return null immediately
        if (this.done && index >= this.chunks.length) {
          resolve(null);
          return;
        }

        if (index < this.chunks.length) {
          resolve(this.chunks[index++]);
        } else if (this.done) {
          // Done but check if new chunks arrived
          if (index < this.chunks.length) {
            resolve(this.chunks[index++]);
          } else {
            resolve(null);
          }
        } else {
          // Wait for either a new chunk or done event
          const handler = (chunk) => {
            this.emitter.off('done', doneHandler);
            resolve(chunk);
            index++;
          };
          const doneHandler = () => {
            this.emitter.off('chunk', handler);
            // Check if there are any unprocessed chunks
            if (index < this.chunks.length) {
              resolve(this.chunks[index++]);
            } else {
              resolve(null);
            }
          };
          this.emitter.once('chunk', handler);
          this.emitter.once('done', doneHandler);
        }
      });
    };

    while (true) {
      const chunk = await getNextChunk();
      if (!chunk) break;
      yield chunk;
    }
  }

  async finalMessage() {
    await this.start();

    // If already done, return immediately
    if (this.done) {
      return this.finalMsg || {
        content: [{ type: 'text', text: this.accumulatedText }],
        usage: this.usage,
        stop_reason: this.stopReason,
        model: this.opts.model,
        role: 'assistant',
      };
    }

    return new Promise((resolve) => {
      if (this.finalMsg && this.done) {
        resolve(this.finalMsg);
      } else {
        this.emitter.once('done', () => {
          resolve(this.finalMsg || {
            content: [{ type: 'text', text: this.accumulatedText }],
            usage: this.usage,
            stop_reason: this.stopReason,
            model: this.opts.model,
            role: 'assistant',
          });
        });
      }
    });
  }
}

/**
 * CLI-based non-streaming implementation
 */
async function cliCreate(opts) {
  const stream = new CLIStream(opts);
  await stream.start();
  return stream.finalMsg || {
    content: [{ type: 'text', text: stream.accumulatedText }],
    usage: stream.usage,
    stop_reason: stream.stopReason,
    model: opts.model,
    role: 'assistant',
  };
}

// ───────────────────────────────────────────────────────────────
// CLI Token-Budget Queue
//
// Max OAuth caps output at ~8,000 tokens/minute. Parallel synthesis
// bursts trip 429s instantly. This queue tracks sliding 60sec window
// of OUTPUT tokens (reserved estimates + reconciled actuals) and gates
// new requests until budget is available.
// ───────────────────────────────────────────────────────────────
const CLI_OUTPUT_BUDGET = parseInt(process.env.CLI_OUTPUT_BUDGET || '7000', 10);
const CLI_WINDOW_MS = 60_000;
const cliWindow = []; // [{ ts, tokens }]

function windowTotal() {
  const cutoff = Date.now() - CLI_WINDOW_MS;
  while (cliWindow.length && cliWindow[0].ts < cutoff) cliWindow.shift();
  return cliWindow.reduce((s, r) => s + r.tokens, 0);
}

function estimateOutput(opts) {
  if (opts?.max_tokens && opts.max_tokens > 0) return Math.min(opts.max_tokens, 8000);
  return 4000;
}

async function waitForBudget(estimate, label = '') {
  const startWait = Date.now();
  const FALLBACK_THRESHOLD_MS = 30000; // 30s wait triggers fallback

  while (true) {
    const used = windowTotal();
    if (used + estimate <= CLI_OUTPUT_BUDGET) return 'cli';

    // Check if we've been waiting too long or queue depth > 1
    const waitedMs = Date.now() - startWait;
    if (waitedMs > FALLBACK_THRESHOLD_MS) {
      console.warn(`[cli-queue] ${label} waited ${waitedMs}ms — falling back to Anthropic SDK API`);
      return 'api-fallback';
    }

    const oldest = cliWindow[0];
    if (!oldest) return 'cli';
    const waitMs = Math.max(250, (oldest.ts + CLI_WINDOW_MS) - Date.now() + 100);
    console.log(`[cli-queue] ${label} waiting ${waitMs}ms (${waitedMs}ms elapsed) — used ${used}/${CLI_OUTPUT_BUDGET} + reserve ${estimate}`);
    await new Promise(r => setTimeout(r, Math.min(waitMs, 5000)));
  }
}

function reserveSlot(tokens) {
  const slot = { ts: Date.now(), tokens };
  cliWindow.push(slot);
  return slot;
}

function reconcileSlot(slot, actualOutputTokens) {
  if (!slot) return;
  slot.tokens = actualOutputTokens > 0 ? actualOutputTokens : slot.tokens;
}

async function queuedCliCreate(opts) {
  const estimate = estimateOutput(opts);
  const backend = await waitForBudget(estimate, 'create');

  if (backend === 'api-fallback') {
    // Fall back to Anthropic SDK
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error('CLI queue timeout but ANTHROPIC_API_KEY not set — cannot fallback to API');
    }
    console.log('[cli-queue] Using Anthropic SDK API fallback');
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const result = await anthropic.messages.create(opts);
    // Mark this call as using API (for cost tracking)
    if (result) result._backend = 'api';
    return result;
  }

  // Use CLI
  const slot = reserveSlot(estimate);
  try {
    const result = await cliCreate(opts);
    reconcileSlot(slot, result?.usage?.output_tokens || 0);
    if (result) result._backend = 'cli';
    return result;
  } catch (err) {
    reconcileSlot(slot, 100);
    throw err;
  }
}

class QueuedCLIStream {
  constructor(opts) {
    this.opts = opts;
    this.estimate = estimateOutput(opts);
    this.inner = null;
    this.slot = null;
    this._ready = null;
    this.backend = null;
    this.apiStream = null;
  }
  async _prep() {
    if (this._ready) return this._ready;
    this._ready = (async () => {
      this.backend = await waitForBudget(this.estimate, 'stream');
      if (this.backend === 'api-fallback') {
        // Fall back to Anthropic SDK streaming
        if (!process.env.ANTHROPIC_API_KEY) {
          throw new Error('CLI queue timeout but ANTHROPIC_API_KEY not set — cannot fallback to API');
        }
        console.log('[cli-queue] Using Anthropic SDK API fallback (streaming)');
        const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
        this.apiStream = await anthropic.messages.stream(this.opts);
      } else {
        this.slot = reserveSlot(this.estimate);
        this.inner = new CLIStream(this.opts);
      }
    })();
    return this._ready;
  }
  async finalMessage() {
    await this._prep();
    if (this.backend === 'api-fallback') {
      const msg = await this.apiStream.finalMessage();
      if (msg) msg._backend = 'api';
      return msg;
    }
    await this.inner.start();
    reconcileSlot(this.slot, this.inner.usage?.output_tokens || 0);
    const msg = this.inner.finalMsg || {
      content: [{ type: 'text', text: this.inner.accumulatedText }],
      usage: this.inner.usage,
      stop_reason: this.inner.stopReason,
      model: this.opts.model,
      role: 'assistant',
    };
    if (msg) msg._backend = 'cli';
    return msg;
  }
  on(event, handler) {
    this._prep().then(() => {
      if (this.backend === 'api-fallback') {
        this.apiStream.on(event, handler);
      } else {
        this.inner.emitter.on(event, handler);
      }
    });
    return this;
  }
  async *[Symbol.asyncIterator]() {
    await this._prep();
    if (this.backend === 'api-fallback') {
      for await (const chunk of this.apiStream) {
        yield chunk;
      }
      return;
    }
    const startPromise = this.inner.start();
    const emitter = this.inner.emitter;
    const queue = [];
    let resolve;
    let done = false;
    const onChunk = (c) => { queue.push(c); if (resolve) { resolve(); resolve = null; } };
    emitter.on('chunk', onChunk);
    startPromise.then(() => { done = true; if (resolve) { resolve(); resolve = null; } });
    while (true) {
      if (queue.length) { yield queue.shift(); continue; }
      if (done) break;
      await new Promise(r => { resolve = r; });
    }
    reconcileSlot(this.slot, this.inner.usage?.output_tokens || 0);
  }
}

/**
 * Create Claude client with runtime routing
 */
export function createClaudeClient() {
  const useCLI = process.env.USE_CLAUDE_CLI === 'on';

  if (!useCLI) {
    if (!process.env.ANTHROPIC_API_KEY) {
      console.warn('[claude-adapter] SDK mode but ANTHROPIC_API_KEY not set — API calls will fail');
    }
    return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }

  console.log(`[claude-adapter] CLI queue active — budget ${CLI_OUTPUT_BUDGET} output tok/${CLI_WINDOW_MS/1000}s`);

  return {
    messages: {
      async create(opts) {
        return queuedCliCreate(opts);
      },

      stream(opts) {
        return new QueuedCLIStream(opts);
      }
    }
  };
}

/**
 * Calculate cost - returns 0 when using CLI, real cost when using API fallback
 * @param {Object} usage - Usage object with input_tokens, output_tokens
 * @param {string} model - Model name
 * @param {Object} response - Full response object (may have _backend marker)
 */
export function calculateClaudeCost(usage, model = 'claude-sonnet-4-6', response = null) {
  // Check if this specific call used API fallback
  if (response && (response._backend === 'api' || response.backend === 'api')) {
    // Real cost for API fallback
    if (!usage || !usage.input_tokens || !usage.output_tokens) return 0.50; // fallback estimate

    const inputTokens = usage.input_tokens;
    const outputTokens = usage.output_tokens;

    let inputCostPerMTok = 3.0;
    let outputCostPerMTok = 15.0;

    if (model.includes('haiku')) {
      inputCostPerMTok = 0.25;
      outputCostPerMTok = 1.25;
    }

    const inputCost = (inputTokens / 1_000_000) * inputCostPerMTok;
    const outputCost = (outputTokens / 1_000_000) * outputCostPerMTok;

    return parseFloat((inputCost + outputCost).toFixed(4));
  }

  // Zero cost when using CLI (default in CLI mode)
  if (process.env.USE_CLAUDE_CLI === 'on') {
    return 0;
  }

  // SDK mode - normal cost
  if (!usage || !usage.input_tokens || !usage.output_tokens) return 0.50; // fallback estimate

  const inputTokens = usage.input_tokens;
  const outputTokens = usage.output_tokens;

  let inputCostPerMTok = 3.0;
  let outputCostPerMTok = 15.0;

  if (model.includes('haiku')) {
    inputCostPerMTok = 0.25;
    outputCostPerMTok = 1.25;
  }

  const inputCost = (inputTokens / 1_000_000) * inputCostPerMTok;
  const outputCost = (outputTokens / 1_000_000) * outputCostPerMTok;

  return parseFloat((inputCost + outputCost).toFixed(4));
}
