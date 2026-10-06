# Variables de entorno y secretos

Dónde va cada valor y por qué. Ningún secreto se guarda en el repositorio: aquí
solo están los **nombres**.

---

## Resumen: qué necesita cada sitio

| Dónde                          | Qué hace falta                          | Por qué                                         |
| ------------------------------ | --------------------------------------- | ----------------------------------------------- |
| **Vercel**                     | `DATABASE_URL` y las claves de Supabase | Es quien sirve la web a los invitados           |
| **Tu portátil** (`.env.local`) | `DATABASE_URL` local                    | Para levantar el proyecto en desarrollo         |
| **GitHub Actions**             | Solo para aplicar migraciones           | Los tests se fabrican su propia base desechable |

---

## Vercel

**Settings → Environment Variables.** Marcar las tres ramas (Production,
Preview, Development) salvo que se indique otra cosa.

| Variable                        | De dónde se saca                                                                                                                                                              |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                  | Botón **Connect** del dashboard → pestaña **Transaction pooler**                                                                                                              |
| `NEXT_PUBLIC_SUPABASE_URL`      | Botón **Connect** → pestaña de frameworks, o Settings → **API Keys**                                                                                                          |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Igual que la anterior: salen juntas                                                                                                                                           |
| `SUPABASE_SERVICE_ROLE_KEY`     | Settings → **API Keys** → `service_role`. **Hace falta para subir fotos** (BODA-29): Storage no admite escrituras con la sesión de un usuario                                 |
| `NEXT_PUBLIC_SITE_URL`          | El dominio final de la web                                                                                                                                                    |
| `RESEND_API_KEY`                | [resend.com](https://resend.com) → **API Keys**. Sin ella no se manda el acuse de recibo, y no es un error                                                                    |
| `CORREO_REMITENTE`              | La dirección desde la que se escribe, en un dominio **verificado** en Resend                                                                                                  |
| `SENTRY_DSN`                    | [sentry.io](https://sentry.io) → proyecto → **Settings → Client Keys (DSN)**. Sin ella no se arranca Sentry, y no es un error. Basta ésta: el navegador la recibe al compilar |
| `NEXT_PUBLIC_POSTHOG_KEY`       | [posthog.com](https://posthog.com) → **Project settings → Project API key**. Sin ella no se arranca la analítica                                                              |
| `NEXT_PUBLIC_POSTHOG_HOST`      | Opcional. `https://eu.i.posthog.com` por defecto; sólo se cambia si el proyecto está en la nube americana                                                                     |

**El pooler, no la conexión directa.** Cada petición a la web arranca una
función efímera; con conexión directa se agotan las conexiones del servidor en
cuanto hay algo de tráfico. El pooler en modo `transaction` está hecho
exactamente para esto. Además, la directa sólo responde por IPv6 salvo que se
contrate el add-on de IPv4, y las funciones de Vercel salen por IPv4.

Se distinguen a simple vista, y confundirlas es el error habitual:

|         | Directa                | Transaction pooler       |
| ------- | ---------------------- | ------------------------ |
| Usuario | `postgres`             | `postgres.<project-ref>` |
| Host    | `db.<ref>.supabase.co` | `…pooler.supabase.com`   |
| Puerto  | `5432`                 | `6543`                   |

El modo `transaction` no admite sentencias preparadas; por eso
`src/lib/bbdd/cliente.ts` va con `prepare: false`. Sin esa opción las consultas
fallan de forma intermitente.

**La contraseña lleva escapado de URL.** Si tiene `@`, `:`, `/`, `#` o `?` hay
que codificarla, o la cadena se parte y el error habla de un host que no existe.

**La misma contraseña vive en dos sitios**: dentro de `DATABASE_URL` en Vercel y
suelta como `SUPABASE_DB_PASSWORD` en GitHub. Al rotarla hay que cambiar las
dos; tocar sólo una deja el otro sistema fallando por autenticación.

**Las funciones, en la región de la base: `fra1`.** La base de Supabase está en
Frankfurt (`eu-central-1`: la IPv6 de `db.<ref>.supabase.co` cae en los rangos
que AWS publica para esa región). Vercel, sin decirle nada, ejecuta las funciones
en Washington (`iad1`), y cada ida y vuelta a la base cruzaba el Atlántico, unos
85 ms. La portada hace una veintena en serie y tardaba de 2 a 3 segundos en
empezar a responder; el RSVP y el panel, lo mismo en proporción. `vercel.json`
fija `"regions": ["fra1"]`, que además queda más cerca de los invitados. Si algún
día la base cambia de región, esa línea cambia con ella: lo vigila
`tests/unidad/region.test.ts`, que sólo admite una región (el plan Hobby no da
más).

**`SUPABASE_SERVICE_ROLE_KEY` se salta todas las políticas RLS.** Nunca puede
llevar el prefijo `NEXT_PUBLIC_`, porque eso la metería en el JavaScript que
descarga cualquier visitante y le daría acceso completo a la lista de invitados
y al presupuesto.

### Observabilidad (BODA-93)

**Sin clave no se arranca nada, y es a propósito.** En local y en CI no hay ni
`SENTRY_DSN` ni `NEXT_PUBLIC_POSTHOG_KEY`, así que no sale ni una petición hacia
ningún tercero y los tests no dependen de que un servicio externo esté de pie.
Lo contrario —una clave de mentira «para que no falle»— manda datos reales a un
sitio que nadie mira.

**Qué NO sale de aquí, pase lo que pase.** Todo lo que se manda pasa antes por
`src/lib/observabilidad/limpiar.ts`, que quita el token de las invitaciones, los
correos y los teléfonos, y por `antesDeMandar`, que además tira enteras las
cookies, las cabeceras y el bloque `user` que Sentry rellena con la IP. Está
probado en `tests/unidad/observabilidad.test.ts` y vigilado sobre el tráfico de
verdad en `tests/e2e/observabilidad.spec.ts`.

**La alerta de confirmaciones fallidas se configura a mano**, una vez, en
Sentry: **Alerts → Create Alert → Issues**, con el filtro
`message:"confirmacion-fallida"` y el umbral que se quiera (por ejemplo, más de
tres en una hora). El nombre del mensaje es la constante
`AVISO_CONFIRMACION_FALLIDA` de `src/config/constants.ts`: si se cambia ahí, hay
que cambiarlo también en la regla, o la alerta se apaga en silencio.

**Una sola variable para los dos lados.** El navegador sólo recibe variables
`NEXT_PUBLIC_*`, así que `next.config.ts` copia `SENTRY_DSN` a
`NEXT_PUBLIC_SENTRY_DSN` al compilar. Hasta que se hizo, con sólo `SENTRY_DSN`
arrancaba el Sentry del servidor y el del navegador no —el que se entera de lo
que le pasa a un invitado en el RSVP—. El DSN es público por diseño; tras
cambiarlo hay que volver a desplegar, porque va dentro del bundle.

**Las trazas pasan por el mismo filtro que los errores.** Con el muestreo
encendido, las transacciones y sus tramos llevan la URL de la página, que en el
RSVP es el token: van por `beforeSendTransaction` y `beforeSendSpan`, no por
`beforeSend`. Las opciones de Sentry viven en
`src/lib/observabilidad/opciones-sentry.ts` y los dos arranques las comparten:
un filtro nuevo llega a los dos o a ninguno. Los identificadores de Sentry
(`event_id`, los de la traza) salen intactos: no son datos de nadie, y uno
estropeado hace que Sentry rechace el informe entero.

**Lo que no se puede probar en CI**: que un error provocado a propósito llegue
al panel de Sentry hace falta comprobarlo a mano sobre el preview, porque leerlo
de vuelta exige un token de la API de Sentry que no va a estar en el
repositorio. Se hace una vez tras configurar el DSN, **con un error del
navegador y otro del servidor**: uno solo no dice si arrancan los dos.

Si falta `DATABASE_URL`, **la web despliega igual** y muestra que está en
preparación, dejando el error en el log del servidor. Se decidió así tras un
despliegue fallido: reventar el build entero por una variable ausente también
tumbaba el 404 y la página de sistema de diseño, que ni siquiera tocan la base.

---

## En local

```bash
# Levanta un PostgreSQL desechable con las migraciones y el seed
export DATABASE_URL="$(sudo ./scripts/preparar-bbdd.sh)"
npm run dev
```

**Necesita `sudo` y un Debian o Ubuntu con PostgreSQL instalado**
(`sudo apt-get install postgresql`): el guion crea el clúster en
`/var/lib/postgresql/pruebaboda` y lo lanza como el usuario `postgres`, igual
que en el CI. Sin `sudo`, `su postgres` pide una contraseña que no se ve y el
guion falla sin decir por qué. En macOS no hay ni ese usuario ni esa ruta: allí
lo práctico es `supabase start`, que levanta la base con todo lo de Supabase, y
`supabase db reset` para cargar las migraciones y el seed.

Para el resto de variables, se copia `.env.example` a `.env.local` y se
rellena. `.env*` está en `.gitignore` —esos ficheros no se suben nunca— con la
única excepción de `.env.example`, que sólo lleva los nombres.

---

## GitHub Actions

### Para probar: ningún secreto

Ninguno de los trabajos de prueba toca tu Supabase, y es a propósito.

`scripts/preparar-bbdd.sh` levanta un PostgreSQL nuevo en el runner, le aplica
las migraciones desde cero y carga el seed de desarrollo. El trabajo del acceso
al panel va más lejos: levanta un Supabase entero con Docker, con sus claves
locales de juguete, y lo destruye al terminar. Cada ejecución empieza de cero.

Un CI conectado a una base de datos compartida tendría tres problemas que esto
evita:

1. **Los tests se pisarían entre ellos.** Dos PR a la vez escribiendo en la
   misma base dan fallos intermitentes imposibles de reproducir.
2. **Datos reales en los logs.** Un test que falla imprime lo que ha leído; si
   lee de la base de verdad, acaban en el log público de la Action los
   teléfonos y las alergias de los invitados.
3. **Un secreto más que rota y que se filtra.** El que no existe no se filtra.

### Para aplicar migraciones en producción: tres valores

`.github/workflows/migraciones.yml` aplica a producción las migraciones que
entran en `main`. Es lo único que habla con tu Supabase de verdad, y por eso es
lo único que necesita credenciales.

**Settings → Secrets and variables → Actions.**

| Dónde                     | Nombre                  | De dónde sale                                                         |
| ------------------------- | ----------------------- | --------------------------------------------------------------------- |
| Secrets                   | `SUPABASE_ACCESS_TOKEN` | supabase.com/dashboard/account/tokens → Generate new token            |
| Secrets                   | `SUPABASE_DB_PASSWORD`  | La contraseña de la base: **Database Settings**, `/database/settings` |
| **Variables**, no secrets | `SUPABASE_PROJECT_REF`  | El identificador del proyecto, el que sale en la URL del dashboard    |

El tercero va en _Variables_ y no en _Secrets_ porque no lo es: aparece en la
URL del panel de Supabase. Guardarlo como secreto solo conseguiría que los
registros lo taparan con asteriscos justo cuando hace falta leerlo.

### Y un cuarto para los flujos programados: `DATABASE_URL`

Lo usan el toque que mantiene viva la base, la copia de seguridad y el camino
de repuesto de las migraciones. Va en _Secrets_.

**Tiene que ser la del agrupador, no la directa, y aquí no vale la misma que
Vercel.** Son tres cadenas distintas para tres sitios distintos:

| Para               | Pestaña              | Host                   | Puerto |
| ------------------ | -------------------- | ---------------------- | ------ |
| Vercel (la web)    | _Transaction pooler_ | `…pooler.supabase.com` | `6543` |
| **GitHub Actions** | _Session pooler_     | `…pooler.supabase.com` | `5432` |
| Nadie, desde fuera | _Direct connection_  | `db.<ref>.supabase.co` | `5432` |

**La directa no funciona desde GitHub y el síntoma engaña.** Se sirve sólo por
IPv6 y un runner sólo tiene IPv4, así que el flujo falla con esto:

```
connect ENETUNREACH 2a05:d014:1577:8802::4354:5432
```

Pasó tal cual: el secreto estaba puesto y era correcto, el proyecto estaba
despierto, y el toque llevaba dos semanas en rojo. Por eso
`scripts/diagnostico-conexion.mjs` distingue ahora ese código y nombra el
agrupador en el propio registro, en vez de repetir que el proyecto «puede estar
pausado» — que es donde se pierde el tiempo.

### El token caduca, y eso ya tumbó producción una vez

`SUPABASE_ACCESS_TOKEN` es un token **personal** y tiene fecha de caducidad.
Cuando caducó, `supabase link` empezó a responder «Unauthorized» y el flujo de
migraciones murió en su primer paso. El despliegue de Vercel no se entera de
eso: siguió publicando, así que dos merges salieron a producción con el esquema
viejo detrás y la portada se quedó en «Estamos preparando la web», con este
error en los registros de Vercel:

```
Fallo al leer de la base de datos: column "paisaje_intro" does not exist
```

Por eso el flujo tiene ahora un **camino de repuesto**: si el CLI no puede
entrar, aplica las migraciones con `scripts/aplicar-migraciones.sh`, que habla
directamente con Postgres a través de `DATABASE_URL` —la misma cadena que ya
usa `mantener-viva.yml`— y no depende de ningún token. Deja un aviso en el
registro para que se renueve el token, pero la base queda al día.

El script se planta si encuentra más de cinco migraciones pendientes: eso casi
siempre significa que no pudo leer la tabla de control y que en realidad están
aplicadas, y seguir adelante reharía el esquema entero sobre datos de verdad.

**El repuesto se comprueba cuando no hace falta.** La única vez que llegó a
ejecutarse, `DATABASE_URL` era la conexión directa —sólo IPv6— y murió con
«Network is unreachable»: se descubrió roto el día que hacía falta. Ahora el
flujo mira la forma del secreto en cada push y deja un aviso si no es la del
_Session pooler_, y el camino de repuesto se niega a intentarlo con la directa
en vez de fallar con un error que engaña. Cada migración se aplica en **una
sola transacción** con su registro dentro: o entra entera y apuntada, o no
entra.
Para una base nueva de verdad, `FORZAR=si`.

También se puede llamar a mano:

```bash
DATABASE_URL="postgres://..." ./scripts/aplicar-migraciones.sh
```

Mientras falte alguno de los tres, el flujo **se salta con un aviso** en lugar
de fallar: no tiene sentido teñir de rojo un despliegue por una configuración
que aún no está.

**Por qué se puede aplicar solo sin miedo.** No es confianza: es que ya se ha
comprobado. Antes de que nada llegue a `main`, el trabajo «Migraciones y
seguridad de la BBDD» ha aplicado todas las migraciones desde cero contra un
PostgreSQL limpio y ha pasado 36 comprobaciones de seguridad. Una migración
rota no llega.

Lo que el flujo **no** hace: cargar el seed —son datos de desarrollo con el
prefijo `(DES)` y no pueden acercarse a la boda— ni deshacer nada. Las
migraciones van hacia delante; cada una trae su SQL de rollback en
`supabase/migrations/rollback/` para aplicarlo a mano, con la cabeza fría y
mirando lo que se borra.

### La excepción: trabajar desde GitHub

`.github/workflows/claude.yml` permite mencionar `@claude` en una incidencia o
en una PR y que el trabajo se haga ahí, sin abrir un terminal. Eso sí necesita
credencial:

| Secreto                   | De dónde sale                                                     |
| ------------------------- | ----------------------------------------------------------------- |
| `CLAUDE_CODE_OAUTH_TOKEN` | `/install-github-app` desde Claude Code, si usas la suscripción   |
| `ANTHROPIC_API_KEY`       | Alternativa: consola de Anthropic, si prefieres pagar por consumo |

Basta con uno de los dos. **Mientras no exista ninguno, la mención se ignora**
dejando un aviso en el registro: el flujo no se pone en rojo, porque no forma
parte del CI y no debe ensuciar el estado de una PR.

### Si algún día hacen falta más

Cuando entren los emails (BODA-57) o la analítica (BODA-93) habrá que añadir
`RESEND_API_KEY` y similares. En todos los casos:

**Settings → Secrets and variables → Actions → New repository secret.**

Solo tú puedes crearlos: hacen falta los valores, y esos valores no deben
viajar por un chat ni quedar registrados en ninguna conversación. Si me pasas
uno por aquí, dalo por comprometido y rótalo.

---

## Qué hacer si se filtra una clave

1. **Rotarla primero, investigar después.** En Supabase: Project Settings → API
   → `Reset`. La clave vieja deja de valer al instante.
2. Actualizarla en Vercel y volver a desplegar.
3. Revisar los logs de Supabase por si hubo accesos raros.

Rotar una clave cuesta dos minutos. Una lista de invitados filtrada no se
recupera.

## El correo del acuse de recibo

Se manda con [Resend](https://resend.com) y hacen falta dos variables:
`RESEND_API_KEY` y `CORREO_REMITENTE`. **Si faltan, no se manda nada y no pasa
nada más**: la confirmación del invitado se guarda igual y la web no cambia. Es
a propósito — un acuse de recibo no puede costar una respuesta.

**A quién se manda lo decide la ficha de cada invitado**: el acuse sale a los
emails apuntados en el panel (Invitados → la invitación → «Email» al añadir a
alguien, o «Corregir datos» en quien ya está). Sin ningún email en esa
invitación no sale nada, aunque Resend esté configurado. Cada destinatario
recibe su propia carta: nadie ve la dirección de los demás.

El remitente tiene que estar en un dominio verificado en Resend. Con una
dirección de un dominio sin verificar, Resend acepta la petición y luego no
entrega, que es la forma más silenciosa de que no llegue nada.

Hay una tercera variable, `RESEND_URL`, que **no hay que poner en Vercel**: por
defecto apunta a la API de Resend. Existe para que los tests puedan levantar un
buzón de captura y leer el correo que sale de verdad, en lugar de simular
nuestra propia función de envío —que probaría que sabemos llamarla, no que el
correo sale—.

## Copia de seguridad

El flujo `copia-seguridad.yml` vuelca la base cada madrugada a un repositorio
**privado** aparte. Hace falta configurar tres cosas en este repositorio:

| Dónde                | Nombre         | Qué es                                           |
| -------------------- | -------------- | ------------------------------------------------ |
| Settings → Variables | `REPO_COPIAS`  | `usuario/repo-privado`, el destino de las copias |
| Settings → Secrets   | `TOKEN_COPIAS` | Un token con permiso de escritura en ese repo    |
| Settings → Secrets   | `DATABASE_URL` | La conexión a la base de producción              |

**El repositorio de destino tiene que ser privado.** Un volcado lleva los
nombres, los teléfonos y las alergias de doscientas personas: en un repositorio
público, eso es publicarlo.

Se guardan los treinta últimos días y no sólo el último, porque un borrado se
detecta tarde — y una copia que sobrescribe la de ayer copia también el
borrado.

Si falta cualquiera de las tres, el flujo **falla y lo dice**. No se salta en
silencio: una copia que no se hace y no avisa es lo mismo que no tener copia,
sólo que con la tranquilidad de creer que se tiene.

**Y lo dice donde se mira.** Cuarenta ejecuciones rojas seguidas en la pestaña
_Actions_ no las vio nadie en cinco semanas, así que un run rojo no es un
aviso. Cuando la copia —o el toque de `mantener-viva.yml`— falla, el propio
flujo abre una incidencia en este repositorio, o comenta la que ya esté
abierta, con el enlace al registro. Mientras esa incidencia siga abierta, **no
hay copia**: hasta que el primer run salga verde, la lista de invitados vive
sólo en Supabase.

**La copia es del esquema `public`, con sus permisos.** Lleva las tablas, los
datos, las políticas RLS y los GRANT de los que vive la web —sin ellos la
portada no podría leer la configuración ni el RSVP abrir una invitación, y toda
función restaurada nacería ejecutable por cualquiera—. No lleva lo que no es de
`public`: las cuentas del panel (`auth.users`, con sus contraseñas, que gestiona
Supabase), el trigger que crea un perfil al darse de alta, los buckets ni la
purga programada. Todo eso lo ponen las migraciones.

**Se vuelca con el `pg_dump` de la versión de la base.** Uno más viejo se niega
a volcarla, y el de Ubuntu es el 16 contra una base 17: el flujo instala el
cliente 17 del repositorio oficial de PostgreSQL, y el guion compara versiones
antes de volcar y falla con un mensaje claro si no casan. Si un día se sube la
versión de la base, se sube también `major_version` en `supabase/config.toml` y
el cliente del flujo; un test vigila que los dos digan lo mismo.

### La purga de los intentos del RSVP

Cada vez que alguien abre su invitación queda una fila en `intentos_rsvp` con
su IP y la huella de su token: es lo que usa el cortafuegos. No hace falta
guardarlas más allá de `parametros_seguridad.dias_retencion_intentos` (30 días),
y de borrarlas se encarga pg_cron dentro de la propia base, todas las noches a
las 04:30 UTC. Lo programa la migración `20261005100200`; no depende de ningún
secreto de GitHub ni de que un flujo llegue a ejecutarse.

Para comprobarlo, en el editor SQL de Supabase:

```sql
select jobname, schedule, command from cron.job;
select status, start_time from cron.job_run_details order by start_time desc limit 5;
```

### Restaurar

Las copias están en el repositorio privado de `REPO_COPIAS`, una por día:
`copias/boda-<fecha>.dump`.

**Si se perdió algo concreto** —una tabla vaciada, unas filas borradas—, no se
restaura encima de producción a ciegas: se restaura en una base aparte y se
copia desde ahí lo que falte. En una máquina con PostgreSQL, en una base vacía
que tenga lo que la copia da por hecho:

```bash
createdb boda_rescate
psql -d boda_rescate \
  -c 'create schema extensions' \
  -c 'create extension pgcrypto with schema extensions' \
  -c 'create extension unaccent with schema extensions' \
  -c 'create extension pg_trgm with schema extensions' \
  -c 'create schema auth' \
  -c 'create table auth.users (id uuid primary key, email text)'
# En tres pasos: esquema y datos; las cuentas que nombran los perfiles; y al
# final claves ajenas, índices y triggers. `auth.users` no viaja en la copia, y
# de una sola vez la clave de `perfiles` hacia ella no se podía crear.
pg_restore --no-owner --section=pre-data --section=data --dbname=boda_rescate copias/boda-<fecha>.dump
psql -d boda_rescate -c "insert into auth.users (id)
  select usuario_id from public.perfiles
  union select usuario_id from public.registro_auditoria where usuario_id is not null
  on conflict (id) do nothing"
pg_restore --no-owner --section=post-data --dbname=boda_rescate copias/boda-<fecha>.dump
```

El único error que se espera es `schema "public" already exists`: cualquier
otro es que algo no ha vuelto.

Los roles `anon`, `authenticated` y `service_role` tienen que existir en ese
servidor para que los permisos se apliquen (`sudo ./scripts/preparar-bbdd.sh`
deja uno así). Es exactamente lo que hace `tests/unidad/copia-seguridad.test.ts`
cada vez que corre: restaura en una base vacía, sin tragarse ningún error de
`pg_restore`, y comprueba que vuelven las filas, las políticas RLS y los
permisos.

**Si se perdió el proyecto entero**, en un Supabase nuevo:

1. Se aplican las migraciones (`supabase link` y `supabase db push`, como en
   «Para aplicar migraciones en producción»). Crean el esquema, los permisos,
   el trigger de altas, los buckets y la purga.
2. Se cargan **sólo los datos**, en una transacción y **sin disparar
   triggers**: si no, cada invitado restaurado crearía otra confirmación
   inicial y cada fila otra entrada de auditoría. Antes se vacía lo que las
   migraciones dejaron sembrado (las secciones, los parámetros, la plantilla de
   tareas), que chocaría con las mismas filas de la copia:

   ```bash
   pg_restore --data-only --no-owner --file=datos.sql copias/boda-<fecha>.dump
   cat > vaciar.sql <<'SQL'
   do $$
   declare t text;
   begin
     for t in select tablename from pg_tables where schemaname = 'public' loop
       execute format('truncate table public.%I cascade', t);
     end loop;
   end $$;
   SQL
   psql "<Session pooler del proyecto nuevo>" --single-transaction -v ON_ERROR_STOP=1 \
     -f vaciar.sql \
     -c 'set session_replication_role = replica' \
     -f datos.sql \
     -c 'set session_replication_role = origin' \
     -c 'delete from public.perfiles as p where not exists (select 1 from auth.users as u where u.id = p.usuario_id)'
   ```

3. Las cuentas del panel no viajan en la copia: el último paso de arriba borra
   los perfiles que apuntan a cuentas que ya no existen, y los novios se dan de
   alta otra vez con `scripts/crear-propietarios.sh`. Sus tareas y sus
   anotaciones se quedan, sin autor.

Los enlaces de las invitaciones siguen valiendo: la base guarda la huella
SHA-256 de cada token, sin secreto aparte, así que el mismo enlace da la misma
huella en el proyecto nuevo. Este procedimiento se probó sobre una base recién
migrada con una copia de la de desarrollo: las mismas filas en cada tabla, ni
una entrada de auditoría de más, y las invitaciones abriendo.
