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

| Tipo de dato                                                                                 | Dónde vive                                | Nunca en                           |
| -------------------------------------------------------------------------------------------- | ----------------------------------------- | ---------------------------------- |
| Colores, tipografías, espaciados, radios, sombras, duraciones, easings, z-index, breakpoints | Design tokens (CSS custom properties)     | Valores literales en componentes   |
| Textos visibles (copys, labels, errores, meta)                                               | `content/copy.es.json`, tipado            | Strings literales en JSX           |
| Datos de la boda (fecha, lugar, nombres, coordenadas, hashtag)                               | Tabla `configuracion_boda` en BBDD        | Constantes en código               |
| Fotos, vídeos, documentos                                                                    | Supabase Storage + tabla `medios`         | `/public` con rutas fijas          |
| URLs de servicios, claves, IDs de proyecto                                                   | Variables de entorno (`.env`, Vercel env) | Código fuente                      |
| Enums de negocio (estados RSVP, categorías)                                                  | Tipos Postgres + tipos TS generados       | Uniones de strings escritas a mano |
| Números mágicos (límites, paginación, timeouts)                                              | `src/config/constants.ts`, con nombre     | Literales incrustados              |

**Regla práctica:** si un valor pudiera cambiar sin que cambie la lógica, no es código — es configuración.

### 2.2 Sistema de design tokens

Arquitectura de tres capas. Una capa solo consume la anterior; nunca se salta niveles.

```
┌─ Capa 1 — Primitivos ────────────────────────────────┐
│  --color-marino-500, --color-bronce-600, --space-6   │  Valores crudos. Sin semántica.
│  Fuente única de verdad. Solo aquí hay literales.    │  No se usan en componentes.
└───────────────────────┬──────────────────────────────┘
                        ▼
┌─ Capa 2 — Semánticos ────────────────────────────────┐
│  --superficie, --tinta-tenue, --acento,              │  Qué significa el valor.
│  --espacio-seccion, --radio-tarjeta                  │  Aquí vive el tema claro/oscuro.
└───────────────────────┬──────────────────────────────┘
                        ▼
┌─ Capa 3 — Componente ────────────────────────────────┐
│  --button-bg, --card-padding, --nav-height           │  Opcional. Solo si el componente
│  Siempre con fallback al semántico.                  │  necesita ajuste propio.
└──────────────────────────────────────────────────────┘
```

**La paleta es la versión azul marino del sistema de marca.** El estudio entregó
la identidad en dos versiones —verde oliva y azul marino— y se monta la azul;
la entrega completa está en `Sistema completo de boda/`, y de su tabla de tokens
salen uno a uno los valores de `primitives.css`. Cambiar de versión es reescribir
ese fichero y nada más: ningún componente nombra un color.
`tests/unidad/paleta.test.ts` compara las dos capas contra esa tabla, así que la
web no puede separarse de la cartelería impresa sin que el CI lo diga.

**Marca, acción y acento son tres cosas distintas.** La marca (marino) es el
color de la identidad; la acción (`--accion`) es el relleno del botón primario;
el acento (`--acento`) es el bronce, el único color cálido, y aparece a gotas —la
versalita de la portada, el conector «y», las citas, las horas del programa y el
aro de foco—. Mezclar acción y acento en un solo token, como estaba, hace que el
acento deje de existir: el botón se lo come.

- Los tokens se definen en `src/styles/tokens/` y se exponen a Tailwind vía `@theme` (Tailwind v4), de modo que `bg-superficie` y `var(--superficie)` son el mismo token. **Una sola fuente, dos sintaxis.**
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

