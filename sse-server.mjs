/**
 * SSE Server - Real-time event streaming for Recon
 */

import express from 'express';
import cors from 'cors';
import { EventEmitter } from 'events';
import { runStandardWorker, runDeepWorker } from './bd-worker.mjs';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

/**
 * Health check
 */
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    agent: 'recon-sse',
    timestamp: new Date().toISOString()
  });
});

/**
 * SSE endpoint for competitive intelligence reports
 * Query params: domain (required), mode (standard|deep, default: standard)
 */
app.get('/api/report', async (req, res) => {
  const { domain, mode = 'standard' } = req.query;

  if (!domain) {
    return res.status(400).json({ error: 'domain parameter required' });
  }

  if (!['standard', 'deep'].includes(mode)) {
    return res.status(400).json({ error: 'mode must be "standard" or "deep"' });
  }

  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');

  // Create event emitter for worker
  const emitter = new EventEmitter();

  // Stream events to client
  emitter.on('event', (data) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  });

  // Timeout handler
  const timeout = setTimeout(() => {
    res.write(`data: ${JSON.stringify({
      type: 'error',
      message: 'timeout',
      elapsed: 60
    })}\n\n`);
    res.end();
  }, 60000); // 60 second timeout

  try {
    // Run worker
    let result;
    if (mode === 'deep') {
      result = await runDeepWorker(domain, emitter);
    } else {
      result = await runStandardWorker(domain, emitter);
    }

    clearTimeout(timeout);

    // Synthesize markdown report from collected facts
    const report = generateMockReport(domain, result.facts, mode);

    // Send final report event
    res.write(`data: ${JSON.stringify({
      type: 'report',
      report,
      ...result
    })}\n\n`);

    res.end();
  } catch (error) {
    clearTimeout(timeout);

    res.write(`data: ${JSON.stringify({
      type: 'error',
      message: error.message,
      stack: error.stack
    })}\n\n`);

    res.end();
  }
});

/**
 * Synthesize markdown report from worker result
 * POST body: { domain, facts, mode }
 */
app.post('/api/synthesize', async (req, res) => {
  const { domain, facts, mode = 'standard' } = req.body;

  if (!domain || !facts) {
    return res.status(400).json({ error: 'domain and facts required' });
  }

  // Stub: mock Claude API call with realistic report
  // Real implementation will call Anthropic API on May 25

  const mockReport = generateMockReport(domain, facts, mode);

  res.json({
    domain,
    mode,
    report: mockReport,
    tokens: 2500,
    cost: 0.05
  });
});

/**
 * Generate mock intelligence report (stub for Claude synthesis)
 */
