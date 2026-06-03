export default function Topbar({ workerCount, queueCount, uptimeSec }) {
  const h = String(Math.floor(uptimeSec / 3600)).padStart(2, '0')
  const m = String(Math.floor((uptimeSec % 3600) / 60)).padStart(2, '0')
  const s = String(uptimeSec % 60).padStart(2, '0')

  return (
    <div className="topbar">
      <div className="logo">AgentOS <span>/ Execution Engine</span></div>
      <div className="topbar-sep" />
      <div className="status-pill">
        <div className="pulse" />
        {workerCount} active workers
      </div>
      <div className="topbar-right">
        <div className="metric-chip">Redis <strong>{queueCount}</strong> queued</div>
        <div className="topbar-sep" />
        <div className="metric-chip">MongoDB <strong>connected</strong></div>
        <div className="topbar-sep" />
        <div className="metric-chip">Uptime <strong>{`${h}:${m}:${s}`}</strong></div>
      </div>
    </div>
  )
}
