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

// ── Pipeline stepper ──────────────────────────────────────────────
const STAGES = [
  {
    label: 'Planning',
    reached: (steps) => steps.some(s => s.name === 'Planning'),
  },
  {
    label: 'Researching',
    reached: (steps) => steps.some(s => s.name === 'web_search' || s.name === 'http_request'),
  },
  {
    label: 'Analyzing',
    reached: (steps) =>
      steps.some(s => s.name === 'execute_python') ||
      steps.filter(s => s.name === 'web_search' && (s.status === 'done' || s.status === 'failed')).length >= 2,
  },
  {
    label: 'Generating\nReport',
    reached: (steps) => steps.some(s => s.name === 'Final answer'),
  },
  {
    label: 'Completed',
    reached: (_steps, runStatus) => runStatus === 'done',
  },
]

function PipelineStepper({ steps, runStatus }) {
  if (!steps.length) return null

  // Index of the last stage that has been activated
  let lastReached = -1
  STAGES.forEach((s, i) => {
    if (s.reached(steps, runStatus)) lastReached = i
  })

  function stageState(i) {
    // "Completed" is only done when the run itself is done
    if (i === STAGES.length - 1) return runStatus === 'done' ? 'done' : 'pending'
    if (runStatus === 'done') return 'done'
    if (i < lastReached) return 'done'
    if (i === lastReached) return 'active'
    return 'pending'
  }

  const items = []
  STAGES.forEach((stage, i) => {
    const state = stageState(i)

    if (i > 0) {
      const connReached = stageState(i - 1) === 'done'
      items.push(
        <div key={`conn-${i}`} className={`pipeline-conn${connReached ? ' reached' : ''}`} />
      )
    }

    items.push(
      <div key={`step-${i}`} className="pipeline-step">
        <div className={`pipeline-circle ${state}`}>
          {state === 'done' ? '✓' : null}
        </div>
        <div className={`pipeline-label ${state}`}>
          {stage.label}
        </div>
      </div>
    )
  })

  return <div className="pipeline">{items}</div>
}

// ── RunPanel ──────────────────────────────────────────────────────
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

      <PipelineStepper steps={steps} runStatus={run.status} />

      <div className="steps-area">
        <div className="steps-title">Execution trace</div>
        <ExecutionTrace run={run} />
      </div>
    </>
  )
}
