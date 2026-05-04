// Invoice detail screen — PDF preview + line items
function PdfJsViewer({ file, page, zoom }) {
  const canvasRef = React.useRef(null);
  const renderTaskRef = React.useRef(null);
  const [error, setError] = React.useState(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;
    async function ensurePdfJs() {
      if (window.pdfjsLib) return window.pdfjsLib;
      await new Promise((resolve, reject) => {
        const existing = document.querySelector('script[data-pdfjs]');
        if (existing) { existing.addEventListener('load', resolve); existing.addEventListener('error', reject); return; }
        const s = document.createElement('script');
        s.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
        s.dataset.pdfjs = '1';
        s.onload = resolve;
        s.onerror = reject;
        document.head.appendChild(s);
      });
      // Worker is blocked in sandboxed iframes — render on main thread instead.
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = '';
      return window.pdfjsLib;
    }

    (async () => {
      try {
        setLoading(true);
        const pdfjsLib = await ensurePdfJs();
        if (cancelled) return;
        const pdf = await pdfjsLib.getDocument({ url: file, disableWorker: true }).promise;
        if (cancelled) return;
        const pdfPage = await pdf.getPage(Math.min(page, pdf.numPages));
        if (cancelled) return;
        const scale = (zoom / 80) * 1.5;
        const viewport = pdfPage.getViewport({ scale });
        const canvas = canvasRef.current;
        if (!canvas) return;
        // Cancel any in-flight render before resizing canvas (resize clears it)
        if (renderTaskRef.current) {
          try { renderTaskRef.current.cancel(); } catch (_) {}
        }
        canvas.height = viewport.height;
        canvas.width = viewport.width;
        const ctx = canvas.getContext('2d');
        const task = pdfPage.render({ canvasContext: ctx, viewport });
        renderTaskRef.current = task;
        await task.promise;
        if (cancelled) return;
        renderTaskRef.current = null;
        setLoading(false);
      } catch (e) {
        if (e && e.name === 'RenderingCancelledException') return;
        console.error('PDF render error', e);
        if (!cancelled) { setError(e.message || 'Failed to load PDF'); setLoading(false); }
      }
    })();
    return () => {
      cancelled = true;
      if (renderTaskRef.current) {
        try { renderTaskRef.current.cancel(); } catch (_) {}
      }
    };
  }, [file, page, zoom]);

  return (
    <div style={{
      width: '100%', height: '100%',
      overflow: 'auto', display: 'flex',
      justifyContent: 'center', padding: 12,
      background: '#F1F5F9',
    }}>
      {error ? (
        <div style={{ color: '#A4221F', padding: 20 }}>Could not load PDF: {error}</div>
      ) : (
        <canvas
          ref={canvasRef}
          style={{
            background: '#fff',
            boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
            opacity: loading ? 0.4 : 1,
            transition: 'opacity 0.15s',
            maxWidth: '100%',
            height: 'auto',
          }}
        />
      )}
    </div>
  );
}

