import { Fragment, useState, useEffect, useLayoutEffect, useRef } from 'react'
import './App.css'
import { ColorPicker, Icon, SGFooter, QuadratoHeader } from '@sensorario/sg-components'
import { Temporal } from '@js-temporal/polyfill'

const today = Temporal.Now.plainDateISO()

// The tasks are quadrato's and are read from there; logins and reschedules go through the
// Gantt's own API app, so their events carry `app: gantt` and rank the Gantt in the launcher.
const QUADRATO_API = 'https://api.simonegentili.com/quadrato'
const GANTT_API = 'https://api.simonegentili.com/gantt'
const QUADRATO_TASK_URL = 'https://quadrato.simonegentili.com/task/'
const NO_PROJECT_ID = '__no-project__'

// The routes: / shows every project, /progetto/<name> one of them, /senza-progetto the tasks
// without one (quadrato's task detail links to them). Anything else shows every project.
const PROJECT_ROUTE = '/progetto/'
const NO_PROJECT_ROUTE = '/senza-progetto'

const projectOfPath = (pathname) => {
  const path = pathname.replace(/\/+$/, '')
  if (path === NO_PROJECT_ROUTE) return NO_PROJECT_ID
  if (!path.startsWith(PROJECT_ROUTE)) return null
  try {
    return decodeURIComponent(path.slice(PROJECT_ROUTE.length)) || null
  } catch {
    // A malformed address, as typed: no project in it.
    return null
  }
}

const pathOfProject = (id) =>
  id === null ? '/' : id === NO_PROJECT_ID ? NO_PROJECT_ROUTE : PROJECT_ROUTE + encodeURIComponent(id)

// Tasks with no project have no color of their own.
const NO_PROJECT_COLOR = '#cbd5e1'
// Offered by the color picker; a project with no color yet gets a random pastel.
const PASTELS = ['#fecaca', '#fed7aa', '#fde68a', '#d9f99d', '#bbf7d0', '#a7f3d0', '#a5f3fc', '#bae6fd', '#c7d2fe', '#ddd6fe', '#f5d0fe', '#fbcfe8']
const STATUS_TODO = 0
const STATUS_IN_PROGRESS = 1
// Nutrimondo's shopping list lands in this quadrato project (QUADRATO_PROJECT in its
// src/pages/Spesa.tsx): things to buy, not work to plan, so the Gantt leaves it out.
const SHOPPING_PROJECT = 'spesa'
// Quadrato's task types (TASK_TYPES and taskTypeIcons in quadrato's src/components/TaskTitle.tsx):
// a task's type is the start of its title, "[epic] Release" is an epic called "Release".
const TASK_TYPE_ICONS = {
  feature: { name: 'sparkle', color: '#5480e6' },
  bug: { name: 'bug', color: '#e2727d' },
  pay: { name: 'credit-card', color: '#2e9e5b' },
  spike: { name: 'books', color: '#9b6bd1' },
  epic: { name: 'zap', color: '#e08a2e' },
  chore: { name: 'wrench', color: '#7d8796' },
  docs: { name: 'file-text', color: '#2a9d9a' },
}
const TASK_TYPE_PREFIX = new RegExp(`^\\[(${Object.keys(TASK_TYPE_ICONS).join('|')})\\]\\s*`, 'i')
const EPIC = 'epic'
// Quadrato's notes ("[note] ...", written down at a time) and events ("[event] ...", tracked in
// Tome): not work to plan, so they're never bars. An event colors its day instead (toEvents).
const UNPLANNED_PREFIX = /^\[(note|event)\]/i
const EVENT_PREFIX = /^\[event\]\s*/i
const STATUS_SKIPPED = 3
// Tasks with no due date are all parked in the same column, this far from today.
const UNSCHEDULED_WEEKS = 3
// The first column, in days from today, when the page opens and with "Oggi": a few days back,
// so with the 14-day default most of the view is what's coming.
const START_OFFSET = -3
// Days a sideways touchpad swipe moves for each column's width swiped: the higher, the more
// sensitive. At 1 the days would follow the fingers, as when dragging the dates' header.
const SWIPE_DAYS_PER_COLUMN = 3
// Due time given to a task scheduled for the first time by dragging it.
const DEFAULT_DUE_TIME = '09:00:00'
// The task-name column is resized by dragging its divider; the width is remembered per browser.
const NAME_WIDTH_KEY = 'gantt-name-width'
const DEFAULT_NAME_WIDTH = 220
const MIN_NAME_WIDTH = 120
const MAX_NAME_WIDTH = 600

const clampNameWidth = (width) => Math.min(MAX_NAME_WIDTH, Math.max(MIN_NAME_WIDTH, width))

