import { useState, useEffect, useRef, useCallback } from 'react'
import { getRuns, getRun, createRun, deleteRun, streamRun } from './api'
import Topbar from './components/Topbar'
import Sidebar from './components/Sidebar'
import RunPanel from './components/RunPanel'
import GoalInput from './components/GoalInput'

export default function App() {
  // Two separate lists so the sidebar never needs to compute Active/Completed —
  // it just renders whatever is in each array.
  const [activeRuns,    setActiveRuns]    = useState([])
  const [completedRuns, setCompletedRuns] = useState([])
  const [activeRunId,   setActiveRunId]   = useState(null)
  const [elapsedMs,     setElapsedMs]     = useState(null)
  const [uptimeSec,     setUptimeSec]     = useState(0)

  const pollRef          = useRef(null)
  const sseRef           = useRef(null)
  const activeRunIdRef   = useRef(null)
  const activeRunsRef    = useRef([])
  const completedRunsRef = useRef([])

  useEffect(() => { activeRunsRef.current    = activeRuns    }, [activeRuns])
  useEffect(() => { completedRunsRef.current = completedRuns }, [completedRuns])
  useEffect(() => { activeRunIdRef.current   = activeRunId   }, [activeRunId])

  // moveToCompleted lives in a ref so startTracking (useCallback([])) can call it
  // without needing it as a dependency.
  const moveToCompletedRef = useRef(null)
  moveToCompletedRef.current = (id) => {
    setActiveRuns(prev => {
      const run = prev.find(r => r.id === id)
      if (run) {
        setCompletedRuns(c => {
          if (c.some(r => r.id === id)) return c   // already there, don't duplicate
          return [run, ...c]
        })
      }
      return prev.filter(r => r.id !== id)
    })
  }

  // ── Uptime ticker ──────────────────────────────────────────────
  useEffect(() => {
    const t = setInterval(() => setUptimeSec(s => s + 1), 1000)
    return () => clearInterval(t)
  }, [])

  // ── Load runs on mount ─────────────────────────────────────────
  useEffect(() => {
    getRuns()
      .then(data => {
        const raw    = Array.isArray(data) ? data : (data.runs || [])
        const unique = raw.filter((r, i, arr) => arr.findIndex(x => x.id === r.id) === i)
        setActiveRuns(unique.filter(r => r.status === 'running' || r.status === 'queued'))
        setCompletedRuns(unique.filter(r => r.status === 'done'    || r.status === 'failed'))
        if (unique.length > 0) setActiveRunId(unique[0].id)
      })
      .catch(console.error)
  }, [])

  // ── Core: SSE + 300 ms authoritative poll ─────────────────────
  const startTracking = useCallback((id) => {
    clearInterval(pollRef.current)
    sseRef.current?.close()

    // ── SSE ──────────────────────────────────────────────────────
    const sse = streamRun(id)
    sseRef.current = sse

    // Applies an update function to whichever list currently holds the run.
    // The other list is untouched (no-op map).
    function applyToRun(fn) {
      setActiveRuns(fn)
      setCompletedRuns(fn)
    }

    function handleSSE(raw) {
      try {
        const data = JSON.parse(raw)

        // Step insert / update
        const step = data.step
          || ((data.type === 'step' || data.type === 'step_update') ? (data.data || data) : null)
          || (data.name && data.status ? data : null)
        if (step?.name) {
          applyToRun(prev => prev.map(r => {
            if (r.id !== id) return r
            const steps = r.steps || []
            const idx   = steps.findIndex(s => s.name === step.name)
            return {
              ...r,
              steps: idx >= 0
                ? steps.map((s, i) => i === idx ? { ...s, ...step } : s)
                : [...steps, step],
            }
          }))
        }

        // Completion signal from SSE
        const status = data.status
          || ((data.type === 'done' || data.type === 'complete') ? 'done' : null)
        if (status === 'done' || status === 'failed') {
          applyToRun(prev => prev.map(r =>
            r.id === id ? { ...r, status, elapsed_ms: data.elapsed_ms ?? r.elapsed_ms } : r
          ))
        }
      } catch { /* ignore malformed SSE payloads */ }
    }

    sse.onmessage = e => handleSSE(e.data)
    ;['step', 'step_update', 'done', 'complete'].forEach(t =>
      sse.addEventListener(t, e => handleSSE(e.data)))
    sse.onerror = () => { sse.close() }

    // ── 300 ms poll — source of truth ────────────────────────────
    pollRef.current = setInterval(async () => {
      try {
        const updated = await getRun(id)

        console.log(
          `[poll] id=…${id.slice(-8)} status=${updated.status}` +
          ` steps=${updated.steps?.length ?? 0}`
        )
        console.log('[poll] step names:', updated.steps?.map(s => s.name))

        // Update run in whichever list holds it
        applyToRun(prev => prev.map(r => r.id === id ? updated : r))

        if (activeRunIdRef.current === id) {
          setElapsedMs(updated.elapsed_ms ?? null)
        }

        if (updated.status === 'done' || updated.status === 'failed') {
          clearInterval(pollRef.current)
          pollRef.current = null
          sseRef.current?.close()
          sseRef.current = null
          // Keep in Active Runs for 1500 ms so the user sees it was active,
          // then slide it over to Completed.
          setTimeout(() => moveToCompletedRef.current(id), 1500)
        }
      } catch { /* network hiccup — retry on next tick */ }
    }, 300)
  }, []) // stable: only refs + stable state setters

  // ── Wire tracking to activeRunId changes ──────────────────────
  useEffect(() => {
    // Skip placeholder runs and cases where there's no active selection
    if (!activeRunId || activeRunId.startsWith('pending-')) return

    // Skip tracking for already-terminal runs (they're in completedRuns)
    const all = [...activeRunsRef.current, ...completedRunsRef.current]
    const cached = all.find(r => r.id === activeRunId)
    if (cached?.status === 'done' || cached?.status === 'failed') {
      setElapsedMs(cached.elapsed_ms ?? null)
      return
    }

    startTracking(activeRunId)
    return () => {
      clearInterval(pollRef.current)
      sseRef.current?.close()
    }
  }, [activeRunId, startTracking])

  // ── Handlers ──────────────────────────────────────────────────
  const handleSelectRun = useCallback((id) => {
    const run = [...activeRunsRef.current, ...completedRunsRef.current].find(r => r.id === id)
    setElapsedMs(run?.elapsed_ms ?? null)
    setActiveRunId(id)
  }, [])

  const handleLaunch = useCallback(async (goal) => {
    // 1) Add placeholder BEFORE the POST fires so it appears in Active instantly.
    const tempId = `pending-${Date.now()}`
    setActiveRuns(prev => [{
      id: tempId, goal, status: 'queued',
      steps: [], plan: [], elapsed_ms: null, tool_calls: 0, tokens_used: 0,
    }, ...prev])
    setActiveRunId(tempId)
    activeRunIdRef.current = tempId
    setElapsedMs(null)

    try {
      // 2) POST — swap the placeholder for the real run when the response arrives.
      const run = await createRun(goal)

      setActiveRuns(prev => prev.map(r => r.id === tempId ? run : r))
      activeRunIdRef.current = run.id

      // 3) Start 300 ms polling immediately; setActiveRunId will re-trigger
      //    startTracking via useEffect (harmless double-start — it clears first).
      startTracking(run.id)
      setActiveRunId(run.id)
    } catch (e) {
      setActiveRuns(prev => prev.filter(r => r.id !== tempId))
      setActiveRunId(prev => prev === tempId ? null : prev)
      throw e
    }
  }, [startTracking])

  const handleDelete = useCallback(async (id) => {
    try { await deleteRun(id) } catch { /* optimistic */ }
    setActiveRuns(prev    => prev.filter(r => r.id !== id))
    setCompletedRuns(prev => prev.filter(r => r.id !== id))
    setActiveRunId(prev   => prev === id ? null : prev)
  }, [])

  // ── Derived ───────────────────────────────────────────────────
  const activeRun   = [...activeRuns, ...completedRuns].find(r => r.id === activeRunId) ?? null
  const workerCount = activeRuns.filter(r => r.status === 'running').length
  const queueCount  = activeRuns.filter(r => r.status === 'queued' && !r.id.startsWith('pending-')).length

  return (
    <div className="shell">
      <Topbar workerCount={workerCount} queueCount={queueCount} uptimeSec={uptimeSec} />
      <Sidebar
        activeRuns={activeRuns}
        completedRuns={completedRuns}
        activeRunId={activeRunId}
        onSelect={handleSelectRun}
        onDelete={handleDelete}
      />
      <div className="main">
        <RunPanel run={activeRun} elapsedMs={elapsedMs} />
        <GoalInput onLaunch={handleLaunch} />
      </div>
    </div>
  )
}
