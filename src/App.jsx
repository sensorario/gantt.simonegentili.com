import { useState, useEffect, useLayoutEffect, useRef } from 'react'
import './App.css'
import { SGFooter } from '@sensorario/sg-components'
import { Temporal } from '@js-temporal/polyfill'
import { initialProjects } from './data/projects'

const today = Temporal.PlainDate.from('2026-05-01')

function getColumns(offset, visibleDays) {
  const now = Temporal.Now.plainDateISO()
  return Array.from({ length: visibleDays }, (_, i) => {
    const date = today.add({ days: offset + i })
    return {
      label: date.toLocaleString('it-IT', { day: '2-digit', month: '2-digit' }),
      date,
      isToday: Temporal.PlainDate.compare(date, now) === 0,
    }
  })
}

function isBetween(date, start, end) {
  return (
    Temporal.PlainDate.compare(date, start) >= 0 &&
    Temporal.PlainDate.compare(date, end) <= 0
  )
}

function resolveConstraints(tasks, movedId) {
  const result = tasks.map(t => ({ ...t }))
  const pushedRight = new Set()
  const pushedLeft = new Set()

  let changed = true
  while (changed) {
    changed = false
    for (const child of result) {
      const deps = Array.isArray(child.dependsOn) ? child.dependsOn : child.dependsOn ? [child.dependsOn] : []
      if (deps.length === 0) continue

      for (const depId of deps) {
        const parent = result.find(t => t.id === depId)
        if (!parent) continue

        const overlap = Temporal.PlainDate.compare(child.start, parent.end) <= 0
        if (!overlap) continue

        const isParentMoved = parent.id === movedId || pushedRight.has(parent.id)
        const isChildMoved = child.id === movedId || pushedLeft.has(child.id)

        if (isParentMoved && !isChildMoved) {
          const dur = child.start.until(child.end, { largestUnit: 'days' }).days
          child.start = parent.end.add({ days: 1 })
          child.end = child.start.add({ days: dur })
          pushedRight.add(child.id)
          changed = true
        } else if (isChildMoved && !isParentMoved) {
          const dur = parent.start.until(parent.end, { largestUnit: 'days' }).days
          parent.end = child.start.subtract({ days: 1 })
          parent.start = parent.end.subtract({ days: dur })
          pushedLeft.add(parent.id)
          changed = true
        } else if (!isParentMoved && !isChildMoved) {
          const dur = child.start.until(child.end, { largestUnit: 'days' }).days
          child.start = parent.end.add({ days: 1 })
          child.end = child.start.add({ days: dur })
          pushedRight.add(child.id)
          changed = true
        }
      }
    }
  }
  return result
}

