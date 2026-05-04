// Invoice detail screen — PDF preview + line items
function DetailScreen({ invoice, lineItems, onBack, onApprove, onReject }) {
  const [filter, setFilter] = React.useState('all'); // all | flagged | matched
  const [openMismatch, setOpenMismatch] = React.useState(null); // index of open popup
  const [pdfPage, setPdfPage] = React.useState(1);
  const [zoom, setZoom] = React.useState(80);
  const [pdfDoc, setPdfDoc] = React.useState(null);
  const [pdfError, setPdfError] = React.useState(null);
  const canvasRef = React.useRef(null);

  // Load PDF.js once and open the file
  React.useEffect(() => {
    let cancelled = false;
    setPdfDoc(null);
    setPdfError(null);
    setPdfPage(1);
    (async () => {
      try {
        if (!window.pdfjsLib) {
          // Use native dynamic import; bypass Babel's CommonJS transform
          // by going through eval (window-level import is preserved)
          const dynImport = new Function('u', 'return import(u)');
          const mod = await dynImport('https://mozilla.github.io/pdf.js/build/pdf.mjs');
          mod.GlobalWorkerOptions.workerSrc = 'https://mozilla.github.io/pdf.js/build/pdf.worker.mjs';
          window.pdfjsLib = mod;
        }
        const task = window.pdfjsLib.getDocument(invoice.pdfUrl || invoice.pdfFile);
        const doc = await task.promise;
        if (!cancelled) setPdfDoc(doc);
      } catch (e) {
        if (!cancelled) setPdfError(e.message || 'Could not load PDF');
      }
    })();
    return () => { cancelled = true; };
  }, [invoice.pdfFile, invoice.pdfUrl]);

  // Render the current page whenever doc/page/zoom changes
  React.useEffect(() => {
    if (!pdfDoc || !canvasRef.current) return;
    let cancelled = false;
    (async () => {
      const page = await pdfDoc.getPage(pdfPage);
      if (cancelled) return;
      const scale = zoom / 100 * 1.4;
      const viewport = page.getViewport({ scale });
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      await page.render({ canvasContext: ctx, viewport }).promise;
    })();
    return () => { cancelled = true; };
  }, [pdfDoc, pdfPage, zoom]);

  const totalPages = pdfDoc ? pdfDoc.numPages : invoice.pages;

  const items = lineItems || [];
  const flaggedCount = items.filter(i => i.match !== 'matched').length;
  const matchedCount = items.filter(i => i.match === 'matched').length;

  const filteredItems = items.filter(i => {
    if (filter === 'flagged') return i.match !== 'matched';
    if (filter === 'matched') return i.match === 'matched';
    return true;
  });

  return (
    <>
      <button className="back-link" onClick={onBack}>
        {Icon.back(14)} Back to Carrier Payables
      </button>

      <div className="detail-grid">
        {/* PDF viewer — renders the real PDF via PDF.js */}
        <div className="pdf-viewer">
          <div className="pdf-toolbar">
            <span className="file" title={invoice.pdfFile}>{invoice.pdfFile}</span>
            <span style={{ color: 'var(--muted)', fontSize: 11 }}>{zoom}%</span>
            <button title="Zoom in" onClick={() => setZoom(z => Math.min(200, z + 10))}>+</button>
            <button title="Zoom out" onClick={() => setZoom(z => Math.max(40, z - 10))}>−</button>
            <button title="Prev page" onClick={() => setPdfPage(p => Math.max(1, p - 1))}>‹</button>
            <span className="nav">{pdfPage} / {totalPages}</span>
            <button title="Next page" onClick={() => setPdfPage(p => Math.min(totalPages, p + 1))}>›</button>
            <button title="Open in new tab" onClick={() => window.open(invoice.pdfUrl || invoice.pdfFile, '_blank')}>
              {Icon.expand(13)}
            </button>
          </div>
          <div className="pdf-body" style={{ overflow: 'auto', padding: 16, minHeight: 720, maxHeight: 720 }}>
            {pdfError && (
              <div style={{ color: 'var(--muted)', fontSize: 12, textAlign: 'center', padding: 40 }}>
                Could not load PDF: {pdfError}
              </div>
            )}
            {!pdfError && (
              <canvas ref={canvasRef} style={{ display: 'block', margin: '0 auto', boxShadow: '0 2px 8px rgba(0,0,0,0.08)', maxWidth: '100%' }} />
            )}
          </div>
        </div>

        {/* Right column */}
        <div className="detail-right">
          <div className="detail-header-card">
            <div className="top">
              <div>
                <h2>{invoice.carrier}</h2>
                <div className="invoice-no">Invoice: {invoice.invoiceNo}</div>
              </div>
              <div className="detail-actions">
                <button
                  className="btn btn-reject-outlined"
                  disabled={invoice.status === 'rejected'}
                  onClick={() => onReject(invoice.id)}
                >
                  {Icon.x(13)} Reject
                </button>
                <button
                  className="btn btn-approve"
                  disabled={invoice.status === 'approved'}
                  onClick={() => onApprove(invoice.id)}
                >
                  {Icon.check(13)} Approve
                </button>
                <span className={`ai-pill ${invoice.aiSuggestion}`} style={{ alignSelf: 'center', marginLeft: 4 }}>
                  {invoice.status === 'approved' ? 'Approved' : invoice.status === 'rejected' ? 'Rejected' : 'Review'}
                </span>
              </div>
            </div>
            <div className="summary-grid">
              <div>
                <div className="stat-label">Invoice Date</div>
                <div className="stat-value">{invoice.invoiceDate}</div>
              </div>
              <div>
                <div className="stat-label">Grand Total</div>
                <div className="stat-value">{AUD(invoice.amount)}</div>
              </div>
              <div>
                <div className="stat-label">Line Items</div>
                <div className="stat-value">{invoice.lineItemsTotal}</div>
              </div>
              <div>
                <div className="stat-label">Flagged / Matched</div>
                <div className="stat-value">
                  <span className="stat-flag">{invoice.lineItemsFlagged}</span>
                  <span style={{ color: 'var(--muted)', fontWeight: 400 }}> / </span>
                  <span style={{ color: 'var(--approve)' }}>{invoice.lineItemsMatched}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="lines-panel">
            <div className="lines-panel-head">
              <h3>Line Items</h3>
              <div className="filter-pills">
                <button className={`filter-pill ${filter === 'all' ? 'active' : ''}`} onClick={() => setFilter('all')}>
                  All ({items.length})
                </button>
                <button className={`filter-pill ${filter === 'flagged' ? 'active' : ''}`} onClick={() => setFilter('flagged')}>
                  Flagged ({flaggedCount})
                </button>
                <button className={`filter-pill ${filter === 'matched' ? 'active' : ''}`} onClick={() => setFilter('matched')}>
                  Matched ({matchedCount})
                </button>
              </div>
            </div>

            {filteredItems.length === 0 ? (
              <div className="empty">No line items in this filter.</div>
            ) : filteredItems.map((l, i) => {
              const isFlagged = l.match !== 'matched';
              const idx = items.indexOf(l);
              const isOpen = openMismatch === idx;
              return (
                <div key={idx} className={`line-item ${isFlagged ? 'flagged' : 'matched'}`}>
                  <span className="x-circle">
                    {isFlagged ? Icon.x(11) : Icon.check(11)}
                  </span>
                  <div>
                    <div>
                      <span className="cn-id">{l.cn}</span>
                      <span className="route">{l.from} → {l.to}</span>
                    </div>
                    <div className="meta">
                      {l.refId || '—'} · {l.date} · {l.desc}
                    </div>
                  </div>
                  <div className="right-stack">
                    <div className="amount">{AUD(l.amount)}</div>
                    <button
                      className={`match-pill ${l.match}`}
                      onClick={() => l.mismatch && setOpenMismatch(isOpen ? null : idx)}
                    >
                      {l.match === 'matched' ? 'Matched' : l.match === 'partial' ? 'Partial' : 'No match'}
                      {l.mismatch && Icon.chevDown(10)}
                    </button>
                  </div>
                  {isOpen && l.mismatch && (
                    <div className="mismatch-pop">
                      <div className="pop-title">Why this is flagged</div>
                      <div className="row"><span>{l.mismatch.reason}</span><span></span></div>
                      <div style={{ marginTop: 6, paddingTop: 6, borderTop: '1px solid var(--line)' }}>
                        <div className="row">
                          <span>Invoice amount</span>
                          <span>{AUD(l.mismatch.invoiceAmount)}</span>
                        </div>
                        <div className="row">
                          <span>System amount</span>
                          <span>{l.mismatch.systemAmount != null ? AUD(l.mismatch.systemAmount) : '—'}</span>
                        </div>
                      </div>
                      {l.mismatch.expected && (
                        <div style={{ marginTop: 6, paddingTop: 6, borderTop: '1px solid var(--line)', fontStyle: 'italic' }}>
                          {l.mismatch.expected}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
}
window.DetailScreen = DetailScreen;
