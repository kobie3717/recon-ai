// Generates a structured PDF from reportData JSON using jsPDF only.
// White background, dark text — covers every section shown in the webapp.

type Doc = InstanceType<Awaited<typeof import('jspdf')>['jsPDF']>;

function checkPage(doc: Doc, y: number, pageH: number, margin: number): number {
  if (y > pageH - 15) { doc.addPage(); return margin; }
  return y;
}

function addSection(doc: Doc, title: string, y: number, pageH: number, margin: number): number {
  y = checkPage(doc, y + 2, pageH, margin);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(30, 80, 160);
  doc.text(title.toUpperCase(), margin, y);
  y += 3;
  doc.setDrawColor(30, 80, 160);
  doc.setLineWidth(0.3);
  doc.line(margin, y, 195, y);
  doc.setFont('helvetica', 'normal');
  return y + 4;
}

function addRow(doc: Doc, label: string, value: string, y: number, pageH: number, margin: number): number {
  y = checkPage(doc, y, pageH, margin);
  doc.setFontSize(8);
  doc.setTextColor(100, 100, 100);
  doc.text(label, margin, y);
  doc.setTextColor(20, 20, 20);
  const lines: string[] = doc.splitTextToSize(String(value ?? '—'), 112);
  doc.text(lines, 82, y);
  return y + lines.length * 4.5;
}

function addBullet(doc: Doc, text: string, y: number, pageH: number, margin: number, indent = 0): number {
  y = checkPage(doc, y, pageH, margin);
  doc.setFontSize(8);
  doc.setTextColor(20, 20, 20);
  const lines: string[] = doc.splitTextToSize(`${indent ? '  ' : '• '}${text}`, 175 - indent);
  doc.text(lines, margin + indent, y);
  return y + lines.length * 4.5;
}

function addBundleHeader(doc: Doc, title: string, y: number, pageH: number, margin: number, pageW: number): number {
  y = checkPage(doc, y + 2, pageH, margin);
  doc.setFillColor(15, 23, 42);
  doc.rect(margin - 2, y - 4, pageW - margin * 2 + 4, 12, 'F');
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(100, 180, 255);
  doc.text(title, margin, y + 3);
  doc.setFont('helvetica', 'normal');
  return y + 14;
}

