#!/usr/bin/env node
/**
 * Test script for Watch Mode / Data Firehose
 */

import { dataFirehose } from './bright-data-connector.mjs';

console.log('Testing Data Firehose (mock mode)...\n');

let eventCount = 0;

const stopFn = dataFirehose('stripe.com', (event) => {
  eventCount++;
  console.log(`[Event #${eventCount}]`);
  console.log(`  Source: ${event.source} ${sourceIcon(event.source)}`);
  console.log(`  Title: ${event.title}`);
  console.log(`  Snippet: ${event.snippet.substring(0, 80)}...`);
  console.log(`  Sentiment: ${event.sentiment}`);
  console.log(`  URL: ${event.url}`);
  console.log(`  Timestamp: ${event.timestamp}`);
  console.log('');
}, 20000); // 20 second test

function sourceIcon(source) {
  const icons = {
    reddit: '🔴',
    twitter: '🐦',
    news: '📰',
    blog: '📝'
  };
  return icons[source] || '🌐';
}

// Auto-stop after 20 seconds
setTimeout(() => {
  console.log(`Test complete! Received ${eventCount} events.`);
  console.log('Stopping firehose...');
  stopFn();
  process.exit(0);
}, 20000);

console.log('Listening for events (20s test)...\n');
