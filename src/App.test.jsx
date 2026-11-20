import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'

const COOKIE = 'simonegentili.com-access-token'

// Due `days` from now at 18:00, as quadrato's `timestamp`.
const dueIn = (days) => {
  const date = new Date(Date.now() + days * 86400000)
  const pad = (n) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} 18:00:00`
}

const task = (id, title, project, days, extra = {}) => ({
  id, title, project, status: 0, timestamp: dueIn(days), createdAt: Math.floor(Date.now() / 1000), ...extra,
})

// Two epics, one with a subtask, and two tasks that are no epic's.
const DATA = {
  'simplanner-tasks': [
    task('e1', '[epic] Lancio', 'alpha', 9),
    task('s1', 'Design', 'alpha', 5, { parentId: 'e1', position: 0 }),
    task('b1', '[bug] Login rotto', 'alpha', 2),
    task('e2', '[epic] Migrazione', 'beta', 10),
    task('t1', 'Documentazione', 'beta', 4),
  ],
  'simplanner-project-colors': { alpha: '#fde68a', beta: '#bfdbfe' },
  'simplanner-project-order': [],
}

const rows = () => [...document.querySelectorAll('.task-name')].map(el => el.textContent.trim()).sort()

const renderLoaded = async () => {
  render(<App />)
  await waitFor(() => expect(rows()).toEqual(['Design', 'Documentazione', 'Lancio', 'Login rotto', 'Migrazione']))
}

describe('what the toolbar shows', () => {
  beforeEach(() => {
    document.cookie = `${COOKIE}=test-token; path=/`
    vi.stubGlobal('fetch', vi.fn(async (url) => ({
      ok: true,
      status: 200,
      json: async () => (String(url).endsWith('/quadrato/data') ? DATA : { apps: [] }),
    })))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    document.cookie = `${COOKIE}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT`
  })

  it('shows only the epics', async () => {
    await renderLoaded()

    fireEvent.click(screen.getByRole('checkbox', { name: 'Task' }))

    expect(rows()).toEqual(['Lancio', 'Migrazione'])
  })

  it('besides only the epics, shows everything but the epics', async () => {
    await renderLoaded()

    fireEvent.click(screen.getByRole('checkbox', { name: /^Epiche/ }))

    expect(rows()).toEqual(['Design', 'Documentazione', 'Login rotto'])
  })
})

describe('deadlines and epics on the bars', () => {
  // "YYYY-MM-DD" `days` from now, as quadrato's `deadline`.
  const dayIn = (days) => dueIn(days).slice(0, 10)

  const load = (data) => {
    document.cookie = `${COOKIE}=test-token; path=/`
    vi.stubGlobal('fetch', vi.fn(async (url) => ({
      ok: true,
      status: 200,
      json: async () => (String(url).endsWith('/quadrato/data') ? data : { apps: [] }),
    })))
  }

  afterEach(() => {
    vi.unstubAllGlobals()
    document.cookie = `${COOKIE}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT`
  })

  const barOf = (name) => [...document.querySelectorAll('tr')]
    .find(row => row.querySelector('.task-name')?.textContent.trim() === name)
    .querySelector('.bar')

  it('draws the days after a deadline that was gone past in another color', async () => {
    load({
      ...DATA,
      'simplanner-tasks': [
        task('late', 'Bolletta', 'alpha', 2, { deadline: dayIn(0) }),
        task('fine', 'Affitto', 'alpha', 2, { deadline: dayIn(5) }),
        task('none', 'Senza', 'alpha', 2),
      ],
    })
    render(<App />)
    await waitFor(() => expect(rows()).toEqual(['Affitto', 'Bolletta', 'Senza']))

    expect(barOf('Bolletta').querySelector('.bar-overrun')).not.toBeNull()
    expect(barOf('Bolletta').title).toMatch(/^Scadenza: .*, superata$/)
    expect(barOf('Affitto').querySelector('.bar-overrun')).toBeNull()
    expect(barOf('Affitto').title).toMatch(/^Scadenza: /)
    expect(barOf('Senza').querySelector('.bar-overrun')).toBeNull()
  })

  it('links an epic down to the task that starts first and up from the one that ends last', async () => {
    load(DATA)
    render(<App />)
    await waitFor(() => expect(rows()).toEqual(['Design', 'Documentazione', 'Lancio', 'Login rotto', 'Migrazione']))

    // Only "Lancio" has a task under it: "Migrazione" has none.
    await waitFor(() => expect(document.querySelectorAll('.epic-span-line')).toHaveLength(2))
    expect(document.querySelectorAll('.epic-span-line--down')).toHaveLength(1)
    expect(document.querySelectorAll('.epic-span-line--up')).toHaveLength(1)
  })
})