// Invoice detail screen — PDF preview + line items
function DetailScreen({ invoice, lineItems, onBack, onApprove, onReject }) {
  const [filter, setFilter] = React.useState('all'); // all | flagged | matched
  const [openMismatch, setOpenMismatch] = React.useState(null); // index of open popup
  const [pdfPage, setPdfPage] = React.useState(1);
  const [zoom, setZoom] = React.useState(80);
  // per-line decisions: { [lineIdx]: 'approved' | 'rejected' }
  const [lineDecisions, setLineDecisions] = React.useState({});

  const decideLine = (idx, decision) => {
    setLineDecisions(prev => ({ ...prev, [idx]: decision }));
    setOpenMismatch(null);
  };

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
        {/* PDF viewer */}
        <div className="pdf-viewer">
          <div className="pdf-toolbar">
            <span className="file">{invoice.pdfFile}</span>
            <button className="active" title="Search">{Icon.zoomIn(13)}</button>
            <span style={{ color: 'var(--muted)', fontSize: 11 }}>{zoom}%</span>
            <button title="Zoom in" onClick={() => setZoom(z => Math.min(200, z + 10))}>+</button>
            <button title="Zoom out" onClick={() => setZoom(z => Math.max(40, z - 10))}>−</button>
            <button title="Reset">{Icon.refresh(13)}</button>
            <button title="Prev" onClick={() => setPdfPage(p => Math.max(1, p - 1))}>‹</button>
            <span className="nav">{pdfPage} / {invoice.pages}</span>
            <button title="Next" onClick={() => setPdfPage(p => Math.min(invoice.pages, p + 1))}>›</button>
            <button title="Fullscreen">{Icon.expand(13)}</button>
          </div>
          <div className="pdf-body">
            {(invoice.pdfFile === 'Dickies invoice.pdf' || invoice.pdfUrl) ? (
              <PdfJsViewer
                file={invoice.pdfUrl || invoice.pdfFile}
                page={pdfPage}
                zoom={zoom}
              />
            ) : (
              <div className="pdf-page" style={{ transform: `scale(${zoom / 80})`, transformOrigin: 'top center' }}>
                <div className="pdf-banner">
                  <div className="logo">{invoice.carrier.split(' ')[0].toUpperCase()}</div>
                  <div style={{ fontSize: 7, textAlign: 'right' }}>
                    <div style={{ fontWeight: 700 }}>TAX INVOICE</div>
                    <div>No. {invoice.invoiceNo}</div>
                  </div>
                </div>
                <div className="pdf-content">
                  <h3>TAX INVOICE SUMMARY</h3>
                  <div className="meta-grid">
                    <div>
                      <b>Bill To</b>
                      <div>Coates Hire Operations Pty Ltd</div>
                      <div>Level 1, 18 Rodborough Rd</div>
                      <div>Frenchs Forest NSW 2086</div>
                    </div>
                    <div>
                      <b>Invoice Details</b>
                      <div>No: {invoice.invoiceNo}</div>
                      <div>Date: {invoice.invoiceDate}</div>
                      <div>ABN: {invoice.abn}</div>
                    </div>
                  </div>
                  <table>
                    <thead>
                      <tr>
                        <th>CN#</th>
                        <th>Route</th>
                        <th style={{ textAlign: 'right' }}>Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.slice(0, 8).map((l, i) => (
                        <tr key={i}>
                          <td>{l.cn}</td>
                          <td>{l.from} → {l.to}</td>
                          <td className="right">{l.amount.toFixed(2)}</td>
                        </tr>
                      ))}
                      {items.length > 8 && (
                        <tr>
                          <td colSpan={3} style={{ textAlign: 'center', color: '#94A3B8', fontStyle: 'italic' }}>
                            + {items.length - 8} more line items...
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                  <div className="totals">
                    <div className="row"><span>Subtotal (ex GST)</span><span>{(invoice.amount / 1.1).toFixed(2)}</span></div>
                    <div className="row"><span>GST 10%</span><span>{(invoice.amount - invoice.amount / 1.1).toFixed(2)}</span></div>
                    <div className="row grand"><span>Total payable AUD</span><span>${invoice.amount.toLocaleString('en-AU', { minimumFractionDigits: 2 })}</span></div>
                  </div>
                </div>
              </div>
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
              const decision = lineDecisions[idx]; // 'approved' | 'rejected' | undefined
              return (
                <div key={idx} className={`line-item ${isFlagged ? 'flagged' : 'matched'} ${decision ? 'decided-' + decision : ''}`}>
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
                    {l.tripId && (
                      <a
                        className="trip-link"
                        href={`../settlements/index.html#trip=${l.tripId}`}
                        title="Open trip in Settlements portal"
                      >
                        View trip {l.tripId} in Settlements {Icon.ext(10)}
                      </a>
                    )}
                  </div>
                  <div className="right-stack">
                    <div className="amount">{AUD(l.amount)}</div>
                    {decision ? (
                      <span className={`decision-badge ${decision}`}>
                        {decision === 'approved' ? Icon.check(10) : Icon.x(10)}
                        {decision === 'approved' ? 'Approved' : 'Rejected'}
                      </span>
                    ) : (
                      <button
                        className={`match-pill ${l.match}`}
                        onClick={() => l.mismatch && setOpenMismatch(isOpen ? null : idx)}
                      >
                        {l.match === 'matched' ? 'Matched' : l.match === 'partial' ? 'Partial' : 'No match'}
                        {l.mismatch && Icon.chevDown(10)}
                      </button>
                    )}
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
                      <div className="pop-actions">
                        <button
                          className="pop-btn pop-btn-reject"
                          onClick={() => decideLine(idx, 'rejected')}
                        >
                          {Icon.x(12)} Reject line
                        </button>
                        <button
                          className="pop-btn pop-btn-approve"
                          onClick={() => decideLine(idx, 'approved')}
                        >
                          {Icon.check(12)} Approve line
                        </button>
                      </div>
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