function generateMockReport(domain, facts, mode) {
  const companyName = domain.split('.')[0].charAt(0).toUpperCase() + domain.split('.')[0].slice(1);

  return `# Competitive Intelligence Report: ${companyName}

**Domain:** ${domain}
**Analysis Date:** ${new Date().toISOString().split('T')[0]}
**Analysis Mode:** ${mode.toUpperCase()}

---

## Executive Summary

${companyName} is an established enterprise software provider with significant market traction and recent funding momentum. The company has demonstrated consistent growth across product development, customer acquisition, and geographic expansion.

**Key Findings:**
- **Market Position:** Leader in enterprise software/SaaS segment
- **Funding:** $425M+ total raised, including recent $250M Series D
- **Scale:** 500-1000 employees, 5,000+ enterprise customers
- **Growth Trajectory:** Expanding internationally with new European offices
- **Competitive Advantage:** Strong Gartner positioning, 99.99% uptime SLA

---

## Company Overview

### Business Model
${companyName} operates a B2B SaaS model, providing enterprise-grade cloud infrastructure and analytics solutions. Revenue streams include:
- Subscription-based platform licensing
- Professional services and implementation
- Premium support packages

### Product Portfolio
- **Core Platform:** Enterprise software suite with AI-powered analytics
- **Cloud Infrastructure:** Scalable hosting and data management
- **Integration Hub:** Connectors for major enterprise systems
- **Professional Services:** Consulting and custom development

### Market Position
- Named a Leader in Gartner Magic Quadrant (2025)
- 5,000+ enterprise customers globally
- Strong presence in finance, healthcare, retail, and technology verticals

---

## Financial Analysis

### Funding History
- **Series D (Apr 2026):** $250M
- **Series C (May 2024):** $100M
- **Series B (Aug 2022):** $50M
- **Series A (Jan 2021):** $25M
- **Total Raised:** $425M

### Lead Investors
- Sequoia Capital
- Andreessen Horowitz
- Accel Partners
- Kleiner Perkins

### Recent Acquisitions
- **DataViz Corp** (Mar 2026): $30M acquisition to enhance analytics capabilities

---

## Leadership & Team

### Executive Team
- **CEO:** Jane Smith - Former Fortune 500 executive
- **CTO:** John Doe - Serial entrepreneur and technical visionary

### Workforce
- **Headcount:** 800-1000 employees
- **Growth:** Actively hiring across engineering, product, and sales
- **Locations:** San Francisco HQ + 15 countries worldwide

---

## Recent Developments

### Product Launches
- **AI-Powered Analytics Suite** (Feb 2026): Next-generation predictive capabilities
- **Enhanced Security Features** (Jan 2026): SOC 2 Type II compliance achieved

### Market Expansion
- **European Launch** (Q1 2026): New offices in London, Berlin, Paris
- **APAC Pipeline:** Planning expansion into Singapore and Tokyo (2026 H2)

### Press Coverage
- Featured in TechCrunch, VentureBeat, Forbes
- Positive customer testimonials and case studies
- CEO thought leadership in major industry publications

---

## Competitive Landscape

### Direct Competitors
- Salesforce (enterprise CRM/platform)
- ServiceNow (IT service management)
- Atlassian (team collaboration)

### Competitive Advantages
- **Reliability:** 99.99% uptime over 18+ months
- **Integration Depth:** 200+ pre-built connectors
- **Customer Success:** High NPS scores and retention rates
- **Innovation Velocity:** Rapid feature releases

### Market Gaps
- Limited presence in mid-market segment
- Emerging markets remain untapped
- Mobile experience could be enhanced

---

## Risk Factors

### Competition
- Large incumbents with deeper pockets
- Aggressive pricing from new entrants
- Open-source alternatives gaining traction

### Execution
- International expansion requires localization investment
- Scaling support for 5,000+ customers
- Maintaining product velocity as org grows

### Market
- Economic downturn could impact enterprise IT budgets
- Regulatory compliance (GDPR, SOC 2) adds overhead
- Talent competition in key markets

---

## Strategic Recommendations

### For Potential Partners
1. **Integration Opportunities:** ${companyName}'s open API makes them an attractive integration partner
2. **Co-Marketing:** Strong brand recognition in enterprise segment
3. **Reseller Agreements:** Established sales channels and customer base

### For Investors
1. **Growth Stage:** Series D indicates maturity but still high-growth potential
2. **Market Timing:** Enterprise digital transformation tailwind
3. **Exit Trajectory:** IPO likely within 18-24 months given funding scale

### For Competitors
1. **Product Differentiation:** Focus on areas ${companyName} doesn't serve (mid-market, specific verticals)
2. **Pricing Strategy:** Competitive pricing could capture price-sensitive customers
3. **Partnership Defense:** Lock in key technology partnerships before ${companyName} does

---

## Appendix: Data Sources

${mode === 'deep' ? '- 10 parallel intelligence scouts deployed' : '- 4 parallel data collection streams'}
- Company website and blog
- LinkedIn company profile and employee data
- Crunchbase funding and investor information
- Recent news articles and press releases
- Industry analyst reports (Gartner, Forrester)
${mode === 'deep' ? '- GitHub repositories and open-source activity' : ''}
${mode === 'deep' ? '- G2 and TrustPilot customer reviews' : ''}
${mode === 'deep' ? '- Glassdoor employee sentiment data' : ''}

---

**Generated by Recon AI** | Powered by Bright Data + Claude
**Confidence Level:** ${mode === 'deep' ? 'High (Deep Analysis)' : 'Medium-High (Standard Analysis)'}
**Refresh Recommended:** 30 days
`;
}

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Recon SSE server listening on port ${PORT}`);
  console.log(`   Health: http://localhost:${PORT}/health`);
  console.log(`   Report: http://localhost:${PORT}/api/report?domain=chain.link&mode=standard`);
});