| Capa          | Elección                                                       | Por qué                                                                                                                           |
| ------------- | -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Framework     | **Next.js 16 (App Router)**                                    | Render en servidor para la landing, Server Actions para el panel, un solo repo para ambas caras                                   |
| Hosting       | **Vercel**                                                     | Despliegue nativo de Next.js: no hay adaptador que mantener. Deploy previews por PR, CDN global, free tier suficiente             |
| BBDD          | **Supabase** (PostgreSQL, open source)                         | Postgres puro + Auth + Storage + RLS + Realtime en un free tier. Autoalojable si algún día hace falta                             |
| Auth          | Supabase Auth (magic link + OAuth Google)                      | Sin gestionar contraseñas. Solo 2-4 usuarios                                                                                      |
| Ficheros      | Supabase Storage                                               | Fotos de la landing, contratos y facturas de proveedores                                                                          |
| Estilos       | Tailwind CSS v4 + design tokens en CSS vars                    | Tokens nativos vía `@theme`, sin capa de traducción                                                                               |
| Componentes   | shadcn/ui (copiado al repo, re-tematizado con nuestros tokens) | Base accesible; el código es nuestro y se adapta a los tokens                                                                     |
| Animación     | CSS `animation-timeline: view()` (BODA-21)                     | Reveals al scroll sin JavaScript ni librerías. Se descartaron Motion y Lenis: el navegador ya lo hace, y fuera del hilo principal |
| Formularios   | React Hook Form + Zod                                          | Un esquema Zod valida cliente y servidor                                                                                          |
| Datos (panel) | TanStack Query + Server Actions                                | Caché, optimistic updates, invalidación                                                                                           |
| Copys         | `content/copy.es.json` + `t()` tipado (`src/lib/copy.ts`)      | **Todo en castellano.** Sin librería de i18n: una capa propia y ligera que impide textos en código y centraliza la redacción      |
| Tablas        | TanStack Table                                                 | Filtros, orden y export CSV para invitados/gastos                                                                                 |
| Emails        | Resend (free tier)                                             | Confirmaciones de RSVP y recordatorios                                                                                            |
| Tests         | Vitest + Testing Library + Playwright                          | Unitarios y E2E del flujo crítico (RSVP y login)                                                                                  |
| Calidad       | ESLint + Prettier + Stylelint + Husky + lint-staged            | Las reglas del §2 se aplican solas                                                                                                |
| Errores       | Sentry (free tier)                                             | Ya disponible en el entorno                                                                                                       |
| Analítica     | PostHog (free tier)                                            | Ya disponible en el entorno                                                                                                       |

**Alternativas descartadas:** Astro (mejor landing, peor panel — no compensa mantener dos apps); Neon + Auth.js (Postgres excelente, pero habría que construir auth, storage y RLS por separado); PocketBase (ligero, pero requiere servidor propio y sigue pre-1.0).

---

## 4. Arquitectura

