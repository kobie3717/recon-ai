/**
 * Monitor Scheduler - Automated domain monitoring with change detection
 */

import fs from 'fs';
import path from 'path';
import http from 'http';

const MONITOR_STATE_PATH = '/root/octo-workspace/monitor-state.json';
const SNAPSHOTS_DIR = '/root/octo-workspace/reports';

/**
 * Load monitor state from disk
 */
function loadMonitorState() {
  try {
    if (!fs.existsSync(MONITOR_STATE_PATH)) {
      return { domains: [] };
    }
    const data = fs.readFileSync(MONITOR_STATE_PATH, 'utf-8');
    return JSON.parse(data);
  } catch (err) {
    console.error('[monitor] Failed to load state:', err);
    return { domains: [] };
  }
}

/**
 * Save monitor state to disk
 */
function saveMonitorState(state) {
  try {
    fs.writeFileSync(MONITOR_STATE_PATH, JSON.stringify(state, null, 2));
  } catch (err) {
    console.error('[monitor] Failed to save state:', err);
  }
}

/**
 * Consume SSE stream from local server
 * Returns Promise that resolves with the report object
 */
function fetchReportViaSSE(domain) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 3001,
      path: `/api/report?domain=${encodeURIComponent(domain)}&mode=standard`,
      method: 'GET',
      headers: {
        'Accept': 'text/event-stream',
      },
    };

    const req = http.request(options, (res) => {
      let buffer = '';

      res.on('data', (chunk) => {
        buffer += chunk.toString();

        // Parse SSE events
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep incomplete line in buffer

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const event = JSON.parse(line.substring(6));

              if (event.type === 'report' && event.report) {
                resolve(event.report);
                req.destroy(); // Close connection
                return;
              } else if (event.type === 'error') {
                reject(new Error(event.message || 'Report generation failed'));
                req.destroy();
                return;
              }
            } catch (err) {
              // Skip unparseable events
            }
          }
        }
      });

      res.on('end', () => {
        reject(new Error('SSE stream ended without report'));
      });
    });

    req.on('error', (err) => {
      reject(err);
    });

    req.setTimeout(180000, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    req.end();
  });
}

/**
 * Load previous snapshot for domain
 */
function loadPreviousSnapshot(domain) {
  try {
    const domainDir = path.join(SNAPSHOTS_DIR, domain.replace(/[^a-z0-9-]/gi, '_'), 'snapshots');
    if (!fs.existsSync(domainDir)) return null;

    const files = fs.readdirSync(domainDir)
      .filter(f => f.endsWith('.json'))
      .sort()
      .reverse();

    if (files.length === 0) return null;

    const data = fs.readFileSync(path.join(domainDir, files[0]), 'utf-8');
    return JSON.parse(data);
  } catch (err) {
    console.error(`[monitor] Failed to load previous snapshot for ${domain}:`, err);
    return null;
  }
}

/**
 * Save snapshot and diff to disk
 */
function saveSnapshot(domain, report, diff) {
  try {
    const domainDir = path.join(SNAPSHOTS_DIR, domain.replace(/[^a-z0-9-]/gi, '_'), 'snapshots');
    fs.mkdirSync(domainDir, { recursive: true });

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const snapshotPath = path.join(domainDir, `${timestamp}.json`);
    const diffPath = path.join(domainDir, `${timestamp}-diff.json`);

    fs.writeFileSync(snapshotPath, JSON.stringify({ domain, savedAt: new Date().toISOString(), report }, null, 2));

    if (diff) {
      fs.writeFileSync(diffPath, JSON.stringify({ domain, savedAt: new Date().toISOString(), diff }, null, 2));
    }
  } catch (err) {
    console.error(`[monitor] Failed to save snapshot for ${domain}:`, err);
  }
}

/**
 * Compare two reports and generate diff
 */
