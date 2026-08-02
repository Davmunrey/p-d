# Backlog — Web de Boda

Board de trabajo. Cada ticket es una rama y una PR. Ver [PLAN-MAESTRO.md](./PLAN-MAESTRO.md) para arquitectura y reglas.

**Estados:** `📋 Pendiente` · `🚧 En curso` · `👀 En revisión` · `✅ Hecho` · `🧊 Congelado`

**Definition of Done** (todos los tickets): funciona contra BBDD real · cero hardcode · **test E2E incluido** · CI verde · responsive · accesible · revisado en preview.

---

## Resumen

| Épica | Tickets | Estado |
|---|---|---|
| E1 · Cimientos | BODA-01 → 06 | 📋 6 pendientes |
| E2 · Base de datos | BODA-10 → 14 | 📋 5 pendientes |
| E3 · Landing | BODA-20 → 28 | 📋 9 pendientes |
| E4 · Save the Date | BODA-30 → 32 | 📋 3 pendientes |
| E5 · Auth y panel | BODA-40 → 43 | 📋 4 pendientes |
| E6 · Invitados y RSVP | BODA-50 → 58 | 📋 9 pendientes |
| E7 · Presupuesto | BODA-60 → 64 | 📋 5 pendientes |
| E8 · Proveedores | BODA-70 → 74 | 📋 5 pendientes |
| E9 · Tareas y seating | BODA-80 → 84 | 📋 5 pendientes |
| E10 · Producción | BODA-90 → 95 | 📋 6 pendientes |

**Total: 57 tickets.**

---

## E1 · Cimientos

> Sin esto, todo lo demás acumula deuda. No se empieza la landing hasta que E1 esté cerrada.

### BODA-01 · Inicializar proyecto Next.js
`📋` · `S` · sin dependencias

Next.js 15 (App Router) + TypeScript estricto + Tailwind v4. Estructura de carpetas del §4 del plan.

**Aceptación:** `npm run dev` levanta · `npm run build` pasa · `strict: true` sin errores · árbol de carpetas creado.
**E2E:** la home responde 200 y renderiza.

---

### BODA-02 · Sistema de design tokens
`📋` · `M` · ← BODA-01

Las tres capas del §2.2: primitivos → semánticos → componente. Expuestos a Tailwind vía `@theme`. Incluye tokens de movimiento (duraciones, easings) y tema claro/oscuro.

**Aceptación:** `styles/tokens/primitives.css`, `semantic.css`, `motion.css` · `bg-surface` y `var(--color-surface)` resuelven al mismo valor · cambiar un primitivo se propaga sin tocar componentes · página `/kitchen-sink` que muestra la paleta y la escala tipográfica.
**E2E:** el kitchen sink renderiza todos los tokens · alternar tema cambia los colores computados.

---

### BODA-03 · Capa de copys en castellano
`📋` · `S` · ← BODA-01

`content/copy.es.json` + hook `useCopy()` tipado. Autocompletado de claves y error de compilación si falta una.

**Aceptación:** cero textos visibles en componentes · clave inexistente falla en typecheck.
**E2E:** una clave del JSON aparece renderizada en pantalla.

---

### BODA-04 · Calidad automatizada
`📋` · `M` · ← BODA-02, BODA-03

ESLint + Prettier + Stylelint + Husky + lint-staged. **Las reglas del §2 se aplican en CI, no por revisión humana.**

**Aceptación:** stylelint rechaza colores literales en CSS · ESLint rechaza valores arbitrarios de Tailwind (`text-[14px]`) y textos literales en JSX · pre-commit bloquea código que no cumple.
**E2E:** n/a — se valida con casos de prueba de lint que deben fallar.

---

### BODA-05 · Netlify y CI
`📋` · `M` · ← BODA-01

`netlify.toml` con `@netlify/plugin-nextjs`. GitHub Actions: typecheck, lint, tests, build. Deploy preview por PR.

**Aceptación:** push a `main` despliega · cada PR genera preview con URL · CI bloquea el merge si falla.
**E2E:** la suite corre en CI contra el preview.

---

### BODA-06 · Proyecto Supabase y conexión
`📋` · `M` · ← BODA-01

Proyectos de producción y staging. Clientes tipados (browser, servidor, middleware). Supabase CLI para local. Generación automática de tipos.

**Aceptación:** `supabase start` levanta en local · `npm run db:types` genera `types/database.ts` · variables en Netlify · **`service_role` nunca en el bundle de cliente** (verificado en build).
**E2E:** una página server-side lee un valor de la BBDD y lo pinta.