// Grouped, each project's rows go by end, the latest at the top ('latest') or the earliest
// ('earliest'), or in the user's own order ('manual', dragged by the ⠿). Remembered per browser.
const ROW_ORDER_KEY = 'gantt-row-order'
const ROW_ORDERS = ['latest', 'earliest', 'manual']

// The user's project colors, the ones quadrato shows too (by name, in all their workspaces).
function sharedColors(data) {
  const colors = data['simplanner-project-colors']
  return colors && typeof colors === 'object' ? { ...colors } : {}
}

const hexToRgb = (hex) => /^#[0-9a-f]{6}$/i.test(hex) ? [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)) : null

function hueOf(hex) {
  const rgb = hexToRgb(hex)
  if (!rgb) return null
  const [r, g, b] = rgb.map(v => v / 255)
  const max = Math.max(r, g, b)
  const range = max - Math.min(r, g, b)
  if (range === 0) return null
  const sector = max === r ? ((g - b) / range) % 6 : max === g ? (b - r) / range + 2 : (r - g) / range + 4
  return (sector * 60 + 360) % 360
}

function hslToHex(h, s, l) {
  const a = (s / 100) * Math.min(l / 100, 1 - l / 100)
  const channel = (n) => {
    const k = (n + h / 30) % 12
    return Math.round((l / 100 - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))) * 255).toString(16).padStart(2, '0')
  }
  return `#${channel(0)}${channel(8)}${channel(4)}`
}

// A random pastel, its hue as far as a few tries get from the ones already taken.
function randomPastel(takenHues) {
  let hue = 0
  let gap = -1
  for (let i = 0; i < 24; i++) {
    const candidate = Math.random() * 360
    const distance = Math.min(360, ...takenHues.map(t => Math.min(Math.abs(candidate - t), 360 - Math.abs(candidate - t))))
    if (distance > gap) {
      hue = candidate
      gap = distance
    }
  }
  return hslToHex(hue, 70, 82)
}

// Dark text on light (pastel) bars, white on dark ones: quadrato's colors can be anything.
function inkOn(hex) {
  const rgb = hexToRgb(hex)
  return rgb && 0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2] < 128 ? '#ffffff' : '#1e293b'
}

// Recorded by the API as a ProjectColorChanged event, then read by quadrato too. A `random`
// color is kept only if the project still has none: resolves to the color it ends up with.
function saveProjectColor(name, color, random = false) {
  return fetch(`${GANTT_API}/project-color`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getAuthCookie()}` },
    body: JSON.stringify(random ? { project: name, color, random } : { project: name, color }),
  }).then(res => {
    if (!res.ok) throw new Error(String(res.status))
    return res.json()
  }).then(saved => saved.color)
}

// The user's order (simplanner-project-order, the same in all their workspaces) first; projects
// it doesn't know yet after them, in toProjects' order; "Nessun progetto" always last.
function inUserOrder(projects, order) {
  const rank = new Map((Array.isArray(order) ? order : []).map((name, index) => [name, index]))
  const position = (project) => project.id === NO_PROJECT_ID ? Number.MAX_SAFE_INTEGER : rank.get(project.id) ?? rank.size
  return [...projects].sort((a, b) => position(a) - position(b))
}

// Recorded by the API as a ProjectsReordered event.
function saveProjectOrder(order) {
  return fetch(`${GANTT_API}/project-order`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getAuthCookie()}` },
    body: JSON.stringify({ order }),
  }).then(res => {
    if (!res.ok) throw new Error(String(res.status))
  })
}

