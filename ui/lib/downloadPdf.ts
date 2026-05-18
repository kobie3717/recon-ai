// Generates a structured PDF from reportData JSON using jsPDF only.
// No html2canvas — lightweight, text-selectable, fast to build.

function addSection(doc: any, title: string, y: number, pageH: number, margin: number): number {
  if (y > pageH - 20) { doc.addPage(); y = margin; }
  doc.setFontSize(10);
  doc.setTextColor(6, 182, 212); // recon-cyan
  doc.text(title.toUpperCase(), margin, y);
  y += 5;
  doc.setDrawColor(6, 182, 212);
  doc.setLineWidth(0.3);
  doc.line(margin, y, 200 - margin, y);
  return y + 5;
}

function addRow(doc: any, label: string, value: string, y: number, pageH: number, margin: number): number {
  if (y > pageH - 10) { doc.addPage(); y = margin; }
  doc.setFontSize(8.5);
  doc.setTextColor(100, 116, 139); // grey
  doc.text(label, margin, y);
  doc.setTextColor(248, 250, 252); // light
  const lines: string[] = doc.splitTextToSize(String(value ?? '—'), 120);
  doc.text(lines, 80, y);
  return y + lines.length * 5;
}

function addBullet(doc: any, text: string, y: number, pageH: number, margin: number): number {
  if (y > pageH - 10) { doc.addPage(); y = margin; }
  doc.setFontSize(8.5);
  doc.setTextColor(248, 250, 252);
  const lines: string[] = doc.splitTextToSize(`• ${text}`, 175);
  doc.text(lines, margin, y);
  return y + lines.length * 5;
}