---

## E2 · Base de datos

### BODA-10 · Esquema base y convenciones
`📋` · `S` · ← BODA-06

Extensiones, `updated_at` por trigger, helpers de auditoría, tabla `profiles` ligada a `auth.users` con roles.

### BODA-11 · Configuración de la boda
`📋` · `S` · ← BODA-10

`wedding_settings` (fila única): fecha, lugar, nombres, coordenadas, flags de secciones, fecha límite de RSVP. **Fuente de verdad de todo dato de la boda.**
**E2E:** cambiar la fecha en BBDD se refleja en la cuenta atrás de la landing.

### BODA-12 · Invitados
`📋` · `M` · ← BODA-10

`guest_groups`, `guests`, `rsvps` con sus enums. Índice único sobre `invite_token`.

### BODA-13 · Presupuesto, proveedores y organización
`📋` · `M` · ← BODA-10

`vendor_categories`, `vendors`, `vendor_documents`, `services`, `budget_categories`, `budget_items`, `payments`, `tasks`, `tables`, `media`, `activity_log`. Vistas `v_budget_summary` y `v_guest_stats`.

### BODA-14 · RLS y funciones públicas
`📋` · `L` · ← BODA-11, BODA-12, BODA-13 · **🔒 crítico**

Políticas RLS de todas las tablas + `get_invitation(token)` y `submit_rsvp(token, responses)` como `SECURITY DEFINER` con rate limiting.

**Aceptación:** anon no lee `guests`, `vendors`, `payments` ni ninguna tabla privada · las funciones devuelven **solo** el grupo del token · token caducado o fuera de plazo se rechaza.
**E2E:** suite de tests de seguridad que intenta leer cada tabla privada como anon y **debe fallar en todas**.

---

## E3 · Landing

> Todas las secciones leen su contenido de la BBDD. Ninguna imagen en `/public`.

| ID | Ticket | Est. | E2E |
|---|---|---|---|
| **BODA-20** | Layout público, navegación y footer | `M` | Navegación entre secciones funciona en móvil y escritorio |
| **BODA-21** | Motor de animación (Motion + Lenis) con `prefers-reduced-motion` | `M` | Con motion reducido no hay transforms activos |
| **BODA-22** | Hero: foto, nombres, fecha, parallax | `M` | Muestra los datos de `wedding_settings` |
| **BODA-23** | Cuenta atrás | `S` | Calcula desde la fecha en BBDD, no desde una constante |
| **BODA-24** | Nuestra historia: timeline con reveals | `M` | Los hitos se cargan de BBDD y aparecen al hacer scroll |
| **BODA-25** | Galería con lightbox y lazy loading | `L` | Solo fotos publicadas · el lightbox abre, navega y cierra con teclado |
| **BODA-26** | Cuándo y dónde + mapa | `M` | Coordenadas de BBDD · el enlace de mapa abre bien |
| **BODA-27** | FAQ, alojamiento y transporte | `M` | El acordeón abre y cierra, accesible por teclado |
| **BODA-28** | Sección de regalo + CTA de RSVP sticky | `S` | El CTA lleva al RSVP · el regalo solo se revela al interactuar |

---

## E4 · Save the Date

| ID | Ticket | Est. | E2E |
|---|---|---|---|
| **BODA-30** | Página `/save-the-date` | `M` | Renderiza con datos de BBDD |
| **BODA-31** | Descarga `.ics` para calendario | `S` | El `.ics` descargado tiene la fecha correcta |
| **BODA-32** | Open Graph e imagen dinámica | `S` | Las meta tags contienen los datos reales |

---

## E5 · Auth y panel

| ID | Ticket | Est. | E2E |
|---|---|---|---|
| **BODA-40** | Login por magic link | `M` | Login completo hasta el panel |
| **BODA-41** | Middleware de protección de rutas | `S` | **Anon en `/app/*` → redirigido al login** |
| **BODA-42** | Layout del panel: navegación, usuario, logout | `M` | Navegar entre módulos y cerrar sesión |
| **BODA-43** | Dashboard con KPIs reales | `M` | Los KPIs cambian al modificar datos |

---

## E6 · Invitados y RSVP

> El corazón de la app. Ningún ticket se cierra sin su E2E.

