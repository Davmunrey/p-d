# Plan Maestro — Web de Boda + Panel de Gestión

> Documento vivo. Define visión, arquitectura, modelo de datos, convenciones y roadmap.
> Cualquier decisión técnica nueva se documenta aquí antes de implementarse.

---

## 1. Visión

Un único producto con dos caras:

| Cara        | Público                      | Contenido                                                                                                                                                           |
| ----------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Público** | Invitados y visitantes       | Landing narrativa con fotos y animaciones al scroll, página _Save the Date_, confirmación de asistencia (RSVP), info práctica (lugar, horario, alojamiento, regalo) |
| **Privado** | Los novios (y colaboradores) | Panel de gestión: invitados, presupuesto, proveedores, servicios, tareas, seating, documentos                                                                       |

Ambas caras comparten el mismo origen de datos: lo que se gestiona en el panel es lo que ve el invitado. La lista de invitados alimenta el RSVP; el RSVP alimenta el presupuesto (nº de menús); los proveedores alimentan los pagos.

---

## 2. Reglas fundacionales (no negociables)

Estas reglas aplican a **todo** el código. Una PR que las incumpla no se mergea.

### 2.1 Cero hardcode

| Tipo de dato                                                                                 | Dónde vive                                 | Nunca en                           |
| -------------------------------------------------------------------------------------------- | ------------------------------------------ | ---------------------------------- |
| Colores, tipografías, espaciados, radios, sombras, duraciones, easings, z-index, breakpoints | Design tokens (CSS custom properties)      | Valores literales en componentes   |
| Textos visibles (copys, labels, errores, meta)                                               | `content/copy.es.json`, tipado             | Strings literales en JSX           |
| Datos de la boda (fecha, lugar, nombres, coordenadas, hashtag)                               | Tabla `wedding_settings` en BBDD           | Constantes en código               |
| Fotos, vídeos, documentos                                                                    | Supabase Storage + tabla `media`           | `/public` con rutas fijas          |
| URLs de servicios, claves, IDs de proyecto                                                   | Variables de entorno (`.env`, Netlify env) | Código fuente                      |
| Enums de negocio (estados RSVP, categorías)                                                  | Tipos Postgres + tipos TS generados        | Uniones de strings escritas a mano |
| Números mágicos (límites, paginación, timeouts)                                              | `src/config/constants.ts`, con nombre      | Literales incrustados              |

**Regla práctica:** si un valor pudiera cambiar sin que cambie la lógica, no es código — es configuración.

### 2.2 Sistema de design tokens

Arquitectura de tres capas. Una capa solo consume la anterior; nunca se salta niveles.

```
┌─ Capa 1 — Primitivos ────────────────────────────────┐
│  --color-sage-500, --font-size-8, --space-6          │  Valores crudos. Sin semántica.
│  Fuente única de verdad. Solo aquí hay literales.    │  No se usan en componentes.
└───────────────────────┬──────────────────────────────┘
                        ▼
┌─ Capa 2 — Semánticos ────────────────────────────────┐
│  --color-surface, --color-text-muted,                │  Qué significa el valor.
│  --color-accent, --space-section, --radius-card      │  Aquí vive el tema claro/oscuro.
└───────────────────────┬──────────────────────────────┘
                        ▼
┌─ Capa 3 — Componente ────────────────────────────────┐
│  --button-bg, --card-padding, --nav-height           │  Opcional. Solo si el componente
│  Siempre con fallback al semántico.                  │  necesita ajuste propio.
└──────────────────────────────────────────────────────┘
```

- Los tokens se definen en `src/styles/tokens/` y se exponen a Tailwind vía `@theme` (Tailwind v4), de modo que `bg-surface` y `var(--color-surface)` son el mismo token. **Una sola fuente, dos sintaxis.**
- Prohibido en componentes: `#hex`, `rgb()`, `px` sueltos (salvo `1px` de borde), `text-[14px]`, `bg-[#fff]`.
- Tema claro/oscuro y variantes estacionales se resuelven **reasignando semánticos**, nunca tocando componentes.
- Movimiento: duraciones y easings también son tokens (`--duration-slow`, `--ease-out-expo`), y todo respeta `prefers-reduced-motion`.
- Lint que lo garantiza: `stylelint` (bloquea colores literales en CSS) + regla ESLint sobre valores arbitrarios de Tailwind.

### 2.3 Otras reglas