// Recorded by the API as a TasksReordered event: the ids are siblings, first to last, and each
// gets its index as quadrato's `position`, so quadrato's list follows too.
function saveTaskOrder(ids) {
  return fetch(`${GANTT_API}/task-order`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getAuthCookie()}` },
    body: JSON.stringify({ ids }),
  }).then(res => {
    if (!res.ok) throw new Error(String(res.status))
  })
}

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
  // Unscheduled ones with no plan are one day long, so they line up; a start after the end is clamped.
  const start = (!due && !planned) || Temporal.PlainDate.compare(base, end) > 0 ? end : base
  const typePrefix = TASK_TYPE_PREFIX.exec(task.title)
  return {
    id: task.id,
    name: typePrefix ? task.title.slice(typePrefix[0].length) : task.title,
    type: typePrefix ? typePrefix[1].toLowerCase() : null,
    depth,
    // The parent shown in this project (null when it isn't): it ends no earlier than this task.
    parentId,
    // The parent in quadrato, shown here or not, and the place among the tasks with the same one:
    // what "Ordine mio" sorts by and saves (byPosition, moveRow).
    quadratoParentId: task.parentId ?? null,
    position: task.position ?? null,
    inProgress: task.status === STATUS_IN_PROGRESS,
    unscheduled: !due,
    dueTime: due ? due.slice(11, 19) : null,
    start,
    end,
    // The task's own dates; `start` and `end` may be stretched over its subtasks (withParentEnds).
    ownStart: start,
    ownEnd: end,
  }
}

// The top-level task a task is under (itself if it's one), following parentId among byId's tasks.
function rootIn(byId, task) {
  let current = task
  while (current.parentId != null && byId.has(current.parentId)) current = byId.get(current.parentId)
  return current
}

// A top-level task spans its subtasks, at any depth: it ends no earlier than any of them,
// as in quadrato where it can't be closed while one is open, and starts no later than any
// of them. Only top-level ones: a deeper task is instead depended on by its subtasks
// (dependsOn), which start after it, so stretching it would push them forever.
// A parked end (no due date) is made up: it pushes nobody, and a parked top-level task
// simply takes its subtasks' end.
function withParentEnds(tasks) {
  const result = tasks.map(t => ({ ...t, start: t.ownStart, end: t.ownEnd, raised: false }))
  const byId = new Map(result.map(t => [t.id, t]))
  for (const task of result) {
    const root = rootIn(byId, task)
    if (root === task || task.unscheduled) continue
    if (Temporal.PlainDate.compare(task.start, root.start) < 0) root.start = task.start
    if ((root.unscheduled && !root.raised) || Temporal.PlainDate.compare(task.end, root.end) > 0) {
      root.end = task.end
      root.raised = true
    }
  }
  return result
}

// False for a made-up end: no due date of its own nor, for a top-level task, in its subtasks.
const hasRealEnd = (task) => !task.unscheduled || task.raised

// Subtasks after their task (resolveConstraints) and top-level tasks stretched over
// their subtasks (withParentEnds), repeated until nothing moves. movedIds: the bars the
// user dragged, which stay where they were dropped.
function layout(tasks, movedIds) {
  let current = withParentEnds(tasks)
  for (let i = 0; i <= tasks.length; i++) {
    const before = new Map(current.map(t => [t.id, t]))
    const next = withParentEnds(resolveConstraints(current, movedIds).map(t =>
      // A task pushed after (or before) the one it depends on has new dates of its own.
      t.end.equals(before.get(t.id).end) ? t : { ...t, ownStart: t.start, ownEnd: t.end }
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

// Epics first, then the other tasks, each top-level task with its subtasks under it and, among
// epics and among the others, by end (stretched over the subtasks): the latest at the top, or
// the earliest. Blocks are found by parentId, not by position: the rows may have been dragged.
function epicsFirstByEnd(tasks, latestFirst) {
  const byId = new Map(tasks.map(t => [t.id, t]))
  const blocks = new Map()
  for (const task of tasks) {
    const root = rootIn(byId, task)
    blocks.set(root, [...(blocks.get(root) ?? []), task])
  }
  const direction = latestFirst ? -1 : 1
  return [...blocks.entries()]
    .sort(([a], [b]) =>
      Number(a.type !== EPIC) - Number(b.type !== EPIC)
      // A made-up end says nothing about when it finishes: those go after the dated ones.
      || Number(!hasRealEnd(a)) - Number(!hasRealEnd(b))
      || (hasRealEnd(a) ? direction * Temporal.PlainDate.compare(a.end, b.end) : 0))
    .flatMap(([root, rows]) => [root, ...rows.filter(t => t !== root)])
}

// Siblings by position; those never placed after them, in the order they came (the sort is stable).
const byOwnPosition = (a, b) => (a.position ?? Number.MAX_SAFE_INTEGER) - (b.position ?? Number.MAX_SAFE_INTEGER)

// "Ordine mio": each task with its subtasks under it, as in quadrato, siblings by position
// (set by dragging rows here, or subtasks in quadrato).
function byPosition(tasks) {
  const ids = new Set(tasks.map(t => t.id))
  const children = new Map()
  for (const task of tasks) {
    const parent = ids.has(task.parentId) ? task.parentId : null
    children.set(parent, [...(children.get(parent) ?? []), task])
  }
  const visit = (parent) => [...(children.get(parent) ?? [])].sort(byOwnPosition).flatMap(task => [task, ...visit(task.id)])
  return visit(null)
}

// The days with an event: quadrato's dated events, but the archived ones, the skipped ones (they
// didn't take place) and the shopping list's. Done ones count too: the event took place that day.
// By time, as the strip over the chart lists a day's events.
function toEvents(tasks) {
  return tasks
    .filter(t => EVENT_PREFIX.test(t.title) && t.timestamp && !t.archived && t.status !== STATUS_SKIPPED
      && (t.project ?? '').trim().toLowerCase() !== SHOPPING_PROJECT)
    .sort((a, b) => String(a.timestamp).localeCompare(String(b.timestamp)))
    .map(t => ({
      id: t.id,
      name: t.title.replace(EVENT_PREFIX, ''),
      projectId: t.project || NO_PROJECT_ID,
      day: Temporal.PlainDate.from(String(t.timestamp).slice(0, 10)),
      time: String(t.timestamp).slice(11, 16),
    }))
}

// What's being done and what's still to do: open quadrato tasks grouped by project, but
// the shopping list, the notes and the events, each subtask right after its parent and one level
// deeper. A subtask whose parent isn't shown (closed, archived, a note or an event, in another
// project) starts its own branch.
function toProjects(tasks) {
  const open = tasks.filter(t => !t.archived && (t.status === STATUS_TODO || t.status === STATUS_IN_PROGRESS)
    && (t.project ?? '').trim().toLowerCase() !== SHOPPING_PROJECT && !UNPLANNED_PREFIX.test(t.title))
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
      return { id: name || NO_PROJECT_ID, name: name || 'Nessun progetto', tasks: layout(rows, new Set()) }
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
      isWeekend: date.dayOfWeek >= 6,
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
    return { ...t, ...dates, ownStart: dates.start, ownEnd: dates.end }
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
    setEvents([])
  }

  const [offset, setOffset] = useState(START_OFFSET)
  // null until quadrato's tasks arrive (or while logged out)
  const [projects, setProjects] = useState(null)
  // See toEvents: each one colors its day's column.
  const [events, setEvents] = useState([])
  // Index in `columns` of the day the mouse is over, null off the days.
  const [hoveredDay, setHoveredDay] = useState(null)
  const [loadError, setLoadError] = useState(null)
  const [saveError, setSaveError] = useState(null)
  // Project name => color, shared with quadrato.
  const [projectColors, setProjectColors] = useState({})
  const colorSaveTimers = useRef({})
  // The user's whole project order, also the projects not loaded here (other workspaces).
  const [projectOrder, setProjectOrder] = useState([])

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
        const order = Array.isArray(json['simplanner-project-order']) ? json['simplanner-project-order'] : []
        const loaded = inUserOrder(toProjects(json['simplanner-tasks'] ?? []), order)
        // A project with no color yet gets a random pastel, saved so that quadrato shows it too.
        const colors = sharedColors(json)
        const taken = loaded.map(p => hueOf(colors[p.id] ?? '')).filter(hue => hue !== null)
        for (const { id } of loaded) {
          if (id === NO_PROJECT_ID || colors[id]) continue
          colors[id] = randomPastel(taken)
          taken.push(hueOf(colors[id]))
          // Another tab or quadrato may have colored it meanwhile: that color wins.
          saveProjectColor(id, colors[id], true)
            .then(saved => setProjectColors(current => current[id] === saved ? current : { ...current, [id]: saved }))
            .catch(() => setSaveError(`Il colore del progetto ${id} non è stato salvato.`))
        }
        setProjectColors(colors)
        setProjectOrder(order)
        setProjects(loaded)
        setEvents(toEvents(json['simplanner-tasks'] ?? []))
      })
      .catch(() => {
        if (!cancelled) setLoadError('Impossibile caricare i task di quadrato.')
      })
    return () => { cancelled = true }
  }, [username])
  // null = tutti. The route says which project is shown: picking one is a new page in the
  // history, so the browser's Back goes to the one before.
  const [selectedProjectId, setSelectedProjectId] = useState(() => projectOfPath(window.location.pathname))
  const selectProject = (id) => {
    setSelectedProjectId(id)
    if (pathOfProject(id) !== window.location.pathname) window.history.pushState(null, '', pathOfProject(id))
  }
  useEffect(() => {
    const handlePopState = () => setSelectedProjectId(projectOfPath(window.location.pathname))
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])
  const [visibleDays, setVisibleDays] = useState(14)
  const [hidePastTasks, setHidePastTasks] = useState(false)
  // Only the epics, each still spanning its subtasks (withParentEnds), which are hidden.
  const [onlyEpics, setOnlyEpics] = useState(false)
  // Off: one list of every task, ordered by start date.
  const [groupByProject, setGroupByProject] = useState(true)
  // See ROW_ORDERS. With "Solo epiche" the projects follow it too, but in "Ordine mio".
  const [rowOrder, setRowOrder] = useState(() => {
    const saved = localStorage.getItem(ROW_ORDER_KEY)
    return ROW_ORDERS.includes(saved) ? saved : 'latest'
  })
  const chooseRowOrder = (order) => {
    setRowOrder(order)
    localStorage.setItem(ROW_ORDER_KEY, order)
  }
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
  // A project group dragged by the handle in its header, and the one it would land on.
  const projectDragRef = useRef(null)
  const projectHeaderRefs = useRef({})
  const [projectDropId, setProjectDropId] = useState(null)
  // Ids of the rows on screen, in their order, while a bar is dragged: the rows stay put
  // under the mouse and are re-sorted (and re-filtered) only once it's released.
  const [frozenRows, setFrozenRows] = useState(null)
  // Ids of the project groups on screen, in their order, while a bar is dragged: with "Solo
  // epiche" they follow their epics' ends, and would otherwise jump under the mouse.
  const [frozenProjects, setFrozenProjects] = useState(null)
  // Picked by dragging a rectangle over the bars: dragging one of them moves them all.
  const [selectedIds, setSelectedIds] = useState([])
  // The selection rectangle being drawn, relative to the chart container.
  const [marquee, setMarquee] = useState(null)
  const barRefs = useRef({})
  const rowRefs = useRef({})
  const containerRef = useRef(null)
  const nameHeaderRef = useRef(null)
  const resizeRef = useRef(null)

  // Righe visibili: task raggruppati per progetto con header progetto
  const loadedProjects = projects ?? []
  // One asked for in the address that isn't here (nothing open in it) shows them all.
  const selectedProject = loadedProjects.find(p => p.id === selectedProjectId) ?? null
  // The events of the project shown, or all of them: what colors a column, listed in the strip
  // over the chart while the mouse is on it.
  const shownEvents = selectedProject ? events.filter(e => e.projectId === selectedProject.id) : events
  const eventsOn = (date) => shownEvents.filter(e => Temporal.PlainDate.compare(e.day, date) === 0)
  const hoveredColumn = hoveredDay !== null ? columns[hoveredDay] : null
  const hoveredEvents = hoveredColumn ? eventsOn(hoveredColumn.date) : []
  // The column under the mouse, anywhere from the header to the last row: the bands let it through.
  const hoverDay = (e) => {
    if (dividerX === null) return
    const box = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - box.left - dividerX
    setHoveredDay(x < 0 ? null : Math.min(visibleDays - 1, Math.floor(x / ((box.width - dividerX) / visibleDays))))
  }

  const isPastTask = (task) => Temporal.PlainDate.compare(task.end, today) < 0
  // Sorted before being filtered: a subtask shown without its task still goes in its block.
  const shownTasks = (project) => frozenRows
    ? project.tasks.filter(t => frozenRows.includes(t.id)).sort((a, b) => frozenRows.indexOf(a.id) - frozenRows.indexOf(b.id))
    : (rowOrder === 'manual' ? byPosition(project.tasks) : epicsFirstByEnd(project.tasks, rowOrder === 'latest'))
      .filter(t => (!hidePastTasks || !isPastTask(t)) && (!onlyEpics || t.type === EPIC))
  // With "Solo epiche", but in "Ordine mio", the projects follow their epics instead of the user's
  // order: by the end of their first dated epic on screen, in the same direction, those with none last.
  const byTopEpicEnd = (projects) => {
    const ends = new Map(projects.map(p => [p.id, shownTasks(p).find(hasRealEnd)?.end]))
    return [...projects].sort((a, b) => {
      const [endA, endB] = [ends.get(a.id), ends.get(b.id)]
      return Number(!endA) - Number(!endB) || (endA ? (rowOrder === 'latest' ? -1 : 1) * Temporal.PlainDate.compare(endA, endB) : 0)
    })
  }
  const visibleProjects = selectedProject ? [selectedProject]
    : frozenProjects ? frozenProjects.map(id => loadedProjects.find(p => p.id === id))
    : onlyEpics && rowOrder !== 'manual' ? byTopEpicEnd(loadedProjects)
    : loadedProjects
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

  // "Ordine mio": a dragged task takes the place of the one it's dropped on, among its siblings
  // only, so it never changes parent here. Every sibling gets its index as position, as when
  // quadrato reorders subtasks: shown at once, put back if the API doesn't take it. `tasks` is
  // the project's, passed in: the bar drag handlers are registered once and can't read the state.
  const moveRow = (projectId, taskId, overId, tasks) => {
    const task = tasks.find(t => t.id === taskId)
    const over = tasks.find(t => t.id === overId)
    if (!task || !over || task.quadratoParentId !== over.quadratoParentId) return
    const siblings = tasks.filter(t => t.quadratoParentId === task.quadratoParentId)
    const order = [...siblings].sort(byOwnPosition)
    const from = order.indexOf(task)
    const to = order.indexOf(over)
    order.splice(to, 0, order.splice(from, 1)[0])
    const setPositions = (positions) => setProjectTasks(projectId, prev =>
      prev.map(t => positions.has(t.id) ? { ...t, position: positions.get(t.id) } : t))
    setPositions(new Map(order.map((t, index) => [t.id, index])))
    saveTaskOrder(order.map(t => t.id)).catch(() => {
      setPositions(new Map(siblings.map(t => [t.id, t.position])))
      setSaveError("L'ordine dei task non è stato salvato.")
    })
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
      setProjectTasks(projectId, prev => withParentEnds(prev.map(t => t.id !== taskId ? t : {
        ...t,
        ...(body.startsAt !== undefined && { ownStart: start }),
        ...(body.timestamp !== undefined && { unscheduled: false, dueTime: time, ownEnd: end }),
      })))
    } catch {
      setSaveError("Salvataggio delle date non riuscito: la barra è tornata dov'era.")
      setProjectTasks(projectId, prev => withParentEnds(prev.map(t =>
        t.id === taskId ? { ...t, ownStart: origStart, ownEnd: origEnd } : t
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

  // A sideways swipe on the touchpad moves the days, SWIPE_DAYS_PER_COLUMN for each column's
  // width swiped; scrolling up and down is left alone. Not passive (React's onWheel is), so
  // that the swipe doesn't also take the browser back or forward a page.
  useEffect(() => {
    const container = containerRef.current
    let swiped = 0
    const handleWheel = (e) => {
      if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return
      e.preventDefault()
      const step = dayColumnWidth(container.querySelector('table'), visibleDays) / SWIPE_DAYS_PER_COLUMN
      // What was left of a swipe the other way doesn't hold this one back.
      if (Math.sign(e.deltaX) !== Math.sign(swiped)) swiped = 0
      swiped += e.deltaX
      const days = Math.trunc(swiped / step)
      if (days === 0) return
      swiped -= days * step
      setOffset(o => o + days)
    }
    container.addEventListener('wheel', handleWheel, { passive: false })
    return () => container.removeEventListener('wheel', handleWheel)
  }, [visibleDays])

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
      drag.overId = overId !== taskId ? overId : null
      setDragOverId(drag.overId)
    }
    const handleMouseUp = () => {
      if (!dragRef.current) return
      const drag = dragRef.current
      const { taskId, projectId } = drag
      dragRef.current = null
      setFrozenRows(null)
      setFrozenProjects(null)
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

      setDragOverId(null)
      // Positions don't change during a drag: the snapshot's are the current ones.
      if (drag.overId) moveRow(projectId, taskId, drag.overId, drag.snapshots.get(projectId))
    }
    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
    // Registered once: saveDates and moveRow from the first render only touch state setters, which never change.
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
      moveRow(projectId, taskId, dragOverId, (projects ?? []).find(p => p.id === projectId)?.tasks ?? [])
      setDragOverId(null)
    }
    window.addEventListener('mousemove', handleRowMouseMove)
    window.addEventListener('mouseup', handleRowMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleRowMouseMove)
      window.removeEventListener('mouseup', handleRowMouseUp)
    }
    // moveRow from an older render only touches state setters; the tasks come from `projects`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragOverId, projects])

  useEffect(() => {
    const handleProjectMouseMove = (e) => {
      if (!projectDragRef.current) return
      // The section under the mouse: the lowest project header above it.
      let overId = null
      let overTop = -Infinity
      for (const [id, el] of Object.entries(projectHeaderRefs.current)) {
        if (!el || id === NO_PROJECT_ID) continue
        const top = el.getBoundingClientRect().top
        if (top <= e.clientY && top > overTop) {
          overId = id
          overTop = top
        }
      }
      setProjectDropId(overId !== projectDragRef.current ? overId : null)
    }
    const handleProjectMouseUp = () => {
      const draggedId = projectDragRef.current
      if (!draggedId) return
      projectDragRef.current = null
      setProjectDropId(null)
      const named = (projects ?? []).filter(p => p.id !== NO_PROJECT_ID)
      const from = named.findIndex(p => p.id === draggedId)
      const to = named.findIndex(p => p.id === projectDropId)
      if (from === -1 || to === -1) return
      const next = [...named]
      next.splice(to, 0, next.splice(from, 1)[0])
      setProjects([...next, ...projects.filter(p => p.id === NO_PROJECT_ID)])
      // Projects not loaded here (other workspaces, only closed tasks) keep their order, after these.
      const names = next.map(p => p.id)
      const order = [...names, ...projectOrder.filter(name => !names.includes(name))]
      setProjectOrder(order)
      saveProjectOrder(order).catch(() => setSaveError("L'ordine dei progetti non è stato salvato."))
    }
    window.addEventListener('mousemove', handleProjectMouseMove)
    window.addEventListener('mouseup', handleProjectMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleProjectMouseMove)
      window.removeEventListener('mouseup', handleProjectMouseUp)
    }
  }, [projectDropId, projects, projectOrder])

  // Dragging from an empty spot of the rows draws a rectangle: the bars it touches become the
  // selection. It starts after a few pixels, so a plain click on an empty spot clears it instead.
  const startMarquee = (e) => {
    if (e.button !== 0 || e.target.closest('.bar, .drag-handle, a, button')) return
    e.preventDefault()
    const startX = e.clientX
    const startY = e.clientY
    const rows = flatRows
    let active = false

    const onMove = (ev) => {
      if (!active && Math.hypot(ev.clientX - startX, ev.clientY - startY) < 5) return
      active = true
      const area = {
        left: Math.min(startX, ev.clientX),
        top: Math.min(startY, ev.clientY),
        right: Math.max(startX, ev.clientX),
        bottom: Math.max(startY, ev.clientY),
      }
      const container = containerRef.current.getBoundingClientRect()
      setMarquee({
        left: area.left - container.left,
        top: area.top - container.top,
        width: area.right - area.left,
        height: area.bottom - area.top,
      })
      setSelectedIds(rows
        .filter(({ task }) => {
          const bar = barRefs.current[task.id]?.getBoundingClientRect()
          return bar && bar.left <= area.right && bar.right >= area.left && bar.top <= area.bottom && bar.bottom >= area.top
        })
        .map(({ task }) => task.id))
    }
    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      if (!active) setSelectedIds([])
      setMarquee(null)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

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
      reorderable: groupByProject && rowOrder === 'manual' && group.length === 1,
    }
    setFrozenRows((groupByProject ? visibleProjects.flatMap(p => shownTasks(p)) : flatRows.map(({ task }) => task)).map(t => t.id))
    setFrozenProjects(visibleProjects.map(p => p.id))
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

  const colorOf = (projectId) => (projectId !== NO_PROJECT_ID && projectColors[projectId]) || NO_PROJECT_COLOR

  const changeProjectColor = (name, color) => {
    setProjectColors(colors => ({ ...colors, [name]: color }))
    // The custom color input fires while it's being dragged: only the last color is saved.
    clearTimeout(colorSaveTimers.current[name])
    colorSaveTimers.current[name] = setTimeout(() => {
      saveProjectColor(name, color).catch(() => setSaveError(`Il colore del progetto ${name} non è stato salvato.`))
    }, 400)
  }

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
            {/* Rows are dragged only in "Ordine mio", within a project (moveRow). */}
            {groupByProject && rowOrder === 'manual' && (
              <span
                className="drag-handle"
                onMouseDown={() => { rowDragRef.current = { taskId: task.id, projectId } }}
              >⠿</span>
            )}
            <span className="task-name" style={{ paddingLeft: groupByProject ? task.depth * 16 : 0 }}>
              {task.type && (
                <Icon
                  name={TASK_TYPE_ICONS[task.type].name}
                  size={14}
                  aria-hidden={false}
                  aria-label={task.type}
                  style={{ color: TASK_TYPE_ICONS[task.type].color }}
                />
              )}
              {task.name}
            </span>
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
                style={{ '--project-color': colorOf(projectId), '--project-ink': inkOn(colorOf(projectId)) }}
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
          <button
            className="btn"
            onClick={() => setOffset(START_OFFSET)}
            disabled={offset === START_OFFSET}
            title="Torna alla vista iniziale, con oggi vicino all'inizio"
          >Oggi</button>
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
            className={`btn${selectedProject === null ? ' active' : ''}`}
            onClick={() => selectProject(null)}
          >Tutti</button>
          {loadedProjects.map(p => (
            <span key={p.id} className="project-filter">
              {p.id !== NO_PROJECT_ID && (
                <span title={`Colore di ${p.name}`}>
                  <ColorPicker value={colorOf(p.id)} swatches={PASTELS} onChange={color => changeProjectColor(p.id, color)} />
                </span>
              )}
              <button
                className={`btn${selectedProjectId === p.id ? ' active' : ''}`}
                onClick={() => selectProject(p.id)}
              >{p.name}</button>
            </span>
          ))}
          <button
            className={`btn${hidePastTasks ? ' active' : ''}`}
            style={{ marginLeft: '12px' }}
            onClick={() => setHidePastTasks(h => !h)}
          >Nascondi passati</button>
          <button
            className={`btn${onlyEpics ? ' active' : ''}`}
            onClick={() => setOnlyEpics(o => !o)}
          >
            <Icon name={TASK_TYPE_ICONS[EPIC].name} size={14} style={{ color: TASK_TYPE_ICONS[EPIC].color }} />
            Solo epiche
          </button>
          <button
            className={`btn${groupByProject ? ' active' : ''}`}
            onClick={() => setGroupByProject(g => !g)}
          >Raggruppa per progetto</button>
          {/* Not grouped, the rows go by start date. */}
          {groupByProject && (
            <>
              <span className="subtitle" style={{ marginLeft: '12px' }}>In alto:</span>
              <button
                className={`btn${rowOrder === 'earliest' ? ' active' : ''}`}
                onClick={() => chooseRowOrder('earliest')}
              >Chi finisce prima</button>
              <button
                className={`btn${rowOrder === 'latest' ? ' active' : ''}`}
                onClick={() => chooseRowOrder('latest')}
              >Chi finisce dopo</button>
              <button
                className={`btn${rowOrder === 'manual' ? ' active' : ''}`}
                onClick={() => chooseRowOrder('manual')}
                title="L'ordine che dai trascinando i task dal ⠿: lo stesso di quadrato"
              >Ordine mio</button>
            </>
          )}
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
        {onlyEpics && projects !== null && projects.length > 0 && !visibleProjects.some(p => p.tasks.some(t => t.type === EPIC)) && (
          <p className="gantt-message">Nessuna epica da fare o in corso.</p>
        )}
        {loadError && <p className="gantt-message gantt-message--error">{loadError}</p>}
        {saveError && <p className="gantt-message gantt-message--error">{saveError}</p>}
        {/* Empty but for the events of the day the mouse is over: a red column only says there's one. */}
        <div className="event-strip">
          {hoveredEvents.length > 0 && (
            <>
              <span className="event-strip-day">{hoveredColumn.label}</span>
              {hoveredEvents.map(event => (
                <span key={event.id} className="event-strip-item">
                  <span className="event-strip-dot" style={{ background: projectColors[event.projectId] ?? NO_PROJECT_COLOR }} />
                  {event.time} {event.name}
                </span>
              ))}
            </>
          )}
        </div>
        <div className="gantt-card">
          {/* A stacking context, so the weekend bands (z-index -1) sit above the card's background but under the rows. */}
          <div ref={containerRef} style={{ position: 'relative', zIndex: 0 }} onMouseMove={hoverDay} onMouseLeave={() => setHoveredDay(null)}>
            {/* Laid out as dayColumnWidth measures the columns: the rows' cells span several days, so they can't be colored. */}
            {dividerX !== null && columns.map(({ label, date, isWeekend }, i) => (
              <Fragment key={label}>
                {[isWeekend && 'weekend-band', eventsOn(date).length > 0 && 'event-band'].filter(Boolean).map(band => (
                  <div
                    key={band}
                    className={band}
                    style={{
                      left: `calc(${dividerX}px + ${i} * (100% - ${dividerX}px) / ${visibleDays})`,
                      width: `calc((100% - ${dividerX}px) / ${visibleDays})`,
                    }}
                  />
                ))}
              </Fragment>
            ))}
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
            {marquee && <div className="marquee" style={marquee} />}
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
                  {columns.map(({ label, date, isToday, isWeekend }) => (
                    <th
                      key={label}
                      className={[isToday && 'col-today', isWeekend && 'col-weekend', eventsOn(date).length > 0 && 'col-event'].filter(Boolean).join(' ') || undefined}
                      ref={isToday ? todayColRef : null}
                    >{label}</th>
                  ))}
                </tr>
              </thead>
              <tbody onMouseDown={startMarquee}>
                {groupByProject
                  ? visibleProjects.map(project => {
                    const tasks = shownTasks(project)
                    if (tasks.length === 0) return null

                    return (
                      <Fragment key={project.id}>
                        <tr
                          className={`project-header-row${projectDropId === project.id ? ' drop-target' : ''}`}
                          ref={el => projectHeaderRefs.current[project.id] = el}
                        >
                          <td className="project-header-cell" colSpan={visibleDays + 1}>
                            {/* With "Solo epiche" the order is the epics', not the user's, but in "Ordine mio". */}
                            {project.id !== NO_PROJECT_ID && (!onlyEpics || rowOrder === 'manual') && (
                              <span
                                className="drag-handle project-drag-handle"
                                title="Trascina per spostare il progetto"
                                onMouseDown={(e) => {
                                  e.preventDefault()
                                  projectDragRef.current = project.id
                                }}
                              >⠿</span>
                            )}
                            <span className="project-dot" style={{ background: colorOf(project.id) }} />
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
