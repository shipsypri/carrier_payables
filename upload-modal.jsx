// Upload Invoice modal — simulates an AI extraction + classification pipeline.
// Outcome can be 'approve', 'review', or 'reject' depending on what the AI
// "finds" in the PDF. The result is shown to the user before they confirm,
// so it feels like a real AI doing real work.

const CARRIER_POOL = [
  { name: 'CENTURION TRANSPORT', prefix: 'CTN', abn: '11 119 005 332' },
  { name: 'RIVET MINING SERVICES', prefix: 'RVT', abn: '85 619 422 887' },
  { name: 'RON FINEMORE TRANSPORT', prefix: 'RFT', abn: '74 003 487 224' },
  { name: 'BLENNERS TRANSPORT', prefix: 'BLN', abn: '86 010 567 940' },
  { name: 'SCOTT\u2019S REFRIGERATED', prefix: 'SRL', abn: '70 095 020 405' },
  { name: 'AERO LOGISTICS', prefix: 'AER', abn: '47 134 778 113' },
  { name: 'BORDER EXPRESS', prefix: 'BEX', abn: '37 005 274 856' },
  { name: 'NQX FREIGHT', prefix: 'NQX', abn: '63 010 580 712' },
];

const ROUTE_POOL = [
  ['Sydney', 'Newcastle'], ['Melbourne', 'Geelong'], ['Brisbane', 'Toowoomba'],
  ['Perth', 'Fremantle'], ['Adelaide', 'Mount Barker'], ['Sydney', 'Wollongong'],
  ['Brisbane', 'Gold Coast'], ['Melbourne', 'Ballarat'], ['Perth', 'Bunbury'],
  ['Sydney', 'Canberra'], ['Adelaide', 'Port Augusta'], ['Brisbane', 'Cairns'],
];

const DESC_POOL = [
  'Pallet x12 - General', 'Container x1 40ft', 'Express parcel run',
  'Refrigerated 20ft', 'B-Double bulk', 'Heavy haul oversize',
  'eParcel x 180', 'Tipper bulk', 'Premium overnight',
];

// Decide an outcome with weighted probabilities so the user sees variety.
// 35% approved, 45% review, 20% rejected.
function rollOutcome() {
  const r = Math.random();
  if (r < 0.35) return 'approve';
  if (r < 0.80) return 'review';
  return 'reject';
}

function buildExtraction(file) {
  const carrier = CARRIER_POOL[Math.floor(Math.random() * CARRIER_POOL.length)];
  const outcome = rollOutcome();

  // Number of line items varies by outcome
  let total, matched, flagged;
  if (outcome === 'approve') {
    total = 3 + Math.floor(Math.random() * 4); // 3-6
    matched = total;
    flagged = 0;
  } else if (outcome === 'review') {
    total = 4 + Math.floor(Math.random() * 4); // 4-7
    flagged = 1 + Math.floor(Math.random() * 2); // 1-2
    matched = total - flagged;
  } else { // reject
    total = 5 + Math.floor(Math.random() * 5); // 5-9
    matched = Math.floor(Math.random() * 2); // 0-1
    flagged = total - matched;
  }

  const today = new Date();
  const formatted = today.toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' });
  const invNo = (carrier.prefix + '/2026/' +
    Math.floor(1000 + Math.random() * 8999).toString());

  // Amount roughly proportional to line item count
  const amount = total * (8000 + Math.random() * 12000);

  // Summary pill
  let summary;
  if (outcome === 'approve') {
    summary = { type: 'matched', text: `${matched} matched` };
  } else if (outcome === 'review') {
    summary = { type: 'matched', text: `${matched} matched` };
  } else {
    if (matched === 0) {
      summary = { type: 'notfound', text: `${flagged} not found` };
    } else {
      summary = { type: 'notfound', text: `${flagged} flagged` };
    }
  }

  // Confidence drops as flagged ratio grows
  const confidence = Math.round(100 - (flagged / total) * 60 - Math.random() * 5);

  return {
    file,
    outcome,
    invoice: {
      id: 'inv-' + Date.now(),
      carrier: carrier.name,
      invoiceNo: invNo,
      invoiceDate: formatted,
      invoiceDateISO: today.toISOString().slice(0, 10),
      amount,
      aiSuggestion: outcome,
      summary,
      status: outcome === 'approve' ? 'approved' : outcome === 'reject' ? 'rejected' : 'review',
      pdfFile: file.name,
      lineItemsTotal: total,
      lineItemsMatched: matched,
      lineItemsFlagged: flagged,
      pages: 2 + Math.floor(Math.random() * 6),
      abn: carrier.abn,
      isUploaded: true,
      confidence,
    },
  };
}

