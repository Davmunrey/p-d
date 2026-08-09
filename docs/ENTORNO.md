# Variables de entorno y secretos

Dónde va cada valor y por qué. Ningún secreto se guarda en el repositorio: aquí
solo están los **nombres**.

---

## Resumen: qué necesita cada sitio

| Dónde                          | Qué hace falta                          | Por qué                                             |
| ------------------------------ | --------------------------------------- | --------------------------------------------------- |
| **Vercel**                     | `DATABASE_URL` y las claves de Supabase | Es quien sirve la web a los invitados               |
| **Tu portátil** (`.env.local`) | `DATABASE_URL` local                    | Para levantar el proyecto en desarrollo             |
| **GitHub Actions**             | **nada, de momento**                    | El CI se fabrica su propia base de datos desechable |

---

## Vercel

**Settings → Environment Variables.** Marcar las tres ramas (Production,
Preview, Development) salvo que se indique otra cosa.

| Variable                        | De dónde se saca                                                                    |
| ------------------------------- | ----------------------------------------------------------------------------------- |
| `DATABASE_URL`                  | Supabase → Project Settings → Database → **Connection pooling**, modo `transaction` |
| `NEXT_PUBLIC_SUPABASE_URL`      | Supabase → Project Settings → API → Project URL                                     |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Project Settings → API → `anon` `public`                                 |
| `SUPABASE_SERVICE_ROLE_KEY`     | Supabase → Project Settings → API → `service_role` **secret**                       |
| `NEXT_PUBLIC_SITE_URL`          | El dominio final de la web                                                          |

**El pooler, no la conexión directa.** Cada petición a la web arranca una
función efímera; con conexión directa se agotan las conexiones del servidor en
cuanto hay algo de tráfico. El pooler en modo `transaction` está hecho
exactamente para esto.

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

## GitHub Actions: por qué no hay secretos

El CI **no necesita ninguno**, y es a propósito.

`scripts/preparar-bbdd.sh` levanta un PostgreSQL nuevo en el runner, le aplica
las migraciones desde cero y carga el seed de desarrollo. Cada ejecución
empieza de una base vacía.

Un CI conectado a una base de datos compartida tendría tres problemas que esto
evita:

1. **Los tests se pisarían entre ellos.** Dos PR a la vez escribiendo en la
   misma base dan fallos intermitentes imposibles de reproducir.
2. **Datos reales en los logs.** Un test que falla imprime lo que ha leído; si
   lee de la base de verdad, acaban en el log público de la Action los
   teléfonos y las alergias de los invitados.
3. **Un secreto más que rota y que se filtra.** El que no existe no se filtra.

### Si algún día hacen falta

Cuando entren los emails (BODA-57) o la analítica (BODA-93) habrá que añadir
`RESEND_API_KEY` y similares. Entonces:

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