- **Todo en castellano.** Interfaz, copys, mensajes de error y emails. También los nombres de dominio en el código (`invitados`, `proveedores`, `presupuesto`) para que las rutas y la conversación hablen el mismo idioma. Palabras reservadas y APIs siguen en inglés.
- **Todo cableado, nada de maquetas.** Ninguna pantalla se da por hecha con datos falsos: si se entrega una vista, lee y escribe de verdad contra la BBDD. No se mergean botones sin acción, campos que no persisten ni datos de ejemplo incrustados. Un módulo a medias pero funcional es preferible a uno completo pero simulado.
- **Toda entrega lleva su test E2E.** Ver §14.
- **TypeScript estricto.** Tipos de BBDD **generados** desde Supabase, nunca escritos a mano.
- **Accesibilidad AA**: contraste, foco visible, navegación por teclado, `prefers-reduced-motion`.
- **Mobile-first.** La mayoría de invitados abrirá el enlace desde WhatsApp en el móvil.
- **Todo migrado.** Ningún cambio de esquema se hace a mano en el panel de Supabase; siempre migración versionada en git.

### 2.4 Listón de diseño

El proyecto instala skills de diseño en [`.claude/skills/`](../.claude/skills/README.md) — `impeccable`, `taste` y las de animación de Emil Kowalski — versionadas en el repo. Ninguna pantalla se da por terminada sin pasar por ellas.

Orden de precedencia si algo entra en conflicto: **estas reglas fundacionales > skills de diseño > preferencia personal.** Una skill nunca justifica hardcodear un valor: su criterio se materializa cambiando **tokens**, no componentes.

---

## 3. Stack

| Capa          | Elección                                                       | Por qué                                                                                                                      |
| ------------- | -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Framework     | **Next.js 15 (App Router)**                                    | SSR/ISR para la landing, Server Actions para el panel, un solo repo para ambas caras                                         |
| Hosting       | **Netlify** (`@netlify/plugin-nextjs`)                         | Requisito. Deploy previews por PR, CDN global, free tier suficiente                                                          |
| BBDD          | **Supabase** (PostgreSQL, open source)                         | Postgres puro + Auth + Storage + RLS + Realtime en un free tier. Autoalojable si algún día hace falta                        |
| Auth          | Supabase Auth (magic link + OAuth Google)                      | Sin gestionar contraseñas. Solo 2-4 usuarios                                                                                 |
| Ficheros      | Supabase Storage                                               | Fotos de la landing, contratos y facturas de proveedores                                                                     |
| Estilos       | Tailwind CSS v4 + design tokens en CSS vars                    | Tokens nativos vía `@theme`, sin capa de traducción                                                                          |
| Componentes   | shadcn/ui (copiado al repo, re-tematizado con nuestros tokens) | Base accesible; el código es nuestro y se adapta a los tokens                                                                |
| Animación     | Motion (`framer-motion`) + Lenis (scroll suave)                | Scroll-linked, parallax y reveals; API declarativa                                                                           |
| Formularios   | React Hook Form + Zod                                          | Un esquema Zod valida cliente y servidor                                                                                     |
| Datos (panel) | TanStack Query + Server Actions                                | Caché, optimistic updates, invalidación                                                                                      |
| Copys         | `content/copy.es.json` + hook `useCopy()` tipado               | **Todo en castellano.** Sin librería de i18n: una capa propia y ligera que impide textos en código y centraliza la redacción |
| Tablas        | TanStack Table                                                 | Filtros, orden y export CSV para invitados/gastos                                                                            |
| Emails        | Resend (free tier)                                             | Confirmaciones de RSVP y recordatorios                                                                                       |
| Tests         | Vitest + Testing Library + Playwright                          | Unitarios y E2E del flujo crítico (RSVP y login)                                                                             |
| Calidad       | ESLint + Prettier + Stylelint + Husky + lint-staged            | Las reglas del §2 se aplican solas                                                                                           |
| Errores       | Sentry (free tier)                                             | Ya disponible en el entorno                                                                                                  |
| Analítica     | PostHog (free tier)                                            | Ya disponible en el entorno                                                                                                  |

**Alternativas descartadas:** Astro (mejor landing, peor panel — no compensa mantener dos apps); Neon + Auth.js (Postgres excelente, pero habría que construir auth, storage y RLS por separado); PocketBase (ligero, pero requiere servidor propio, no encaja con Netlify).

---

## 4. Arquitectura

