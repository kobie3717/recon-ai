#!/usr/bin/env node
/**
 * Test new BD MCP browser and geo groups
 */

import { mcpBrowserCapture, mcpGeoIntel } from './bd-mcp-client.mjs';
import dotenv from 'dotenv';

dotenv.config();

async function test() {
  console.log('Testing BD MCP Browser Capture...');
  try {
    const browserResult = await mcpBrowserCapture('https://stripe.com/pricing');
    console.log('Browser result:', JSON.stringify(browserResult, null, 2));
  } catch (err) {
    console.error('Browser error:', err.message);
  }

  console.log('\nTesting BD MCP Geo Intel...');
  try {
    const geoResult = await mcpGeoIntel('stripe.com', 'What is stripe.com? Strengths, weaknesses, recent news');
    console.log('Geo result:', JSON.stringify(geoResult, null, 2));
  } catch (err) {
    console.error('Geo error:', err.message);
  }
}

test().catch(console.error);
