const BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000'

export const getRuns   = () => fetch(`${BASE}/runs`).then(r => r.json())
export const getRun    = (id) => fetch(`${BASE}/runs/${id}`).then(r => r.json())
export const createRun = (goal) =>
  fetch(`${BASE}/runs`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ goal }),
  }).then(r => r.json())
export const deleteRun = (id) =>
  fetch(`${BASE}/runs/${id}`, { method: 'DELETE' }).then(r => r.json())
export const streamRun = (id) => new EventSource(`${BASE}/runs/${id}/stream`)
