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

| Variable                        | De dónde se saca                                                                                           |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                  | Botón **Connect** del dashboard → pestaña **Transaction pooler**                                           |
| `NEXT_PUBLIC_SUPABASE_URL`      | Botón **Connect** → pestaña de frameworks, o Settings → **API Keys**                                       |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Igual que la anterior: salen juntas                                                                        |
| `SUPABASE_SERVICE_ROLE_KEY`     | Settings → **API Keys** → `service_role`. **Todavía no hace falta**: ningún código la usa                  |
| `NEXT_PUBLIC_SITE_URL`          | El dominio final de la web                                                                                 |
| `RESEND_API_KEY`                | [resend.com](https://resend.com) → **API Keys**. Sin ella no se manda el acuse de recibo, y no es un error |
| `CORREO_REMITENTE`              | La dirección desde la que se escribe, en un dominio **verificado** en Resend                               |

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

**`SUPABASE_SERVICE_ROLE_KEY` se salta todas las políticas RLS.** Nunca puede
llevar el prefijo `NEXT_PUBLIC_`, porque eso la metería en el JavaScript que
descarga cualquier visitante y le daría acceso completo a la lista de invitados
y al presupuesto.

Si falta `DATABASE_URL`, **la web despliega igual** y muestra que está en
preparación, dejando el error en el log del servidor. Se decidió así tras un
despliegue fallido: reventar el build entero por una variable ausente también
tumbaba el 404 y la página de sistema de diseño, que ni siquiera tocan la base.

---

## En local

```bash
# Levanta un PostgreSQL desechable con las migraciones y el seed
export DATABASE_URL="$(./scripts/preparar-bbdd.sh)"
npm run dev
```

O se copia `.env.example` a `.env.local` y se rellena. `.env*` está en
`.gitignore`: esos ficheros no se suben nunca.

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

### Restaurar

`pg_restore --no-owner --no-privileges --dbname="<destino>" copias/boda-<fecha>.dump`

La restauración está probada en `tests/unidad/copia-seguridad.test.ts`, y no
sólo el volcado: el test restaura en una base vacía y comprueba que vuelven las
filas **y las políticas RLS**. Sin esa segunda mitad, una copia podría devolver
la lista de invitados a una base donde la lee cualquiera.
