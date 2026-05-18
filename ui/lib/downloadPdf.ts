// Generates a structured PDF from reportData JSON using jsPDF only.
// White background, dark text — readable in any viewer and printable.

type Doc = InstanceType<Awaited<typeof import('jspdf')>['jsPDF']>;

function checkPage(doc: Doc, y: number, pageH: number, margin: number): number {
  if (y > pageH - 15) {
    doc.addPage();
    return margin;
  }
  return y;
}

function addSection(doc: Doc, title: string, y: number, pageH: number, margin: number): number {
  y = checkPage(doc, y, pageH, margin);
  y += 2;
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(30, 80, 160);
  doc.text(title.toUpperCase(), margin, y);
  y += 3;
  doc.setDrawColor(30, 80, 160);
  doc.setLineWidth(0.3);
  doc.line(margin, y, 200 - margin, y);
  doc.setFont('helvetica', 'normal');
  return y + 4;
}

function addRow(doc: Doc, label: string, value: string, y: number, pageH: number, margin: number): number {
  y = checkPage(doc, y, pageH, margin);
  doc.setFontSize(8);
  doc.setTextColor(100, 100, 100);
  doc.text(label, margin, y);
  doc.setTextColor(20, 20, 20);
  const lines: string[] = doc.splitTextToSize(String(value ?? '—'), 115);
  doc.text(lines, 80, y);
  return y + lines.length * 4.5;
}

function addBullet(doc: Doc, text: string, y: number, pageH: number, margin: number): number {
  y = checkPage(doc, y, pageH, margin);
  doc.setFontSize(8);
  doc.setTextColor(20, 20, 20);
  const lines: string[] = doc.splitTextToSize(`• ${text}`, 175);
  doc.text(lines, margin, y);
  return y + lines.length * 4.5;
}

