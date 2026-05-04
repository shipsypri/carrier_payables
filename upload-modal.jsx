// Upload Invoice modal
function UploadModal({ onClose, onComplete }) {
  const [file, setFile] = React.useState(null);
  const [phase, setPhase] = React.useState('select'); // select | processing
  const [step, setStep] = React.useState(0);
  const [dragOver, setDragOver] = React.useState(false);

  const inputRef = React.useRef(null);

  const onFile = (f) => {
    if (!f) return;
    setFile(f);
  };

  const start = () => {
    if (!file) return;
    setPhase('processing');
    setStep(0);

    // Fake AI pipeline: 4 steps over ~2.2s
    const stepDelays = [400, 600, 700, 500];
    let cumulative = 0;
    stepDelays.forEach((d, i) => {
      cumulative += d;
      setTimeout(() => setStep(i + 1), cumulative);
    });

    setTimeout(() => {
      // Detect known invoices by filename
      const fname = file.name.toLowerCase();
      const isRedHot = fname.includes('example 3') || fname.includes('red hot') || fname.includes('redhot');

      if (isRedHot) {
        // Pre-canned Red Hot Transit invoice — matches the actual PDF content
        const fileUrl = URL.createObjectURL(file);
        onComplete({
          id: 'inv-redhot-' + Date.now(),
          carrier: 'Red Hot Transit',
          invoiceNo: '17196',
          invoiceDate: '20 Feb 2026',
          invoiceDateISO: '2026-02-20',
          amount: 700.23,
          aiSuggestion: 'review',
          summary: { type: 'partial', text: '23 matched · 5 flagged' },
          status: 'review',
          pdfFile: file.name,
          pdfUrl: fileUrl,
          lineItemsTotal: 28,
          lineItemsMatched: 23,
          lineItemsFlagged: 5,
          pages: 3,
          abn: '54 123 456 789',
          isUploaded: true,
          // Embed the line items directly for this seeded invoice
          _seedLineItems: [
            { cn: 'S2026.10502HS', refId: '—', date: '16/02/2026', from: '8 Tonne Hiab Ingleburn', to: 'EASTERN CREEK',
              desc: '8 Tonne Hiab Ingleburn to EASTERN CREEK GST 1 500.00 500.00',
              amount: 500.00, match: 'no-match',
              mismatch: { invoiceAmount: 500.00, systemAmount: null, reason: 'No matching dispatch record found',
                expected: 'No POD or order reference matches this charge.' } },
            { cn: 'DD25673055-PENR', refId: '—', date: '17/02/2026', from: 'Tow Axle Moorebank', to: 'NORTH',
              desc: 'Tow Axle Moorebank to NORTH GST 1 200.00 200.00',
              amount: 200.00, match: 'no-match',
              mismatch: { invoiceAmount: 200.00, systemAmount: null, reason: 'No matching dispatch record found',
                expected: 'CN DD25673055-PENR has no corresponding trip in Settlements.' } },
            { cn: 'DD25677006-GLDV', refId: '—', date: '19/02/2026', from: '1 Tonne Futile MANLY', to: 'Gladesville',
              desc: '1 Tonne Futile MANLY to Gladesville GST 1 41.25 41.25',
              amount: 41.25, match: 'partial',
              mismatch: { invoiceAmount: 41.25, systemAmount: 35.00, reason: 'Futile delivery surcharge above contracted rate',
                expected: 'Contracted futile fee is $35.00 — invoice charges $6.25 extra.' } },
            { cn: 'S2026.11751HS', refId: '—', date: '19/02/2026', from: '6 Tonne Futile POTTS POINT', to: 'Moorebank',
              desc: '6 Tonne Futile POTTS POINT to Moorebank GST 1 192.50 192.50',
              amount: 192.50, match: 'partial',
              mismatch: { invoiceAmount: 192.50, systemAmount: 165.00, reason: 'Futile fee mismatch',
                expected: 'Rate card 6T futile = $165 — $27.50 over.' } },
            { cn: 'LN-024', refId: '—', date: '20/02/2026', from: 'Rigid Tilt Tray Futile Ingleburn', to: 'Georges Hall',
              desc: 'Rigid Tilt Tray Futile Ingleburn to Georges hall GST 1 285.00 285.00',
              amount: 285.00, match: 'partial',
              mismatch: { invoiceAmount: 285.00, systemAmount: 240.00, reason: 'Tilt tray futile above contract',
                expected: 'Contract rate $240 — invoice billed $45 extra.' } },
            // 23 matched line items
            ...Array.from({ length: 23 }, (_, i) => ({
              cn: `RHT-${(20100 + i).toString()}`,
              refId: `OD-${(50000 + i).toString()}`,
              tripId: `RHT-${(20100 + i).toString()}`,
              date: `${15 + (i % 6)}/02/2026`,
              from: ['Ingleburn', 'Moorebank', 'Eastern Creek', 'Sydney', 'Bankstown'][i % 5],
              to: ['Penrith', 'Liverpool', 'Parramatta', 'Manly', 'Bondi'][i % 5],
              desc: ['4 Tonne', '6 Tonne', '8 Tonne Hiab', 'Rigid Tilt Tray', '1 Tonne'][i % 5] + ' delivery',
              amount: Math.round((40 + Math.random() * 460) * 100) / 100,
              match: 'matched',
            })),
          ],
        });
        return;
      }

      // Build a generic new invoice row from the uploaded file
      const carriers = [
        'CENTURION TRANSPORT',
        'RIVET MINING SERVICES',
        'RON FINEMORE TRANSPORT',
        'BLENNERS TRANSPORT',
      ];
      const carrier = carriers[Math.floor(Math.random() * carriers.length)];
      const invNo = file.name.replace(/\.pdf$/i, '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12) || ('UP' + Date.now().toString().slice(-6));
      const today = new Date();
      const formatted = today.toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' });
      const flaggedCount = 1 + Math.floor(Math.random() * 3);
      const matchedCount = 2 + Math.floor(Math.random() * 4);

      onComplete({
        id: 'inv-' + Date.now(),
        carrier,
        invoiceNo: invNo,
        invoiceDate: formatted,
        invoiceDateISO: today.toISOString().slice(0, 10),
        amount: 25000 + Math.random() * 200000,
        aiSuggestion: 'review',
        summary: { type: 'partial', text: `${flaggedCount} to review` },
        status: 'review',
        pdfFile: file.name,
        pdfUrl: URL.createObjectURL(file),
        lineItemsTotal: matchedCount + flaggedCount,
        lineItemsMatched: matchedCount,
        lineItemsFlagged: flaggedCount,
        pages: 2 + Math.floor(Math.random() * 6),
        abn: `${10 + Math.floor(Math.random() * 90)} ${Math.floor(Math.random() * 1000).toString().padStart(3, '0')} ${Math.floor(Math.random() * 1000).toString().padStart(3, '0')} ${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`,
        isUploaded: true,
      });
    }, cumulative + 300);
  };

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget && phase !== 'processing') onClose(); }}>
      <div className="upload-modal" onClick={e => e.stopPropagation()}>
        {phase === 'select' ? (
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
                {Icon.upload(13)} Upload & process
              </button>
            </div>
          </>
        ) : (
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
      </div>
    </div>
  );
}
window.UploadModal = UploadModal;
