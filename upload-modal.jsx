// Upload Invoice modal — actually parses the uploaded PDF and extracts real data.
// Carrier name, invoice number, date, total, and every line item come from the PDF text.
// AI "match" simulation: most rows match dispatch, a small share fail (rate variance,
// missing trip ID, etc.) so the result feels real. Trip "DD25673055-PENR" is treated
// as a known no-match per ops feedback (not in dispatch records).

const KNOWN_NO_MATCH_TRIPS = ['DD25673055-PENR'];

// ---------- PDF parsing ----------

async function loadPdfJs() {
  if (window.pdfjsLib) return window.pdfjsLib;
  const dynImport = new Function('u', 'return import(u)');
  const mod = await dynImport('https://mozilla.github.io/pdf.js/build/pdf.mjs');
  mod.GlobalWorkerOptions.workerSrc = 'https://mozilla.github.io/pdf.js/build/pdf.worker.mjs';
  window.pdfjsLib = mod;
  return mod;
}

async function readPdfText(file) {
  const lib = await loadPdfJs();
  const buf = await file.arrayBuffer();
  const doc = await lib.getDocument({ data: new Uint8Array(buf) }).promise;
  const pages = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const p = await doc.getPage(i);
    const tc = await p.getTextContent();
    // Reconstruct text in reading order using y/x sorting
    const items = tc.items.map(it => ({
      str: it.str,
      x: it.transform[4],
      y: it.transform[5],
      h: it.height || 10,
    }));
    // Group by row (y bucket)
    items.sort((a, b) => b.y - a.y || a.x - b.x);
    const rows = [];
    let curY = null, cur = [];
    for (const it of items) {
      if (curY === null || Math.abs(it.y - curY) < 4) {
        cur.push(it); curY = curY === null ? it.y : curY;
      } else {
        rows.push(cur); cur = [it]; curY = it.y;
      }
    }
    if (cur.length) rows.push(cur);
    const lines = rows.map(r => r.map(x => x.str).join(' ').replace(/\s+/g, ' ').trim()).filter(Boolean);
    pages.push(lines.join('\n'));
  }
  return { pageCount: doc.numPages, text: pages.join('\n\n') };
}

// ---------- Field extraction ----------

const titleCase = (s) => s.replace(/\b([A-Z])([A-Z]+)/g, (m, a, b) => a + b.toLowerCase()).replace(/\s+/g, ' ').trim();

