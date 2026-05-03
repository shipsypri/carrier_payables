// Carrier Payables list screen
function ListScreen({ invoices, onOpenDetail, onOpenUpload, onApprove, onReject }) {
  const [tab, setTab] = React.useState('review');
  const [search, setSearch] = React.useState('');
  const [selected, setSelected] = React.useState(new Set());

  const counts = React.useMemo(() => ({
    review: invoices.filter(i => i.status === 'review').length,
    approved: invoices.filter(i => i.status === 'approved').length,
    rejected: invoices.filter(i => i.status === 'rejected').length,
    all: invoices.length,
  }), [invoices]);

  const filtered = React.useMemo(() => {
    let list = tab === 'all' ? invoices : invoices.filter(i => i.status === tab);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(i =>
        i.carrier.toLowerCase().includes(q) ||
        i.invoiceNo.toLowerCase().includes(q)
      );
    }
    return list;
  }, [invoices, tab, search]);

  // Reset selection when tab changes
  React.useEffect(() => { setSelected(new Set()); }, [tab]);

  const toggleRow = (id) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelected(next);
  };
  const toggleAll = () => {
    if (selected.size === filtered.length) setSelected(new Set());
    else setSelected(new Set(filtered.map(i => i.id)));
  };

  const bulkApprove = () => {
    selected.forEach(id => onApprove(id));
    setSelected(new Set());
  };
  const bulkReject = () => {
    selected.forEach(id => onReject(id));
    setSelected(new Set());
  };

  const showCheckbox = tab === 'review';
  const allSelected = filtered.length > 0 && selected.size === filtered.length;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Carrier Payables</h1>
          <div className="sub">Manage and reconcile carrier invoices</div>
        </div>
        <button className="btn btn-primary" onClick={onOpenUpload}>
          {Icon.upload(14)} Upload Invoice
        </button>
      </div>

      <div className="surface">
        <div className="tabs">
          {[
            { id: 'review',   label: 'Review',   count: counts.review },
            { id: 'approved', label: 'Approved', count: counts.approved },
            { id: 'rejected', label: 'Rejected', count: counts.rejected },
            { id: 'all',      label: 'All',      count: counts.all },
          ].map(t => (
            <button
              key={t.id}
              className={`tab tab-${t.id} ${tab === t.id ? 'active' : ''}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
              <span className="badge">{t.count}</span>
            </button>
          ))}
        </div>

        {showCheckbox && selected.size > 0 && (
          <div className="bulk-bar">
            <div className="count">{selected.size} invoice{selected.size === 1 ? '' : 's'} selected</div>
            <div className="bulk-actions">
              <button className="bulk-btn approve" onClick={bulkApprove}>
                {Icon.check(12)} Approve selected
              </button>
              <button className="bulk-btn reject" onClick={bulkReject}>
                {Icon.x(12)} Reject selected
              </button>
              <button className="bulk-btn clear" onClick={() => setSelected(new Set())}>Clear</button>
            </div>
          </div>
        )}

        <div className="search-row">
          <div className="search">
            {Icon.search(14)}
            <input
              type="text"
              placeholder="Search carrier, invoice number..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="empty">
            {search ? `No invoices match "${search}"` : 'No invoices in this tab'}
          </div>
        ) : (
          <table className="inv-table">
            <thead>
              <tr>
                {showCheckbox && (
                  <th style={{ width: 40 }}>
                    <input
                      type="checkbox"
                      className="checkbox"
                      checked={allSelected}
                      onChange={toggleAll}
                    />
                  </th>
                )}
                <th>Carrier Name</th>
                <th>Invoice Number</th>
                <th>Invoice Date</th>
                <th>Amount</th>
                <th>AI Suggestion</th>
                <th>Summary</th>
                <th style={{ width: 120 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(inv => (
                <tr key={inv.id}>
                  {showCheckbox && (
                    <td>
                      <input
                        type="checkbox"
                        className="checkbox"
                        checked={selected.has(inv.id)}
                        onChange={() => toggleRow(inv.id)}
                      />
                    </td>
                  )}
                  <td className="carrier-name">{inv.carrier}</td>
                  <td style={{ color: 'var(--ink-2)' }}>{inv.invoiceNo}</td>
                  <td style={{ color: 'var(--ink-2)' }}>{inv.invoiceDate}</td>
                  <td className="amount-cell">{AUD(inv.amount)}</td>
                  <td>
                    <span className={`ai-pill ${inv.aiSuggestion}`}>
                      {inv.aiSuggestion === 'review' ? 'Review' : inv.aiSuggestion === 'approve' ? 'Approve' : 'Reject'}
                    </span>
                  </td>
                  <td>
                    <span className={`summary-pill ${inv.summary.type}`}>{inv.summary.text}</span>
                  </td>
                  <td>
                    <div className="actions">
                      <button
                        className="iact eye"
                        title="View invoice details"
                        onClick={() => onOpenDetail(inv.id)}
                      >
                        {Icon.eye(15)}
                      </button>
                      <button
                        className="iact approve"
                        title="Approve"
                        disabled={inv.status === 'approved'}
                        onClick={() => onApprove(inv.id)}
                      >
                        {Icon.check(15)}
                      </button>
                      <button
                        className="iact reject"
                        title="Reject"
                        disabled={inv.status === 'rejected'}
                        onClick={() => onReject(inv.id)}
                      >
                        {Icon.x(15)}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
window.ListScreen = ListScreen;
