#!/bin/bash
# Comprehensive test of both CLI and SDK modes

set -e

echo "==================================="
echo "Testing Claude Adapter - Both Modes"
echo "==================================="

echo ""
echo "[1/2] Testing CLI mode (USE_CLAUDE_CLI=on)"
echo "-------------------------------------------"
USE_CLAUDE_CLI=on node test-sse-pattern.mjs

echo ""
echo "[2/2] Testing SDK mode fallback (USE_CLAUDE_CLI=off, no API key)"
echo "----------------------------------------------------------------"
USE_CLAUDE_CLI=off node -e "
import { createClaudeClient } from './claude-adapter.mjs';
const client = createClaudeClient();
try {
  await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 100,
    messages: [{ role: 'user', content: 'test' }]
  });
  console.log('✗ Should have failed without API key');
  process.exit(1);
} catch (err) {
  if (err.message.includes('authentication')) {
    console.log('✓ SDK mode correctly requires API key');
    process.exit(0);
  } else {
    console.error('✗ Unexpected error:', err.message);
    process.exit(1);
  }
}
"

echo ""
echo "==================================="
echo "✓✓ All tests passed!"
echo "==================================="
echo ""
echo "Usage:"
echo "  USE_CLAUDE_CLI=on  → Routes through Claude CLI (Max OAuth, \$0 cost)"
echo "  USE_CLAUDE_CLI=off → Routes through Anthropic SDK (API key required)"
echo "  unset              → Defaults to SDK mode"