| ID | Ticket | Est. | E2E |
|---|---|---|---|
| **BODA-50** | Tabla de invitados: filtros, búsqueda, orden | `L` | Filtrar y buscar devuelve resultados correctos |
| **BODA-51** | Alta y edición de invitados y grupos | `M` | Crear invitado → aparece en la tabla → editarlo persiste |
| **BODA-52** | Generación y copia de enlaces de invitación | `M` | El enlace generado **funciona** en el flujo público |
| **BODA-53** | Import CSV con validación | `M` | CSV válido da de alta en bloque · CSV con errores los muestra sin importar nada |
| **BODA-54** | Export CSV y Excel | `S` | El fichero descargado contiene las filas filtradas |
| **BODA-55** | Formulario público de RSVP multipaso | `L` | Recorrido completo de confirmación |
| **BODA-56** | Edición de RSVP hasta la fecha límite | `M` | Editar antes del plazo funciona · después, se bloquea |
| **BODA-57** | Emails de confirmación (Resend) | `M` | Al confirmar se envía el email (mailbox de test) |
| **BODA-58** | Manejo de tokens inválidos y caducados | `S` | Token falso → error claro, **sin filtrar datos de otros** |

---

## E7 · Presupuesto

| ID | Ticket | Est. | E2E |
|---|---|---|---|
| **BODA-60** | Categorías de presupuesto | `M` | Crear categoría con importe previsto |
| **BODA-61** | Partidas de gasto: alta, edición, borrado | `M` | Alta de gasto → **se refleja en los totales** |
| **BODA-62** | Pagos y calendario de vencimientos | `M` | Marcar pagado actualiza el pendiente |
| **BODA-63** | Gráficas previsto vs real | `M` | Las gráficas reflejan los datos reales |
| **BODA-64** | Alertas de desvío presupuestario | `S` | Superar lo previsto muestra el aviso |

---

## E8 · Proveedores y servicios

| ID | Ticket | Est. | E2E |
|---|---|---|---|
| **BODA-70** | CRUD de proveedores + categorías | `M` | Alta, edición y borrado |
| **BODA-71** | Pipeline de estado (investigando → contratado) | `M` | Cambiar estado persiste y se refleja en la vista |
| **BODA-72** | Documentos: subida a Storage | `M` | Subir contrato → descargarlo · **anon no puede acceder** |
| **BODA-73** | Comparativa de presupuestos | `M` | Compara importes de varios proveedores |
| **BODA-74** | Servicios con precio por invitado | `M` | Confirmar invitados **recalcula el importe del servicio** |

---

## E9 · Tareas y seating

| ID | Ticket | Est. | E2E |
|---|---|---|---|
| **BODA-80** | CRUD de tareas | `M` | Crear, completar y borrar |
| **BODA-81** | Vista kanban con drag & drop | `M` | Arrastrar cambia el estado y persiste |
| **BODA-82** | Plantilla inicial de tareas por meses restantes | `S` | Genera las tareas según la fecha de boda |
| **BODA-83** | Plano de mesas drag & drop | `L` | Mover mesa guarda su posición |
| **BODA-84** | Asignación de invitados a mesas | `L` | Asignar avisa de alergias y de invitados sin mesa |

---

## E10 · Producción

| ID | Ticket | Est. | Nota |
|---|---|---|---|
| **BODA-90** | Optimización de imágenes y rendimiento | `L` | Objetivo Lighthouse ≥ 95 · CLS < 0.1 |
| **BODA-91** | Auditoría de accesibilidad AA | `M` | Axe en CI sin violaciones críticas |
| **BODA-92** | SEO, sitemap y robots | `S` | Landing indexable · panel **no** indexable |
| **BODA-93** | Sentry y PostHog | `M` | Errores y eventos llegan a los paneles |
| **BODA-94** | Backup diario automatizado | `M` | GitHub Action que exporta a repo privado |
| **BODA-95** | Ping semanal anti-pausa de Supabase | `S` | Evita la pausa por inactividad del free tier |

---

## Rutas de trabajo

**Camino crítico hacia el primer envío a invitados:**
`E1 → E2 → E3 → E4 → BODA-52 → BODA-55` — con esto ya se pueden repartir invitaciones y recibir confirmaciones.

**Después, sin prisa:** E7, E8 y E9 son gestión interna y no bloquean a los invitados.

**Paralelizable:** E3 (landing) y E5 (auth/panel) no dependen entre sí una vez cerrada E2.

---

## Estimaciones

`S` ≈ medio día · `M` ≈ 1 día · `L` ≈ 2 días

**Total estimado: ~48 días de trabajo efectivo.** Al camino crítico (E1→E4 + RSVP) le corresponden ~22.
