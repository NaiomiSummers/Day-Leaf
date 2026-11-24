export const reportExportControls = `<section class="card stack jr-controls">
  <div class="card-head jr-export-head">
    <h2 tabindex="-1" data-preview-heading>Report preview</h2>
    <div class="row">
      <button type="button" class="btn primary" data-save-pdf disabled>Save PDF</button>
      <button type="button" class="btn" data-print hidden>Print</button>
    </div>
  </div>
  <p class="muted">Exported PDFs are not password-protected. On iPhone, choose Save to Files in the share sheet to keep a copy.</p>
  <p class="muted jr-export-status" role="status" data-pdf-status>Preparing PDF…</p>
  <div data-download-option hidden><a class="btn" data-download-pdf>Download PDF</a></div>
</section>`;

export function bindReportExport(preview, filename, viewSignal) {
  const article = preview.querySelector('#print-report');
  const save = preview.querySelector('[data-save-pdf]');
  const print = preview.querySelector('[data-print]');
  const status = preview.querySelector('[data-pdf-status]');
  const download = preview.querySelector('[data-download-pdf]');
  const lifetime = new AbortController();
  const signal = lifetime.signal;
  let file, objectURL;

  function release() {
    lifetime.abort();
    viewSignal?.removeEventListener('abort', release);
    download.removeAttribute('href');
    if (objectURL) URL.revokeObjectURL(objectURL);
    file = objectURL = undefined;
    save.disabled = true;
  }
  if (viewSignal?.aborted) { release(); return release; }
  viewSignal?.addEventListener('abort', release, { once: true });
  print.hidden = typeof window.print !== 'function';
  print.addEventListener('click', () => window.print(), { signal });

  function downloadLink() {
    objectURL ??= URL.createObjectURL(file);
    download.href = objectURL;
    download.download = filename;
    return download;
  }

  async function saveFile() {
    let canShare = false;
    const payload = { files: [file] };
    try { canShare = Boolean(navigator.share && navigator.canShare?.(payload)); }
    catch { /* Some browsers reject file capability probes. */ }
    if (!canShare) {
      const link = downloadLink();
      preview.querySelector('[data-download-option]').hidden = false;
      link.click();
      return;
    }
    status.textContent = '';
    save.disabled = true;
    try {
      // Enter the native sheet in the original tap, with the PDF already built.
      await navigator.share(payload);
    } catch (error) {
      if (!signal.aborted) status.textContent = error.name === 'AbortError'
        ? 'Sharing canceled. You can also download the PDF.'
        : 'File sharing is unavailable. Use Download PDF to save a copy.';
    } finally {
      if (!signal.aborted) {
        downloadLink();
        preview.querySelector('[data-download-option]').hidden = false;
        save.disabled = false;
      }
    }
  }

  async function prepare() {
    save.disabled = true;
    status.textContent = 'Preparing PDF…';
    try {
      const { buildReportPdf } = await import('./pdf-export.js');
      if (signal.aborted) return;
      const blob = await buildReportPdf(article, { signal });
      if (signal.aborted) return;
      file = new File([blob], filename, { type: 'application/pdf' });
      status.textContent = '';
      save.textContent = 'Save PDF';
    } catch {
      if (signal.aborted) return;
      status.textContent = 'The PDF could not be prepared. Try again.';
      save.textContent = 'Retry PDF';
    }
    save.disabled = false;
  }
  save.addEventListener('click', () => file ? saveFile() : prepare(), { signal });
  void prepare();
  return release;
}
