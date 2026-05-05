import { useState, useEffect, useLayoutEffect, useRef } from 'react'
import './App.css'

const today = new Date(2026, 4, 6)

const initialTasks = [
  { id: 1, name: 'Task Alpha', start: new Date(2026, 4, 6), end: new Date(2026, 4, 8) },
  { id: 2, name: 'Task Beta', start: new Date(2026, 4, 9), end: new Date(2026, 4, 16), dependsOn: 1 },
  { id: 3, name: 'Task Gamma', start: new Date(2026, 4, 10), end: new Date(2026, 4, 11), dependsOn: 1 },
]

function getColumns(offset, visibleDays) {
  return Array.from({ length: visibleDays }, (_, i) => {
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

function resolveConstraints(tasks, movedId) {
  const result = tasks.map(t => ({ ...t, start: new Date(t.start), end: new Date(t.end) }))
  const pushedRight = new Set()
  const pushedLeft = new Set()

  let changed = true
  while (changed) {
    changed = false
    for (const child of result) {
      if (!child.dependsOn) continue
      const parent = result.find(t => t.id === child.dependsOn)
      if (!parent) continue

      const overlap = child.start.getTime() <= parent.end.getTime()
      if (!overlap) continue

      const isParentMoved = parent.id === movedId || pushedRight.has(parent.id)
      const isChildMoved = child.id === movedId || pushedLeft.has(child.id)

      if (isParentMoved && !isChildMoved) {
        const dur = child.end.getTime() - child.start.getTime()
        child.start = new Date(parent.end.getTime() + DAY_MS)
        child.end = new Date(child.start.getTime() + dur)
        pushedRight.add(child.id)
        changed = true
      } else if (isChildMoved && !isParentMoved) {
        const dur = parent.end.getTime() - parent.start.getTime()
        parent.end = new Date(child.start.getTime() - DAY_MS)
        parent.start = new Date(parent.end.getTime() - dur)
        pushedLeft.add(parent.id)
        changed = true
      } else if (!isParentMoved && !isChildMoved) {
        const dur = child.end.getTime() - child.start.getTime()
        child.start = new Date(parent.end.getTime() + DAY_MS)
        child.end = new Date(child.start.getTime() + dur)
        pushedRight.add(child.id)
        changed = true
      }
    }
  }
  return result
}

function App() {
  const [offset, setOffset] = useState(0)
  const [tasks, setTasks] = useState(initialTasks)
  const [visibleDays, setVisibleDays] = useState(14)
  const [arrows, setArrows] = useState([])
  const columns = getColumns(offset, visibleDays)
  const dragRef = useRef(null)
  const rowDragRef = useRef(null)
  const [dragOverId, setDragOverId] = useState(null)
  const barRefs = useRef({})
  const rowRefs = useRef({})
  const containerRef = useRef(null)

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

      // spostamento orizzontale → cambia date
      const deltaX = e.clientX - startX
      const deltaDays = Math.round(deltaX / colWidth)
      if (deltaDays !== dragRef.current.lastDelta) {
        dragRef.current.lastDelta = deltaDays
        setTasks(prev => {
          const updated = prev.map(t => {
            if (t.id !== taskId) return t
            return {
              ...t,
              start: new Date(dragRef.current.origStart.getTime() + deltaDays * DAY_MS),
              end: new Date(dragRef.current.origEnd.getTime() + deltaDays * DAY_MS),
            }
          })
          return resolveConstraints(updated, taskId)
        })
      }

      // spostamento verticale → evidenzia riga target
      let overId = null
      for (const [id, el] of Object.entries(rowRefs.current)) {
        if (!el) continue
        const rect = el.getBoundingClientRect()
        if (e.clientY >= rect.top && e.clientY <= rect.bottom) {
          overId = Number(id)
          break
        }
      }
      setDragOverId(overId !== taskId ? overId : null)
    }
    const handleMouseUp = () => {
      if (!dragRef.current) return
      const { taskId } = dragRef.current
      dragRef.current = null

      // riordina riga se c'è una destinazione verticale
      setDragOverId(prev => {
        if (prev !== null && prev !== taskId) {
          setTasks(tasks => {
            const fromIdx = tasks.findIndex(t => t.id === taskId)
            const toIdx = tasks.findIndex(t => t.id === prev)
            const next = [...tasks]
            const [moved] = next.splice(fromIdx, 1)
            next.splice(toIdx, 0, moved)
            return next
          })
        }
        return null
      })
    }
    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [])

  useEffect(() => {
    const handleRowMouseMove = (e) => {
      if (!rowDragRef.current) return
      let overId = null
      for (const [id, el] of Object.entries(rowRefs.current)) {
        if (!el) continue
        const rect = el.getBoundingClientRect()
        if (e.clientY >= rect.top && e.clientY <= rect.bottom) {
          overId = Number(id)
          break
        }
      }
      setDragOverId(overId)
    }
    const handleRowMouseUp = () => {
      if (!rowDragRef.current) return
      const { taskId } = rowDragRef.current
      rowDragRef.current = null
      if (dragOverId === null || dragOverId === taskId) {
        setDragOverId(null)
        return
      }
      setTasks(prev => {
        const fromIdx = prev.findIndex(t => t.id === taskId)
        const toIdx = prev.findIndex(t => t.id === dragOverId)
        const next = [...prev]
        const [moved] = next.splice(fromIdx, 1)
        next.splice(toIdx, 0, moved)
        return next
      })
      setDragOverId(null)
    }
    window.addEventListener('mousemove', handleRowMouseMove)
    window.addEventListener('mouseup', handleRowMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleRowMouseMove)
      window.removeEventListener('mouseup', handleRowMouseUp)
    }
  }, [dragOverId])

  const handleBarMouseDown = (e, task) => {
    const colWidth = e.currentTarget.closest('table').offsetWidth / (visibleDays + 1)
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

  useLayoutEffect(() => {
    if (!containerRef.current) return
    const containerRect = containerRef.current.getBoundingClientRect()
    const newArrows = []
    for (const task of tasks) {
      if (!task.dependsOn) continue
      const fromEl = barRefs.current[task.id]
      const toEl = barRefs.current[task.dependsOn]
      if (!fromEl || !toEl) continue
      const fromRect = fromEl.getBoundingClientRect()
      const toRect = toEl.getBoundingClientRect()
      const x1 = fromRect.left - containerRect.left
      const y1 = fromRect.top - containerRect.top + fromRect.height / 2
      const x2 = toRect.right - containerRect.left
      const y2 = toRect.top - containerRect.top + toRect.height / 2
      newArrows.push({ id: `${task.dependsOn}-${task.id}`, x1, y1, x2, y2 })
    }
    setArrows(prev => JSON.stringify(prev) === JSON.stringify(newArrows) ? prev : newArrows)
  }, [tasks])

  return (
    <div className="app">
      <h1>Tabella 14 colonne</h1>
      <div style={{ marginBottom: '12px', display: 'flex', gap: '8px', alignItems: 'center' }}>
        <button onClick={() => setOffset(o => o - 1)}>&#8592; Giorno precedente</button>
        <button onClick={() => setOffset(o => o + 1)}>Giorno successivo &#8594;</button>
        <span style={{ marginLeft: '16px', fontSize: '12px' }}>Mostra:</span>
        {[7, 14, 30, 60].map(d => (
          <button
            key={d}
            onClick={() => setVisibleDays(d)}
            style={{ fontWeight: visibleDays === d ? 'bold' : 'normal', textDecoration: visibleDays === d ? 'underline' : 'none' }}
          >{d}g</button>
        ))}
      </div>
      <div ref={containerRef} style={{ position: 'relative' }}>
        <svg style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none', overflow: 'visible' }}>
          {arrows.map(({ id, x1, y1, x2, y2 }) => (
            <path
              key={id}
              d={`M${x1},${y1} C${x1 - 40},${y1} ${x2 + 40},${y2} ${x2},${y2}`}
              stroke="#ef4444" strokeWidth="2" fill="none"
            />
          ))}
        </svg>
        <table border="1" cellPadding="4" cellSpacing="0" style={{ tableLayout: 'fixed', width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ width: '120px', fontSize: '11px', border: '1px solid #d1d5db' }}>Nome</th>
              {columns.map(({ label }) => (
                <th key={label} style={{ width: '7%', fontSize: '11px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', border: '1px solid #d1d5db' }}>{label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tasks.map((task) => {
              const firstActive = columns.findIndex(({ date }) => isBetween(date, task.start, task.end))
              const lastActive = columns.findLastIndex(({ date }) => isBetween(date, task.start, task.end))

              return (
                <tr
                  key={task.id}
                  ref={el => rowRefs.current[task.id] = el}
                  style={{ outline: dragOverId === task.id ? '2px solid #f59e0b' : 'none' }}
                >
                  <td style={{ fontSize: '11px', border: '1px solid #d1d5db', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span
                      onMouseDown={() => { rowDragRef.current = { taskId: task.id } }}
                      style={{ cursor: 'grab', color: '#9ca3af', userSelect: 'none', fontSize: '14px' }}
                    >⠿</span>
                    {task.name}
                  </td>
                  {firstActive === -1 ? (
                    <td colSpan={visibleDays} style={{ border: 'none' }}></td>
                  ) : (
                    <>
                      {firstActive > 0 && <td colSpan={firstActive} style={{ border: 'none' }}></td>}
                      <td
                        colSpan={lastActive - firstActive + 1}
                        style={{ height: '36px', padding: '4px', verticalAlign: 'middle', border: 'none' }}
                      >
                        <div
                          ref={el => barRefs.current[task.id] = el}
                          onMouseDown={(e) => handleBarMouseDown(e, task)}
                          style={{ background: '#3b82f6', height: '100%', borderRadius: '4px', cursor: 'grab' }}
                        ></div>
                      </td>
                      {lastActive < visibleDays - 1 && <td colSpan={visibleDays - 1 - lastActive} style={{ border: 'none' }}></td>}
                    </>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default App