function generateDiff(oldReport, newReport) {
  const changes = [];

  // Funding changes
  if (oldReport?.financials?.lastRound !== newReport?.financials?.lastRound) {
    changes.push({
      type: 'funding',
      icon: '💰',
      old: oldReport?.financials?.lastRound || 'Unknown',
      new: newReport?.financials?.lastRound || 'Unknown',
      message: `Funding: ${newReport?.financials?.lastRound || 'Unknown'}`,
    });
  }

  if (oldReport?.financials?.totalRaised !== newReport?.financials?.totalRaised) {
    changes.push({
      type: 'funding',
      icon: '💰',
      old: oldReport?.financials?.totalRaised || 'Unknown',
      new: newReport?.financials?.totalRaised || 'Unknown',
      message: `Total raised: ${newReport?.financials?.totalRaised || 'Unknown'}`,
    });
  }

  // Headcount changes
  const oldEmployees = oldReport?.snapshot?.employees || 0;
  const newEmployees = newReport?.snapshot?.employees || 0;
  if (oldEmployees !== newEmployees && newEmployees > 0) {
    const diff = newEmployees - oldEmployees;
    const pct = oldEmployees > 0 ? Math.round((diff / oldEmployees) * 100) : 0;
    changes.push({
      type: 'headcount',
      icon: '👥',
      old: oldEmployees,
      new: newEmployees,
      message: `Headcount: ${oldEmployees} → ${newEmployees} (${pct > 0 ? '+' : ''}${pct}%)`,
    });
  }

  // Hiring changes
  const oldHiring = oldReport?.hiring?.length || 0;
  const newHiring = newReport?.hiring?.length || 0;
  if (newHiring > oldHiring) {
    const diff = newHiring - oldHiring;
    changes.push({
      type: 'hiring',
      icon: '💼',
      old: oldHiring,
      new: newHiring,
      message: `New roles: +${diff} engineering roles`,
    });
  }

  // News changes — find new headlines
  const oldNews = new Set((oldReport?.news || []).map(n => n.title || n.headline));
  const newNews = (newReport?.news || []).filter(n => !oldNews.has(n.title || n.headline));
  if (newNews.length > 0) {
    changes.push({
      type: 'news',
      icon: '📰',
      count: newNews.length,
      headlines: newNews.slice(0, 2).map(n => n.title || n.headline),
      message: `New news: ${newNews.slice(0, 2).map(n => `"${n.title || n.headline}"`).join(', ')}`,
    });
  }

  // Strategic changes
  const oldStrategic = new Set((oldReport?.strategic || []).map(s => JSON.stringify(s)));
  const newStrategic = (newReport?.strategic || []).filter(s => !oldStrategic.has(JSON.stringify(s)));
  if (newStrategic.length > 0) {
    changes.push({
      type: 'strategic',
      icon: '🎯',
      count: newStrategic.length,
      message: `New strategic direction: ${newStrategic.length} item(s)`,
    });
  }

  return changes;
}

/**
 * Check if changes are significant enough to notify
 */
function hasSignificantChanges(changes) {
  const significant = ['funding', 'headcount', 'hiring', 'news'];
  return changes.some(c => significant.includes(c.type));
}

/**
 * Send Slack notification
 */
async function sendSlackNotification(domain, changes, slackWebhook, previousCheckDate) {
  if (!slackWebhook) return;

  const dateStr = previousCheckDate ? new Date(previousCheckDate).toLocaleDateString() : 'last scan';

  let message = `🔍 *Recon Alert: ${domain}*\nChanges detected since ${dateStr}:\n\n`;

  for (const change of changes) {
    message += `• ${change.message}\n`;
  }

  message += `\n_View full report: https://recon.whatshubb.co.za_`;

  try {
    const response = await fetch(slackWebhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: message }),
    });

    if (!response.ok) {
      console.error(`[monitor] Slack webhook failed for ${domain}: ${response.status}`);
    }
  } catch (err) {
    console.error(`[monitor] Failed to send Slack notification for ${domain}:`, err);
  }
}

/**
 * Check a single domain
 */
