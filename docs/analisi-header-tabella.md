# Analisi: visualizzazione giorni/mesi nell'header della tabella

## Come funziona

### Generazione delle colonne — `getColumns(offset, visibleDays)`

```js
// src/App.jsx
date.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' })
```

Ogni colonna mostra un'etichetta nel formato **`gg/mm`** (es. `01/05`, `15/06`), usando il locale italiano. La data di partenza è `today` (hardcoded a `new Date(2026, 4, 1)`) spostata di `offset + i` giorni.

### Header della tabella

```jsx
<tr>
  <th className="col-name">Task</th>
  {columns.map(({ label }) => (
    <th key={label}>{label}</th>   // una colonna per giorno
  ))}
</tr>
```

C'è **una sola riga di header**, con una `<th>` per ogni giorno visibile. Non esiste un raggruppamento per mese.

---

## Finestra temporale — `visibleDays`

Lo stato `visibleDays` (default: **180**) controlla quante colonne/giorni vengono mostrati nella tabella.

```jsx
// Inizializzazione
const [visibleDays, setVisibleDays] = useState(180)

// Pulsanti di selezione nel header
{[90, 180, 365].map(d => (
  <button
    className={`btn${visibleDays === d ? ' active' : ''}`}
    onClick={() => setVisibleDays(d)}
  >{d}g</button>
))}
```

| Valore | Descrizione | Utilizzo tipico |
|---|---|---|
| **90g** | ~3 mesi | Sprint e pianificazione trimestrale |
| **180g** | ~6 mesi | Vista semestrale (default) |
| **365g** | 1 anno | Pianificazione annuale |

`visibleDays` viene usato anche per calcolare la larghezza di ogni colonna:
```js
const colWidth = table.offsetWidth / (visibleDays + 1)
```
Quindi più giorni → colonne più strette → label `gg/mm` più difficili da leggere.

---

## Problemi rilevati

| Problema | Stato | Dettaglio |
|---|---|---|
| **Nessun header mese** | Aperto | I mesi non sono raggruppati visivamente — si vede solo `gg/mm` per colonna |
| **Colonne molto strette** | Aperto | Con 90/180/365 giorni le label si sovrappongono o vengono troncate |
| **Anno non mostrato** | Aperto | Se la timeline attraversa anni diversi, non c'è modo di distinguerli |
| **Nessuna distinzione weekend** | Aperto | Sabato e domenica non hanno stile diverso |
| **`today` hardcoded** | Aperto | `new Date(2026, 4, 1)` invece di `new Date()` |
| **Giorno corrente non visibile** | ✅ Risolto | Colonna odierna evidenziata in rosso con linea verticale SVG |
