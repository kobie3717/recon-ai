// Captures the full report panel as a PDF download (no print dialog).
// Temporarily removes height/overflow constraints so the entire scrollable
// content is rendered, then slices across A4 pages.

export async function downloadPdf(filename: string): Promise<void> {
  const el = document.getElementById('report-panel');
  if (!el) return;

  const { jsPDF } = await import('jspdf');
  const { default: html2canvas } = await import('html2canvas');

  // Collect every element inside the panel that clips content
  const clipped = el.querySelectorAll<HTMLElement>('*');
  const saved: Array<{ el: HTMLElement; overflow: string; height: string; maxHeight: string }> = [];

  // Save + expand the panel itself
  saved.push({
    el,
    overflow: el.style.overflow,
    height: el.style.height,
    maxHeight: el.style.maxHeight,
  });
  el.style.overflow = 'visible';
  el.style.height = 'auto';
  el.style.maxHeight = 'none';

  // Expand any inner scroll containers
  clipped.forEach((child) => {
    const cs = window.getComputedStyle(child);
    if (cs.overflow === 'auto' || cs.overflow === 'hidden' || cs.overflowY === 'auto' || cs.overflowY === 'hidden') {
      saved.push({
        el: child,
        overflow: child.style.overflow,
        height: child.style.height,
        maxHeight: child.style.maxHeight,
      });
      child.style.overflow = 'visible';
      child.style.height = 'auto';
      child.style.maxHeight = 'none';
    }
  });

  try {
    const canvas = await html2canvas(el, {
      scale: 2,
      useCORS: true,
      backgroundColor: '#0A0E1A',
      logging: false,
      windowWidth: el.scrollWidth,
      windowHeight: el.scrollHeight,
    });

    const imgData = canvas.toDataURL('image/png');
    const pdfW = 210; // A4 width in mm
    const pdfH = (canvas.height / canvas.width) * pdfW;
    const pageH = 297; // A4 height in mm

    const pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });

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
    // Restore all styles
    saved.forEach(({ el: e, overflow, height, maxHeight }) => {
      e.style.overflow = overflow;
      e.style.height = height;
      e.style.maxHeight = maxHeight;
    });
  }
}