```
                 ┌──────────────────────────────┐
   Invitados ───►│  Vercel CDN / Edge           │
                 │  ├─ / (landing, dinámica)    │
                 │  ├─ /reserva-la-fecha        │
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
│  ├─ supabase/              # servidor.ts (el middleware vive en src/middleware.ts)
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

Treinta y una tablas y ocho vistas, todas en `public`, todas con RLS activa y **todas con nombre en castellano** — regla 2, también aquí.

La convención es uniforme: `id uuid` como clave, `creado_en` y `actualizado_en` con trigger. Las excepciones se nombran donde toca.

> Este apartado describe lo que hay en `supabase/migrations/`, no lo que se planeó. Un test unitario extrae los nombres `public.*` citados aquí y comprueba que existen: citar una tabla inventada pone el CI en rojo.

### Configuración y acceso

**`configuracion_boda`** (fila única) — fecha y hora de ceremonia y banquete, nombres, lugares, direcciones, coordenadas, hashtag, correo de contacto, moneda, zona horaria, idioma por defecto y `fecha_limite_rsvp`. La vista **`v_configuracion_publica`** es lo único que lee `anon`: enumera columna a columna lo que puede salir a la web, para que una columna añadida mañana no aparezca sola en la landing.

**`configuracion_privada`** (fila única) — lo que no sale a la web: presupuesto objetivo, aforo, teléfono, IBAN de regalos con su titular, y notas. `anon` no tiene nada sobre esta tabla; la única excepción es **`datos_para_regalos()`**, que publica el IBAN y el titular —y sólo eso— cuando la sección `regalos` está visible. Encender la sección **es** publicar la cuenta: no hay un segundo interruptor que pueda quedar en desacuerdo con el primero. La sección está encendida, así que el interruptor real es el propio IBAN: mientras esté vacío no se pinta nada, y el día que se escriba en el panel se publica.

**`secciones_landing`** — qué secciones se enseñan y en qué orden (`seccion`, `visible`, `orden`). Añadir una sección es una fila, no una migración. Su política es `using (visible)`: a un invitado no le llega ni el nombre de una sección apagada. Vista pública: **`v_secciones_publicas`**.

**`perfiles`** — extiende `auth.users`. `usuario_id`, `nombre_completo`, `rol` (`propietario` | `editor` | `lector`) y `activo`. Estar autenticado y tener acceso son cosas distintas: un perfil inactivo es tan forastero como alguien sin sesión.

**`invitaciones_panel`** — altas pendientes de colaborador.

**`parametros_seguridad`** (fila única) — `maximo_intentos_rsvp` y `ventana_intentos_minutos`, que alimentan el cortafuegos del RSVP.

**`intentos_rsvp`** — bitácora de intentos. Guarda la **huella** del token, nunca el token.

**`registro_auditoria`** y **`campos_auditoria_redactados`** — quién cambió qué y cuándo, con la lista de columnas que se redactan antes de anotarlas.

### Invitados y confirmaciones

**`grupos_invitacion`** — la unidad de invitación (una familia, una cuadrilla). `nombre`, `lado` (`novia` | `novio` | `ambos`), `invitado_a` (array de `ceremonia` | `banquete` | `fiesta`), `maximo_acompanantes`, `idioma`, `huella_token` y `token_emitido_en`.

> **El token no se guarda.** La columna es `huella_token`: el SHA-256 del token, y nada más. Ni un volcado de la base ni quien tenga la contraseña de Supabase puede reconstruir un enlace. De ahí que el panel lo enseñe **una sola vez** al emitirlo, y que perderlo obligue a emitir otro — que invalida el anterior en el acto.

**`invitados`** — persona. `grupo_id`, `nombre`, `apellidos`, `correo_electronico`, `telefono`, `es_nino`, `es_acompanante`, `tipo_menu` (`estandar` | `vegetariano` | `vegano` | `infantil` | `sin_gluten` | `otro`) y `alergias`. El menú infantil está reservado a menores por restricción de tabla.

**`confirmaciones`** — respuesta por invitado: `estado` (`pendiente` | `tentativo` | `confirmado` | `rechazado`), `origen`, `respondido_en`, `necesita_autobus`, `necesita_alojamiento`, `cancion_solicitada`, `mensaje` y `es_vigente`.

> **Histórico inmutable.** Cambiar una respuesta inserta una fila nueva; la anterior deja de ser vigente pero no se toca. Un trigger lo impide, así que **ninguna columna añadida aquí se puede actualizar después** — por eso lo leído de un mensaje vive en `mensajes_leidos` y no en una columna de esta tabla.

**`notas_grupo`** y **`notas_invitado`** — anotaciones privadas del panel. No las ve ningún invitado.

**`mensajes_leidos`** — qué mensajes de invitados ya se han leído, y quién.

**`mesas`** — mesas del banquete: nombre, capacidad, forma y posición para el plano.

Vistas: **`v_estadisticas_invitados`** (confirmados, adultos, niños, autobús, alojamiento) y **`v_menus_confirmados`** (menús por tipo y cuántos llevan alergias).

### Contenido de la landing

**`hitos_programa`** — el día hora a hora, y también la víspera: la columna `momento` (`preboda` | `boda`) separa las dos secciones sin duplicar la tabla. La hora es texto y no `time` a propósito: en una boda se escribe «14:00» pero también «de madrugada».

**`hitos_historia`**, **`preguntas_frecuentes`**, **`alojamientos`**, **`rutas_llegada`** — cada uno con `orden` y `publicado`.

**`canciones_sugeridas`** — la playlist. `aprobada` la retira de la web sin borrarla, y es la propia política de lectura pública la que filtra por ese booleano.

**`consejos_vestimenta`** — los bloques del dress code («Ellas», «Ellos», «Solo dos peticiones»), con `orden` y `publicado`. Es una tabla y no copy fijo porque los consejos dependen de la finca y de la fecha —el del tacón sale de conocer el suelo— y se retocan sin desplegar.

**`medios`** — fotos de la landing: `ruta_almacenamiento`, `texto_alternativo`, `seccion`, `orden`, `ancho`, `alto`, `marcador_borroso` y `publicado`. Vista pública: **`v_medios_publicados`**. Ninguna imagen va en `/public`.

### Proveedores, presupuesto y organización

**`categorias_proveedor`**, **`proveedores`**, **`contactos_proveedor`**, **`documentos_proveedor`**, **`servicios`** — con `es_por_invitado` en los servicios, que recalcula al confirmarse invitados. Vista: **`v_servicios_importe`**.

**El embudo tiene siete fases y `descartado` exige decir por qué.** `estado_proveedor` va de `investigando` a `contratado` pasando por `contactado`, `presupuesto_pedido`, `presupuesto_recibido` y `visitado` — el orden de declaración del enumerado ES el orden de avance, así que un `order by estado` sale ordenado por lo avanzada que está la negociación. `motivo_descarte` es obligatorio con estado `descartado` y prohibido con cualquier otro, por restricción y no sólo por pantalla: sin el motivo, en septiembre alguien vuelve a escribir al fotógrafo que se descartó en marzo y recibe la misma respuesta; sin la segunda mitad, un proveedor recuperado conserva un motivo que ya no es verdad. La restricción entra `not valid` para no exigir que las filas anteriores —descartadas cuando la columna no existía— se inventen un motivo.

**`v_categorias_sin_contratar`** contesta la única pregunta que importa del módulo: qué falta por cerrar. Distingue una categoría sin empezar (cero candidatos) de una en la que hay que decidir (tres presupuestos encima de la mesa), que son dos problemas con dos remedios distintos. Es vista y no cálculo en pantalla porque el resumen del panel querrá el mismo dato, y dos sitios contándolo por su cuenta acaban discrepando la semana que alguien cambie qué cuenta como cerrado. Lleva `security_invoker` para que se lea con los permisos de quien pregunta: sin eso, una vista es un agujero por el que se salta RLS.

**Por qué `contactos_proveedor` existe además de las columnas de contacto de `proveedores`.** Quien te vende el catering no es quien está en la cocina, y el número del comercial a las once de la noche no lo coge nadie: lo que hace falta el día de la boda es el móvil del jefe de sala. Las columnas de `proveedores` se quedan como contacto principal —el que sale en la lista sin abrir la ficha— y esta tabla es «además de», no «en vez de». Su `es_del_dia` es lo que ordenará la agenda de BODA-101. La clave ajena es `on delete cascade`, al revés que el resto de esta parte del esquema: un contacto no es contabilidad y no tiene sentido conservarlo sin su proveedor.

**`categorias_presupuesto`**, **`partidas_presupuesto`**, **`pagos`**. Vistas: **`v_resumen_presupuesto`** y **`v_proximos_pagos`**.

**Un gasto lleva dos importes y el segundo puede estar sin poner.** `importe_estimado` es lo que se calcula que costará —`not null` con `default 0`, porque un gasto sin calcular son cero euros previstos— y `importe_real` es lo que se acabó acordando. `importe_real` nulo significa «todavía no cerrado» y hay que dejarlo nulo: un cero ahí diría que el proveedor sale gratis, y ese ahorro inventado entraría en la desviación de la categoría como dinero que sobra. Por eso la pantalla enseña «sin cerrar» y no «0,00 €», y `loQueVaCostando()` se despeja de la `desviacion` que ya calcula la vista —real donde lo haya, estimado donde no— en vez de sumar las partidas por segunda vez con otro criterio.

**La web es clara mientras nadie elija otra cosa.** Nació siguiendo `prefers-color-scheme`, y eso significaba que media lista de invitados abría la invitación en oscuro sin haberlo pedido — una pieza que nadie diseñó, porque la entrega del estudio es clara. Ahora la ausencia de atributo significa «clara»; `[data-tema="oscuro"]` fuerza el oscuro y `[data-tema="sistema"]` sigue al navegador **sólo si alguien lo elige a propósito**, de modo que las tres opciones del selector siguen significando lo que dicen. Es un fallo invisible desde un navegador en claro, así que lo sujeta un test que carga la página con el sistema en oscuro y mide la luminosidad real del fondo.

**Un vídeo de fondo empieza siendo su póster.** El servidor pinta el fotograma quieto y sólo el navegador, si confirma que se puede mover, monta el `<video>`. De ahí salen tres cosas a la vez: sin JavaScript se ve el póster, con `prefers-reduced-motion` se ve el póster —un bucle aéreo a pantalla completa es justo lo que marea a quien activa esa preferencia—, y los casi ochocientos kilos del vídeo no se descargan para quien no va a verlo moverse, que en una invitación abierta desde datos móviles no es una optimización de manual. Se resuelve con `useSyncExternalStore` y no con un efecto: la preferencia es estado de fuera de React que el sistema puede cambiar solo, y su instantánea de servidor evita pintar el vídeo y quitarlo al hidratar. **El tipo lo dice la base, no la extensión**: «.mov» y «.mp4» son el mismo vídeo con distinto envoltorio, y adivinarlo mirando el final de una cadena convierte un dato en una corazonada. Un vídeo **exige** su póster, con restricción de dos mitades.

**En el paisaje manda la frase, no la foto.** La sección que la entrega pone bajo la portada —una vista aérea con «Todo empezó entre Barcelona y Sevilla y continúa en León» encima— se pinta si hay frase, aunque no haya foto todavía: la frase es el mensaje y la foto es cómo se presenta, y esperar a la sesión de fotos para publicar un texto ya escrito sería dejarlo meses en un cajón. Sin frase no hay sección: una foto aérea muda es un fondo bonito que no dice nada. **La frase es un dato de la boda** —nombra tres ciudades concretas— y vive en `configuracion_boda`, editable desde ajustes, no en `copy.es.json`, que es el sitio de lo que no cambia de una boda a otra. **Y es el `h2` de la sección**, no un párrafo suelto: es lo único que la sección dice, así que es lo que le da nombre para quien la recorre saltando de titular en titular.

**El aviso de desvío vive en la portada del panel, no dentro del presupuesto.** Quien se ha pasado con el catering no entra al módulo de presupuesto a comprobarlo: entra a mirar cuántos han confirmado. Un aviso que sólo se ve donde ya ibas a mirar no avisa. Y tiene **dos grados**, porque «superado» llega tarde por definición —el dinero ya está comprometido—: el que cambia algo es el de antes, con el umbral en `UMBRAL_AVISO_PRESUPUESTO`. Una categoría sin presupuesto (cero previsto) no genera aviso: no es que se haya pasado, es que nadie la ha presupuestado todavía, y un aviso que aparece sin que nadie haya hecho nada mal enseña a no mirarlos.

**La decisión vive en `src/lib/desvios.ts`, fuera de `server-only`.** No toca la base —recibe filas y devuelve conclusiones—, y sacarla de ahí es lo que permite probar sus bordes (justo en el umbral, presupuesto a cero, el orden) con tests unitarios en vez de montar media boda en un E2E. Lo que el unitario no puede decir —si el aviso se ve al entrar— lo cubre el E2E. `loQueVaCostando` se muda con ella: es la misma decisión y no puede vivir separada.

**El mapa de «cómo llegar» es OpenStreetMap y el botón lleva a Google.** El mapa incrustado de Google exige una clave de API —una cuenta, una facturación y una variable más que configurar para que la landing no salga rota— y le cuenta a Google quién ha abierto la invitación antes de que el invitado pulse nada; OSM no pide clave. El **botón** sí lleva a Google, que es la aplicación que la gente tiene instalada: eso es una elección del invitado, no una que hagamos por él al cargar la página. El marco se carga con `loading="lazy"`, que es «al llegar a la sección» sin una línea de JavaScript y sin dejar fuera a quien navega sin él.

**Sin coordenadas, la sección de «cómo llegar» desaparece entera**, aunque haya rutas escritas. «Treinta minutos en autobús» sin decir hasta dónde no informa de nada: las rutas describen cómo llegar **a** un sitio, y sin ese sitio quedan flotando. Las dos columnas se comprueban juntas y una sola vez, porque una latitud sin longitud no es ningún sitio.

**Un pago no puede salirse de su gasto, y lo impone un trigger.** `pagos_dentro_del_gasto` compara la suma de los pagos de una partida contra su importe acordado —o el estimado mientras no haya acuerdo, el mismo criterio que usa `v_resumen_presupuesto` para la desviación— y lanza `PAG01`. Es trigger y no `check` porque mira **otras filas**: un `check` sólo ve la suya. Un gasto sin estimar (cero) no se compara con nada y admite su señal, que es como se paga de verdad: la señal del fotógrafo se da antes de saber el total. La pantalla repite la cuenta antes de enviar, pero sólo para poder decir **cuánto queda** — «no cabe» a secas obliga a ir al gasto, mirar su importe, sumar sus pagos y restar.

**`v_pagos` es la única definición de «vencido» del proyecto**, y `v_proximos_pagos` pasa a ser su filtro (`pagado_en is null`) en vez de repetir los joins. Con dos consultas independientes, «vencido» acaba significando cosas distintas en el aviso del panel y en la pantalla de pagos. Lo calcula la base con **su** fecha: preguntárselo al navegador es preguntárselo a un reloj que puede estar mal puesto o en otro huso, y un pago que aparece vencido un día antes —o un día después— no sirve para lo único que tiene que servir.

**Quién paga: un enumerado y un texto, no uno de los dos.** `pagos.paga` (`novia`/`novio`/`ambos`/`otros`) contesta la pregunta que justifica la columna —cuánto pone cada familia— y `paga_detalle` recoge lo que no encaja («los padrinos»), con la restricción de dos mitades: `otros` exige nombre y cualquier otro valor lo prohíbe. Sólo texto libre haría imposible el total por pagador («mis padres» y «Mis padres» son dos pagadores distintos para la base); sólo el enumerado mandaría a las notas algo que pasa en todas las bodas. `paga` nulo es «todavía no se ha decidido», que es un estado de verdad: la señal se apunta mucho antes de esa conversación, y por eso la columna no tiene valor por defecto.

**Los totales los suma la base y nunca el navegador.** Los importes son `numeric`, que en PostgreSQL es exacto y en JavaScript se convierte en coma flotante: sumar cuarenta partidas en la pantalla acaba enseñando «21.399,999999999996 €» justo en la vista que decide si esta boda cabe en el presupuesto.

**Cómo se lee un importe teclado** (`leerImporte()`, en `src/lib/importe.ts`, compartido por la ficha de proveedor, las categorías y los gastos). Vacío es `null` y no cero; lo ilegible es un rechazo con su frase y no un `null` que borraría en silencio lo que alguien acaba de teclear mal. **No se redondea, se rechaza:** un tercer decimal es un dedo que ha resbalado y la respuesta es enseñarlo, no elegir por él —antes `8600,555` se guardaba como 8.600,56 sin decir nada—. Y con el punto manda el castellano: se quita sólo el que va seguido de exactamente tres cifras, así que `1.250` son mil doscientos cincuenta y `12.50` siguen siendo doce con cincuenta.

**`tareas`** — con estado, prioridad y vencimiento.

### Política RLS

Lo primero que hace la migración de seguridad es `revoke all on all tables in schema public from anon, authenticated`, y después reparte permisos **tabla por tabla**. Una tabla nueva nace sin privilegios: la política dice qué filas puede tocar quien ya tiene permiso, no se lo concede.

| Quién         | Qué puede                                                                                                                                             |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `anon`        | `SELECT` sobre `configuracion_boda`, `secciones_landing` y `medios`, más el contenido de la landing filtrado por `publicado` / `visible` / `aprobada` |
| `lector`      | Leer todo el panel; no escribe nada                                                                                                                   |
| `editor`      | Además, escribir invitados, contenido, proveedores, presupuesto y tareas                                                                              |
| `propietario` | Además, gestionar colaboradores                                                                                                                       |

`anon` puede leer el contenido de la landing porque la landing se renderiza en el servidor con ese mismo rol: es el que usaría PostgREST, así que lo que devuelve una consulta es exactamente lo que puede ver un invitado. No hay filtrado en el frontend porque no hace falta.

Sobre `grupos_invitacion`, `invitados` y `confirmaciones`, `anon` **no tiene nada**. El RSVP público pasa por funciones `SECURITY DEFINER` que reciben el token:

- **`obtener_invitacion(token)`** → el grupo del token y su gente. Enumera sus columnas a mano: sin eso, un invitado recibiría el teléfono y las notas privadas de sus coinvitados, y cualquier columna futura se publicaría sola. **Cero filas significa «este enlace no vale»**, y no lanza excepción: al abortar se perdería el registro del intento y el cortafuegos dejaría de contar.
- **`registrar_confirmacion(token, respuestas)`** → registra la respuesta del grupo, todo o nada. Escribe además menú y alergias en `invitados`, que es donde viven.
- **`sugerir_cancion(token, texto)`** → añade a la playlist, con tope de diez por grupo. La escriben los dos sitios donde se pide una canción: el último paso del RSVP y el campo de la sección `playlist` en la portada.
- **`datos_para_regalos()`** → el IBAN y su titular, o cero filas. Es la única puerta por la que sale un dato de `configuracion_privada`, y sólo se abre con la sección `regalos` visible.
- **`crear_grupo_invitacion(...)`** y **`rotar_token_invitacion(grupo)`** → del panel, devuelven el token en claro una sola vez.
- **`importar_invitados(filas)`** → da de alta en bloque la gente de un CSV, en **una** transacción: o entran todas o no entra ninguna. Reutiliza el grupo cuando ya existe uno con ese nombre, porque un CSV trae una fila por persona y una invitación son varias. No emite enlaces: importar da de alta gente, no reparte invitaciones.

El plazo lo aplica un trigger contra `now()`, nunca contra una fecha enviada por el cliente. El cupo de intentos lo aplica **`exigir_cupo_rsvp()`** por origen.

### Arranque en frío

La base nace sin nadie dentro: no hay un usuario administrador de fábrica. La primera persona que entra se convierte en propietaria llamando a **`designar_primer_propietario()`**, que sólo funciona mientras no haya ninguno. Sin ese paso, un despliegue nuevo tiene el panel cerrado para todo el mundo — incluido quien lo desplegó.

---

## 6. Experiencia pública

### Landing (`/`)

El orden y la visibilidad de las secciones salen de `secciones_landing`, no del JSX: la landing recorre esa tabla y pinta lo que le dice (BODA-20). Una sección se enseña si la base de datos la da por visible **y** hay contenido que pintar; ninguna aparece en el menú si su código todavía no existe, porque un enlace a una sección inexistente es peor que no tener menú.

Secciones del enumerado `seccion_landing`:

| Valor                  | Qué es                                                      | Ticket  |
| ---------------------- | ----------------------------------------------------------- | ------- |
| `portada`              | Nombres, fecha y lugar a pantalla completa                  | BODA-22 |
| `cuenta_atras`         | Lo que falta, calculado desde la fecha de la BBDD           | BODA-23 |
| `historia`             | Hitos de la pareja, con reveal al entrar en pantalla        | BODA-24 |
| `galeria`              | Rejilla de fotos con lightbox                               | BODA-25 |
| `programa`             | El día hora a hora                                          | BODA-22 |
| `ubicaciones`          | Ceremonia y banquete, con mapa                              | BODA-26 |
| `transporte`           | Cómo llegar: coche, tren, autobús                           | BODA-26 |
| `alojamiento`          | Hoteles recomendados con tarifa y enlace de reserva         | BODA-27 |
| `regalos`              | Número de cuenta en campo copiable. Nace apagada            | BODA-37 |
| `dresscode`            | Qué ponerse, un bloque por consejo                          | BODA-38 |
| `preguntas_frecuentes` | Acordeón nativo: etiqueta, niños, aparcamiento…             | BODA-27 |
| `playlist`             | Canciones que sugieren los invitados, con campo para añadir | BODA-29 |
| `rsvp`                 | Llamada a confirmar asistencia                              | BODA-28 |
| `reserva_la_fecha`     | **No es una sección: es una página aparte** (ver más abajo) | BODA-30 |

**Por qué la landing no se cachea.** Nació con `revalidate = 3600` y se quitó tras un fallo en producción: si la base no responde justo en el despliegue —caída, pausada por inactividad del plan gratuito, o una variable de entorno que aún no está—, lo que se hornea y se sirve **durante una hora entera** es la pantalla de «estamos preparando la web», aunque la base vuelva a los diez segundos. Ahora se consulta en cada visita: ocho consultas indexadas sobre tablas de pocas filas, lanzadas a la vez, medidas en 27 ms de mediana en local. A cambio, un cambio en el panel se ve al instante y un fallo nunca se queda pegado. Ver BODA-09.

**Principios de animación:** el movimiento sirve a la narrativa, no la interrumpe. Todas las duraciones y curvas son tokens. Con `prefers-reduced-motion` los reveals se convierten en fades cortos o desaparecen. Ninguna animación puede provocar layout shift (CLS objetivo < 0.1).

### Reserva la fecha (`/reserva-la-fecha`)

Página independiente, ligera y compartible: fecha grande, foto, «añadir al calendario» (`.ics` generado desde `configuracion_boda`) y Open Graph propio para que se vea bien en WhatsApp. La ruta va en castellano como el resto del producto, y existe sólo si su fila de `secciones_landing` está visible: apagada, devuelve 404 en vez de una página a medias.

### RSVP (`/rsvp/[token]`)

El grupo se identifica por su enlace único — sin contraseñas. Formulario multipaso: asistencia por persona → menú y alergias → transporte/alojamiento → canción y mensaje. Confirmación por email (Resend) y posibilidad de editar hasta la fecha límite.

**Abrir la invitación deja huella en el navegador.** El middleware guarda el token de `/rsvp/[token]` en una cookie `httpOnly` de un año, y de ahí lo saca la portada para el campo de la playlist: `sugerir_cancion()` exige token —la lista que sonará esa noche es de los invitados, no de internet entera— y en la portada no hay ninguno en la URL. Quien nunca ha abierto su invitación no ve el campo, ve la línea que explica que hace falta el enlace; enseñar un campo que sólo puede responder «vuestro enlace no vale» se lee como que la web está rota. El token **no** viaja en el HTML de la portada ni en un campo oculto: eso lo pondría en el código fuente de una página pública y en el historial del móvil, y ese token abre los datos de una familia entera. La cookie no se valida al escribirla —sería una consulta a la base en cada navegación de toda la web— porque la base la vuelve a comprobar cuando de verdad importa, al escribir, y un token inventado allí no abre nada.

---

## 7. Panel de gestión (`/app`)

| Módulo          | Contenido                                                                                                                                                             |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Dashboard**   | KPIs: días restantes, confirmados/pendientes, % presupuesto consumido, próximos pagos y tareas                                                                        |
| **Invitados**   | Tabla con filtros y búsqueda, alta individual o import CSV, gestión de grupos, generación y copia de enlaces de invitación, envío por WhatsApp/email, export          |
| **Presupuesto** | Categorías con previsto vs real, gráfica de reparto, calendario de pagos, alertas de desvío                                                                           |
| **Proveedores** | Lista agrupada por categoría con búsqueda que aguanta acentos, ficha por proveedor con su gente, pipeline de estado, comparativa de presupuestos, documentos adjuntos |
| **Servicios**   | Qué se contrata, precio por unidad o por invitado, recálculo automático con los confirmados                                                                           |
| **Tareas**      | Checklist con vista lista y kanban, plantilla inicial por meses restantes                                                                                             |
| **Seating**     | Plano drag & drop de mesas, asignación con avisos de alergias y de invitados sin mesa                                                                                 |
| **Ajustes**     | Contenido de la landing, orden y visibilidad de secciones, subida y ordenación de fotos, textos i18n, datos de la boda, usuarios                                      |

---

## 8. Roadmap

| Fase                            | Alcance                                                                                                                  | Entregable                                    | Est.  |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------- | ----- |
| **0 — Cimientos**               | Next.js + TS + Tailwind v4, **tokens completos**, i18n, ESLint/Stylelint/Husky, Vercel + previews, proyecto Supabase, CI | Deploy en verde con las reglas del §2 activas | 1-2 d |
| **1 — Base de datos**           | Migraciones de todas las tablas, enums, vistas, triggers, RLS, seed, tipos TS generados                                  | Esquema completo versionado                   | 2 d   |
| **2 — Landing**                 | Todas las secciones, animaciones, galería, contenido desde BBDD                                                          | Landing pública lista                         | 4-5 d |
| **3 — Save the Date**           | Página, `.ics`, OG images                                                                                                | Enlace compartible                            | 1 d   |
| **4 — Auth + shell**            | Usuario y contraseña, middleware, layout del panel, roles                                                                | Panel accesible y protegido                   | 2 d   |
| **5 — Invitados + RSVP**        | CRUD, grupos, tokens, import/export, flujo público de RSVP, emails                                                       | Ciclo completo de invitación                  | 4-5 d |
| **6 — Presupuesto**             | Categorías, partidas, pagos, gráficas                                                                                    | Control económico operativo                   | 3 d   |
| **7 — Proveedores + servicios** | Fichas, pipeline, documentos, precio por invitado                                                                        | Gestión de contratación                       | 3 d   |
| **8 — Tareas + seating**        | Checklist, kanban, plano de mesas                                                                                        | Organización del día                          | 3-4 d |
| **9 — Pulido**                  | Performance (Lighthouse ≥ 95), a11y, SEO, Sentry, PostHog, E2E, backups                                                  | Producción                                    | 2-3 d |

**Camino crítico:** 0 → 1 → 2 → 3 permite publicar y empezar a repartir el Save the Date mientras el panel sigue en desarrollo. Las fases 6-8 son internas: no bloquean nada de cara a los invitados.

---

## 9. Entornos y despliegue

| Entorno    | Rama                    | Supabase                                 |
| ---------- | ----------------------- | ---------------------------------------- |
| Producción | `main`                  | Proyecto principal                       |
| Preview    | Cada PR (URL de Vercel) | Branch de Supabase o proyecto de staging |
| Local      | —                       | Supabase CLI (`supabase start`)          |

**`main` es la rama por defecto del repositorio y la única de producción, siempre.** Las ramas de ticket son temporales: nacen de `main` y se borran al mergear. Esto se configura en dos sitios y ambos deben apuntar a `main`:

1. **GitHub** → Settings → General → Default branch.
2. **Vercel** → Settings → Git → Production Branch.

Si el despliegue apunta a una rama de trabajo, producción deja de actualizarse en cuanto esa rama se mergea y se abandona.

Variables de entorno (Vercel, nunca en git): `DATABASE_URL` (cadena del pooler de Supabase, modo transaction), `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (solo servidor), `RESEND_API_KEY`, `NEXT_PUBLIC_SITE_URL`, `SENTRY_DSN`, `NEXT_PUBLIC_POSTHOG_KEY`.

