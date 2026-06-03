import { useState, useEffect } from 'react'
import StepRow from './StepRow'

export default function ExecutionTrace({ run }) {
  const [openStep, setOpenStep] = useState(null)

  // Reset expanded step when the selected run changes
  useEffect(() => { setOpenStep(null) }, [run?.id])

  const steps = run?.steps || []

  // Debug: verify every step the API returned makes it here unchanged
  console.log(
    `[ExecutionTrace] run=${run?.id?.slice(-8) ?? '—'} status=${run?.status} steps(${steps.length}):`,
    steps.map(s => ({ name: s.name, tool: s.tool, status: s.status }))
  )

  if (!steps.length) {
    const msg = run?.status === 'queued'
      ? 'Agent queued — waiting for a free worker slot…'
      : 'No steps yet.'
    return <div style={{ fontSize: 13, color: 'var(--muted)', padding: '20px 0' }}>{msg}</div>
  }

  return (
    <div>
      {steps.map((s, i) => (
        <StepRow
          key={i}
          step={s}
          index={i}
          isOpen={openStep === i}
          onToggle={() => setOpenStep(prev => prev === i ? null : i)}
          isLast={i === steps.length - 1}
        />
      ))}
    </div>
  )
}
