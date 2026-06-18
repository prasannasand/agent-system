import { useState } from 'react'

// ── Icon helpers ───────────────────────────────────────────────────
const TOOL_ICONS = { llm: '🧠', web: '🔍', code: '⚙️', api: '📡' }
function toolIcon(tool) { return TOOL_ICONS[tool] || '▸' }
function Spinner() { return <div className="step-spinner" /> }

// ── Inline bold: **text** → <strong> ──────────────────────────────
function inlineBold(text) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g)
  return parts.map((p, i) =>
    p.startsWith('**') && p.endsWith('**')
      ? <strong key={i}>{p.slice(2, -2)}</strong>
      : p
  )
}

// ── Planning ──────────────────────────────────────────────────────
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

// ── Agent reasoning ───────────────────────────────────────────────
function ReasoningDetail({ text }) {
  return (
    <div className="step-detail reasoning-detail open">
      <span className="val" style={{ fontStyle: 'italic' }}>{text}</span>
    </div>
  )
}

// ── Final answer (markdown) ───────────────────────────────────────
const URL_REGEX = /https?:\/\/[^\s)]+/g

function extractUrls(text) {
  const seen = new Set()
  const urls = []
  for (const match of text.matchAll(URL_REGEX)) {
    const url = match[0]
    if (!seen.has(url)) {
      seen.add(url)
      urls.push(url)
    }
  }
  return urls
}

function domainFromUrl(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url.replace(/^https?:\/\//, '').replace(/^www\./, '').split(/[/:?#]/)[0]
  }
}

function SourcesSection({ text }) {
  const urls = extractUrls(text)
  if (!urls.length) return null
  return (
    <div className="md-sources">
      <div className="md-sources-label">Sources</div>
      <ol className="md-sources-list">
        {urls.map(url => (
          <li key={url}>
            <a href={url} target="_blank" rel="noopener noreferrer">
              {domainFromUrl(url)}
            </a>
          </li>
        ))}
      </ol>
    </div>
  )
}

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
  const nodes = []
  let   tbuf  = []
  let   key   = 0

  const flush = () => {
    if (tbuf.length) { nodes.push(<MarkdownTable key={key++} rows={[...tbuf]} />); tbuf = [] }
  }

  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (!line) { flush(); continue }
    if (line.startsWith('|')) { tbuf.push(line); continue }
    flush()
    if (line.startsWith('## '))
      nodes.push(<div key={key++} className="md-header">{inlineBold(line.slice(3))}</div>)
    else if (line.startsWith('- ') || line.startsWith('• '))
      nodes.push(<div key={key++} className="md-bullet">• {inlineBold(line.slice(2))}</div>)
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
      nodes.push(<div key={key++} className="md-text">{inlineBold(line)}</div>)
    }
  }
  flush()
  return (
    <div className="step-detail final-answer open">
      {nodes}
      <SourcesSection text={text} />
    </div>
  )
}