**Backups:** export diario del esquema y datos a un repo privado vía GitHub Action — el free tier de Supabase tiene retención limitada, y la lista de invitados no se puede perder.

---

## 10. Costes

| Servicio         | Plan                             | Coste        |
| ---------------- | -------------------------------- | ------------ |
| Vercel           | Hobby                            | 0 €          |
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

1. **Dominio** — ¿comprado ya? Necesario en Fase 3 (Save the Date). _Vercel o Cloudflare como registrador._
2. ~~**Dirección de arte**~~ — _resuelta._ El estudio entregó la identidad completa (`Sistema completo de boda/`) en dos versiones, y se monta la **azul marino**: marino `#1F2B44`, acento bronce `#8A6224`, Cormorant Infant y Jost. Los valores están transcritos en `primitives.css`; ver §2.2.
3. **Fotos** — ¿hay sesión de preboda? Condiciona el diseño del hero y la galería.
4. **Regalo** — ¿cuenta bancaria, Bizum, lista? Afecta a una sección de la landing.
5. **Colaboradores** — ¿acceso para wedding planner o familiares? El rol `viewer` ya lo contempla.

_Idioma resuelto: solo castellano._

---

## 13. Cómo trabajamos

- **Se trabaja por tickets**, no por fases sueltas. El board está en [GitHub Issues](https://github.com/Davmunrey/p-d/issues); cómo se lee, en [`docs/BACKLOG.md`](./BACKLOG.md).
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
10. Anon intenta leer `invitados` directamente vía API → **denegado por RLS**

Entorno de test: proyecto Supabase de staging con seed determinista, reseteado antes de cada suite. Los E2E corren en cada PR (bloqueantes) y en `main` tras el deploy.

---

## 15. Board

El backlog vive en [GitHub Issues](https://github.com/Davmunrey/p-d/issues): un ticket por incidencia, con su código `BODA-XX` en el título, épica y talla como etiquetas, dependencias enlazadas con `#` y sus criterios de aceptación y test E2E en el cuerpo.

Está en GitHub y no en un fichero del repositorio a propósito. Es donde ya están la PR, el CI y el deploy preview, así que un ticket se cierra al mergear (`Closes #NN`) en lugar de editando un Markdown que tarde o temprano discrepa del estado real. Las etiquetas sí son configuración versionada: viven en [`.github/etiquetas.json`](../.github/etiquetas.json) y un flujo de Actions las reconcilia, de modo que el board se puede reconstruir entero desde el repositorio.

[`docs/BACKLOG.md`](./BACKLOG.md) explica cómo leerlo: épicas, tallas, camino crítico y el ciclo de un ticket.
