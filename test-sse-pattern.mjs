#!/usr/bin/env node
/**
 * Test adapter with exact SSE server usage pattern
 */

import { createClaudeClient } from './claude-adapter.mjs';

async function testSSEPattern() {
  console.log('=== Testing SSE Server Pattern ===');
  console.log('USE_CLAUDE_CLI:', process.env.USE_CLAUDE_CLI || 'unset');

  const anthropic = createClaudeClient();

  try {
    // Match exact pattern from sse-server.mjs synthesizeWithClaude()
    const stream = await anthropic.messages.stream({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 500,
      system: 'You are an analyst. Output JSON.',
      messages: [{ role: 'user', content: 'Say {"ok":true}' }]
    });

    let accumulatedText = '';
    let tokenCount = 0;

    // Exact pattern from L1233-1257
    for await (const chunk of stream) {
      if (chunk.type === 'content_block_delta' && chunk.delta?.type === 'text_delta') {
        const delta = chunk.delta.text;
        accumulatedText += delta;
        tokenCount++;
      }
    }

    // Get final message with usage stats (L1260)
    const finalMessage = await stream.finalMessage();
    const usage = finalMessage.usage;

    console.log('Accumulated:', accumulatedText.substring(0, 100));
    console.log('Tokens:', tokenCount);
    console.log('Usage:', usage);
    console.log('Stop reason:', finalMessage.stop_reason);

    if (usage && usage.input_tokens && usage.output_tokens && finalMessage.stop_reason) {
      console.log('✓ SSE pattern test passed');
      return true;
    } else {
      console.error('✗ Missing usage fields');
      return false;
    }
  } catch (err) {
    console.error('✗ Test failed:', err.message);
    console.error(err.stack);
    return false;
  }
}

testSSEPattern().then(ok => process.exit(ok ? 0 : 1));
