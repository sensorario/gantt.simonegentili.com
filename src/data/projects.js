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
    id: 1,
    name: "JavaScript",
    tasks: [
      {
        id: 101,
        name: "Edit del master",
        start: Temporal.PlainDate.from("2026-01-01"),
        end: Temporal.PlainDate.from("2026-05-01"),
      },
      {
        id: 102,
        name: "Pubblicazione paperback",
        start: Temporal.PlainDate.from("2026-05-01"),
        end: Temporal.PlainDate.from("2026-06-01"),
        dependsOn: 101,
      },
      {
        id: 103,
        name: "Conversione per ebook",
        start: Temporal.PlainDate.from("2026-05-01"),
        end: Temporal.PlainDate.from("2026-06-15"),
        dependsOn: 101,
      },
      {
        id: 104,
        name: "Pubblicazione ebook",
        start: Temporal.PlainDate.from("2026-06-15"),
        end: Temporal.PlainDate.from("2026-07-01"),
        dependsOn: 103,
      },
    ],
  },
  {
    id: 2,
    name: "TypeScript",
    tasks: [
      {
        id: 201,
        name: "Edit del master",
        start: Temporal.PlainDate.from("2026-06-01"),
        end: Temporal.PlainDate.from("2026-09-01"),
      },
      {
        id: 202,
        name: "Pubblicazione paperback",
        start: Temporal.PlainDate.from("2026-09-01"),
        end: Temporal.PlainDate.from("2026-10-01"),
        dependsOn: 201,
      },
      {
        id: 203,
        name: "Conversione per ebook",
        start: Temporal.PlainDate.from("2026-09-01"),
        end: Temporal.PlainDate.from("2026-10-15"),
        dependsOn: 201,
      },
      {
        id: 204,
        name: "Pubblicazione ebook",
        start: Temporal.PlainDate.from("2026-10-15"),
        end: Temporal.PlainDate.from("2026-11-01"),
        dependsOn: 203,
      },
    ],
  },
  {
    id: 3,
    name: "React",
    tasks: [
      {
        id: 301,
        name: "Edit del master",
        start: Temporal.PlainDate.from("2026-09-01"),
        end: Temporal.PlainDate.from("2027-06-01"),
      },
      {
        id: 302,
        name: "Pubblicazione paperback",
        start: Temporal.PlainDate.from("2027-06-01"),
        end: Temporal.PlainDate.from("2027-07-01"),
        dependsOn: 301,
      },
      {
        id: 303,
        name: "Conversione per ebook",
        start: Temporal.PlainDate.from("2027-06-01"),
        end: Temporal.PlainDate.from("2027-08-01"),
        dependsOn: 301,
      },
      {
        id: 304,
        name: "Pubblicazione ebook",
        start: Temporal.PlainDate.from("2027-08-01"),
        end: Temporal.PlainDate.from("2027-09-01"),
        dependsOn: 303,
      },
    ],
  },
];
