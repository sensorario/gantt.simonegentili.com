import { Fragment, useState, useEffect, useLayoutEffect, useRef } from 'react'
import './App.css'
import { SGFooter, QuadratoHeader } from '@sensorario/sg-components'
import { Temporal } from '@js-temporal/polyfill'

const today = Temporal.Now.plainDateISO()

// The tasks are quadrato's and are read from there; logins and reschedules go through the
// Gantt's own API app, so their events carry `app: gantt` and rank the Gantt in the launcher.
const QUADRATO_API = 'https://api.simonegentili.com/quadrato'
const GANTT_API = 'https://api.simonegentili.com/gantt'
const QUADRATO_TASK_URL = 'https://quadrato.simonegentili.com/task/'
const STATUS_TODO = 0
const STATUS_IN_PROGRESS = 1
// Tasks with no due date are all parked in the same column, this far from today.
const UNSCHEDULED_WEEKS = 3
// Due time given to a task scheduled for the first time by dragging it.
const DEFAULT_DUE_TIME = '09:00:00'
// The task-name column is resized by dragging its divider; the width is remembered per browser.
const NAME_WIDTH_KEY = 'gantt-name-width'
const DEFAULT_NAME_WIDTH = 220
const MIN_NAME_WIDTH = 120
const MAX_NAME_WIDTH = 600

const clampNameWidth = (width) => Math.min(MAX_NAME_WIDTH, Math.max(MIN_NAME_WIDTH, width))

// One day column: the table minus the task-name column, whatever its current width.
const dayColumnWidth = (table, visibleDays) =>
  (table.offsetWidth - table.querySelector('th.col-name').offsetWidth) / visibleDays

// Cookie condiviso su .simonegentili.com: un utente già autenticato su un
// altro prodotto della famiglia (es. quadrato) risulta loggato anche qui.
const AUTH_URL = `${GANTT_API}/authenticate`
const COOKIE_NAME = 'simonegentili.com-access-token'
const USERNAME_KEY = 'simonegentili.com-username'

function setAuthCookie(token) {
  document.cookie = `${COOKIE_NAME}=${token}; path=/; domain=.simonegentili.com; secure; samesite=strict`
}

function clearAuthCookie() {
  document.cookie = `${COOKIE_NAME}=; path=/; domain=.simonegentili.com; expires=Thu, 01 Jan 1970 00:00:00 GMT; secure; samesite=strict`
}

function getAuthCookie() {
  const entry = document.cookie.split('; ').find(c => c.startsWith(`${COOKIE_NAME}=`))
  return entry ? entry.slice(COOKIE_NAME.length + 1) : null
}

const dayOf = (unixSeconds) =>
  Temporal.Instant.fromEpochMilliseconds(unixSeconds * 1000).toZonedDateTimeISO('Europe/Rome').toPlainDate()

// One quadrato task as a bar. The end is the due date (`timestamp`, 'Y-m-d H:i:s' in
// Rome time); the start is the planned start (`startsAt`, set by dragging here), else
// the creation day, else today.
function toGanttTask(task, depth, parentId) {
  const due = task.timestamp ? String(task.timestamp) : null
  const end = due ? Temporal.PlainDate.from(due.slice(0, 10)) : today.add({ weeks: UNSCHEDULED_WEEKS })
  const planned = task.startsAt ? dayOf(task.startsAt) : null
  const base = planned ?? (task.createdAt ? dayOf(task.createdAt) : today)
  return {
    id: task.id,
    name: task.title,
    depth,
    // The parent shown in this project (null when it isn't): it ends no earlier than this task.
    parentId,
    inProgress: task.status === STATUS_IN_PROGRESS,
    unscheduled: !due,
    dueTime: due ? due.slice(11, 19) : null,
    // Unscheduled ones with no plan are one day long, so they line up; a start after the end is clamped.
    start: (!due && !planned) || Temporal.PlainDate.compare(base, end) > 0 ? end : base,
    end,
    // The task's own end; `end` may be pushed further by its subtasks (withParentEnds).
    ownEnd: end,
  }
}

