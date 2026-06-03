import { useState } from 'react'

export default function GoalInput({ onLaunch }) {
  const [goal, setGoal]       = useState('')
  const [loading, setLoading] = useState(false)

  const launch = async () => {
    const trimmed = goal.trim()
    if (!trimmed) return
    setLoading(true)
    try {
      await onLaunch(trimmed)
      setGoal('')
    } catch (e) {
      alert('Failed to start run: ' + e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="input-row">
      <input
        className="goal-input"
        placeholder="Enter a high-level goal for the agent…"
        value={goal}
        disabled={loading}
        onChange={e => setGoal(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && launch()}
      />
      <button className="run-btn" disabled={loading} onClick={launch}>
        {loading ? '⏳ Launching…' : '▶ Run Agent'}
      </button>
    </div>
  )
}
