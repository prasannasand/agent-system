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
    </div>
  )
}
