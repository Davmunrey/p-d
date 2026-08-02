# Reglas del proyecto

Web de boda: landing pública + panel privado de gestión. Documentación en [`docs/PLAN-MAESTRO.md`](./docs/PLAN-MAESTRO.md), board en [`docs/BACKLOG.md`](./docs/BACKLOG.md).

Estas reglas son **innegociables** y aplican a todo cambio, sin excepción.

## 1. Cero hardcode

Si un valor pudiera cambiar sin que cambie la lógica, no es código — es configuración.

| Qué                                                                                | Dónde va                               | Nunca                                                                    |
| ---------------------------------------------------------------------------------- | -------------------------------------- | ------------------------------------------------------------------------ |
| Color, tipografía, espaciado, radio, sombra, duración, easing, z-index, breakpoint | Token CSS en `src/styles/tokens/`      | `#hex`, `rgb()`, `px` sueltos, `text-[14px]`, `bg-[#fff]` en componentes |
| Texto visible (copy, label, error, meta)                                           | `content/copy.es.json` vía `useCopy()` | String literal en JSX                                                    |
| Datos de la boda (fecha, lugar, nombres, coords)                                   | Tabla `wedding_settings`               | Constante en código                                                      |
| Imágenes de la landing                                                             | Supabase Storage + tabla `media`       | `/public` con ruta fija                                                  |
| URLs de servicios, claves, IDs                                                     | Variables de entorno                   | Código fuente                                                            |
| Límites, paginaciones, timeouts                                                    | `src/config/constants.ts`, con nombre  | Literal incrustado                                                       |

**Tokens en tres capas.** Una capa solo consume la anterior, nunca se salta niveles:

1. **Primitivos** (`primitives.css`) — `--color-sage-500`, `--space-6`. Valores crudos, sin semántica. **El único sitio del proyecto con literales.** No se usan en componentes.
2. **Semánticos** (`semantic.css`) — `--color-surface`, `--color-text-muted`, `--radius-card`. Qué significa el valor. Aquí vive el tema claro/oscuro.
3. **Componente** — opcional, siempre con fallback al semántico.

Los componentes **solo** usan capa 2 o 3. Cambiar de tema o de paleta se hace reasignando semánticos, jamás tocando componentes.

## 2. Todo en castellano

Interfaz, copys, errores, emails y nombres de dominio en el código (`invitados`, `proveedores`, `presupuesto`). Palabras reservadas y APIs siguen en inglés.

## 3. Todo cableado

Ninguna pantalla se entrega con datos falsos. Si una vista se da por hecha, lee y escribe de verdad contra la BBDD. **No se mergean** botones sin acción, campos que no persisten ni datos de ejemplo incrustados. Un módulo a medias pero funcional es mejor que uno completo pero simulado.

## 4. Test E2E en cada entrega

Cada ticket incluye su test Playwright: camino feliz + al menos un caso de error. Un módulo sin test se considera no entregado. Los tests de RLS (que anon **no** puede leer tablas privadas) son obligatorios y bloqueantes.

## 5. Listón de diseño

Skills en [`.claude/skills/`](./.claude/skills/README.md): `impeccable`, `taste` y las de animación de Emil Kowalski. Ninguna pantalla se cierra sin pasar por ellas — `impeccable` (`audit` → `polish`) y `review-animations` si hay movimiento.

Precedencia ante conflicto: **estas reglas > skills de diseño > preferencia personal.** Una skill nunca justifica hardcodear: su criterio se materializa cambiando **tokens**.

## Definition of Done

- [ ] Funciona contra BBDD real, sin mocks
- [ ] Cero hardcode (regla 1)
- [ ] Test E2E incluido
- [ ] CI verde: typecheck, lint, stylelint, unitarios, E2E
- [ ] Responsive en móvil, tablet y escritorio
- [ ] Accesible: teclado, foco visible, contraste AA, `prefers-reduced-motion`
- [ ] Pasado por las skills de diseño
- [ ] Revisado en el deploy preview

## Cómo trabajamos

- Se trabaja **por tickets** del backlog. Una rama por ticket: `feat/BODA-12-tabla-invitados`.
- PR con deploy preview → merge a `main` → producción.
- Toda migración de BBDD entra por PR con su SQL de rollback.
- El plan maestro se actualiza en la misma PR que introduce el cambio que lo afecta.
- **Ante una decisión de producto que cambie el resultado, preguntar** antes de asumir.
