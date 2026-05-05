import { useState, useEffect, useRef } from 'react'
import './App.css'

const today = new Date(2026, 4, 6)

const initialTasks = [
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

const DAY_MS = 1000 * 60 * 60 * 24

function App() {
  const [offset, setOffset] = useState(0)
  const [tasks, setTasks] = useState(initialTasks)
  const columns = getColumns(offset)
  const dragRef = useRef(null)

  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === 'ArrowLeft') setOffset(o => o - 1)
      if (e.key === 'ArrowRight') setOffset(o => o + 1)
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [])

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!dragRef.current) return
      const { taskId, startX, colWidth } = dragRef.current
      const deltaX = e.clientX - startX
      const deltaDays = Math.round(deltaX / colWidth)
      if (deltaDays === dragRef.current.lastDelta) return
      dragRef.current.lastDelta = deltaDays
      setTasks(prev => prev.map(t => {
        if (t.id !== taskId) return t
        const newStart = new Date(dragRef.current.origStart.getTime() + deltaDays * DAY_MS)
        const newEnd = new Date(dragRef.current.origEnd.getTime() + deltaDays * DAY_MS)
        return { ...t, start: newStart, end: newEnd }
      }))
    }
    const handleMouseUp = () => { dragRef.current = null }
    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [])

  const handleBarMouseDown = (e, task) => {
    const colWidth = e.currentTarget.closest('table').offsetWidth / 15
    dragRef.current = {
      taskId: task.id,
      startX: e.clientX,
      colWidth,
      origStart: new Date(task.start),
      origEnd: new Date(task.end),
      lastDelta: 0,
    }
    e.preventDefault()
  }

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
                      <div
                        onMouseDown={(e) => handleBarMouseDown(e, task)}
                        style={{ background: '#3b82f6', height: '100%', borderRadius: '4px', cursor: 'grab' }}
                      ></div>
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
