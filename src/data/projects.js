import { Temporal } from "@js-temporal/polyfill";

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
        id: 4,
        name: "React Certification",
        tasks: [
            {
                id: 401,
                name: "JavaScript review",
                start: Temporal.PlainDate.from("2026-06-01"),
                end: Temporal.PlainDate.from("2026-07-01"),
            },
            {
                id: 402,
                name: "Core concepts",
                start: Temporal.PlainDate.from("2026-07-01"),
                end: Temporal.PlainDate.from("2026-07-15"),
                dependsOn: [401],
            },
            {
                id: 403,
                name: "JSX",
                start: Temporal.PlainDate.from("2026-07-16"),
                end: Temporal.PlainDate.from("2026-08-01"),
                dependsOn: [402],
            },
            {
                id: 404,
                name: "Components",
                start: Temporal.PlainDate.from("2026-08-01"),
                end: Temporal.PlainDate.from("2026-08-16"),
                dependsOn: [403],
            },
            {
                id: 405,
                name: "Event Handling",
                start: Temporal.PlainDate.from("2026-08-17"),
                end: Temporal.PlainDate.from("2026-09-01"),
                dependsOn: [404],
            },
            {
                id: 406,
                name: "State",
                start: Temporal.PlainDate.from("2026-09-15"),
                end: Temporal.PlainDate.from("2026-09-20"),
                dependsOn: [405],
            },
            {
                id: 407,
                name: "Hooks",
                start: Temporal.PlainDate.from("2026-09-21"),
                end: Temporal.PlainDate.from("2026-09-30"),
                dependsOn: [406],
            },
            {
                id: 408,
                name: "React Router",
                start: Temporal.PlainDate.from("2026-10-01"),
                end: Temporal.PlainDate.from("2026-10-10"),
                dependsOn: [407],
            },
            {
                id: 409,
                name: "Additional Notes",
                start: Temporal.PlainDate.from("2026-10-11"),
                end: Temporal.PlainDate.from("2026-10-15"),
                dependsOn: [408],
            },
        ],
    },
    {
        id: 5,
        name: "React II Edizione",
        tasks: [
            {
                id: 501,
                name: "Stesura master",
                start: Temporal.PlainDate.from("2026-06-04"),
                end: Temporal.PlainDate.from("2026-10-15"),
            },
            {
                id: 504,
                name: "Pubblicazione Paperback",
                start: Temporal.PlainDate.from("2026-10-26"),
                end: Temporal.PlainDate.from("2026-11-10"),
                dependsOn: [501, 409],
            },
            {
                id: 505,
                name: "Pubblicazione ebook",
                start: Temporal.PlainDate.from("2026-11-10"),
                end: Temporal.PlainDate.from("2026-11-17"),
                dependsOn: [501, 409],
            }
        ],
    },
];
