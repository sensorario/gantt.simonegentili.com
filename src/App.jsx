import { useState, useEffect } from 'react'
import './App.css'

const today = new Date(2026, 4, 6)

const tasks = [
  { id: 1, name: 'Task Alpha', start: new Date(2026, 4, 6), end: new Date(2026, 4, 10) },
  { id: 2, name: 'Task Beta', start: new Date(2026, 4, 9), end: new Date(2026, 4, 16) },
]

function getColumns(offset) {
  return Array.from({ length: 14 }, (_, i) => {
    const date = new Date(today)
    date.setDate(today.getDate() + offset + i)
    return { label: date.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' }), date: new Date(date) }
  })
}

function isBetween(date, start, end) {
  const d = date.getTime()
  const s = new Date(start.getFullYear(), start.getMonth(), start.getDate()).getTime()
  const e = new Date(end.getFullYear(), end.getMonth(), end.getDate()).getTime()
  return d >= s && d <= e
}

function App() {
  const [offset, setOffset] = useState(0)
  const columns = getColumns(offset)

  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === 'ArrowLeft') setOffset(o => o - 1)
      if (e.key === 'ArrowRight') setOffset(o => o + 1)
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [])

  return (
    <div className="app">
      <h1>Tabella 14 colonne</h1>
      <div style={{ marginBottom: '12px', display: 'flex', gap: '8px' }}>
        <button onClick={() => setOffset(o => o - 1)}>&#8592; Giorno precedente</button>
        <button onClick={() => setOffset(o => o + 1)}>Giorno successivo &#8594;</button>
      </div>
      <table border="1" cellPadding="4" cellSpacing="0" style={{ tableLayout: 'fixed', width: '100%' }}>
        <thead>
          <tr>
            <th style={{ width: '120px', fontSize: '11px' }}>Nome</th>
            {columns.map(({ label }) => (
              <th key={label} style={{ width: '7%', fontSize: '11px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {tasks.map((task) => {
            const firstActive = columns.findIndex(({ date }) => isBetween(date, task.start, task.end))
            const lastActive = columns.findLastIndex(({ date }) => isBetween(date, task.start, task.end))

            return (
              <tr key={task.id}>
                <td style={{ fontSize: '11px' }}>{task.name}</td>
                {firstActive === -1 ? (
                  <td colSpan={14}></td>
                ) : (
                  <>
                    {firstActive > 0 && <td colSpan={firstActive}></td>}
                    <td
                      colSpan={lastActive - firstActive + 1}
                      style={{ height: '36px', padding: '4px', verticalAlign: 'middle' }}
                    >
                      <div style={{ background: '#3b82f6', height: '100%', borderRadius: '4px' }}></div>
                    </td>
                    {lastActive < 13 && <td colSpan={13 - lastActive}></td>}
                  </>
                )}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export default App