// A top-level task ends no earlier than any of its subtasks, at any depth, as in quadrato
// where it can't be closed while one is open: its end becomes the latest between its own
// and its descendants'. Only top-level ones: a deeper task is instead depended on by its
// subtasks (dependsOn), which start after it, so stretching it would push them forever.
// A parked end (no due date) is made up: it pushes nobody, and a parked top-level task
// simply takes its subtasks' end.
function withParentEnds(tasks) {
  const result = tasks.map(t => ({ ...t, end: t.ownEnd, raised: false }))
  const byId = new Map(result.map(t => [t.id, t]))
  const rootOf = (task) => {
    let current = task
    while (current.parentId != null && byId.has(current.parentId)) current = byId.get(current.parentId)
    return current
  }
  for (const task of result) {
    const root = rootOf(task)
    if (root === task || task.unscheduled) continue
    if ((root.unscheduled && !root.raised) || Temporal.PlainDate.compare(task.end, root.end) > 0) {
      root.end = task.end
      root.raised = true
      if (Temporal.PlainDate.compare(root.start, root.end) > 0) root.start = root.end
    }
  }
  return result
}

// Subtasks after their task (resolveConstraints) and top-level tasks stretched over
// their subtasks (withParentEnds), repeated until nothing moves. movedIds: the bars the
// user dragged, which stay where they were dropped.
function layout(tasks, movedIds) {
  let current = withParentEnds(tasks)
  for (let i = 0; i <= tasks.length; i++) {
    const before = new Map(current.map(t => [t.id, t]))
    const next = withParentEnds(resolveConstraints(current, movedIds).map(t =>
      // A task pushed after the one it depends on has a new end of its own.
      t.end.equals(before.get(t.id).end) ? t : { ...t, ownEnd: t.end }
    ))
    if (next.every(t => t.start.equals(before.get(t.id).start) && t.end.equals(before.get(t.id).end))) return next
    current = next
  }
  return current
}

// Same order as quadrato's list (sortByDate in quadrato's src/utils/filterTaskByVisibilityRange.tsx):
// in progress before to-do; within each, due ones first by due date, then the others by position.
function sortLikeQuadrato(tasks) {
  const due = tasks.filter(t => t.timestamp).sort((a, b) => String(a.timestamp).localeCompare(String(b.timestamp)))
  const undated = tasks.filter(t => !t.timestamp)
    .sort((a, b) => (a.position ?? Number.MAX_SAFE_INTEGER) - (b.position ?? Number.MAX_SAFE_INTEGER))
  return [...due, ...undated].sort((a, b) => Number(b.status === STATUS_IN_PROGRESS) - Number(a.status === STATUS_IN_PROGRESS))
}

// What's being done and what's still to do: open quadrato tasks grouped by project,
// each subtask right after its parent and one level deeper. A subtask whose parent
// isn't shown (closed, archived, in another project) starts its own branch.
function toProjects(tasks) {
  const open = tasks.filter(t => !t.archived && (t.status === STATUS_TODO || t.status === STATUS_IN_PROGRESS))
  const byProject = new Map()
  for (const task of open) {
    const name = task.project || ''
    byProject.set(name, [...(byProject.get(name) ?? []), task])
  }

  return [...byProject.entries()]
    .sort(([a], [b]) => Number(a === '') - Number(b === '') || a.localeCompare(b))
    .map(([name, projectTasks]) => {
      const ids = new Set(projectTasks.map(t => t.id))
      const parentOf = t => (t.parentId != null && ids.has(t.parentId) ? t.parentId : null)
      const rows = []
      const placed = new Set()
      const visit = (parentId, depth, parentRow) => {
        for (const task of sortLikeQuadrato(projectTasks.filter(t => parentOf(t) === parentId && !placed.has(t.id)))) {
          placed.add(task.id)
          const row = toGanttTask(task, depth, parentId)
          // A subtask depends on its task (it starts once that one has ended), except under a
          // top-level task: that one has no arrows, it just spans its subtasks (withParentEnds).
          // Siblings don't depend on each other. A task with no due date sits on a made-up
          // date, so it neither depends nor is depended on.
          if (parentRow && parentRow.depth > 0 && !parentRow.unscheduled && !row.unscheduled) {
            row.dependsOn = [parentRow.id]
          }
          rows.push(row)
          visit(task.id, depth + 1, row)
        }
      }
      visit(null, 0, null)
      // Tasks caught in a parent cycle aren't reachable from the top: show them anyway.
      for (const task of projectTasks.filter(t => !placed.has(t.id))) {
        placed.add(task.id)
        const row = toGanttTask(task, 0, null)
        rows.push(row)
        visit(task.id, 1, row)
      }
      return { id: name || '__no-project__', name: name || 'Nessun progetto', tasks: layout(rows, new Set()) }
    })
}

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

