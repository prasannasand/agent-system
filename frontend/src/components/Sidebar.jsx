function fmtMs(ms) {
  return ms != null ? `${(ms / 1000).toFixed(1)}s` : '—'
}

function SidebarItem({ run, active, onSelect, onDelete }) {
  const isPending = run.id?.startsWith('pending-')
  const dot  = { running: 'running', queued: 'queued', done: 'done', failed: 'failed' }[run.status] || 'queued'
  const time = isPending
    ? 'posting…'
    : run.status === 'queued' ? 'queued' : fmtMs(run.elapsed_ms)
  const name = (run.goal || 'Unnamed').slice(0, 22) + ((run.goal || '').length > 22 ? '…' : '')

  return (
    <div
      className={`run-item${active ? ' active' : ''}`}
      data-run-id={run.id}
      style={isPending ? { opacity: 0.6 } : {}}
      onClick={() => !isPending && onSelect(run.id)}
    >
      <div className={`run-dot ${dot}`} />
      <div className="run-name">{name}</div>
      <div className="run-time">{time}</div>
      {!isPending && (
        <button
          className="run-delete"
          title="Delete"
          onClick={e => { e.stopPropagation(); onDelete(run.id) }}
        >
          ×
        </button>
      )}
    </div>
  )
}

function MetricsPanel({ activeRuns, completedRuns }) {
  const real = [...activeRuns, ...completedRuns].filter(r => !r.id?.startsWith('pending-'))
  const total   = real.length
  const done    = real.filter(r => r.status === 'done').length
  const failed  = real.filter(r => r.status === 'failed').length
  const withMs  = real.filter(r => r.elapsed_ms != null && r.elapsed_ms > 0)
  const avgMs   = withMs.length ? withMs.reduce((s, r) => s + r.elapsed_ms, 0) / withMs.length : null
  const withTc  = real.filter(r => r.tool_calls != null)
  const avgTc   = withTc.length ? withTc.reduce((s, r) => s + r.tool_calls, 0) / withTc.length : 0
  const tokens  = real.reduce((s, r) => s + (r.tokens_used || 0), 0)
  const rate    = total > 0 ? Math.round((done / total) * 100) : 0

  const metrics = [
    { label: 'Total Runs',     value: total,                          color: 'var(--text)'    },
    { label: 'Success Rate',   value: total > 0 ? `${rate}%` : '—',  color: 'var(--accent)'  },
    { label: 'Avg Time',       value: avgMs != null ? fmtMs(avgMs) : '—', color: 'var(--amber)' },
    { label: 'Avg Tool Calls', value: withTc.length ? avgTc.toFixed(1) : '—', color: 'var(--accent2)' },
    { label: 'Total Tokens',   value: tokens > 0 ? tokens.toLocaleString() : '—', color: 'var(--accent2)' },
    { label: 'Failed Runs',    value: failed,                         color: failed > 0 ? 'var(--coral)' : 'var(--muted)' },
  ]

  return (
    <div className="metrics-panel">
      <div className="sidebar-label" style={{ padding: '0 6px', marginBottom: 10 }}>Session Stats</div>
      <div className="metrics-grid">
        {metrics.map(m => (
          <div key={m.label} className="metric-card">
            <div className="metric-card-label">{m.label}</div>
            <div className="metric-card-value" style={{ color: m.color }}>{m.value}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function Sidebar({ activeRuns, completedRuns, activeRunId, onSelect, onDelete }) {
  return (
    <div className="sidebar">
      <div className="sidebar-section" id="sidebar-active">
        <div className="sidebar-label">Active Runs</div>
        {activeRuns.length > 0
          ? activeRuns.map(r => (
              <SidebarItem
                key={r.id} run={r}
                active={r.id === activeRunId}
                onSelect={onSelect}
                onDelete={onDelete}
              />
            ))
          : <div style={{ fontSize: 12, color: 'var(--muted)', padding: '6px 10px' }}>No active runs</div>
        }
      </div>
      <div className="sidebar-section" id="sidebar-completed">
        <div className="sidebar-label">Completed</div>
        {completedRuns.length > 0
          ? completedRuns.map(r => (
              <SidebarItem
                key={r.id} run={r}
                active={r.id === activeRunId}
                onSelect={onSelect}
                onDelete={onDelete}
              />
            ))
          : <div style={{ fontSize: 12, color: 'var(--muted)', padding: '6px 10px' }}>No completed runs</div>
        }
      </div>
      <MetricsPanel activeRuns={activeRuns} completedRuns={completedRuns} />
    </div>
  )
}
