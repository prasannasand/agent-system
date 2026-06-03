import ExecutionTrace from './ExecutionTrace'

function fmtMs(ms) {
  return ms != null ? `${(ms / 1000).toFixed(1)}s` : '—'
}

const STATUS = {
  running: ['badge badge-running', '⚡ RUNNING', {}],
  done:    ['badge badge-done',    '✓ DONE',     {}],
  failed:  ['badge badge-failed',  '✗ FAILED',   {}],
  queued:  ['badge badge-running', '⏳ QUEUED',  { color: '#fbbf24' }],
}

export default function RunPanel({ run, elapsedMs }) {
  if (!run) {
    return (
      <>
        <div className="main-header">
          <div className="goal-block">
            <div className="goal-label">Goal</div>
            <div className="goal-text">Select a run or launch a new one</div>
          </div>
          <div className="badge" style={{ visibility: 'hidden' }}>—</div>
        </div>
        <div className="stats-row">
          {['Elapsed', 'Steps', 'Tool calls', 'Tokens used'].map(l => (
            <div key={l} className="stat-cell">
              <div className="stat-label">{l}</div>
              <div className="stat-val">—</div>
            </div>
          ))}
        </div>
        <div className="steps-area">
          <div className="steps-title">Execution trace</div>
        </div>
      </>
    )
  }

  const [badgeCls, badgeLabel, badgeStyle] = STATUS[run.status] || STATUS.queued

  const steps     = run.steps || []
  const doneSteps = steps.filter(s => s.status === 'done' || s.status === 'failed').length
  const tools     = run.tool_calls  ?? run.tools_used  ?? doneSteps
  const tokens    = run.tokens_used ?? run.tokens      ?? 0
  // elapsedMs comes from the API response on every poll — no client-side interpolation
  const displayElapsed = fmtMs(elapsedMs)

  return (
    <>
      <div className="main-header">
        <div className="goal-block">
          <div className="goal-label">Goal</div>
          <div className="goal-text">{run.goal || '—'}</div>
        </div>
        <div className={badgeCls} style={badgeStyle}>{badgeLabel}</div>
      </div>

      <div className="stats-row">
        <div className="stat-cell">
          <div className="stat-label">Elapsed</div>
          <div className="stat-val amber">{displayElapsed}</div>
        </div>
        <div className="stat-cell">
          <div className="stat-label">Steps</div>
          <div className="stat-val">{steps.length ? `${doneSteps} / ${steps.length}` : '0 / ?'}</div>
        </div>
        <div className="stat-cell">
          <div className="stat-label">Tool calls</div>
          <div className="stat-val green">{tools}</div>
        </div>
        <div className="stat-cell">
          <div className="stat-label">Tokens used</div>
          <div className="stat-val purple">{Number(tokens).toLocaleString()}</div>
        </div>
      </div>

      <div className="steps-area">
        <div className="steps-title">Execution trace</div>
        <ExecutionTrace run={run} />
      </div>
    </>
  )
}