```
                 ┌──────────────────────────────┐
   Invitados ───►│  Netlify CDN / Edge          │
                 │  ├─ / (landing, ISR)         │
                 │  ├─ /save-the-date           │
                 │  └─ /rsvp/[token]            │
                 └──────────┬───────────────────┘
                            │ Server Actions / Route Handlers
                            ▼
   Novios ──────►┌──────────────────────────────┐
   (login)       │  /app/* (panel, SSR privado) │
                 └──────────┬───────────────────┘
                            │ supabase-js (anon key + RLS)
                            ▼
                 ┌──────────────────────────────┐
                 │  Supabase                    │
                 │  ├─ Postgres + RLS           │
                 │  ├─ Auth                     │
                 │  ├─ Storage (fotos, docs)    │
                 │  └─ Edge Functions (emails)  │
                 └──────────────────────────────┘
```

**Seguridad:** la autorización vive en la BBDD (RLS), no en el frontend. Aunque alguien obtuviera la clave pública, no puede leer la lista de invitados. La `service_role` key **solo** se usa en servidor y nunca se expone al bundle.

### Estructura de carpetas

```
src/
├─ app/
│  ├─ (public)/              # Landing, save the date, RSVP, info
│  ├─ (auth)/login/          # Magic link
│  └─ (dashboard)/app/       # Panel privado (layout con guard)
│     ├─ invitados/  presupuesto/  proveedores/
│     ├─ tareas/     seating/      ajustes/
├─ components/
│  ├─ ui/                    # Primitivos shadcn re-tematizados
│  ├─ marketing/             # Hero, galería, timeline, countdown
│  └─ dashboard/             # Tablas, formularios, gráficas
├─ styles/
│  ├─ tokens/                # primitives.css, semantic.css, motion.css
│  └─ globals.css
├─ lib/
│  ├─ supabase/              # client.ts, server.ts, middleware.ts
│  ├─ validators/            # Esquemas Zod (compartidos cliente/servidor)
│  └─ queries/               # Acceso a datos tipado
├─ config/                   # constants.ts, navigation.ts, site.ts
├─ types/database.ts         # GENERADO por supabase gen types
messages/                    # es.json, en.json
supabase/migrations/         # SQL versionado
tests/e2e/
```

---

## 5. Modelo de datos

Todas las tablas llevan `id uuid pk default gen_random_uuid()`, `created_at`, `updated_at` (trigger) y RLS activo.

### Configuración

**`wedding_settings`** (fila única) — fecha, hora, nombres de los novios, lugar de ceremonia y banquete, coordenadas, hashtag, moneda, idioma por defecto, fecha límite de RSVP, flags de secciones visibles.
→ _Elimina de raíz todo hardcode de datos de la boda._

**`profiles`** — extiende `auth.users`. `role`: `owner` | `editor` | `viewer`.

### Invitados

**`guest_groups`** — la unidad de invitación (una familia, una pareja). Campos: `name`, `invite_token` (único, indexado — la URL `/rsvp/[token]`), `max_guests`, `language`, `side` (`novia` | `novio` | `ambos`), `address`, `invited_to` (`ceremonia`, `banquete`, `fiesta` — array).

**`guests`** — persona individual. `group_id`, `first_name`, `last_name`, `email`, `phone`, `is_child`, `is_plus_one`, `menu_type` (`estandar` | `vegetariano` | `vegano` | `infantil` | `sin_gluten` | `otro`), `allergies`, `notes`, `table_id`.

**`rsvps`** — respuesta por invitado. `guest_id`, `status` (`pendiente` | `confirmado` | `rechazado` | `tentativo`), `responded_at`, `needs_transport`, `needs_accommodation`, `song_request`, `message`.
→ Historial preservado: se inserta versión nueva, no se sobrescribe.

### Proveedores y servicios

**`vendor_categories`** — catering, fotografía, música, flores, transporte, vestido…

**`vendors`** — `name`, `category_id`, `contact_name`, `email`, `phone`, `website`, `status` (`investigando` | `contactado` | `presupuesto_recibido` | `contratado` | `descartado`), `rating`, `quoted_amount`, `agreed_amount`, `notes`.

**`vendor_documents`** — contratos y facturas en Storage. `vendor_id`, `storage_path`, `type`, `uploaded_by`.

**`services`** — lo contratado a cada proveedor: `vendor_id`, `name`, `description`, `unit_price`, `quantity`, `is_per_guest` _(recalcula automáticamente al confirmarse invitados)_.

### Presupuesto

**`budget_categories`** — con `planned_amount` por categoría.