function renderSections(doc: Doc, d: any, y: number, pageH: number, margin: number): number {
  // ── Signals ───────────────────────────────────────────────────────────────
  if (d?.signals?.length) {
    y = addSection(doc, 'Signals', y, pageH, margin);
    for (const s of d.signals) {
      const badge = s.level === 'high' ? '[HIGH]' : s.level === 'medium' ? '[MED]' : '[LOW]';
      y = addBullet(doc, `${badge}  ${s.text}`, y, pageH, margin);
    }
    y += 2;
  }

  // ── Snapshot (standard / SEO / deep) ─────────────────────────────────────
  if (d?.snapshot) {
    const isSeop = d?.meta?.mode === 'seo' || 'domainAuthority' in d.snapshot;
    y = addSection(doc, isSeop ? 'SEO Snapshot' : 'Company Snapshot', y, pageH, margin);
    for (const [k, v] of Object.entries(d.snapshot)) {
      if (v != null) y = addRow(doc, k.charAt(0).toUpperCase() + k.slice(1).replace(/([A-Z])/g, ' $1'), String(v), y, pageH, margin);
    }
    y += 2;
  }

  // ── Profile (person) ──────────────────────────────────────────────────────
  if (d?.profile) {
    y = addSection(doc, 'Profile', y, pageH, margin);
    for (const [k, v] of Object.entries(d.profile)) {
      if (v != null) y = addRow(doc, k.charAt(0).toUpperCase() + k.slice(1).replace(/([A-Z])/g, ' $1'), String(v), y, pageH, margin);
    }
    y += 2;
  }

  // ── Financials ────────────────────────────────────────────────────────────
  if (d?.financials) {
    y = addSection(doc, 'Financials', y, pageH, margin);
    const { investors, ...rest } = d.financials;
    for (const [k, v] of Object.entries(rest)) {
      if (v != null) y = addRow(doc, k.charAt(0).toUpperCase() + k.slice(1).replace(/([A-Z])/g, ' $1'), String(v), y, pageH, margin);
    }
    if (investors?.length) y = addRow(doc, 'Investors', investors.join(', '), y, pageH, margin);
    y += 2;
  }

  // ── Recent Signals / News ─────────────────────────────────────────────────
  if (d?.news?.length) {
    y = addSection(doc, 'Recent Signals', y, pageH, margin);
    for (const item of d.news) {
      y = addBullet(doc, `[${item.signal}] ${item.date}  ${item.headline}`, y, pageH, margin);
    }
    y += 2;
  }

  // ── Products ──────────────────────────────────────────────────────────────
  if (d?.products?.length) {
    y = addSection(doc, 'Products', y, pageH, margin);
    for (const p of d.products) {
      y = addBullet(doc, `${p.name} — ${p.description}`, y, pageH, margin);
    }
    y += 2;
  }

  // ── Competitive / Security Landscape ─────────────────────────────────────
  if (d?.competitive?.length) {
    const mode = d?.meta?.mode;
    const label = mode === 'redteam' ? 'Security Landscape' : mode === 'seo' ? 'Competitive Landscape' : 'Competitive Position';
    y = addSection(doc, label, y, pageH, margin);
    for (const c of d.competitive) {
      y = addBullet(doc, `${c.competitor}: ${c.weakness}`, y, pageH, margin);
    }
    y += 2;
  }

  // ── Hiring Signals ────────────────────────────────────────────────────────
  if (d?.hiring?.length) {
    y = addSection(doc, 'Hiring Signals', y, pageH, margin);
    for (const h of d.hiring) {
      y = addBullet(doc, `${h.role} (${h.count}) — ${h.signal}`, y, pageH, margin);
    }
    y += 2;
  }

  // ── Strategic Direction ───────────────────────────────────────────────────
  if (d?.strategic?.length) {
    y = addSection(doc, 'Strategic Direction', y, pageH, margin);
    d.strategic.forEach((s: string, i: number) => {
      y = addBullet(doc, `${i + 1}.  ${s}`, y, pageH, margin);
    });
    y += 2;
  }

  // ── Tech Stack (deep) ────────────────────────────────────────────────────
  if (d?.techStack?.length) {
    y = addSection(doc, 'Tech Stack', y, pageH, margin);
    for (const stack of d.techStack) {
      y = addBullet(doc, `${stack.category}: ${stack.items.join(', ')}`, y, pageH, margin);
    }
    y += 2;
  }

  // ── GitHub Intelligence ───────────────────────────────────────────────────
  if (d?.github) {
    y = addSection(doc, 'GitHub Intelligence', y, pageH, margin);
    const gh = d.github;
    if (gh.repos != null) y = addRow(doc, 'Repos', String(gh.repos), y, pageH, margin);
    if (gh.stars != null) y = addRow(doc, 'Stars', gh.stars.toLocaleString(), y, pageH, margin);
    if (gh.contributors != null) y = addRow(doc, 'Contributors', String(gh.contributors), y, pageH, margin);
    if (gh.topLanguage) y = addRow(doc, 'Top Language', gh.topLanguage, y, pageH, margin);
    if (gh.recentActivity) y = addRow(doc, 'Recent Activity', gh.recentActivity, y, pageH, margin);
    y += 2;
  }

  // ── Customer Reviews (G2) ────────────────────────────────────────────────
  if (d?.reviews) {
    y = addSection(doc, 'Customer Reviews', y, pageH, margin);
    const r = d.reviews;
    if (r.g2Score != null) y = addRow(doc, 'G2 Score', `${r.g2Score} / 5.0 (${r.g2Reviews} reviews)`, y, pageH, margin);
    if (r.sentiment) y = addRow(doc, 'Sentiment', r.sentiment, y, pageH, margin);
    y += 2;
  }

  // ── Glassdoor ────────────────────────────────────────────────────────────
  if (d?.glassdoor) {
    y = addSection(doc, 'Glassdoor', y, pageH, margin);
    const g = d.glassdoor;
    if (g.rating != null) y = addRow(doc, 'Rating', `${g.rating} / 5.0`, y, pageH, margin);
    if (g.reviews != null) y = addRow(doc, 'Reviews', String(g.reviews), y, pageH, margin);
    if (g.ceoApproval) y = addRow(doc, 'CEO Approval', g.ceoApproval, y, pageH, margin);
    if (g.recommend) y = addRow(doc, 'Recommend', g.recommend, y, pageH, margin);
    if (g.sentiment) y = addRow(doc, 'Sentiment', g.sentiment, y, pageH, margin);
    y += 2;
  }

  // ── Risk Factors ─────────────────────────────────────────────────────────
  if (d?.risks?.length) {
    y = addSection(doc, 'Risk Factors', y, pageH, margin);
    for (const r of d.risks) {
      y = addBullet(doc, `[${r.severity}] ${r.factor}`, y, pageH, margin);
    }
    y += 2;
  }

  // ── SEO: Top Keywords ────────────────────────────────────────────────────
  if (d?.topKeywords?.length) {
    y = addSection(doc, 'Top Keywords', y, pageH, margin);
    for (const k of d.topKeywords) {
      y = addBullet(doc, `#${k.position}  ${k.keyword}  |  vol: ${k.volume?.toLocaleString() ?? '—'}  |  ${k.intent}`, y, pageH, margin);
    }
    y += 2;
  }

  // ── SEO: Technical Health ────────────────────────────────────────────────
  if (d?.technical) {
    y = addSection(doc, 'Technical Health', y, pageH, margin);
    const t = d.technical;
    if (t.coreWebVitals) {
      const cwv = t.coreWebVitals;
      y = addRow(doc, 'Core Web Vitals', `LCP: ${cwv.lcp}  FID: ${cwv.fid}  CLS: ${cwv.cls}  Score: ${cwv.score}`, y, pageH, margin);
    }
    if (t.mobileScore != null) y = addRow(doc, 'Mobile Score', `${t.mobileScore}/100`, y, pageH, margin);
    if (t.pageSpeed != null) y = addRow(doc, 'Page Speed', `${t.pageSpeed}/100`, y, pageH, margin);
    if (t.issues?.length) {
      for (const issue of t.issues) y = addBullet(doc, issue, y, pageH, margin);
    }
    y += 2;
  }

  // ── SEO: SERP Features ───────────────────────────────────────────────────
  if (d?.serp) {
    y = addSection(doc, 'SERP Features', y, pageH, margin);
    const s = d.serp;
    if (s.featuredSnippets != null) y = addRow(doc, 'Featured Snippets', String(s.featuredSnippets), y, pageH, margin);
    if (s.peopleAlsoAsk != null) y = addRow(doc, 'People Also Ask', String(s.peopleAlsoAsk), y, pageH, margin);
    if (s.knowledgePanel) y = addRow(doc, 'Knowledge Panel', 'Yes', y, pageH, margin);
    if (s.localPack) y = addRow(doc, 'Local Pack', 'Yes', y, pageH, margin);
    y += 2;
  }

  // ── SEO: Content Strategy ────────────────────────────────────────────────
  if (d?.contentStrategy) {
    y = addSection(doc, 'Content Strategy', y, pageH, margin);
    const cs = d.contentStrategy;
    if (cs.postsPerMonth != null) y = addRow(doc, 'Posts / Month', String(cs.postsPerMonth), y, pageH, margin);
    if (cs.avgWordCount != null) y = addRow(doc, 'Avg Word Count', cs.avgWordCount.toLocaleString(), y, pageH, margin);
    if (cs.topTopics?.length) y = addRow(doc, 'Top Topics', cs.topTopics.join(', '), y, pageH, margin);
    if (cs.contentGaps?.length) {
      y = addRow(doc, 'Content Gaps', '', y, pageH, margin);
      for (const gap of cs.contentGaps) y = addBullet(doc, gap, y, pageH, margin, 4);
    }
    y += 2;
  }

  // ── SEO: Backlink Profile ────────────────────────────────────────────────
  if (d?.backlinks) {
    y = addSection(doc, 'Backlink Profile', y, pageH, margin);
    const bl = d.backlinks;
    if (bl.total != null) y = addRow(doc, 'Total Backlinks', bl.total.toLocaleString(), y, pageH, margin);
    if (bl.referringDomains != null) y = addRow(doc, 'Referring Domains', bl.referringDomains.toLocaleString(), y, pageH, margin);
    if (bl.linkVelocity) y = addRow(doc, 'Link Velocity', bl.linkVelocity, y, pageH, margin);
    if (bl.topSources?.length) y = addRow(doc, 'Top Sources', bl.topSources.join(', '), y, pageH, margin);
    y += 2;
  }

  // ── SEO: Opportunities ───────────────────────────────────────────────────
  if (d?.opportunities?.length) {
    y = addSection(doc, 'SEO Opportunities', y, pageH, margin);
    for (const o of d.opportunities) {
      y = addBullet(doc, `${o.keyword}  |  vol: ${o.volume?.toLocaleString() ?? '—'}  |  difficulty: ${o.difficulty ?? '—'}`, y, pageH, margin);
      if (o.opportunity) y = addBullet(doc, o.opportunity, y, pageH, margin, 4);
    }
    y += 2;
  }

  // ── Redteam: Attack Surface ───────────────────────────────────────────────
  if (d?.attackSurface) {
    y = addSection(doc, 'Attack Surface', y, pageH, margin);
    const as = d.attackSurface;
    if (as.subdomains?.length) y = addRow(doc, 'Subdomains', as.subdomains.join(', '), y, pageH, margin);
    if (as.techStack?.length) y = addRow(doc, 'Tech Stack', as.techStack.join(', '), y, pageH, margin);
    if (as.headers) {
      y = addRow(doc, 'Header Grade', as.headers.score ?? '—', y, pageH, margin);
      const flags = [['CSP', as.headers.csp], ['HSTS', as.headers.hsts], ['X-Frame', as.headers.xframe], ['Referrer', as.headers.referrerPolicy]];
      const status = flags.map(([l, ok]) => `${l}: ${ok ? 'OK' : 'Missing'}`).join('  ');
      y = addRow(doc, 'Header Details', status, y, pageH, margin);
    }
    y += 2;
  }

  // ── Redteam: Known Exposures ──────────────────────────────────────────────
  if (d?.exposures?.length) {
    y = addSection(doc, 'Known Exposures', y, pageH, margin);
    for (const e of d.exposures) {
      y = addBullet(doc, `[${e.severity}] ${e.type}  ${e.date}`, y, pageH, margin);
      if (e.detail) y = addBullet(doc, e.detail, y, pageH, margin, 4);
    }
    y += 2;
  }

  // ── Redteam: Social Engineering ───────────────────────────────────────────
  if (d?.socialEngineering?.length) {
    y = addSection(doc, 'Social Engineering Vectors', y, pageH, margin);
    for (const v of d.socialEngineering) {
      y = addBullet(doc, `[${v.risk}] ${v.vector}`, y, pageH, margin);
      if (v.detail) y = addBullet(doc, v.detail, y, pageH, margin, 4);
    }
    y += 2;
  }

  // ── Redteam: Recommendations ─────────────────────────────────────────────
  if (d?.recommendations?.length) {
    y = addSection(doc, 'Remediation Priorities', y, pageH, margin);
    for (const r of d.recommendations) {
      y = addBullet(doc, `${r.priority}  ${r.action}`, y, pageH, margin);
    }
    y += 2;
  }

  // ── Person: Career History ────────────────────────────────────────────────
  if (d?.career?.length) {
    y = addSection(doc, 'Career History', y, pageH, margin);
    for (const j of d.career) {
      y = addBullet(doc, `${j.role} — ${j.company}  (${j.period})`, y, pageH, margin);
      if (j.achievement) y = addBullet(doc, j.achievement, y, pageH, margin, 4);
    }
    y += 2;
  }

  // ── Person: Companies ────────────────────────────────────────────────────
  if (d?.companies?.length) {
    y = addSection(doc, 'Companies', y, pageH, margin);
    for (const c of d.companies) {
      y = addBullet(doc, `${c.name} — ${c.role}${c.domain ? `  (${c.domain})` : ''}`, y, pageH, margin);
    }
    y += 2;
  }

  // ── Person: Public Activity ───────────────────────────────────────────────
  if (d?.publicActivity?.length) {
    y = addSection(doc, 'Public Activity', y, pageH, margin);
    for (const item of d.publicActivity) {
      y = addBullet(doc, `[${item.signal}] ${item.date}  ${item.event}`, y, pageH, margin);
    }
    y += 2;
  }

  // ── Person: Quotes ────────────────────────────────────────────────────────
  if (d?.quotes?.length) {
    y = addSection(doc, 'Notable Quotes', y, pageH, margin);
    for (const q of d.quotes) {
      y = addBullet(doc, `"${q.text}"`, y, pageH, margin);
      y = addBullet(doc, `${q.source}  ${q.date}`, y, pageH, margin, 4);
    }
    y += 2;
  }

  // ── Person: Network ───────────────────────────────────────────────────────
  if (d?.network?.length) {
    y = addSection(doc, 'Network', y, pageH, margin);
    for (const n of d.network) {
      y = addBullet(doc, `${n.name} — ${n.relationship}`, y, pageH, margin);
    }
    y += 2;
  }

  // ── Intelligence Sources ──────────────────────────────────────────────────
  if (d?.sources?.length) {
    y = addSection(doc, 'Intelligence Sources', y, pageH, margin);
    for (const s of d.sources) {
      const secs = s.sections?.length ? `  [${s.sections.join(', ')}]` : '';
      y = addBullet(doc, `${s.tool}  ->  ${s.target}${secs}`, y, pageH, margin);
    }
    y += 2;
  }

  // ── Cost Breakdown ────────────────────────────────────────────────────────
  if (d?.cost) {
    y = addSection(doc, 'Cost Breakdown', y, pageH, margin);
    const c = d.cost;
    if (c.webUnlocker > 0) y = addRow(doc, 'Web Unlocker', `$${c.webUnlocker.toFixed(2)}`, y, pageH, margin);
    if (c.serpApi > 0) y = addRow(doc, 'SERP API', `$${c.serpApi.toFixed(2)}`, y, pageH, margin);
    if (c.scrapingBrowser > 0) y = addRow(doc, 'Scraping Browser', `$${c.scrapingBrowser.toFixed(2)}`, y, pageH, margin);
    if (c.webScraperApi > 0) y = addRow(doc, 'Web Scraper API', `$${c.webScraperApi.toFixed(2)}`, y, pageH, margin);
    if (c.claude > 0) y = addRow(doc, 'Claude Synthesis', `$${c.claude.toFixed(2)}`, y, pageH, margin);
    if (c.total != null) y = addRow(doc, 'TOTAL', `$${Number(c.total).toFixed(2)}`, y, pageH, margin);
  }

  return y;
}

