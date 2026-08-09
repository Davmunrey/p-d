# Backlog

**El board vive en [GitHub Issues](https://github.com/Davmunrey/p-d/issues).** Este
fichero ya no lo duplica: explica cómo está montado y cómo se trabaja con él.

Un tablero en Markdown y otro en GitHub acaban discrepando siempre, y cuando
discrepan nadie sabe cuál manda. Se elige GitHub porque es donde ya están la PR,
el CI y el deploy preview: cerrar un ticket deja de ser editar un fichero y pasa
a ser consecuencia de mergear.

| Dónde                                                 | Qué contiene                                             |
| ----------------------------------------------------- | -------------------------------------------------------- |
| [Issues](https://github.com/Davmunrey/p-d/issues)     | Los tickets: qué hay que hacer, aceptación y su test E2E |
| [`docs/PLAN-MAESTRO.md`](./PLAN-MAESTRO.md)           | Arquitectura, modelo de datos y decisiones tomadas       |
| [`CLAUDE.md`](../CLAUDE.md)                           | Las reglas innegociables                                 |
| [`.github/etiquetas.json`](../.github/etiquetas.json) | Las etiquetas del board, versionadas                     |

---

## Cómo se lee el board

Cada ticket lleva **una etiqueta de épica**, **una de talla** y, si toca, alguna
de aviso.

**Épicas** — las decenas del código `BODA-XX` coinciden con la épica, así que el
número ya dice de qué va:

| Etiqueta              | Códigos          | Qué agrupa                                   |
| --------------------- | ---------------- | -------------------------------------------- |
| `e1-cimientos`        | `BODA-01` → `06` | Proyecto, tokens, copys, calidad, despliegue |
| `e2-base-de-datos`    | `BODA-10` → `14` | Esquema, RLS y funciones públicas            |
| `e3-landing`          | `BODA-20` → `28` | La web que ven los invitados                 |
| `e4-save-the-date`    | `BODA-30` → `32` | Reserva de fecha y calendario                |
| `e5-auth-y-panel`     | `BODA-40` → `43` | Acceso privado y esqueleto del panel         |
| `e6-invitados-y-rsvp` | `BODA-50` → `58` | Invitados y confirmaciones                   |
| `e7-presupuesto`      | `BODA-60` → `64` | Partidas, pagos y desvíos                    |
| `e8-proveedores`      | `BODA-70` → `74` | Proveedores, contratos y servicios           |
| `e9-tareas-y-mesas`   | `BODA-80` → `84` | Tareas y plano de mesas                      |
| `e10-produccion`      | `BODA-90` → `95` | Rendimiento, accesibilidad, SEO y respaldos  |
| `e11-dia-de-la-boda`  | `BODA-100`→`104` | Lo que se usa el día D, desde el móvil       |
| `e12-comunicacion`    | `BODA-110`→`113` | Envíos, recordatorios y mensajes             |

**Tallas** — `talla-s` medio día · `talla-m` un día · `talla-l` dos días.

**Avisos** — `camino-critico` es lo que bloquea poder repartir invitaciones;
`seguridad` marca lo que toca RLS, tokens o datos personales y tiene revisión
bloqueante; `bloqueado` y `decision-pendiente` señalan lo que no se puede
empezar todavía.

**Estados.** No hay etiquetas de estado: abierto es pendiente, con PR enlazada
es en curso, cerrado es hecho. Se sabe por la propia incidencia, no por una
etiqueta que alguien tiene que acordarse de mover.

---

## Camino crítico

Filtro directo: [`label:camino-critico`](https://github.com/Davmunrey/p-d/issues?q=is%3Aopen+label%3Acamino-critico).

`E1 → E2 → E3 → E4 → BODA-52 → BODA-55`. Con eso ya se pueden repartir
invitaciones y recibir confirmaciones, que es lo único con fecha de verdad.

E7, E8 y E9 son gestión interna: no bloquean a nadie. E3 (landing) y E5
(panel) se pueden llevar en paralelo una vez cerrada E2.

---

## El ciclo de un ticket

1. **Se abre** con la plantilla de ticket. Sin criterios de aceptación y sin
   test E2E descrito, no es un ticket: es una idea.
2. **Rama desde `main` actualizado**, nombrada por el ticket:
   `feat/BODA-52-enlaces-de-invitacion`.
3. **PR con `Closes #NN`** en el cuerpo. GitHub cierra la incidencia al mergear;
   nadie la cierra a mano.
4. **CI verde y preview revisado.** Verde es todo: typecheck, lint, stylelint,
   formato, unitarios, migraciones y E2E.
5. **Merge a `main`** en cuanto esté verde, sin pedir permiso. Nunca con un
   check en rojo, y nunca relajando un test para conseguirlo.
6. La rama se borra sola.

---

## Trabajar desde GitHub, sin terminal

Mencionar `@claude` en una incidencia, en una PR o en un comentario de revisión
lanza el trabajo ahí mismo, con el contexto de ese hilo
([`.github/workflows/claude.yml`](../.github/workflows/claude.yml)).

Sirve para abrir un ticket y decir «hazlo», para pedir un cambio sobre una
revisión, o para que arregle su propio CI en rojo. Necesita el secreto
`CLAUDE_CODE_OAUTH_TOKEN`; mientras no esté, la mención se ignora con un aviso
en el registro en lugar de fallar. Ver [`ENTORNO.md`](./ENTORNO.md).

---

## Reconstruir el board

Las etiquetas son configuración versionada, no algo que se cree a mano en la
interfaz. Se editan en [`.github/etiquetas.json`](../.github/etiquetas.json) y
al mergear a `main` el flujo `Etiquetas` las reconcilia. También se puede
lanzar a mano desde la pestaña **Actions**.
