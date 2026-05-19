#!/usr/bin/env node
/**
 * Test SSE /api/watch endpoint
 * Usage: node test-watch-sse.mjs [domain]
 */

import { EventSource } from 'eventsource';

const domain = process.argv[2] || 'stripe.com';
const url = `http://localhost:3001/api/watch?domain=${encodeURIComponent(domain)}`;

console.log(`Testing /api/watch SSE endpoint...`);
console.log(`Domain: ${domain}`);
console.log(`URL: ${url}\n`);

let eventCount = 0;

const es = new EventSource(url);

es.onopen = () => {
  console.log('✓ SSE connection established\n');
};

es.onmessage = (e) => {
  try {
    const event = JSON.parse(e.data);

    if (event.type === 'watch-start') {
      console.log('📡 Watch started');
      console.log(`   Domain: ${event.domain}`);
      console.log(`   Timestamp: ${event.timestamp}\n`);
    } else if (event.type === 'mention') {
      eventCount++;
      console.log(`[Mention #${eventCount}]`);
      console.log(`   Source: ${event.source}`);
      console.log(`   Title: ${event.title}`);
      console.log(`   Snippet: ${event.snippet.substring(0, 60)}...`);
      console.log(`   Sentiment: ${event.sentiment}`);
      console.log(`   URL: ${event.url}`);
      console.log('');
    }
  } catch (err) {
    console.error('Failed to parse event:', err);
  }
};

es.onerror = (err) => {
  console.error('SSE error:', err.message || 'connection failed');
  es.close();
  process.exit(1);
};

// Auto-stop after 20 seconds
setTimeout(() => {
  console.log(`\nTest complete! Received ${eventCount} mentions.`);
  console.log('Closing connection...');
  es.close();
  process.exit(0);
}, 20000);

console.log('Listening for events (20s test)...\n');