function extractFields(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

  // ---- Carrier name: first line that's not "Page X of Y" or "Tax Invoice"
  let carrier = '';
  for (const l of lines) {
    if (/^Page \d+ of \d+/i.test(l)) continue;
    if (/^tax invoice/i.test(l)) continue;
    if (/^invoice/i.test(l)) continue;
    if (l.length < 3) continue;
    carrier = l;
    break;
  }
  // Strip trailing phone if appended
  carrier = carrier.replace(/\s*\+?\d[\d\s\-]{6,}.*$/, '').trim();

  // ---- ABN
  const abnM = /ABN[:\s]*([\d ]{11,})/i.exec(text);
  const abn = abnM ? abnM[1].trim().replace(/\s+/g, ' ').replace(/(\d{2})(\d{3})(\d{3})(\d{3})/, '$1 $2 $3 $4') : '';

  // ---- Invoice number — skip "INVOICE TO" address blocks; PDF columns may merge
  // into a single visual line like "INVOICE TO INVOICE 17196", so we scan all
  // INVOICE occurrences in the line and take the first that isn't followed by "TO".
  let invoiceNo = '';
  outer: for (const l of lines) {
    const re = /\bINVOICE\b(?:\s+(?:NUMBER|NO\.?|#))?\s*[:#]?\s*([A-Z0-9][A-Z0-9\-\/]*)\b/gi;
    let m;
    while ((m = re.exec(l)) !== null) {
      const tok = m[1];
      // Skip the "TO" of "INVOICE TO" billing-address block
      if (/^TO$/i.test(tok)) continue;
      // Skip generic words that aren't an invoice ID
      if (/^(NUMBER|NO|DATE|TERMS|DUE)$/i.test(tok)) continue;
      // Must contain a digit to look like an invoice number
      if (!/\d/.test(tok)) continue;
      invoiceNo = tok;
      break outer;
    }
  }

  // ---- Date
  let invoiceDate = '';
  let invoiceDateISO = '';
  const dM = /DATE[\s\t:]+(\d{1,2}\/\d{1,2}\/\d{2,4})/i.exec(text);
  if (dM) {
    const [d, mo, y] = dM[1].split('/');
    const yr = y.length === 2 ? '20' + y : y;
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    invoiceDate = `${parseInt(d, 10)} ${months[parseInt(mo, 10) - 1]} ${yr}`;
    invoiceDateISO = `${yr}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  // ---- Total amount
  let amount = 0;
  const totM =
    /TOTAL\s+A?\$?\s*([\d,]+\.\d{2})\s*(?:BALANCE|$)/i.exec(text) ||
    /BALANCE DUE\s+A?\$?\s*([\d,]+\.\d{2})/i.exec(text) ||
    /\bTOTAL\s+([\d,]+\.\d{2})\b/i.exec(text);
  if (totM) amount = parseFloat(totM[1].replace(/,/g, ''));

  return { carrier, abn, invoiceNo, invoiceDate, invoiceDateISO, amount };
}

function extractLineItems(text) {
  // Each line item starts with DD/MM/YYYY, then activity, then "FROM to TO" route,
  // then "Transaction ID XXXX" (may wrap), then GST/qty/rate/amount line.
  const items = [];
  // Split text into chunks delimited by leading date stamps
  const re = /(\d{2}\/\d{2}\/\d{4})\s+([^\n]+?)\n([\s\S]*?)(?=\n\d{2}\/\d{2}\/\d{4}\s|\nSUBTOTAL|\nTOTAL\s|\n--\s|\nPage \d|$)/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const date = m[1];
    const firstLine = m[2].trim();
    const rest = m[3];
    const block = firstLine + '\n' + rest;

    // Skip "DATE" header
    if (/^DATE\s/i.test(firstLine)) continue;

    // route: "FROM to TO"  (case-insensitive 'to', allowing wrap)
    const routeM = /([A-Z][A-Za-z' ]+?)\s+to\s+([A-Z][A-Za-z' ]+?)(?:\s+Transaction|\s*\n|\s+After hours|\s+HS No)/i.exec(block);
    let from = '', to = '';
    if (routeM) {
      from = titleCase(routeM[1].trim());
      to = titleCase(routeM[2].trim());
    }

    // activity: the part of firstLine after the date that's NOT the route
    let activity = firstLine;
    if (routeM) {
      const cutAt = firstLine.toUpperCase().indexOf(routeM[1].trim().toUpperCase());
      if (cutAt > 0) activity = firstLine.slice(0, cutAt).trim();
    }
    activity = activity.replace(/\s+\d+$/, '').trim();

    // transaction id (may span two lines: "DD25673772-\nROSA")
    const txM = /Transaction ID\s+([A-Z0-9\.\-]+(?:-?\s*\n?\s*[A-Z]+)?)/i.exec(block);
    let trip = '';
    if (txM) {
      trip = txM[1].replace(/\s+/g, '').replace(/-+/, '-');
      // Combine wrapped suffix
      if (/-$/.test(trip)) {
        // shouldn't happen after the regex, but guard
      }
    }

    // amount: the last "X.XX  X.XX" pair on the GST line is rate/amount
    const amtM = /GST\s+\d+\s+[\d,]+\.\d{2}\s+([\d,]+\.\d{2})/i.exec(block);
    const amount = amtM ? parseFloat(amtM[1].replace(/,/g, '')) : 0;

    if (!from && !to && !trip && !amount) continue;

    items.push({ date, activity, from, to, trip, amount });
  }
  return items;
}

// ---------- AI matching simulation ----------

function classifyItems(items) {
  // Realistic heuristic: most match, a few fail.
  // Rules:
  //  - Known no-match trips → 'no-match'
  //  - "Futile" jobs → 'partial' (rate variance)
  //  - Trips starting with "S2026." (manual job IDs, not dispatch) → 'no-match'
  //  - Otherwise → 'matched'
  let matched = 0, flagged = 0;
  const out = items.map((it, i) => {
    let match = 'matched';
    let reason = null;
    let systemAmount = null;
    if (KNOWN_NO_MATCH_TRIPS.includes(it.trip)) {
      match = 'no-match';
      reason = 'Trip ID not found in dispatch records';
    } else if (/futile/i.test(it.activity)) {
      match = 'partial';
      reason = 'Futile job — partial rate vs. rate card';
      systemAmount = +(it.amount * 0.5).toFixed(2);
    } else if (/^S\d{4}\./i.test(it.trip)) {
      match = 'no-match';
      reason = 'Manual job ID — no dispatch reference';
    }
    if (match === 'matched') matched++; else flagged++;
    const refId = match === 'matched'
      ? 'OD-' + (10000 + (i * 73 + 421) % 89999)
      : null;
    return {
      cn: it.trip || `LN-${(i + 1).toString().padStart(3, '0')}`,
      refId,
      date: it.date,
      from: it.from || '—',
      to: it.to || '—',
      desc: it.activity || 'Transport charge',
      amount: it.amount,
      match,
      mismatch: match === 'matched' ? null : {
        invoiceAmount: it.amount,
        systemAmount,
        reason,
        expected: systemAmount != null
          ? 'System rate is lower than invoiced'
          : 'No matching dispatch found in system',
      },
    };
  });
  return { items: out, matched, flagged };
}

function decideOutcome(matched, flagged, total) {
  if (flagged === 0) return 'approve';
  // >=40% flagged → reject; otherwise review
  if (flagged / total >= 0.4) return 'reject';
  return 'review';
}

function formatDateISO(ddmmyyyy) {
  if (!ddmmyyyy) return new Date().toISOString().slice(0, 10);
  const [d, m, y] = ddmmyyyy.split(/[\/\-\s]/);
  if (!d || !m || !y) return new Date().toISOString().slice(0, 10);
  return `${y.length === 2 ? '20' + y : y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
}

// ---------- Modal component ----------

function UploadModal({ onClose, onComplete }) {
  const [file, setFile] = React.useState(null);
  const [phase, setPhase] = React.useState('select');
  const [step, setStep] = React.useState(0);
  const [dragOver, setDragOver] = React.useState(false);
  const [extraction, setExtraction] = React.useState(null);
  const [error, setError] = React.useState(null);

  const inputRef = React.useRef(null);

  const onFile = (f) => { if (f) { setFile(f); setError(null); } };

  const start = async () => {
    if (!file) return;
    setPhase('processing');
    setStep(0);
    setError(null);

    // Step 1: read PDF
    setTimeout(() => setStep(1), 400);
    let parsed;
    try {
      parsed = await readPdfText(file);
    } catch (e) {
      setError('Could not read this PDF. Please upload a text-based invoice.');
      setPhase('select');
      return;
    }

    // Step 2: extract fields
    await new Promise(r => setTimeout(r, 400));
    setStep(2);
    const fields = extractFields(parsed.text);
    const lineItemsRaw = extractLineItems(parsed.text);

    // Step 3: match
    await new Promise(r => setTimeout(r, 600));
    setStep(3);
    const { items, matched, flagged } = classifyItems(lineItemsRaw);
    const total = items.length;
    const outcome = decideOutcome(matched, flagged, total);

    // Step 4: generate suggestion
    await new Promise(r => setTimeout(r, 500));
    setStep(4);

    const computedAmount = fields.amount || items.reduce((s, x) => s + x.amount, 0);

    let summary;
    if (outcome === 'approve') summary = { type: 'matched', text: `${matched} matched` };
    else if (outcome === 'review') summary = { type: 'matched', text: `${matched} matched` };
    else summary = { type: 'notfound', text: `${flagged} flagged` };

    const confidence = Math.max(45, Math.round(100 - (flagged / Math.max(total, 1)) * 60 - Math.random() * 4));

    // Create a blob URL so the detail-view PDF renderer can load the actual file
    const pdfUrl = URL.createObjectURL(file);

    const invoice = {
      id: 'inv-' + Date.now(),
      carrier: fields.carrier || '(Unknown carrier)',
      invoiceNo: fields.invoiceNo || 'N/A',
      invoiceDate: fields.invoiceDate || new Date().toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' }),
      invoiceDateISO: fields.invoiceDateISO || new Date().toISOString().slice(0, 10),
      amount: computedAmount,
      aiSuggestion: outcome,
      summary,
      status: outcome === 'approve' ? 'approved' : outcome === 'reject' ? 'rejected' : 'review',
      pdfFile: file.name,
      pdfUrl,            // <-- blob URL, takes priority in detail view
      lineItemsTotal: total,
      lineItemsMatched: matched,
      lineItemsFlagged: flagged,
      pages: parsed.pageCount,
      abn: fields.abn || '',
      isUploaded: true,
      confidence,
    };

    await new Promise(r => setTimeout(r, 350));
    setExtraction({ file, outcome, invoice, items });
    setPhase('result');
  };

  const confirm = () => {
    onComplete(extraction.invoice, extraction.items);
  };

  const outcomeMeta = (o) => {
    if (o === 'approve') return {
      title: 'Auto-approved',
      subtitle: 'All line items matched dispatch records.',
      tone: 'approve',
      verb: 'View in Approved',
    };
    if (o === 'reject') return {
      title: 'Recommended for rejection',
      subtitle: 'Multiple line items could not be reconciled.',
      tone: 'reject',
      verb: 'View in Rejected',
    };
    return {
      title: 'Flagged for review',
      subtitle: 'Some line items need a human eye before approval.',
      tone: 'review',
      verb: 'View in Review',
    };
  };

  return (
    <div
      className="modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget && phase !== 'processing') onClose();
      }}
    >
      <div className="upload-modal" onClick={e => e.stopPropagation()}>
        {phase === 'select' && (
          <>
            <h2>Upload Invoice</h2>
            <div className="sub">Drop a carrier PDF — our AI will extract line items and try to match them against your dispatch records.</div>

            <label
              className={`dropzone ${dragOver ? 'dragover' : ''}`}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                const f = e.dataTransfer.files[0];
                if (f) onFile(f);
              }}
            >
              {Icon.upload(28)}
              <div className="main-text">Drop PDF here, or <span className="browse">browse</span></div>
              <div className="sub-text">PDF only, up to 25 MB</div>
              <input
                ref={inputRef}
                type="file"
                accept="application/pdf,.pdf"
                onChange={(e) => onFile(e.target.files[0])}
              />
            </label>

            {file && (
              <div className="file-chip">
                {Icon.pdf(20)}
                <span className="name">{file.name}</span>
                <span className="size">{(file.size / 1024).toFixed(0)} KB</span>
                <button
                  onClick={(e) => { e.stopPropagation(); setFile(null); if (inputRef.current) inputRef.current.value = ''; }}
                  style={{ background: 'transparent', border: 'none', color: 'var(--muted)', cursor: 'pointer' }}
                  title="Remove"
                >
                  {Icon.x(14)}
                </button>
              </div>
            )}

            {error && (
              <div style={{ padding: '8px 12px', background: 'rgba(244, 67, 54, 0.1)', color: '#C62828', borderRadius: 6, fontSize: 12, marginTop: 8 }}>
                {error}
              </div>
            )}

            <div className="upload-actions">
              <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
              <button className="btn btn-primary" disabled={!file} onClick={start}
                style={!file ? { opacity: 0.5, cursor: 'not-allowed' } : {}}>
                {Icon.upload(13)} Upload &amp; process
              </button>
            </div>
          </>
        )}

        {phase === 'processing' && (
          <>
            <h2>Processing invoice</h2>
            <div className="sub">Extracting line items and matching against dispatch records...</div>
            <div className="processing">
              <div className="spinner"></div>
              {[
                'Reading PDF',
                'Extracting line items',
                'Matching against dispatch records',
                'Generating AI suggestion',
              ].map((label, i) => {
                const status = step > i ? 'done' : step === i ? 'active' : 'pending';
                return (
                  <div key={i} className={`step ${status}`}>
                    <span className="dot">
                      {status === 'done' ? Icon.check(10) : (i + 1)}
                    </span>
                    {label}
                  </div>
                );
              })}
            </div>
          </>
        )}

        {phase === 'result' && extraction && (() => {
          const m = outcomeMeta(extraction.outcome);
          const inv = extraction.invoice;
          return (
            <>
              <div className={`result-banner result-${m.tone}`}>
                <div className={`result-icon result-${m.tone}`}>
                  {extraction.outcome === 'approve' ? Icon.check(20) :
                   extraction.outcome === 'reject' ? Icon.x(20) :
                   Icon.eye(20)}
                </div>
                <div className="result-text">
                  <div className="result-title">{m.title}</div>
                  <div className="result-subtitle">{m.subtitle}</div>
                </div>
                <div className="result-confidence">
                  <div className="conf-num">{inv.confidence}%</div>
                  <div className="conf-label">confidence</div>
                </div>
              </div>

              <div className="extract-grid">
                <div className="extract-row">
                  <span className="k">Carrier</span>
                  <span className="v carrier">{inv.carrier}</span>
                </div>
                <div className="extract-row">
                  <span className="k">Invoice number</span>
                  <span className="v">{inv.invoiceNo}</span>
                </div>
                <div className="extract-row">
                  <span className="k">Invoice date</span>
                  <span className="v">{inv.invoiceDate}</span>
                </div>
                <div className="extract-row">
                  <span className="k">ABN</span>
                  <span className="v mono">{inv.abn || '—'}</span>
                </div>
                <div className="extract-row">
                  <span className="k">Total amount</span>
                  <span className="v amt">{AUD(inv.amount)}</span>
                </div>
                <div className="extract-row">
                  <span className="k">Line items</span>
                  <span className="v">
                    <span className="li-pill matched">{inv.lineItemsMatched} matched</span>
                    {inv.lineItemsFlagged > 0 && (
                      <span className="li-pill flagged">{inv.lineItemsFlagged} flagged</span>
                    )}
                  </span>
                </div>
              </div>

              <div className="upload-actions">
                <button className="btn btn-ghost" onClick={() => { setPhase('select'); setExtraction(null); setStep(0); }}>
                  Upload another
                </button>
                <button className={`btn btn-primary btn-${m.tone}`} onClick={confirm}>
                  {m.verb}
                </button>
              </div>
            </>
          );
        })()}
      </div>
    </div>
  );
}
window.UploadModal = UploadModal;