// Where a dragged bar lands: the middle moves both dates, an edge only its own,
// never past the other one.
function draggedDates(mode, start, end, days) {
  if (mode === 'start') {
    const moved = start.add({ days })
    return { start: Temporal.PlainDate.compare(moved, end) > 0 ? end : moved, end }
  }
  if (mode === 'end') {
    const moved = end.add({ days })
    return { start, end: Temporal.PlainDate.compare(moved, start) < 0 ? start : moved }
  }
  return { start: start.add({ days }), end: end.add({ days }) }
}

// The tasks with the dragged bars moved `days` columns from where they were at mousedown.
function withDragged(tasks, drag, days) {
  return tasks.map(t => {
    const orig = drag.moved.get(t.id)
    if (!orig) return t
    const dates = draggedDates(drag.mode, orig.start, orig.end, days)
    return { ...t, ...dates, ownEnd: dates.end }
  })
}

function isBetween(date, start, end) {
  return (
    Temporal.PlainDate.compare(date, start) >= 0 &&
    Temporal.PlainDate.compare(date, end) <= 0
  )
}

function resolveConstraints(tasks, movedIds) {
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

        const isParentMoved = movedIds.has(parent.id) || pushedRight.has(parent.id)
        const isChildMoved = movedIds.has(child.id) || pushedLeft.has(child.id)

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
  const [username, setUsername] = useState(() => localStorage.getItem(USERNAME_KEY))

  const handleLogin = async (loginUsername, password) => {
    const res = await fetch(AUTH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: loginUsername, password }),
    })
    if (!res.ok) {
      throw new Error('Authentication failed')
    }
    const { token } = await res.json()
    localStorage.setItem(USERNAME_KEY, loginUsername)
    setAuthCookie(token)
    setUsername(loginUsername)
  }

  const handleLogout = () => {
    clearAuthCookie()
    localStorage.removeItem(USERNAME_KEY)
    setUsername(null)
    setProjects(null)
  }

  // A few days back: with the 14-day default most of the view is what's coming.
  const [offset, setOffset] = useState(-3)
  // null until quadrato's tasks arrive (or while logged out)
  const [projects, setProjects] = useState(null)
  const [loadError, setLoadError] = useState(null)
  const [saveError, setSaveError] = useState(null)

  useEffect(() => {
    // The cookie is shared across *.simonegentili.com: a login in quadrato counts here too.
    const token = getAuthCookie()
    if (!token) return
    let cancelled = false
    fetch(`${QUADRATO_API}/data`, { headers: { Authorization: `Bearer ${token}` } })
      .then(res => {
        if (res.status === 401) {
          clearAuthCookie()
          localStorage.removeItem(USERNAME_KEY)
          setUsername(null)
          return null
        }
        if (!res.ok) throw new Error(String(res.status))
        return res.json()
      })
      .then(json => {
        if (cancelled || !json) return
        setLoadError(null)
        setProjects(toProjects(json['simplanner-tasks'] ?? []))
      })
      .catch(() => {
        if (!cancelled) setLoadError('Impossibile caricare i task di quadrato.')
      })
    return () => { cancelled = true }
  }, [username])
  const [selectedProjectId, setSelectedProjectId] = useState(null) // null = tutti
  const [visibleDays, setVisibleDays] = useState(14)
  const [hidePastTasks, setHidePastTasks] = useState(false)
  // Off: one list of every task, ordered by start date.
  const [groupByProject, setGroupByProject] = useState(true)
  const [nameWidth, setNameWidth] = useState(() => {
    const saved = Number(localStorage.getItem(NAME_WIDTH_KEY))
    return saved ? clampNameWidth(saved) : DEFAULT_NAME_WIDTH
  })
  const [dividerX, setDividerX] = useState(null)
  const [arrows, setArrows] = useState([])
  const [todayLine, setTodayLine] = useState(null)
  const columns = getColumns(offset, visibleDays)
  const todayIndex = columns.findIndex(c => c.isToday)
  const dragRef = useRef(null)
  const rowDragRef = useRef(null)
  const timelineDragRef = useRef(null)
  const todayColRef = useRef(null)
  const [dragOverId, setDragOverId] = useState(null)
  // Ids of the rows on screen, in their order, while a bar is dragged: the rows stay put
  // under the mouse and are re-sorted (and re-filtered) only once it's released.
  const [frozenRows, setFrozenRows] = useState(null)
  // Ticked in the name column: dragging one of their bars moves them all.
  const [selectedIds, setSelectedIds] = useState([])
  const barRefs = useRef({})
  const rowRefs = useRef({})
  const containerRef = useRef(null)
  const nameHeaderRef = useRef(null)
  const resizeRef = useRef(null)

  // Righe visibili: task raggruppati per progetto con header progetto
  const loadedProjects = projects ?? []
  const visibleProjects = selectedProjectId === null
    ? loadedProjects
    : loadedProjects.filter(p => p.id === selectedProjectId)

  const isPastTask = (task) => Temporal.PlainDate.compare(task.end, today) < 0
  const shownTasks = (project) => frozenRows
    ? project.tasks.filter(t => frozenRows.includes(t.id))
    : hidePastTasks ? project.tasks.filter(t => !isPastTask(t)) : project.tasks
  // Not grouped by project: one list by start date (ties by end).
  const flatRows = visibleProjects
    .flatMap(project => shownTasks(project).map(task => ({ task, projectId: project.id })))
    .sort(frozenRows
      ? (a, b) => frozenRows.indexOf(a.task.id) - frozenRows.indexOf(b.task.id)
      : (a, b) => Temporal.PlainDate.compare(a.task.start, b.task.start) || Temporal.PlainDate.compare(a.task.end, b.task.end))
  // Only the selected tasks on screen count: hidden by a filter, they neither move nor show up in the count.
  const selectedRows = flatRows.filter(({ task }) => selectedIds.includes(task.id))

  // tasks flat per i vincoli (solo quelli visibili)
  const flatTasks = visibleProjects.flatMap(p => p.tasks)

  const setProjectTasks = (projectId, updater) => {
    setProjects(prev => prev && prev.map(p =>
      p.id === projectId ? { ...p, tasks: updater(p.tasks) } : p
    ))
  }

  // Dropping a bar reschedules the task in quadrato: the due date (end) and/or the
  // planned start, whichever the drag changed.
  const saveDates = async ({ taskId, projectId, mode, origStart, origEnd, dueTime }, { start, end }) => {
    const time = dueTime ?? DEFAULT_DUE_TIME
    // Local time: the browser and the API are both on Italian time.
    const body = {}
    if (mode !== 'start') body.timestamp = new Date(`${end.toString()}T${time}`).getTime()
    if (mode !== 'end') body.startsAt = Math.floor(new Date(`${start.toString()}T00:00:00`).getTime() / 1000)
    try {
      const res = await fetch(`${GANTT_API}/task/${taskId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getAuthCookie()}` },
        body: JSON.stringify(body),
      })
      if (res.status === 401) {
        handleLogout()
        return
      }
      if (!res.ok) throw new Error(String(res.status))
      setSaveError(null)
      if (body.timestamp !== undefined) {
        setProjectTasks(projectId, prev => withParentEnds(prev.map(t =>
          t.id === taskId ? { ...t, unscheduled: false, dueTime: time, ownEnd: end } : t
        )))
      }
    } catch {
      setSaveError("Salvataggio delle date non riuscito: la barra è tornata dov'era.")
      setProjectTasks(projectId, prev => withParentEnds(prev.map(t =>
        t.id === taskId ? { ...t, start: origStart, ownEnd: origEnd } : t
      )))
    }
  }

  useEffect(() => {
    const handleResizeMove = (e) => {
      if (!resizeRef.current) return
      const { startX, startWidth } = resizeRef.current
      setNameWidth(clampNameWidth(startWidth + e.clientX - startX))
    }
    const handleResizeUp = () => {
      if (!resizeRef.current) return
      resizeRef.current = null
      document.body.style.cursor = ''
    }
    window.addEventListener('mousemove', handleResizeMove)
    window.addEventListener('mouseup', handleResizeUp)
    return () => {
      window.removeEventListener('mousemove', handleResizeMove)
      window.removeEventListener('mouseup', handleResizeUp)
    }
  }, [])

  useEffect(() => {
    localStorage.setItem(NAME_WIDTH_KEY, String(nameWidth))
  }, [nameWidth])

  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === 'ArrowLeft') setOffset(o => o - 1)
      if (e.key === 'ArrowRight') setOffset(o => o + 1)
      if (e.key === 'Escape') setSelectedIds([])
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
      const drag = dragRef.current
      const { taskId, startX, colWidth } = drag

      // spostamento orizzontale → cambia date
      const deltaX = e.clientX - startX
      const deltaDays = Math.round(deltaX / colWidth)
      if (deltaDays !== drag.lastDelta) {
        drag.lastDelta = deltaDays
        const movedIds = new Set(drag.moved.keys())
        for (const projectId of drag.snapshots.keys()) {
          setProjectTasks(projectId, prev => layout(withDragged(prev, drag, deltaDays), movedIds))
        }
      }

      // spostamento verticale → evidenzia riga target (solo raggruppati: altrimenti l'ordine è per data)
      if (!dragRef.current.reorderable) return
      let overId = null
      for (const [id, el] of Object.entries(rowRefs.current)) {
        if (!el) continue
        const rect = el.getBoundingClientRect()
        if (e.clientY >= rect.top && e.clientY <= rect.bottom) {
          overId = id
          break
        }
      }
      setDragOverId(overId !== taskId ? overId : null)
    }
    const handleMouseUp = () => {
      if (!dragRef.current) return
      const drag = dragRef.current
      const { taskId, projectId } = drag
      dragRef.current = null
      setFrozenRows(null)
      // Recomputed from the tasks as they were at mousedown, so what gets saved doesn't
      // depend on how many mousemoves the state went through.
      const movedIds = new Set(drag.moved.keys())
      for (const [snapshotProjectId, snapshot] of drag.snapshots) {
        const before = new Map(snapshot.map(t => [t.id, t]))
        for (const t of layout(withDragged(snapshot, drag, drag.lastDelta), movedIds)) {
          const old = before.get(t.id)
          const startMoved = !t.start.equals(old.start)
          const endMoved = !t.end.equals(old.end)
          // An edge pushed against the other one may end up exactly where it started.
          if (!startMoved && !endMoved) continue
          // A dragged bar saves what the drag changed; any other task was moved along by one:
          // a subtask pushed after it, or the top-level task stretched over it.
          const mode = movedIds.has(t.id) ? drag.mode : startMoved && endMoved ? 'move' : startMoved ? 'start' : 'end'
          saveDates({ taskId: t.id, projectId: snapshotProjectId, mode, origStart: old.start, origEnd: old.end, dueTime: t.dueTime }, t)
        }
      }

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
    // Registered once: saveDates from the first render only touches state setters, which never change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const handleRowMouseMove = (e) => {
      if (!rowDragRef.current) return
      let overId = null
      for (const [id, el] of Object.entries(rowRefs.current)) {
        if (!el) continue
        const rect = el.getBoundingClientRect()
        if (e.clientY >= rect.top && e.clientY <= rect.bottom) {
          overId = id
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

  // mode: 'move' (the bar), 'start' or 'end' (one of its edges). Moving a selected bar
  // moves every selected one on screen; an edge, or a bar outside the selection, only itself.
  const handleBarMouseDown = (e, task, projectId, mode = 'move') => {
    e.stopPropagation()
    const colWidth = dayColumnWidth(e.currentTarget.closest('table'), visibleDays)
    const group = mode === 'move' && selectedIds.includes(task.id) ? selectedRows : [{ task, projectId }]
    dragRef.current = {
      taskId: task.id,
      projectId,
      mode,
      startX: e.clientX,
      colWidth,
      // Where each moving bar was at mousedown, by task id.
      moved: new Map(group.map(row => [row.task.id, { start: row.task.start, end: row.task.end }])),
      // The tasks of every project the drag touches, as they were at mousedown.
      snapshots: new Map(group.map(row => [row.projectId, loadedProjects.find(p => p.id === row.projectId).tasks])),
      lastDelta: 0,
      reorderable: groupByProject && group.length === 1,
    }
    setFrozenRows(flatRows.map(({ task }) => task.id))
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

  // The rows set the line's height, so it's recomputed when they arrive or change.
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
  }, [offset, visibleDays, todayIndex, nameWidth, projects, selectedProjectId, hidePastTasks, groupByProject])

  // The divider sits on the name column's right edge, wherever the table puts it.
  useLayoutEffect(() => {
    if (nameHeaderRef.current) setDividerX(nameHeaderRef.current.offsetWidth)
  }, [nameWidth])

  const renderTaskRow = (task, projectId) => {
    const firstActive = columns.findIndex(({ date }) => isBetween(date, task.start, task.end))
    const lastActive = columns.findLastIndex(({ date }) => isBetween(date, task.start, task.end))
    const selected = selectedIds.includes(task.id)

    return (
      <tr
        key={task.id}
        ref={el => rowRefs.current[task.id] = el}
        className={[dragOverId === task.id && 'drop-target', selected && 'row-selected'].filter(Boolean).join(' ')}
      >
        <td className="cell-name">
          <div className="cell-name-inner">
            <input
              type="checkbox"
              className="row-select"
              checked={selected}
              onChange={() => setSelectedIds(ids => selected ? ids.filter(id => id !== task.id) : [...ids, task.id])}
              title="Seleziona: trascinando una barra selezionata si spostano tutte"
              aria-label={`Seleziona ${task.name}`}
            />
            {/* Rows are reordered, and indented under their parent, only within a project. */}
            {groupByProject && (
              <span
                className="drag-handle"
                onMouseDown={() => { rowDragRef.current = { taskId: task.id, projectId } }}
              >⠿</span>
            )}
            <span style={{ paddingLeft: groupByProject ? task.depth * 16 : 0 }}>{task.name}</span>
            <a
              className="open-in-quadrato"
              href={`${QUADRATO_TASK_URL}${task.id}`}
              target="_blank"
              rel="noopener noreferrer"
              title="Apri il task in quadrato"
              aria-label={`Apri ${task.name} in quadrato`}
            >↗</a>
          </div>
        </td>
        {firstActive === -1 ? (
          <td colSpan={visibleDays}></td>
        ) : (
          <>
            {firstActive > 0 && <td colSpan={firstActive}></td>}
            <td colSpan={lastActive - firstActive + 1} className="cell-bar">
              <div
                className={`bar${task.inProgress ? ' bar--doing' : ''}${task.unscheduled ? ' bar--unscheduled' : ''}${selected ? ' bar--selected' : ''}`}
                title={task.unscheduled ? 'Senza scadenza: trascinala per pianificarla' : undefined}
                ref={el => barRefs.current[task.id] = el}
                onMouseDown={(e) => handleBarMouseDown(e, task, projectId)}
              >
                <span
                  className="bar-handle bar-handle--start"
                  title="Trascina per spostare la data di inizio"
                  onMouseDown={(e) => handleBarMouseDown(e, task, projectId, 'start')}
                />
                <span
                  className="bar-handle bar-handle--end"
                  title="Trascina per spostare la data di fine"
                  onMouseDown={(e) => handleBarMouseDown(e, task, projectId, 'end')}
                />
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
  }

  return (

    <>
      <QuadratoHeader
        title="Gantt"
        username={username}
        onLogin={handleLogin}
        onLogout={handleLogout}
      />
      <div className="app">
        <div className="gantt-header">
          <button className="btn" onClick={() => setOffset(o => o - 1)}>&#8592;</button>
          <button className="btn" onClick={() => setOffset(o => o + 1)}>&#8594;</button>
          <span className="subtitle">Giorni:</span>
          {[14, 30, 90, 180, 365].map(d => (
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
          {loadedProjects.map(p => (
            <button
              key={p.id}
              className={`btn${selectedProjectId === p.id ? ' active' : ''}`}
              onClick={() => setSelectedProjectId(p.id)}
            >{p.name}</button>
          ))}
          <button
            className={`btn${hidePastTasks ? ' active' : ''}`}
            style={{ marginLeft: '12px' }}
            onClick={() => setHidePastTasks(h => !h)}
          >Nascondi passati</button>
          <button
            className={`btn${groupByProject ? ' active' : ''}`}
            onClick={() => setGroupByProject(g => !g)}
          >Raggruppa per progetto</button>
          {selectedRows.length > 0 && (
            <>
              <span className="subtitle" style={{ marginLeft: '12px' }}>
                {selectedRows.length} {selectedRows.length === 1 ? 'selezionata' : 'selezionate'}
              </span>
              <button className="btn" onClick={() => setSelectedIds([])} title="Anche con Esc">Deseleziona</button>
            </>
          )}
        </div>
        {!getAuthCookie() && <p className="gantt-message">Accedi per vedere i task di quadrato.</p>}
        {getAuthCookie() && projects === null && !loadError && <p className="gantt-message">Caricamento dei task di quadrato…</p>}
        {projects !== null && projects.length === 0 && <p className="gantt-message">Nessun task da fare o in corso.</p>}
        {loadError && <p className="gantt-message gantt-message--error">{loadError}</p>}
        {saveError && <p className="gantt-message gantt-message--error">{saveError}</p>}
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
              <defs>
                <marker id="dep-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                  <path d="M0,0 L10,5 L0,10 z" className="dep-arrow-head" />
                </marker>
              </defs>
              {/* From the end of the task depended on (x2, y2) to the start of the dependent one (x1, y1). */}
              {arrows.map(({ id, x1, y1, x2, y2 }) => (
                <path
                  key={id}
                  className="dep-line"
                  markerEnd="url(#dep-arrow)"
                  d={`M${x2},${y2} C${x2 + 40},${y2} ${x1 - 40},${y1} ${x1},${y1}`}
                />
              ))}
            </svg>
            {dividerX !== null && (
              <div
                className="name-divider"
                style={{ left: dividerX }}
                title="Trascina per ridimensionare"
                onMouseDown={(e) => {
                  resizeRef.current = { startX: e.clientX, startWidth: nameWidth }
                  document.body.style.cursor = 'col-resize'
                  e.preventDefault()
                }}
              />
            )}
            <table className="gantt-table">
              <thead
                onMouseDown={(e) => {
                  const colWidth = dayColumnWidth(e.currentTarget.closest('table'), visibleDays)
                  timelineDragRef.current = { startX: e.clientX, startOffset: offset, colWidth }
                  e.preventDefault()
                }}
                style={{ cursor: 'ew-resize', userSelect: 'none' }}
              >
                <tr>
                  <th className="col-name" ref={nameHeaderRef} style={{ width: nameWidth }}>Task</th>
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
                {groupByProject
                  ? visibleProjects.map(project => {
                    const tasks = shownTasks(project)
                    if (tasks.length === 0) return null

                    return (
                      <Fragment key={project.id}>
                        <tr className="project-header-row">
                          <td className="project-header-cell" colSpan={visibleDays + 1}>
                            {project.name}
                          </td>
                        </tr>
                        {tasks.map(task => renderTaskRow(task, project.id))}
                      </Fragment>
                    )
                  })
                  : flatRows.map(({ task, projectId }) => renderTaskRow(task, projectId))}
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
