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
      // Build a new invoice row from the uploaded file
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