// ── web_search ────────────────────────────────────────────────────
function WebSearchDetail({ detail, dur }) {
  const query   = detail.query   || ''
  const results = Array.isArray(detail.results) ? detail.results : []
  return (
    <div className="step-detail open">
      {query && (
        <div className="sd-query">
          <div className="sd-query-label">Query</div>
          <div className="sd-query-text">{query}</div>
        </div>
      )}
      <div className="sd-results">
        {results.map((r, i) => (
          <div key={i} className="sd-result">
            <a href={typeof r.url === 'string' && /^https?:\/\//i.test(r.url) ? r.url : undefined} target="_blank" rel="noopener noreferrer" className="sd-result-title">
              {r.title || r.url}
            </a>
            {r.snippet && <div className="sd-result-snippet">{r.snippet}</div>}
          </div>
        ))}
      </div>
      <div className="sd-footer">
        <span>{results.length} source{results.length !== 1 ? 's' : ''} found</span>
        {dur && <span>{dur}</span>}
      </div>
    </div>
  )
}

// ── http_request ──────────────────────────────────────────────────
function HttpRequestDetail({ detail }) {
  const [expanded, setExpanded] = useState(false)
  const method = (detail.method || 'GET').toLowerCase()
  const url    = detail.url || ''
  const status = detail.status
  const body   = detail.body

  const bodyStr = body == null ? '' : typeof body === 'object' ? JSON.stringify(body, null, 2) : String(body)
  const preview = bodyStr.slice(0, 200)
  const hasMore = bodyStr.length > 200

  const statusColor =
    status == null  ? 'var(--muted)' :
    status < 300    ? 'var(--accent)' :
    status < 400    ? 'var(--amber)' :
    /* 4xx/5xx */     'var(--coral)'
  const statusLabel =
    status == null ? '' : status < 300 ? 'OK' : status < 400 ? 'Redirect' : 'Error'

  return (
    <div className="step-detail open">
      <div className="sd-http-line">
        <span className={`sd-method sd-method-${method}`}>{method.toUpperCase()}</span>
        <span className="sd-url">{url}</span>
      </div>
      {status != null && (
        <div className="sd-status">
          <span style={{ color: statusColor, fontWeight: 700 }}>{status}</span>
          {statusLabel && <span style={{ color: 'var(--muted)', marginLeft: 6 }}>{statusLabel}</span>}
        </div>
      )}
      {bodyStr && (
        <div className="sd-body">
          <pre className="sd-pre">{expanded ? bodyStr : preview}{!expanded && hasMore ? '…' : ''}</pre>
          {hasMore && (
            <button
              className="sd-toggle"
              onClick={e => { e.stopPropagation(); setExpanded(x => !x) }}
            >
              {expanded ? 'show less ↑' : 'show more ↓'}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ── execute_python ────────────────────────────────────────────────
function ExecutePythonDetail({ detail }) {
  const code     = detail.code      || ''
  const stdout   = detail.stdout    || ''
  const stderr   = detail.stderr    || ''
  const exitCode = detail.exit_code

  return (
    <div className="step-detail open">
      {code && <pre className="sd-code">{code}</pre>}
      {stdout && (
        <div className="sd-output sd-stdout">
          <span className="sd-output-label">stdout</span>
          <pre className="sd-pre">{stdout}</pre>
        </div>
      )}
      {stderr && (
        <div className="sd-output sd-stderr">
          <span className="sd-output-label">stderr</span>
          <pre className="sd-pre">{stderr}</pre>
        </div>
      )}
      {exitCode != null && (
        <div className="sd-exit">
          <span className={`sd-exit-badge ${exitCode === 0 ? 'success' : 'error'}`}>
            exit {exitCode}
          </span>
        </div>
      )}
    </div>
  )
}

// ── Default key/value ─────────────────────────────────────────────
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
    detailNode = <ReasoningDetail text={String(detail.output || detail.reasoning || Object.values(detail)[0] || '')} />
    noToggle   = true

  } else if (step.name === 'Final answer') {
    icon       = state === 'running' ? <Spinner /> : '✅'
    const raw  = typeof detail.output === 'string' ? detail.output : JSON.stringify(detail.output ?? detail)
    detailNode = <FinalAnswerDetail text={raw} />
    noToggle   = true

  } else if (step.name === 'web_search') {
    icon       = state === 'running' ? <Spinner /> : '🔍'
    detailNode = isOpen ? <WebSearchDetail detail={detail} dur={dur} /> : null

  } else if (step.name === 'http_request') {
    icon       = state === 'running' ? <Spinner /> : '📡'
    detailNode = isOpen ? <HttpRequestDetail detail={detail} /> : null

  } else if (step.name === 'execute_python') {
    icon       = state === 'running' ? <Spinner /> : '⚙️'
    detailNode = isOpen ? <ExecutePythonDetail detail={detail} /> : null

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
