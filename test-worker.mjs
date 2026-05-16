/**
 * Test Worker - Smoke test for standard recon workflow
 */

import { EventEmitter } from 'events';
import { runStandardWorker } from './bd-worker.mjs';

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m'
};

console.log(`${colors.bright}${colors.cyan}
╔═══════════════════════════════════════════════════════════╗
║                   RECON WORKER TEST                       ║
║          Real-time Intelligence Gathering Demo            ║
╚═══════════════════════════════════════════════════════════╝
${colors.reset}\n`);

const domain = 'chain.link';
console.log(`${colors.bright}Target Domain:${colors.reset} ${colors.green}${domain}${colors.reset}`);
console.log(`${colors.bright}Test Mode:${colors.reset} Standard (4 parallel BD calls)\n`);
console.log(`${colors.dim}${'─'.repeat(60)}${colors.reset}\n`);

const startTime = Date.now();
const emitter = new EventEmitter();

// Track event counts
const stats = {
  events: 0,
  agents: new Set()
};

// Event listener with formatted output
emitter.on('event', (data) => {
  stats.events++;
  stats.agents.add(data.agent);

  const timestamp = `[+${data.elapsed || 0}s]`;
  const agent = data.agent.padEnd(20);

  let statusIcon = '◆';
  let statusColor = colors.cyan;

  if (data.status === 'complete') {
    statusIcon = '✓';
    statusColor = colors.green;
  } else if (data.status === 'received') {
    statusIcon = '►';
    statusColor = colors.magenta;
  } else if (data.status === 'fetching' || data.status === 'searching' || data.status === 'launching' || data.status === 'extracting') {
    statusIcon = '◉';
    statusColor = colors.yellow;
  }

  const status = data.status || 'processing';

  // Build extra info string
  let extra = '';
  if (data.chars) extra += ` (${data.chars} chars)`;
  if (data.results) extra += ` (${data.results} results)`;
  if (data.pages) extra += ` (${data.pages} pages)`;
  if (data.facts) extra += ` (${data.facts} facts)`;
  if (data.cost) extra += ` ($${data.cost.toFixed(2)})`;
  if (data.url) extra += ` ${colors.dim}${data.url}${colors.reset}`;
  if (data.query) extra += ` ${colors.dim}"${data.query}"${colors.reset}`;

  console.log(
    `${colors.dim}${timestamp}${colors.reset} ${statusColor}${statusIcon}${colors.reset} ${colors.bright}${agent}${colors.reset} ${statusColor}${status}${colors.reset}${extra}`
  );
});

// Run test
console.log(`${colors.bright}Starting worker...${colors.reset}\n`);

try {
  const result = await runStandardWorker(domain, emitter);

  const totalTime = ((Date.now() - startTime) / 1000).toFixed(2);

  console.log(`\n${colors.dim}${'─'.repeat(60)}${colors.reset}\n`);
  console.log(`${colors.bright}${colors.green}✓ Test Complete!${colors.reset}\n`);

  console.log(`${colors.bright}Results Summary:${colors.reset}`);
  console.log(`  • Domain: ${colors.cyan}${result.domain}${colors.reset}`);
  console.log(`  • Mode: ${colors.cyan}${result.mode}${colors.reset}`);
  console.log(`  • Facts Collected: ${colors.green}${Object.keys(result.facts).length}${colors.reset}`);
  console.log(`  • Total Events: ${colors.green}${stats.events}${colors.reset}`);
  console.log(`  • Unique Agents: ${colors.green}${stats.agents.size}${colors.reset}`);
  console.log(`  • Total Time: ${colors.yellow}${totalTime}s${colors.reset}`);
  console.log(`  • Total Cost: ${colors.yellow}$${result.cost.toFixed(2)}${colors.reset}`);

  console.log(`\n${colors.bright}Cost Breakdown:${colors.reset}`);
  Object.entries(result.costBreakdown).forEach(([key, cost]) => {
    console.log(`  • ${key.padEnd(20)}: ${colors.yellow}$${cost.toFixed(2)}${colors.reset}`);
  });

  console.log(`\n${colors.bright}Facts Collected:${colors.reset}`);
  console.log(`  • Homepage: ${result.facts.homepage ? colors.green + '✓' + colors.reset : colors.dim + '✗' + colors.reset} ${result.facts.homepage?.chars || 0} chars`);
  console.log(`  • News/SERP: ${result.facts.news ? colors.green + '✓' + colors.reset : colors.dim + '✗' + colors.reset} ${result.facts.news?.results?.length || 0} results`);
  console.log(`  • LinkedIn: ${result.facts.linkedin ? colors.green + '✓' + colors.reset : colors.dim + '✗' + colors.reset} ${result.facts.linkedin?.text?.length || 0} chars`);
  console.log(`  • Crunchbase: ${result.facts.crunchbase ? colors.green + '✓' + colors.reset : colors.dim + '✗' + colors.reset} ${result.facts.crunchbase?.text?.length || 0} chars`);
  console.log(`  • Structured Data: ${result.facts.structured ? colors.green + '✓' + colors.reset : colors.dim + '✗' + colors.reset} ${result.facts.structured?.company?.name || 'N/A'}`);

  console.log(`\n${colors.dim}Expected time: 5-7s (parallel stubs — real BD will be ~9-10s)${colors.reset}`);
  console.log(`${colors.dim}Actual time: ${totalTime}s${colors.reset}\n`);

  if (parseFloat(totalTime) < 4) {
    console.log(`${colors.yellow}⚠ Warning: Too fast — stub delays may not be running.${colors.reset}\n`);
  } else if (parseFloat(totalTime) > 12) {
    console.log(`${colors.yellow}⚠ Warning: Unusually slow. Check for bottlenecks.${colors.reset}\n`);
  } else {
    console.log(`${colors.green}✓ Timing looks good!${colors.reset}\n`);
  }

  console.log(`${colors.bright}${colors.cyan}Worker test passed! Ready for SSE server.${colors.reset}\n`);

} catch (error) {
  console.error(`\n${colors.bright}${colors.yellow}✗ Test Failed${colors.reset}\n`);
  console.error(`Error: ${error.message}`);
  console.error(error.stack);
  process.exit(1);
}
