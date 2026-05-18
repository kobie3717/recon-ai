// Captures the report panel element and downloads it as a multi-page PDF.
// Uses html2canvas to render the full (scrollable) content, then slices it
// across jsPDF pages at A4 dimensions.

export async function downloadPdf(filename: string): Promise<void> {
  const el = document.getElementById('report-panel');
  if (!el) return;

  const { default: jsPDF } = await import('jspdf');
  const { default: html2canvas } = await import('html2canvas');

  // Temporarily expand to full height so the whole report is captured
  const prevOverflow = el.style.overflow;
  const prevMaxH = el.style.maxHeight;
  el.style.overflow = 'visible';
  el.style.maxHeight = 'none';

  // Also expand any inner scrollable div (the flex-1 overflow-y-auto child)
  const scrollDiv = el.querySelector<HTMLElement>('.overflow-y-auto');
  const prevScrollOverflow = scrollDiv?.style.overflow ?? '';
  const prevScrollMaxH = scrollDiv?.style.maxHeight ?? '';
  if (scrollDiv) {
    scrollDiv.style.overflow = 'visible';
    scrollDiv.style.maxHeight = 'none';
  }

  try {
    const canvas = await html2canvas(el, {
      scale: 2,
      useCORS: true,
      backgroundColor: '#0A0E1A',
      logging: false,
    });

    // A4 at 96dpi: 794 × 1123 px — use canvas width to set PDF width
    const imgData = canvas.toDataURL('image/png');
    const pdfW = 210; // mm (A4 width)
    const pdfH = (canvas.height / canvas.width) * pdfW;

    // Split across pages if taller than A4
    const pageH = 297; // mm (A4 height)
    const pdf = new jsPDF({ orientation: pdfH > pageH ? 'p' : 'p', unit: 'mm', format: 'a4' });

    let yOffset = 0;
    let pageNum = 0;
    while (yOffset < pdfH) {
      if (pageNum > 0) pdf.addPage();
      pdf.addImage(imgData, 'PNG', 0, -yOffset, pdfW, pdfH);
      yOffset += pageH;
      pageNum++;
    }

    pdf.save(filename);
  } finally {
    el.style.overflow = prevOverflow;
    el.style.maxHeight = prevMaxH;
    if (scrollDiv) {
      scrollDiv.style.overflow = prevScrollOverflow;
      scrollDiv.style.maxHeight = prevScrollMaxH;
    }
  }
}