**`budget_items`** — `category_id`, `vendor_id` (opcional), `concept`, `estimated_amount`, `actual_amount`, `is_paid`.

**`payments`** — `budget_item_id`, `amount`, `due_date`, `paid_at`, `method`, `receipt_path`.
→ Vistas SQL: `v_budget_summary` (previsto vs real vs pagado vs pendiente por categoría) y `v_guest_stats` (confirmados, menús por tipo, niños).

### Organización

**`tasks`** — `title`, `description`, `due_date`, `status` (`pendiente` | `en_progreso` | `hecha`), `priority`, `assigned_to`, `vendor_id`, `category`.

**`tables`** — mesas del banquete: `name`, `capacity`, `shape`, `position_x`, `position_y` (para el plano visual).

**`media`** — fotos de la landing: `storage_path`, `alt_text` (i18n), `section`, `sort_order`, `width`, `height`, `blur_hash`, `is_published`.
→ _Ninguna imagen de la landing va en `/public`; todas se gestionan desde el panel._

**`activity_log`** — auditoría: quién cambió qué y cuándo.

### Política RLS

| Tabla                                           | Público (anon)                           | Autenticado             |
| ----------------------------------------------- | ---------------------------------------- | ----------------------- |
| `wedding_settings`                              | SELECT (solo campos públicos, vía vista) | ALL si `owner`/`editor` |
| `media`                                         | SELECT donde `is_published = true`       | ALL                     |
| `guest_groups`, `guests`, `rsvps`               | **Nada directo**                         | ALL                     |
| Resto (presupuesto, proveedores, pagos, tareas) | **Nada**                                 | ALL                     |

El invitado nunca consulta tablas directamente. El RSVP público pasa por dos funciones `SECURITY DEFINER` que reciben el token, devuelven **solo** ese grupo y escriben **solo** su respuesta:

- `get_invitation(token text)` → datos del grupo y sus invitados
- `submit_rsvp(token text, responses jsonb)` → registra respuestas

Ambas con rate limiting y validación de que el token existe y el plazo no ha vencido.

---

## 6. Experiencia pública

### Landing (`/`)

Secciones (orden y visibilidad configurables desde `wedding_settings`):

1. **Hero** — foto a pantalla completa, nombres, fecha, cuenta atrás. Parallax suave al scroll.
2. **Nuestra historia** — timeline con reveals escalonados al entrar en viewport.
3. **Galería** — grid tipo masonry, lightbox, lazy loading con blur placeholder.
4. **Cuándo y dónde** — ceremonia y banquete, mapa embebido, cómo llegar.
5. **Alojamiento y transporte** — recomendaciones y horarios de bus.
6. **FAQ** — acordeón (dress code, niños, aparcamiento…).
7. **Regalo** — número de cuenta / Bizum, revelado con interacción.
8. **CTA RSVP** — sticky en móvil.

**Principios de animación:** el movimiento sirve a la narrativa, no la interrumpe. Todas las duraciones y curvas son tokens. Con `prefers-reduced-motion` los reveals se convierten en fades cortos o desaparecen. Ninguna animación puede provocar layout shift (CLS objetivo < 0.1).

### Save the Date (`/save-the-date`)

Página independiente, ligera y compartible: fecha grande, foto, "añadir al calendario" (`.ics` generado desde `wedding_settings`), Open Graph propio para que se vea bien en WhatsApp.

### RSVP (`/rsvp/[token]`)

El grupo se identifica por su enlace único — sin contraseñas. Formulario multipaso: asistencia por persona → menú y alergias → transporte/alojamiento → canción y mensaje. Confirmación por email (Resend) y posibilidad de editar hasta la fecha límite.

---

## 7. Panel de gestión (`/app`)

| Módulo          | Contenido                                                                                                                                                    |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Dashboard**   | KPIs: días restantes, confirmados/pendientes, % presupuesto consumido, próximos pagos y tareas                                                               |
| **Invitados**   | Tabla con filtros y búsqueda, alta individual o import CSV, gestión de grupos, generación y copia de enlaces de invitación, envío por WhatsApp/email, export |
| **Presupuesto** | Categorías con previsto vs real, gráfica de reparto, calendario de pagos, alertas de desvío                                                                  |
| **Proveedores** | Ficha por proveedor, pipeline de estado, comparativa de presupuestos, documentos adjuntos                                                                    |
| **Servicios**   | Qué se contrata, precio por unidad o por invitado, recálculo automático con los confirmados                                                                  |
| **Tareas**      | Checklist con vista lista y kanban, plantilla inicial por meses restantes                                                                                    |
| **Seating**     | Plano drag & drop de mesas, asignación con avisos de alergias y de invitados sin mesa                                                                        |
| **Ajustes**     | Contenido de la landing, orden y visibilidad de secciones, subida y ordenación de fotos, textos i18n, datos de la boda, usuarios                             |