export async function downloadPdf(filename: string, reportData: any): Promise<void> {
  const { jsPDF } = await import('jspdf');

  const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
  const margin = 15;
  const pageH = 297;
  const pageW = 210;
  let y = margin;

  // Dark background
  doc.setFillColor(10, 14, 26);
  doc.rect(0, 0, pageW, pageH, 'F');

  // Title
  doc.setFontSize(20);
  doc.setTextColor(255, 255, 255);
  const domain = reportData?.meta?.domain || reportData?.meta?.name || 'Report';
  doc.text(domain, margin, y + 5);
  y += 12;

  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  const subtitle = [
    reportData?.meta?.companyName,
    reportData?.meta?.mode && `Mode: ${reportData.meta.mode}`,
    reportData?.meta?.analysisDate,
  ].filter(Boolean).join('  ·  ');
  if (subtitle) { doc.text(subtitle, margin, y); y += 8; }

  // Signals
  if (reportData?.signals?.length) {
    y = addSection(doc, 'Signals', y, pageH, margin);
    for (const s of reportData.signals) {
      y = addBullet(doc, `${s.icon || ''} ${s.text}`, y, pageH, margin);
    }
    y += 3;
  }

  // Snapshot
  if (reportData?.snapshot) {
    y = addSection(doc, 'Company Snapshot', y, pageH, margin);
    for (const [k, v] of Object.entries(reportData.snapshot)) {
      y = addRow(doc, k.charAt(0).toUpperCase() + k.slice(1), String(v), y, pageH, margin);
    }
    y += 3;
  }

  // Profile (person)
  if (reportData?.profile) {
    y = addSection(doc, 'Profile', y, pageH, margin);
    for (const [k, v] of Object.entries(reportData.profile)) {
      y = addRow(doc, k.charAt(0).toUpperCase() + k.slice(1), String(v), y, pageH, margin);
    }
    y += 3;
  }

  // Financials
  if (reportData?.financials) {
    y = addSection(doc, 'Financials', y, pageH, margin);
    const { investors, ...rest } = reportData.financials;
    for (const [k, v] of Object.entries(rest)) {
      y = addRow(doc, k.charAt(0).toUpperCase() + k.slice(1), String(v), y, pageH, margin);
    }
    if (investors?.length) {
      y = addRow(doc, 'Investors', investors.join(', '), y, pageH, margin);
    }
    y += 3;
  }

  // News / signals
  if (reportData?.news?.length) {
    y = addSection(doc, 'Recent Signals', y, pageH, margin);
    for (const item of reportData.news) {
      y = addBullet(doc, `[${item.signal}] ${item.date}  ${item.headline}`, y, pageH, margin);
    }
    y += 3;
  }

  // Products
  if (reportData?.products?.length) {
    y = addSection(doc, 'Products', y, pageH, margin);
    for (const p of reportData.products) {
      y = addBullet(doc, `${p.name} — ${p.description}`, y, pageH, margin);
    }
    y += 3;
  }

  // Competitive
  if (reportData?.competitive?.length) {
    y = addSection(doc, 'Competitive Position', y, pageH, margin);
    for (const c of reportData.competitive) {
      y = addBullet(doc, `${c.competitor}: ${c.weakness}`, y, pageH, margin);
    }
    y += 3;
  }

  // Hiring
  if (reportData?.hiring?.length) {
    y = addSection(doc, 'Hiring Signals', y, pageH, margin);
    for (const h of reportData.hiring) {
      y = addBullet(doc, `${h.role} (${h.count}) → ${h.signal}`, y, pageH, margin);
    }
    y += 3;
  }

  // Strategic
  if (reportData?.strategic?.length) {
    y = addSection(doc, 'Strategic Direction', y, pageH, margin);
    for (const s of reportData.strategic) {
      y = addBullet(doc, s, y, pageH, margin);
    }
    y += 3;
  }

  // SEO snapshot
  if (reportData?.snapshot?.domainAuthority !== undefined) {
    // Already handled above via snapshot
  }

  // Top keywords (SEO)
  if (reportData?.topKeywords?.length) {
    y = addSection(doc, 'Top Keywords', y, pageH, margin);
    for (const k of reportData.topKeywords) {
      y = addBullet(doc, `#${k.position}  ${k.keyword}  vol: ${k.volume}  intent: ${k.intent}`, y, pageH, margin);
    }
    y += 3;
  }

  // SEO opportunities
  if (reportData?.opportunities?.length) {
    y = addSection(doc, 'SEO Opportunities', y, pageH, margin);
    for (const o of reportData.opportunities) {
      y = addBullet(doc, `${o.keyword}  ${o.opportunity}`, y, pageH, margin);
    }
    y += 3;
  }

  // Redteam attack surface
  if (reportData?.attackSurface) {
    y = addSection(doc, 'Attack Surface', y, pageH, margin);
    const as = reportData.attackSurface;
    if (as.subdomains?.length) y = addRow(doc, 'Subdomains', as.subdomains.join(', '), y, pageH, margin);
    if (as.techStack?.length) y = addRow(doc, 'Tech Stack', as.techStack.join(', '), y, pageH, margin);
    if (as.headers) y = addRow(doc, 'Header Grade', as.headers.score, y, pageH, margin);
    y += 3;
  }

  // Exposures
  if (reportData?.exposures?.length) {
    y = addSection(doc, 'Known Exposures', y, pageH, margin);
    for (const e of reportData.exposures) {
      y = addBullet(doc, `[${e.severity}] ${e.type}  ${e.date}  ${e.detail}`, y, pageH, margin);
    }
    y += 3;
  }

  // Recommendations
  if (reportData?.recommendations?.length) {
    y = addSection(doc, 'Recommendations', y, pageH, margin);
    for (const r of reportData.recommendations) {
      y = addBullet(doc, `${r.priority}  ${r.action}`, y, pageH, margin);
    }
    y += 3;
  }

  // Career (person)
  if (reportData?.career?.length) {
    y = addSection(doc, 'Career History', y, pageH, margin);
    for (const j of reportData.career) {
      y = addBullet(doc, `${j.role} — ${j.company}  (${j.period})`, y, pageH, margin);
      if (j.achievement) y = addBullet(doc, `  ${j.achievement}`, y, pageH, margin);
    }
    y += 3;
  }

  // Risks
  if (reportData?.risks?.length) {
    y = addSection(doc, 'Risk Factors', y, pageH, margin);
    for (const r of reportData.risks) {
      y = addBullet(doc, `[${r.severity}] ${r.factor}`, y, pageH, margin);
    }
    y += 3;
  }

  // Cost
  if (reportData?.cost?.total) {
    y = addSection(doc, 'Cost', y, pageH, margin);
    y = addRow(doc, 'Total', `$${Number(reportData.cost.total).toFixed(2)}`, y, pageH, margin);
  }

  // Footer on every page
  const totalPages = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFillColor(10, 14, 26);
    doc.rect(0, 0, pageW, pageH, 'F'); // redraw bg on each page
    doc.setFontSize(7);
    doc.setTextColor(50, 60, 80);
    doc.text(`RECON — ${domain} — Page ${i} of ${totalPages}`, margin, pageH - 5);
  }

  doc.save(filename);
}
