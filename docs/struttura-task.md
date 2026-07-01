# Struttura dei Task e Progetti

## File di configurazione

I dati sono in `src/data/projects.js`. Questo file è pensato per essere sostituito in futuro da una chiamata API REST — il formato dei dati prodotto dall'API dovrà corrispondere a quello descritto qui.

---

## Struttura di un Progetto

```js
{
  id: 3,           // number — identificatore univoco del progetto
  name: 'Scrivere', // string — nome visualizzato nell'header di gruppo
  tasks: [ ... ],  // Task[] — lista dei task appartenenti al progetto
}
```

---

## Struttura di un Task

```js
{
  id: 234,                        // number — identificatore univoco (usato da dependsOn)
  name: 'JavaScript // II edition', // string — nome visualizzato nella colonna Task
  start: new Date(2026, 0, 1),    // Date — data di inizio (inclusa)
  end: new Date(2026, 5, 1),      // Date — data di fine (inclusa)
  dependsOn: 234,                 // number | number[] | undefined — id del task padre
}
```

### Campi obbligatori

| Campo | Tipo | Descrizione |
|---|---|---|
| `id` | `number` | Identificatore univoco. Non deve ripetersi tra progetti diversi. |
| `name` | `string` | Testo mostrato nella colonna "Task". |
| `start` | `Date` | Data di inizio della barra nel Gantt. |
| `end` | `Date` | Data di fine della barra nel Gantt. |

### Campi opzionali

| Campo | Tipo | Descrizione |
|---|---|---|
| `dependsOn` | `number \| number[]` | Id del task (o lista di id) da cui dipende. Quando il task padre viene spostato, il figlio si aggiusta automaticamente via `resolveConstraints`. |

---

## Aggiungere un task

1. Aprire `src/data/projects.js`
2. Aggiungere un oggetto nell'array `tasks` del progetto desiderato
3. Scegliere un `id` non ancora usato
4. Impostare `start` e `end` con `new Date(anno, mese, giorno)` — **nota**: il mese è 0-based (gennaio = 0, dicembre = 11)

```js
{
  id: 999,
  name: 'Nuovo task',
  start: new Date(2026, 9, 1),  // 2026-10-01
  end: new Date(2026, 11, 31),  // 2026-12-31
}
```

## Rimuovere un task

Eliminare l'oggetto corrispondente dall'array `tasks`. Se altri task hanno `dependsOn` puntato all'id rimosso, rimuovere o aggiornare anche quel campo.

---

## Aggiungere un progetto

```js
{
  id: 10,             // nuovo id univoco
  name: 'Nome progetto',
  tasks: [
    // lista task
  ],
}
```

---

## Migrazione futura a API REST

Quando sarà disponibile un'API, sarà sufficiente sostituire l'import in `App.jsx`:

```js
// Attuale (dati statici)
import { initialProjects } from './data/projects'

// Futuro (da API)
const initialProjects = await fetch('/api/projects').then(r => r.json())
// → convertire le date da stringa ISO a oggetti Date prima di passarle allo stato
```

Il formato JSON atteso dall'API:

```json
[
  {
    "id": 3,
    "name": "Scrivere",
    "tasks": [
      {
        "id": 234,
        "name": "JavaScript // II edition",
        "start": "2026-01-01",
        "end": "2026-06-01"
      }
    ]
  }
]
```

Le date in stringa ISO dovranno essere convertite con `new Date(dateString)` prima di essere passate a `useState`.