---

## 8. Roadmap

| Fase                            | Alcance                                                                                                                   | Entregable                                    | Est.  |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- | ----- |
| **0 — Cimientos**               | Next.js + TS + Tailwind v4, **tokens completos**, i18n, ESLint/Stylelint/Husky, Netlify + previews, proyecto Supabase, CI | Deploy en verde con las reglas del §2 activas | 1-2 d |
| **1 — Base de datos**           | Migraciones de todas las tablas, enums, vistas, triggers, RLS, seed, tipos TS generados                                   | Esquema completo versionado                   | 2 d   |
| **2 — Landing**                 | Todas las secciones, animaciones, galería, contenido desde BBDD                                                           | Landing pública lista                         | 4-5 d |
| **3 — Save the Date**           | Página, `.ics`, OG images                                                                                                 | Enlace compartible                            | 1 d   |
| **4 — Auth + shell**            | Magic link, middleware, layout del panel, roles                                                                           | Panel accesible y protegido                   | 2 d   |
| **5 — Invitados + RSVP**        | CRUD, grupos, tokens, import/export, flujo público de RSVP, emails                                                        | Ciclo completo de invitación                  | 4-5 d |
| **6 — Presupuesto**             | Categorías, partidas, pagos, gráficas                                                                                     | Control económico operativo                   | 3 d   |
| **7 — Proveedores + servicios** | Fichas, pipeline, documentos, precio por invitado                                                                         | Gestión de contratación                       | 3 d   |
| **8 — Tareas + seating**        | Checklist, kanban, plano de mesas                                                                                         | Organización del día                          | 3-4 d |
| **9 — Pulido**                  | Performance (Lighthouse ≥ 95), a11y, SEO, Sentry, PostHog, E2E, backups                                                   | Producción                                    | 2-3 d |

**Camino crítico:** 0 → 1 → 2 → 3 permite publicar y empezar a repartir el Save the Date mientras el panel sigue en desarrollo. Las fases 6-8 son internas: no bloquean nada de cara a los invitados.

---

## 9. Entornos y despliegue

| Entorno    | Rama                     | Supabase                                 |
| ---------- | ------------------------ | ---------------------------------------- |
| Producción | `main`                   | Proyecto principal                       |
| Preview    | Cada PR (URL de Netlify) | Branch de Supabase o proyecto de staging |
| Local      | —                        | Supabase CLI (`supabase start`)          |

Variables de entorno (Netlify, nunca en git): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (solo servidor), `RESEND_API_KEY`, `NEXT_PUBLIC_SITE_URL`, `SENTRY_DSN`, `NEXT_PUBLIC_POSTHOG_KEY`.

**Backups:** export diario del esquema y datos a un repo privado vía GitHub Action — el free tier de Supabase tiene retención limitada, y la lista de invitados no se puede perder.

---

## 10. Costes

| Servicio         | Plan                             | Coste        |
| ---------------- | -------------------------------- | ------------ |
| Netlify          | Free (100 GB/mes)                | 0 €          |
| Supabase         | Free (500 MB BBDD, 1 GB storage) | 0 €          |
| Resend           | Free (3.000 emails/mes)          | 0 €          |
| Sentry / PostHog | Free                             | 0 €          |
| Dominio          | `.com` o `.es`                   | ~10-15 €/año |

**Total: ~12 €/año.** Único punto de atención: el free tier de Supabase pausa proyectos tras 7 días sin actividad — se resuelve con un ping semanal desde una GitHub Action (o el plan Pro, 25 $/mes, si se prefiere no depender de ello en la semana de la boda).

---

## 11. Riesgos

| Riesgo                                      | Mitigación                                                                                     |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Pico de tráfico al enviar invitaciones      | Landing estática en CDN; solo el RSVP toca BBDD                                                |
| Pausa del proyecto Supabase por inactividad | Cron semanal de ping + monitorización                                                          |
| Fotos pesadas hunden el rendimiento         | `next/image` + AVIF/WebP, tamaños responsive, blur placeholder, presupuesto de peso por página |
| Enlace de invitación compartido o filtrado  | Token largo aleatorio, sin datos sensibles en la respuesta, rate limiting, opción de regenerar |
| Pérdida de datos                            | Backup diario automatizado a repo privado                                                      |
| Deriva del diseño (hardcode reintroducido)  | Stylelint + ESLint en CI: la PR falla, no depende de revisión humana                           |