function reasonForFlag(outcome) {
  if (outcome === 'reject') {
    const reasons = [
      'CN# not found in dispatch records',
      'Duplicate billing detected',
      'Rate exceeds master agreement',
      'Surcharge not in rate card',
      'Cancelled trip — outside policy',
    ];
    return reasons[Math.floor(Math.random() * reasons.length)];
  }
  const reasons = [
    'Rate variance vs. rate card',
    'Awaiting POD confirmation',
    'Handling fee mismatch',
    'Detention exceeds tolerance',
  ];
  return reasons[Math.floor(Math.random() * reasons.length)];
}

function buildLineItems(invoice, outcome) {
  const items = [];
  for (let i = 0; i < invoice.lineItemsTotal; i++) {
    const r = ROUTE_POOL[Math.floor(Math.random() * ROUTE_POOL.length)];
    const isMatched = i < invoice.lineItemsMatched;
    const desc = DESC_POOL[Math.floor(Math.random() * DESC_POOL.length)];
    const baseAmt = 5000 + Math.random() * 35000;
    items.push({
      cn: invoice.invoiceNo.split('/')[0] + '-' + (10000 + Math.floor(Math.random() * 89999)),
      refId: isMatched ? 'OD-' + (90000 + Math.floor(Math.random() * 9999)) : null,
      date: invoice.invoiceDate,
      from: r[0], to: r[1],
      desc,
      amount: baseAmt,
      match: isMatched ? 'matched' : (outcome === 'reject' ? 'no-match' : (Math.random() > 0.5 ? 'no-match' : 'partial')),
      mismatch: isMatched ? null : {
        invoiceAmount: baseAmt,
        systemAmount: outcome === 'reject' ? null : (Math.random() > 0.5 ? null : baseAmt * 0.85),
        reason: reasonForFlag(outcome),
        expected: outcome === 'reject'
          ? 'No matching dispatch found in system'
          : 'AI flagged this for human verification',
      },
    });
  }
  return items;
}

function UploadModal({ onClose, onComplete }) {
  const [file, setFile] = React.useState(null);
  const [phase, setPhase] = React.useState('select'); // select | processing | result
  const [step, setStep] = React.useState(0);
  const [dragOver, setDragOver] = React.useState(false);
  const [extraction, setExtraction] = React.useState(null);

  const inputRef = React.useRef(null);

  const onFile = (f) => { if (f) setFile(f); };

  const start = () => {
    if (!file) return;
    setPhase('processing');
    setStep(0);

    // Pre-compute the extraction so the result is deterministic for this run
    const ex = buildExtraction(file);
    setExtraction(ex);

    // 4-step pipeline timing
    const stepDelays = [500, 700, 800, 600];
    let cumulative = 0;
    stepDelays.forEach((d, i) => {
      cumulative += d;
      setTimeout(() => setStep(i + 1), cumulative);
    });

    setTimeout(() => setPhase('result'), cumulative + 350);
  };

  const confirm = () => {
    const items = buildLineItems(extraction.invoice, extraction.outcome);
    onComplete(extraction.invoice, items);
  };

  // Outcome display helpers
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
                  <span className="v mono">{inv.abn}</span>
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
