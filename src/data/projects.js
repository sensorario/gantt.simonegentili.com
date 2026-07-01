import { Temporal } from '@js-temporal/polyfill'

/**
 * Dati dei progetti e dei task.
 *
 * Questa struttura è pensata per essere sostituita in futuro
 * da una chiamata a un'API REST. Il formato dei dati qui definito
 * rispecchia quello atteso dal componente App.
 *
 * Vedere docs/struttura-task.md per la documentazione completa.
 */

export const initialProjects = [
    {
        id: 3,
        name: 'Scrivere',
        tasks: [
            {
                id: 234,
                name: 'JavaScript // II edition',
                start: Temporal.PlainDate.from('2026-01-01'),
                end: Temporal.PlainDate.from('2026-06-01'),
            },
            {
                id: 987,
                name: 'TypeScript // II edition',
                start: Temporal.PlainDate.from('2026-06-01'),
                end: Temporal.PlainDate.from('2026-09-01'),
                dependsOn: 234,
            },
            {
                id: 456,
                name: 'JavaScript // III edition',
                start: Temporal.PlainDate.from('2026-09-01'),
                end: Temporal.PlainDate.from('2027-08-31'),
                dependsOn: 987,
            },
            {
                id: 988,
                name: 'React // II edition',
                start: Temporal.PlainDate.from('2026-09-01'),
                end: Temporal.PlainDate.from('2027-09-01'),
                dependsOn: 987,
            },
        ],
    },
]