---

## 12. Decisiones pendientes

Ninguna bloquea la Fase 0; se resuelven antes de la fase indicada.

1. **Dominio** — ¿comprado ya? Necesario en Fase 3 (Save the Date). _Netlify o Cloudflare como registrador._
2. **Dirección de arte** — paleta, tipografías y tono. Determina los valores de los tokens primitivos (no su estructura), así que la Fase 0 puede arrancar con una paleta provisional.
3. **Fotos** — ¿hay sesión de preboda? Condiciona el diseño del hero y la galería.
4. **Regalo** — ¿cuenta bancaria, Bizum, lista? Afecta a una sección de la landing.
5. **Colaboradores** — ¿acceso para wedding planner o familiares? El rol `viewer` ya lo contempla.

_Idioma resuelto: solo castellano._

---

## 13. Cómo trabajamos

- **Se trabaja por tickets**, no por fases sueltas. El board está en [`docs/BACKLOG.md`](./BACKLOG.md).
- Una rama por ticket (`feat/BODA-12-tabla-invitados`), PR con deploy preview, merge a `main` = deploy a producción.
- Toda migración de BBDD entra por PR con su SQL de rollback.
- Este documento se actualiza en la misma PR que introduce el cambio que lo afecta.

### Definition of Done

Un ticket no se cierra hasta cumplir **todos** los puntos:

- [ ] Funciona de verdad contra la BBDD (sin mocks ni datos de ejemplo incrustados)
- [ ] Cero hardcode: tokens, copys en `copy.es.json`, configuración en BBDD o env
- [ ] **Test E2E que cubre el camino feliz y al menos un caso de error**
- [ ] Verde en CI: typecheck, lint, stylelint, unitarios, E2E
- [ ] Responsive verificado en móvil, tablet y escritorio
- [ ] Accesible: navegable por teclado, foco visible, contraste AA
- [ ] **Pasado por las skills de diseño** (`impeccable` → `audit` y `polish`; `review-animations` si hay movimiento)
- [ ] Revisado en el deploy preview antes del merge

---

## 14. Estrategia de test

**Cada ticket entrega su test E2E.** Es parte del ticket, no una tarea posterior — un módulo sin test se considera no entregado.

| Nivel         | Herramienta              | Qué cubre                                                                               |
| ------------- | ------------------------ | --------------------------------------------------------------------------------------- |
| **E2E**       | Playwright               | Recorridos completos de usuario en navegador real. Chromium + WebKit móvil              |
| Integración   | Vitest + Testing Library | Componentes con estado, formularios, validaciones                                       |
| Base de datos | pgTAP o SQL en CI        | **Que las políticas RLS realmente bloquean.** Crítico: es la única capa de autorización |
| Visual        | Playwright screenshots   | Landing y secciones animadas, para detectar regresiones de maquetación                  |

### Recorridos E2E imprescindibles

1. Invitado abre la landing → navega secciones → llega al CTA de RSVP
2. Invitado abre `/rsvp/[token]` → confirma → recibe email → vuelve y **edita** su respuesta
3. Token inválido, caducado o fuera de plazo → mensaje claro, sin filtrar datos
4. Novio hace login por magic link → entra al panel → cierra sesión
5. Usuario **no autenticado** intenta entrar a `/app/*` → redirigido al login
6. Alta de invitado → aparece en la tabla → se genera enlace → ese enlace **funciona** en el flujo público
7. Import CSV de invitados → validación de errores → alta en bloque
8. Alta de gasto → se refleja en los totales del presupuesto y en el dashboard
9. Confirmación de un invitado → recalcula servicios con precio por invitado
10. Anon intenta leer `guests` directamente vía API → **denegado por RLS**

Entorno de test: proyecto Supabase de staging con seed determinista, reseteado antes de cada suite. Los E2E corren en cada PR (bloqueantes) y en `main` tras el deploy.

---

## 15. Board

El backlog vive en [`docs/BACKLOG.md`](./BACKLOG.md): tickets con ID, épica, estimación, dependencias, criterios de aceptación y su test E2E asociado. Se mantiene sincronizado con GitHub Issues (mismo ID) para poder enlazarlos desde las PRs.
