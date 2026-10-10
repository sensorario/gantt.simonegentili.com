# Struttura dei Task e Progetti

## Da dove vengono i dati

Il Gantt mostra i task di **quadrato** del workspace corrente, letti da `GET https://api.simonegentili.com/quadrato/data` con il token del cookie `simonegentili.com-access-token` (condiviso su `*.simonegentili.com`: chi ha fatto il login in quadrato è già dentro anche qui). Senza login non c'è niente da mostrare.

La conversione sta in `src/App.jsx`, in `toProjects` e `toGanttTask`.

### Quali task

- Solo quelli **da fare** (`status` 0) e **in corso** (`status` 1), non archiviati: cosa si sta facendo e cosa si dovrà fare.
- Raggruppati per `project`; quelli senza progetto finiscono in "Nessun progetto". Con "Raggruppa per progetto" spento diventano un'unica lista ordinata per data di inizio (a parità, per data di fine), senza rientri né maniglia ⠿.
- I sotto-task (`parentId`) stanno subito sotto il padre, rientrati di un livello. Un sotto-task il cui padre non è mostrato (chiuso, archiviato, in un altro progetto) parte come primo livello.

### Le date di una barra

| Barra | Da dove viene |
|---|---|
| fine | la scadenza del task (`timestamp`) |
| inizio | l'inizio pianificato (`startsAt`, salvato dal Gantt); se manca il giorno di creazione (`createdAt`); se manca anche quello oggi; mai dopo la fine |

I task **senza scadenza** e senza inizio pianificato sono barre di un giorno, tutte nella stessa colonna, `UNSCHEDULED_WEEKS` (3) settimane dopo oggi, tratteggiate. Ogni barra ha il colore del suo progetto; i task **in corso** hanno in più un bordo scuro dello stesso colore.

### Colori dei progetti

Il colore è dell'utente, legato al nome del progetto e uguale in tutti i suoi workspace: è lo stesso che mostra quadrato, e si cambia da entrambe le app. Nel Gantt si cambia dal quadratino accanto al bottone del progetto, in alto (pastelli o colore personalizzato); viene salvato con `PATCH /gantt/project-color` dopo un attimo, così il selettore personalizzato non manda una richiesta a ogni movimento. Ogni cambio è un evento `ProjectColorChanged` nello storico dell'utente; il valore attuale (la proiezione, tabella `project_colors`) arriva con `simplanner-project-colors` di `GET /quadrato/data`, sopra i colori scelti in quadrato prima di questi eventi. Un progetto senza colore riceve un pastello a caso, lontano dai colori degli altri progetti, e lo salva con `random: true`: l'API lo tiene solo se il progetto non ha ancora un colore, altrimenti risponde con quello (per esempio scelto nel frattempo in quadrato) e il Gantt usa quello. I task senza progetto sono grigi.

### Padre e sotto-task

- **Un sotto-task dipende dal suo task**: non inizia prima che il task sia finito, e una freccia rossa va dalla fine del task all'inizio del sotto-task. Vale a ogni livello tranne che sotto un task di primo livello.
- **Il task di primo livello non ha frecce**: contiene i suoi sotto-task e finisce quando finisce l'ultimo, a qualunque profondità (la sua fine è la più lontana tra la sua scadenza e quelle dei discendenti). I task intermedi invece non vengono allungati: sono i loro sotto-task a venire dopo di loro.
- **Tra fratelli non c'è nessun legame.**
- Un task senza scadenza (parcheggiato qualche settimana avanti) è su una data finta: non dipende da nessuno, nessuno dipende da lui, non allunga nessuno. Un task di primo livello senza scadenza prende la fine dei sotto-task.
- Le regole si applicano insieme finché niente si sposta più (`layout`). Al caricamento il Gantt mostra già il risultato, ma niente viene salvato finché non si trascina qualcosa; trascinando un task, ogni altro task che si sposta di conseguenza (un sotto-task spinto dopo, il task di primo livello allungato) viene salvato insieme a lui.

## La vista

- All'apertura mostra 14 giorni, a partire da 3 giorni fa; i bottoni "Giorni" la allargano fino a un anno. I task senza scadenza (`UNSCHEDULED_WEEKS` settimane avanti) restano fuori finché non si allarga o si scorre la vista.
- La linea verticale tra i nomi dei task e le barre si trascina per allargare o stringere la colonna dei nomi (tra 120 e 600 px). La larghezza resta salvata nel browser (`localStorage`, chiave `gantt-name-width`).

## Aprire un task in quadrato

Accanto al nome di ogni task c'è un bottone ↗ che apre il task in quadrato (`https://quadrato.simonegentili.com/task/:id`) in una nuova scheda.

## Trascinare una barra

| Cosa si trascina | Cosa cambia | Cosa si salva in quadrato |
|---|---|---|
| il centro della barra | inizio e fine insieme | `startsAt` e `timestamp` |
| il bordo sinistro | solo l'inizio (mai oltre la fine) | `startsAt` |
| il bordo destro | solo la fine (mai prima dell'inizio) | `timestamp` |

Il salvataggio è `PUT /gantt/task/:id` (accetta solo `timestamp` e `startsAt`, poi aggiorna il task come farebbe quadrato e registra l'evento `TaskRescheduled` con `app: gantt`, che conta per l'ordine delle app nel launcher; anche il login dal Gantt passa da `POST /gantt/authenticate`): `timestamp` in millisecondi, mantenendo l'orario che la scadenza aveva (le 09:00 se non ne aveva); `startsAt` in secondi Unix, mezzanotte del giorno scelto. Se il salvataggio non riesce la barra torna dov'era.

### Più task insieme

Si selezionano trascinando: premendo su un punto vuoto delle righe e trascinando si disegna un rettangolo, e le barre che tocca diventano la selezione (la riga si colora e la barra ha un bordo; nella barra in alto compare "N selezionate" con "Deseleziona"). Un clic su un punto vuoto, Esc o "Deseleziona" tolgono la selezione; il rettangolo non parte da una barra, dalla maniglia ⠿ né dai link. Trascinando il **centro** di una barra selezionata si spostano dello stesso numero di giorni tutte le selezionate visibili, anche di progetti diversi; quelle nascoste da un filtro restano dove sono. I **bordi** di una barra selezionata, e qualunque barra non selezionata, spostano solo il proprio task. Le regole tra padre e sotto-task valgono come sempre, con le selezionate che restano dove le si lascia: un sotto-task selezionato insieme al suo task si sposta con lui senza essere spinto oltre, uno non selezionato viene spinto dopo. Ogni task che cambia viene salvato.

Mentre si trascina, le righe restano ferme: stesso ordine e stesse righe, anche se la barra finisce oltre un'altra o nel passato con "Nascondi passati" attivo. Il riordino per data di inizio (senza raggruppamento) e il filtro si applicano al rilascio del mouse. Senza raggruppamento, trascinando una barra in verticale non si riordinano le righe.

Il riordino verticale delle righe (maniglia ⠿) e le dipendenze tra task (`dependsOn`, frecce) restano funzioni del Gantt ma non vengono salvati: quadrato non ha né un ordine per il Gantt né dipendenze.

## Struttura interna di un task

```js
{
  id: 'uuid',              // id del task in quadrato
  name: 'Titolo',          // title del task
  depth: 0,                // 0 = primo livello, 1 = sotto-task, ...
  inProgress: false,       // status === 1
  unscheduled: false,      // nessuna scadenza in quadrato
  dueTime: '09:00:00',     // orario della scadenza, riusato al salvataggio
  start: Temporal.PlainDate,
  end: Temporal.PlainDate,
}
```
