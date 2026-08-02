# Nuestra boda

Web de boda con landing pública y panel privado de gestión.

- **Pública:** landing con fotos y animaciones al scroll, save the date, confirmación de asistencia.
- **Privada:** gestión de invitados, presupuesto, proveedores, servicios, tareas y seating.

## Documentación

| Documento | Contenido |
|---|---|
| [Plan maestro](./docs/PLAN-MAESTRO.md) | Visión, arquitectura, stack, modelo de datos, reglas y roadmap |
| [Backlog](./docs/BACKLOG.md) | Board de tickets con criterios de aceptación y tests E2E |
| [Skills](./.claude/skills/README.md) | Listón de diseño e interacción del proyecto |

## Reglas del proyecto

1. **Cero hardcode.** Colores y espaciados vía design tokens, textos en `content/copy.es.json`, datos de la boda en BBDD, claves en variables de entorno.
2. **Todo en castellano.**
3. **Todo cableado.** Nada de maquetas con datos falsos: si una pantalla se entrega, funciona contra la BBDD.
4. **Todo ticket lleva su test E2E.**
5. **Nada se cierra sin pasar por las skills de diseño** (`impeccable`, `taste`, `review-animations`).

Detalle completo en el §2 del plan maestro.

## Stack

Next.js 15 · TypeScript · Tailwind v4 · Supabase (PostgreSQL) · Netlify · Playwright