async function checkDomain(domainConfig) {
  const { domain, slackWebhook } = domainConfig;

  console.log(`[monitor] Checking ${domain}...`);

  try {
    // Fetch new report
    const newReport = await fetchReportViaSSE(domain);

    // Load previous snapshot
    const previousSnapshot = loadPreviousSnapshot(domain);

    // Generate diff
    const changes = previousSnapshot
      ? generateDiff(previousSnapshot.report, newReport)
      : [];

    // Save snapshot
    saveSnapshot(domain, newReport, changes.length > 0 ? changes : null);

    // Send notification if significant changes
    if (changes.length > 0 && hasSignificantChanges(changes)) {
      await sendSlackNotification(domain, changes, slackWebhook, previousSnapshot?.savedAt);
      console.log(`[monitor] ${domain}: ${changes.length} change(s) detected, notification sent`);
    } else {
      console.log(`[monitor] ${domain}: no significant changes`);
    }

    return {
      success: true,
      changes,
      timestamp: new Date().toISOString(),
    };
  } catch (err) {
    console.error(`[monitor] Failed to check ${domain}:`, err);
    return {
      success: false,
      error: err.message,
      timestamp: new Date().toISOString(),
    };
  }
}

/**
 * Run all checks
 */
async function runChecks() {
  const state = loadMonitorState();

  if (state.domains.length === 0) {
    console.log('[monitor] No domains configured');
    return;
  }

  console.log(`[monitor] Running checks for ${state.domains.length} domain(s)...`);

  for (const domainConfig of state.domains) {
    const now = Date.now();
    const intervalMs = (domainConfig.intervalHours || 24) * 60 * 60 * 1000;
    const lastChecked = domainConfig.lastChecked ? new Date(domainConfig.lastChecked).getTime() : 0;

    // Skip if not time yet
    if (now - lastChecked < intervalMs) {
      const remaining = Math.round((intervalMs - (now - lastChecked)) / 1000 / 60);
      console.log(`[monitor] ${domainConfig.domain}: skipping, next check in ${remaining}m`);
      continue;
    }

    const result = await checkDomain(domainConfig);

    // Update state
    domainConfig.lastChecked = result.timestamp;
    if (result.changes) {
      domainConfig.lastDiff = result.changes;
    }
  }

  saveMonitorState(state);
  console.log('[monitor] All checks complete');
}

/**
 * Start the monitor scheduler
 */
export function startMonitorScheduler() {
  console.log('[monitor] Scheduler started');

  // Run checks every hour
  const intervalMs = 60 * 60 * 1000; // 1 hour

  setInterval(() => {
    runChecks().catch(err => {
      console.error('[monitor] Check run failed:', err);
    });
  }, intervalMs);

  // Also run on startup (after 30s delay to let server start)
  setTimeout(() => {
    runChecks().catch(err => {
      console.error('[monitor] Initial check run failed:', err);
    });
  }, 30000);
}

/**
 * Get monitor state (for API)
 */
export function getMonitorState() {
  return loadMonitorState();
}

/**
 * Update monitor state (for API)
 */
export function updateMonitorState(state) {
  saveMonitorState(state);
}

/**
 * Get diff history for a domain
 */
export function getDiffHistory(domain) {
  try {
    const domainDir = path.join(SNAPSHOTS_DIR, domain.replace(/[^a-z0-9-]/gi, '_'), 'snapshots');
    if (!fs.existsSync(domainDir)) return [];

    const diffFiles = fs.readdirSync(domainDir)
      .filter(f => f.endsWith('-diff.json'))
      .sort()
      .reverse();

    return diffFiles.slice(0, 50).map(file => {
      const data = fs.readFileSync(path.join(domainDir, file), 'utf-8');
      return JSON.parse(data);
    });
  } catch (err) {
    console.error(`[monitor] Failed to load diff history for ${domain}:`, err);
    return [];
  }
}

/**
 * Trigger immediate check for a domain (for "Run Now" button)
 */
export async function triggerDomainCheck(domain) {
  const state = loadMonitorState();
  const domainConfig = state.domains.find(d => d.domain === domain);

  if (!domainConfig) {
    throw new Error('Domain not found in monitor list');
  }

  const result = await checkDomain(domainConfig);

  // Update state
  domainConfig.lastChecked = result.timestamp;
  if (result.changes) {
    domainConfig.lastDiff = result.changes;
  }

  saveMonitorState(state);

  return result;
}