export async function downloadPdf(filename: string, reportData: any): Promise<void> {
  const { jsPDF } = await import('jspdf');

  const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
  const margin = 15;
  const pageH = 297;
  const pageW = 210;
  let y = margin;

  // Header bar
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
  const meta = [
    reportData?.meta?.companyName,
    reportData?.meta?.mode && `Mode: ${reportData.meta.mode}`,
    reportData?.meta?.analysisDate,
  ].filter(Boolean).join('  ·  ');
  if (meta) doc.text(meta, pageW - margin, 12, { align: 'right' });

  y = 26;

  // Signals
  if (reportData?.signals?.length) {
    y = addSection(doc, 'Signals', y, pageH, margin);
    for (const s of reportData.signals) {
      y = addBullet(doc, `${s.icon ? s.icon + ' ' : ''}${s.text}  [${s.level}]`, y, pageH, margin);
    }
    y += 2;
  }

  // Snapshot
  if (reportData?.snapshot) {
    y = addSection(doc, 'Company Snapshot', y, pageH, margin);
    for (const [k, v] of Object.entries(reportData.snapshot)) {
      y = addRow(doc, k.charAt(0).toUpperCase() + k.slice(1), String(v), y, pageH, margin);
    }
    y += 2;
  }

  // Profile (person)
  if (reportData?.profile) {
    y = addSection(doc, 'Profile', y, pageH, margin);
    for (const [k, v] of Object.entries(reportData.profile)) {
      y = addRow(doc, k.charAt(0).toUpperCase() + k.slice(1), String(v), y, pageH, margin);
    }
    y += 2;
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
    y += 2;
  }

  // News
  if (reportData?.news?.length) {
    y = addSection(doc, 'Recent Signals', y, pageH, margin);
    for (const item of reportData.news) {
      y = addBullet(doc, `[${item.signal}] ${item.date}  ${item.headline}`, y, pageH, margin);
    }
    y += 2;
  }

  // Products
  if (reportData?.products?.length) {
    y = addSection(doc, 'Products', y, pageH, margin);
    for (const p of reportData.products) {
      y = addBullet(doc, `${p.name} — ${p.description}`, y, pageH, margin);
    }
    y += 2;
  }

  // Competitive
  if (reportData?.competitive?.length) {
    y = addSection(doc, 'Competitive Position', y, pageH, margin);
    for (const c of reportData.competitive) {
      y = addBullet(doc, `${c.competitor}: ${c.weakness}`, y, pageH, margin);
    }
    y += 2;
  }

  // Hiring
  if (reportData?.hiring?.length) {
    y = addSection(doc, 'Hiring Signals', y, pageH, margin);
    for (const h of reportData.hiring) {
      y = addBullet(doc, `${h.role} (${h.count}) → ${h.signal}`, y, pageH, margin);
    }
    y += 2;
  }

  // Strategic
  if (reportData?.strategic?.length) {
    y = addSection(doc, 'Strategic Direction', y, pageH, margin);
    for (const s of reportData.strategic) {
      y = addBullet(doc, s, y, pageH, margin);
    }
    y += 2;
  }

  // Top keywords (SEO)
  if (reportData?.topKeywords?.length) {
    y = addSection(doc, 'Top Keywords', y, pageH, margin);
    for (const k of reportData.topKeywords) {
      y = addBullet(doc, `#${k.position}  ${k.keyword}  vol: ${k.volume?.toLocaleString()}  intent: ${k.intent}`, y, pageH, margin);
    }
    y += 2;
  }

  // SEO opportunities
  if (reportData?.opportunities?.length) {
    y = addSection(doc, 'SEO Opportunities', y, pageH, margin);
    for (const o of reportData.opportunities) {
      y = addBullet(doc, `${o.keyword} — ${o.opportunity}`, y, pageH, margin);
    }
    y += 2;
  }

  // Attack surface (redteam)
  if (reportData?.attackSurface) {
    y = addSection(doc, 'Attack Surface', y, pageH, margin);
    const as = reportData.attackSurface;
    if (as.subdomains?.length) y = addRow(doc, 'Subdomains', as.subdomains.join(', '), y, pageH, margin);
    if (as.techStack?.length) y = addRow(doc, 'Tech Stack', as.techStack.join(', '), y, pageH, margin);
    if (as.headers?.score) y = addRow(doc, 'Header Grade', as.headers.score, y, pageH, margin);
    y += 2;
  }

  // Exposures
  if (reportData?.exposures?.length) {
    y = addSection(doc, 'Known Exposures', y, pageH, margin);
    for (const e of reportData.exposures) {
      y = addBullet(doc, `[${e.severity}] ${e.type}  ${e.date}  ${e.detail}`, y, pageH, margin);
    }
    y += 2;
  }

  // Recommendations
  if (reportData?.recommendations?.length) {
    y = addSection(doc, 'Recommendations', y, pageH, margin);
    for (const r of reportData.recommendations) {
      y = addBullet(doc, `${r.priority}  ${r.action}`, y, pageH, margin);
    }
    y += 2;
  }

  // Career (person)
  if (reportData?.career?.length) {
    y = addSection(doc, 'Career History', y, pageH, margin);
    for (const j of reportData.career) {
      y = addBullet(doc, `${j.role} — ${j.company}  (${j.period})`, y, pageH, margin);
      if (j.achievement) y = addBullet(doc, `    ${j.achievement}`, y, pageH, margin);
    }
    y += 2;
  }

  // Companies (person)
  if (reportData?.companies?.length) {
    y = addSection(doc, 'Companies', y, pageH, margin);
    for (const c of reportData.companies) {
      const line = `${c.name} — ${c.role}${c.domain ? `  (${c.domain})` : ''}`;
      y = addBullet(doc, line, y, pageH, margin);
    }
    y += 2;
  }

  // Public Activity (person)
  if (reportData?.publicActivity?.length) {
    y = addSection(doc, 'Public Activity', y, pageH, margin);
    for (const item of reportData.publicActivity) {
      y = addBullet(doc, `[${item.signal}] ${item.date}  ${item.event}`, y, pageH, margin);
    }
    y += 2;
  }

  // Notable Quotes (person)
  if (reportData?.quotes?.length) {
    y = addSection(doc, 'Notable Quotes', y, pageH, margin);
    for (const q of reportData.quotes) {
      y = addBullet(doc, `"${q.text}"`, y, pageH, margin);
      y = addBullet(doc, `    — ${q.source}  ${q.date}`, y, pageH, margin);
    }
    y += 2;
  }

  // Network (person)
  if (reportData?.network?.length) {
    y = addSection(doc, 'Network', y, pageH, margin);
    for (const n of reportData.network) {
      y = addBullet(doc, `${n.name} — ${n.relationship}`, y, pageH, margin);
    }
    y += 2;
  }

  // Social Engineering (redteam)
  if (reportData?.socialEngineering?.length) {
    y = addSection(doc, 'Social Engineering Vectors', y, pageH, margin);
    for (const v of reportData.socialEngineering) {
      y = addBullet(doc, `[${v.risk}] ${v.vector}: ${v.detail}`, y, pageH, margin);
    }
    y += 2;
  }

  // Risks
  if (reportData?.risks?.length) {
    y = addSection(doc, 'Risk Factors', y, pageH, margin);
    for (const r of reportData.risks) {
      y = addBullet(doc, `[${r.severity}] ${r.factor}`, y, pageH, margin);
    }
    y += 2;
  }

  // Cost
  if (reportData?.cost?.total) {
    y = addSection(doc, 'Cost', y, pageH, margin);
    y = addRow(doc, 'Total', `$${Number(reportData.cost.total).toFixed(2)}`, y, pageH, margin);
  }

  // Page numbers footer (text only — no background rectangle)
  const totalPages = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(160, 160, 160);
    doc.text(
      `RECON  ·  ${domain}  ·  Page ${i} of ${totalPages}`,
      pageW / 2,
      pageH - 5,
      { align: 'center' }
    );
  }

  doc.save(filename);
}
