# Copilot Instructions

## Project Overview

This is a Gantt chart web application built with **React 19** and **Vite**. It visualizes project tasks on a timeline with drag-and-drop support and automatic dependency constraint resolution.

## Tech Stack

- **Framework**: React 19
- **Bundler**: Vite 8
- **Language**: JavaScript (JSX)
- **Component library**: `@sensorario/sg-components`
- **Linting**: ESLint

## Architecture

- `src/App.jsx` — main component containing all Gantt logic (projects, tasks, drag-and-drop, constraint resolution)
- `src/App.css` — styles for the Gantt chart
- `src/main.jsx` — React entry point

## Key Conventions

- Use functional React components with hooks (`useState`, `useEffect`, `useLayoutEffect`, `useRef`)
- Date manipulation is done with native `Date` objects — avoid adding date libraries unless strictly necessary
- Task dependency (`dependsOn`) can be a single ID or an array of IDs
- `resolveConstraints` propagates date shifts when tasks are dragged, respecting parent→child ordering
- Italian locale (`it-IT`) is used for date formatting
- `getColumns` returns an `isToday` flag on the column matching the real current date; used to apply `.col-today` CSS class and render a vertical SVG line overlay
- Keep all Gantt state inside `App.jsx`; extract sub-components only when clearly reusable

## Development Commands

```bash
npm run dev       # start dev server
npm run build     # production build
npm run lint      # run ESLint
npm run preview   # preview production build
```
