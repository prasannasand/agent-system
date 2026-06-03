// ── Icon helpers ──────────────────────────────────────────────────
const TOOL_ICONS = { llm: '🧠', web: '🔍', code: '⚙️', api: '📡' }
function toolIcon(tool) { return TOOL_ICONS[tool] || '▸' }
function Spinner() { return <div className="step-spinner" /> }

// ── Typed detail renderers ────────────────────────────────────────
function PlanDetail({ plan }) {
  const items = Array.isArray(plan) ? plan : [String(plan)]
  return (
    <div className="step-detail plan-detail open">
      <ol style={{ paddingLeft: 16, margin: '4px 0' }}>
        {items.map((p, i) => <li key={i}>{p}</li>)}
      </ol>
    </div>
  )
}

function ReasoningDetail({ text }) {
  return (
    <div className="step-detail reasoning-detail open">
      <span className="val" style={{ fontStyle: 'italic' }}>{text}</span>
    </div>
  )
}

// ── Markdown renderer for Final answer ───────────────────────────
function MarkdownTable({ rows }) {
  const data = rows.filter(r => !/^\|[\s|:\-]+\|$/.test(r))
  if (!data.length) return null
  const [header, ...body] = data
  const cells = row => row.split('|').filter((_, j, a) => j > 0 && j < a.length - 1).map(c => c.trim())
  return (
    <table className="md-table">
      <thead><tr>{cells(header).map((c, i) => <th key={i}>{c}</th>)}</tr></thead>
      <tbody>{body.map((r, i) => <tr key={i}>{cells(r).map((c, j) => <td key={j}>{c}</td>)}</tr>)}</tbody>
    </table>
  )
}

function FinalAnswerDetail({ text }) {
  if (!text) return null
  const nodes  = []
  let   tbuf   = []
  let   key    = 0

  const flush = () => {
    if (tbuf.length) { nodes.push(<MarkdownTable key={key++} rows={[...tbuf]} />); tbuf = [] }
  }

  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (!line) { flush(); continue }
    if (line.startsWith('|')) { tbuf.push(line); continue }
    flush()
    if (line.startsWith('## '))
      nodes.push(<div key={key++} className="md-header">{line.slice(3)}</div>)
    else if (line.startsWith('- ') || line.startsWith('• '))
      nodes.push(<div key={key++} className="md-bullet">• {line.slice(2)}</div>)
    else if (/confidence score/i.test(line)) {
      const parts = line.split(/:\s*/)
      const val   = parts.length > 1 ? parts.slice(1).join(': ') : line
      nodes.push(
        <div key={key++} className="md-confidence">
          <span className="md-conf-label">Confidence Score</span>
          <span className="md-conf-value">{val}</span>
        </div>
      )
    } else {
      nodes.push(<div key={key++} className="md-text">{line}</div>)
    }
  }
  flush()
  return <div className="step-detail final-answer open">{nodes}</div>
}

// ── Default key/value detail ──────────────────────────────────────
function DefaultDetail({ detail, isOpen, index }) {
  const entries = Object.entries(detail)
  if (!entries.length) return null
  return (
    <div className={`step-detail${isOpen ? ' open' : ''}`} id={`detail-${index}`}>
      {entries.map(([k, v]) => (
        <span key={k}>
          <span className="key">{k}:</span>{' '}
          <span className={k === 'output' || k === 'out' ? 'out' : 'val'}>
            {typeof v === 'object' ? JSON.stringify(v) : String(v)}
          </span>
          <br />
        </span>
      ))}
    </div>
  )
}

// ── StepRow ───────────────────────────────────────────────────────
export default function StepRow({ step, index, isOpen, onToggle, isLast }) {
  const state  = step.status || 'pending'
  const dur    = step.duration_ms != null
    ? `${(step.duration_ms / 1000).toFixed(1)}s`
    : state === 'running' ? '...' : ''
  const detail = step.detail || {}

  let icon, detailNode, noToggle = false

  if (step.name === 'Planning' && detail.plan) {
    icon       = state === 'running' ? <Spinner /> : '📋'
    detailNode = <PlanDetail plan={detail.plan} />
    noToggle   = true
  } else if (step.name === 'Agent reasoning') {
    icon       = state === 'running' ? <Spinner /> : '🧠'
    const text = detail.output || detail.reasoning || Object.values(detail)[0] || ''
    detailNode = <ReasoningDetail text={String(text)} />
    noToggle   = true
  } else if (step.name === 'Final answer') {
    icon       = state === 'running' ? <Spinner /> : '✅'
    const raw  = typeof detail.output === 'string'
      ? detail.output
      : JSON.stringify(detail.output ?? detail)
    detailNode = <FinalAnswerDetail text={raw} />
    noToggle   = true
  } else {
    icon       = state === 'running' ? <Spinner /> : toolIcon(step.tool)
    detailNode = <DefaultDetail detail={detail} isOpen={isOpen} index={index} />
  }

  return (
    <div
      className={`step-row${noToggle ? ' no-toggle' : ''}`}
      onClick={noToggle ? undefined : onToggle}
    >
      <div className="step-left">
        <div className={`step-icon ${state}`}>{icon}</div>
        {!isLast && <div className="step-line" />}
      </div>
      <div className="step-body">
        <div className="step-header">
          <div className="step-name">{step.name || `Step ${index + 1}`}</div>
          <div className={`step-tool ${step.tool || ''}`}>{(step.tool || '').toUpperCase()}</div>
          <div className="step-duration">{dur}</div>
        </div>
        {detailNode}
      </div>
    </div>
  )
}
