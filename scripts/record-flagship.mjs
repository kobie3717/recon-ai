#!/usr/bin/env node
/**
 * record-flagship.mjs
 *
 * Records SSE event streams from RECON's /api/report endpoint for flagship domains.
 * Creates pre-cached event sequences for demo runs without burning BD credits.
 *
 * Usage: node scripts/record-flagship.mjs [--force]
 */

import { EventSource } from 'eventsource';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE_URL = 'http://localhost:3001';
const CACHE_DIR = path.join(__dirname, '../cache/flagship');
const FORCE = process.argv.includes('--force');

const FLAGSHIP = [
  { domain: 'brightdata.com', mode: 'standard' },
  { domain: 'lablab.ai', mode: 'standard' },
  { domain: 'stripe.com', mode: 'standard' },
  { domain: 'openai.com', mode: 'standard' },
  { domain: 'anthropic.com', mode: 'standard' },
  // P1: cache flagship runs for newly real-BD modes so demo is instant
  { domain: 'stripe.com', mode: 'redteam' },
  { domain: 'stripe.com', mode: 'seo' },
  { domain: 'anthropic.com', mode: 'redteam' },
  { domain: 'anthropic.com', mode: 'seo' },
  { domain: 'Dario Amodei', mode: 'person' },
];

/**
 * Record a single domain's SSE event stream
 */
async function recordDomain(domain, mode) {
  const filename = `${domain}-${mode}.json`;
  const filepath = path.join(CACHE_DIR, filename);

  // Skip if already recorded (unless --force)
  if (!FORCE && fs.existsSync(filepath)) {
    console.log(`[skip] ${domain}/${mode}: already recorded (use --force to overwrite)`);
    return { status: 'skipped', domain, mode };
  }

  return new Promise((resolve) => {
    const events = [];
    const startTime = Date.now();
    let eventCount = 0;
    let hasError = false;
    let recordedAt = new Date().toISOString();

    // Bypass in-memory + flagship cache for fresh recording
    const url = `${BASE_URL}/api/report?domain=${encodeURIComponent(domain)}&mode=${mode}&nocache=1&t=${Date.now()}`;

    console.log(`[record] ${domain}/${mode}: connecting...`);

    const es = new EventSource(url);

    // Record all data events
    es.addEventListener('message', (e) => {
      try {
        const data = JSON.parse(e.data);
        const ts = Date.now() - startTime;

        events.push({
          event: 'message',
          data,
          ts
        });

        eventCount++;

        // Stop on final report or error
        if (data.type === 'report') {
          console.log(`[record] ${domain}/${mode}: received final report`);
          es.close();

          // Save recording
          const recording = {
            domain,
            mode,
            recordedAt,
            eventCount: events.length,
            duration: ts,
            events
          };

          fs.writeFileSync(filepath, JSON.stringify(recording, null, 2));
          console.log(`[record] ${domain}/${mode}: ${events.length} events, ${(ts/1000).toFixed(1)}s, status=ok`);

          resolve({ status: 'ok', domain, mode, eventCount: events.length, duration: ts });
        } else if (data.type === 'error') {
          console.error(`[record] ${domain}/${mode}: error event received: ${data.message}`);
          hasError = true;
          es.close();
          resolve({ status: 'error', domain, mode, error: data.message });
        }
      } catch (err) {
        console.error(`[record] ${domain}/${mode}: parse error:`, err.message);
      }
    });

    es.addEventListener('error', (err) => {
      console.error(`[record] ${domain}/${mode}: connection error`);
      es.close();
      if (!hasError) {
        resolve({ status: 'error', domain, mode, error: 'connection failed' });
      }
    });

    // Timeout after 3 minutes
    setTimeout(() => {
      if (es.readyState !== EventSource.CLOSED) {
        console.error(`[record] ${domain}/${mode}: timeout after 180s`);
        es.close();
        resolve({ status: 'error', domain, mode, error: 'timeout' });
      }
    }, 280000);
  });
}

/**
 * Main recording loop
 */
async function main() {
  console.log(`RECON Flagship Recorder`);
  console.log(`Base URL: ${BASE_URL}`);
  console.log(`Cache dir: ${CACHE_DIR}`);
  console.log(`Force overwrite: ${FORCE}`);
  console.log('');

  // Ensure cache directory exists
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  }

  const results = [];

  for (const { domain, mode } of FLAGSHIP) {
    try {
      const result = await recordDomain(domain, mode);
      results.push(result);

      // Small delay between recordings
      if (result.status !== 'skipped') {
        await new Promise(r => setTimeout(r, 2000));
      }
    } catch (err) {
      console.error(`[record] ${domain}/${mode}: unexpected error:`, err.message);
      results.push({ status: 'error', domain, mode, error: err.message });
    }
  }

  // Summary
  console.log('');
  console.log('=== Recording Summary ===');
  const ok = results.filter(r => r.status === 'ok').length;
  const skipped = results.filter(r => r.status === 'skipped').length;
  const errors = results.filter(r => r.status === 'error').length;

  console.log(`OK: ${ok}`);
  console.log(`Skipped: ${skipped}`);
  console.log(`Errors: ${errors}`);

  if (errors > 0) {
    console.log('');
    console.log('Failed recordings:');
    results.filter(r => r.status === 'error').forEach(r => {
      console.log(`  - ${r.domain}/${r.mode}: ${r.error}`);
    });
  }

  process.exit(errors > 0 ? 1 : 0);
}

main();