export async function downloadPdf(filename: string, reportData: any): Promise<void> {
  const { jsPDF } = await import('jspdf');

  const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
  const margin = 15;
  const pageH = 297;
  const pageW = 210;
  let y = margin;

  const isBundle = !!(reportData?.standard || reportData?.seo || reportData?.redteam);

  // ── Header bar ────────────────────────────────────────────────────────────
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, pageW, 18, 'F');
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(255, 255, 255);
  const domain = reportData?.meta?.domain || reportData?.meta?.name || 'Report';
  doc.text(`RECON — ${domain}`, margin, 12);
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(150, 180, 220);
  const metaSource = isBundle ? reportData.meta : reportData?.meta;
  const meta = [
    metaSource?.companyName,
    isBundle ? 'Mode: Bundle' : (metaSource?.mode && `Mode: ${metaSource.mode}`),
    metaSource?.analysisDate,
  ].filter(Boolean).join('  ·  ');
  if (meta) doc.text(meta, pageW - margin, 12, { align: 'right' });
  y = 26;

  if (isBundle) {
    // ── Bundle: render each sub-report with a section banner ────────────────
    if (reportData.standard) {
      y = addBundleHeader(doc, 'INTELLIGENCE REPORT', y, pageH, margin, pageW);
      y = renderSections(doc, reportData.standard, y, pageH, margin);
    }
    if (reportData.seo) {
      doc.addPage();
      y = margin + 4;
      y = addBundleHeader(doc, 'SEO INTELLIGENCE', y, pageH, margin, pageW);
      y = renderSections(doc, reportData.seo, y, pageH, margin);
    }
    if (reportData.redteam) {
      doc.addPage();
      y = margin + 4;
      y = addBundleHeader(doc, 'SECURITY ANALYSIS', y, pageH, margin, pageW);
      y = renderSections(doc, reportData.redteam, y, pageH, margin);
    }
  } else {
    y = renderSections(doc, reportData, y, pageH, margin);
  }

  // ── Page footer ───────────────────────────────────────────────────────────
  const totalPages = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(160, 160, 160);
    doc.text(`RECON  ·  ${domain}  ·  Page ${i} of ${totalPages}`, pageW / 2, pageH - 5, { align: 'center' });
  }

  doc.save(filename);
}