function App() {
  const [offset, setOffset] = useState(0)
  const [projects, setProjects] = useState(initialProjects)
  const [selectedProjectId, setSelectedProjectId] = useState(null) // null = tutti
  const [visibleDays, setVisibleDays] = useState(180)
  const [arrows, setArrows] = useState([])
  const [todayLine, setTodayLine] = useState(null)
  const columns = getColumns(offset, visibleDays)
  const todayIndex = columns.findIndex(c => c.isToday)
  const dragRef = useRef(null)
  const rowDragRef = useRef(null)
  const timelineDragRef = useRef(null)
  const todayColRef = useRef(null)
  const [dragOverId, setDragOverId] = useState(null)
  const barRefs = useRef({})
  const rowRefs = useRef({})
  const containerRef = useRef(null)

  // Righe visibili: task raggruppati per progetto con header progetto
  const visibleProjects = selectedProjectId === null
    ? projects
    : projects.filter(p => p.id === selectedProjectId)

  // tasks flat per i vincoli (solo quelli visibili)
  const flatTasks = visibleProjects.flatMap(p => p.tasks)

  const setProjectTasks = (projectId, updater) => {
    setProjects(prev => prev.map(p =>
      p.id === projectId ? { ...p, tasks: updater(p.tasks) } : p
    ))
  }

  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === 'ArrowLeft') setOffset(o => o - 1)
      if (e.key === 'ArrowRight') setOffset(o => o + 1)
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [])

  useEffect(() => {
    const handleTimelineMove = (e) => {
      if (!timelineDragRef.current) return
      const { startX, startOffset, colWidth } = timelineDragRef.current
      const deltaX = e.clientX - startX
      const deltaDays = -Math.round(deltaX / colWidth)
      const newOffset = startOffset + deltaDays
      setOffset(newOffset)
    }
    const handleTimelineUp = () => { timelineDragRef.current = null }
    window.addEventListener('mousemove', handleTimelineMove)
    window.addEventListener('mouseup', handleTimelineUp)
    return () => {
      window.removeEventListener('mousemove', handleTimelineMove)
      window.removeEventListener('mouseup', handleTimelineUp)
    }
  }, [])

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!dragRef.current) return
      const { taskId, projectId, startX, colWidth } = dragRef.current

      // spostamento orizzontale → cambia date
      const deltaX = e.clientX - startX
      const deltaDays = Math.round(deltaX / colWidth)
      if (deltaDays !== dragRef.current.lastDelta) {
        dragRef.current.lastDelta = deltaDays
        setProjectTasks(projectId, prev => {
          const updated = prev.map(t => {
            if (t.id !== taskId) return t
            return {
              ...t,
              start: dragRef.current.origStart.add({ days: deltaDays }),
              end: dragRef.current.origEnd.add({ days: deltaDays }),
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
      const { taskId, projectId } = dragRef.current
      dragRef.current = null

      setDragOverId(prev => {
        if (prev !== null && prev !== taskId) {
          setProjectTasks(projectId, tasks => {
            const fromIdx = tasks.findIndex(t => t.id === taskId)
            const toIdx = tasks.findIndex(t => t.id === prev)
            if (fromIdx === -1 || toIdx === -1) return tasks
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
      const { taskId, projectId } = rowDragRef.current
      rowDragRef.current = null
      if (dragOverId === null || dragOverId === taskId) {
        setDragOverId(null)
        return
      }
      setProjectTasks(projectId, prev => {
        const fromIdx = prev.findIndex(t => t.id === taskId)
        const toIdx = prev.findIndex(t => t.id === dragOverId)
        if (fromIdx === -1 || toIdx === -1) return prev
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

  const handleBarMouseDown = (e, task, projectId) => {
    const colWidth = e.currentTarget.closest('table').offsetWidth / (visibleDays + 1)
    dragRef.current = {
      taskId: task.id,
      projectId,
      startX: e.clientX,
      colWidth,
      origStart: task.start,
      origEnd: task.end,
      lastDelta: 0,
    }
    e.preventDefault()
  }

  useLayoutEffect(() => {
    if (!containerRef.current) return
    const containerRect = containerRef.current.getBoundingClientRect()
    const newArrows = []
    for (const task of flatTasks) {
      const deps = Array.isArray(task.dependsOn) ? task.dependsOn : task.dependsOn ? [task.dependsOn] : []
      if (deps.length === 0) continue
      for (const depId of deps) {
        const fromEl = barRefs.current[task.id]
        const toEl = barRefs.current[depId]
        if (!fromEl || !toEl) continue
        const fromRect = fromEl.getBoundingClientRect()
        const toRect = toEl.getBoundingClientRect()
        const x1 = fromRect.left - containerRect.left
        const y1 = fromRect.top - containerRect.top + fromRect.height / 2
        const x2 = toRect.right - containerRect.left
        const y2 = toRect.top - containerRect.top + toRect.height / 2
        newArrows.push({ id: `${depId}-${task.id}`, x1, y1, x2, y2 })
      }
    }
    setArrows(prev => JSON.stringify(prev) === JSON.stringify(newArrows) ? prev : newArrows)
  }, [flatTasks])

  useLayoutEffect(() => {
    if (!containerRef.current || todayIndex === -1 || !todayColRef.current) {
      setTodayLine(null)
      return
    }
    const containerRect = containerRef.current.getBoundingClientRect()
    const colRect = todayColRef.current.getBoundingClientRect()
    setTodayLine({
      x: colRect.left - containerRect.left + colRect.width / 2,
      height: containerRect.height,
    })
  }, [offset, visibleDays, todayIndex])

  return (

    <>

      <div className="app">
        <h1>Gantt</h1>
        <div className="gantt-header">
          <button className="btn" onClick={() => setOffset(o => o - 1)}>&#8592;</button>
          <button className="btn" onClick={() => setOffset(o => o + 1)}>&#8594;</button>
          <span className="subtitle">Giorni:</span>
          {[90, 180, 365].map(d => (
            <button
              key={d}
              className={`btn${visibleDays === d ? ' active' : ''}`}
              onClick={() => setVisibleDays(d)}
            >{d}g</button>
          ))}
          <span className="subtitle" style={{ marginLeft: '12px' }}>Progetto:</span>
          <button
            className={`btn${selectedProjectId === null ? ' active' : ''}`}
            onClick={() => setSelectedProjectId(null)}
          >Tutti</button>
          {projects.map(p => (
            <button
              key={p.id}
              className={`btn${selectedProjectId === p.id ? ' active' : ''}`}
              onClick={() => setSelectedProjectId(p.id)}
            >{p.name}</button>
          ))}
        </div>
        <div className="gantt-card">
          <div ref={containerRef} style={{ position: 'relative' }}>
            <svg style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none', overflow: 'visible' }}>
              {todayLine && (
                <line
                  x1={todayLine.x} y1={0}
                  x2={todayLine.x} y2={todayLine.height}
                  className="today-line"
                />
              )}
              {arrows.map(({ id, x1, y1, x2, y2 }) => (
                <path
                  key={id}
                  className="dep-line"
                  d={`M${x1},${y1} C${x1 - 40},${y1} ${x2 + 40},${y2} ${x2},${y2}`}
                />
              ))}
            </svg>
            <table className="gantt-table">
              <thead
                onMouseDown={(e) => {
                  const colWidth = e.currentTarget.closest('table').offsetWidth / (visibleDays + 1)
                  timelineDragRef.current = { startX: e.clientX, startOffset: offset, colWidth }
                  e.preventDefault()
                }}
                style={{ cursor: 'ew-resize', userSelect: 'none' }}
              >
                <tr>
                  <th className="col-name">Task</th>
                  {columns.map(({ label, isToday }) => (
                    <th
                      key={label}
                      className={isToday ? 'col-today' : undefined}
                      ref={isToday ? todayColRef : null}
                    >{label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visibleProjects.map(project => (
                  <>
                    <tr key={`proj-${project.id}`} className="project-header-row">
                      <td className="project-header-cell" colSpan={visibleDays + 1}>
                        {project.name}
                      </td>
                    </tr>
                    {project.tasks.map((task) => {
                      const firstActive = columns.findIndex(({ date }) => isBetween(date, task.start, task.end))
                      const lastActive = columns.findLastIndex(({ date }) => isBetween(date, task.start, task.end))

                      return (
                        <tr
                          key={task.id}
                          ref={el => rowRefs.current[task.id] = el}
                          className={dragOverId === task.id ? 'drop-target' : ''}
                        >
                          <td className="cell-name">
                            <div className="cell-name-inner">
                              <span
                                className="drag-handle"
                                onMouseDown={() => { rowDragRef.current = { taskId: task.id, projectId: project.id } }}
                              >⠿</span>
                              {task.name}
                            </div>
                          </td>
                          {firstActive === -1 ? (
                            <td colSpan={visibleDays}></td>
                          ) : (
                            <>
                              {firstActive > 0 && <td colSpan={firstActive}></td>}
                              <td colSpan={lastActive - firstActive + 1} className="cell-bar">
                                <div
                                  className="bar"
                                  ref={el => barRefs.current[task.id] = el}
                                  onMouseDown={(e) => handleBarMouseDown(e, task, project.id)}
                                >
                                  <span className="bar-date bar-date-start">
                                    {task.start.toLocaleString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                                  </span>
                                  <span className="bar-date bar-date-end">
                                    {task.end.toLocaleString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                                  </span>
                                </div>
                              </td>
                              {lastActive < visibleDays - 1 && <td colSpan={visibleDays - 1 - lastActive}></td>}
                            </>
                          )}
                        </tr>
                      )
                    })}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      <div>&nbsp;</div>
      <div>&nbsp;</div>
      <div>&nbsp;</div>
      <SGFooter />
    </>
  )
}

export default App
