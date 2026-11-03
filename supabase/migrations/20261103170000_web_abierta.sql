-- ============================================================================
-- La web, abierta o cerrada
--
-- Los novios mandan primero el Save the Date —en su propio subdominio— y la web
-- de la boda no se enseña hasta que la abran ellos. Mientras está cerrada,
-- quien entra en el dominio ve «Próximamente»: la noche, el retrato de
-- estrellas, los nombres y la fecha, y nada más. Ellos, con sesión en el panel,
-- la siguen viendo entera para prepararla.
--
-- Es un dato y no una variable de entorno porque lo cambian ellos, desde
-- Ajustes, el día que quieran, sin desplegar nada.
--
-- NACE CERRADA. Se aplica en producción al entrar en `main`, y lo pedido es
-- que nadie vea la web hasta abrirla. El seed la abre, porque en desarrollo y
-- en el CI la landing tiene que verse.
--
-- Va en `v_configuracion_publica` porque la landing la lee como `anon`, y no
-- revela nada que la portada no diga ya: que la web está o no está.
-- ============================================================================

begin;

alter table public.configuracion_boda
  add column if not exists web_abierta boolean not null default false;

comment on column public.configuracion_boda.web_abierta is
  'Si la landing se enseña. Cerrada, el dominio enseña «Próximamente» (la noche, '
  'el retrato, los nombres y la fecha) y sólo quien tiene acceso al panel ve la '
  'web, como vista previa. Se abre y se cierra desde Ajustes.';

-- `create or replace` puede AÑADIR una columna al final; las demás no cambian.
create or replace view public.v_configuracion_publica
with (security_invoker = on) as
select
  c.nombre_novia,
  c.nombre_novio,
  c.hashtag,
  c.fecha_hora_ceremonia,
  c.fecha_hora_banquete,
  c.zona_horaria,
  c.fecha_limite_rsvp,
  c.lugar_ceremonia,
  c.direccion_ceremonia,
  c.latitud_ceremonia,
  c.longitud_ceremonia,
  c.lugar_banquete,
  c.direccion_banquete,
  c.latitud_banquete,
  c.longitud_banquete,
  c.correo_contacto,
  c.moneda,
  c.idioma_por_defecto,
  c.ciudad_ceremonia,
  c.avisos_programa,
  c.firma_regalos,
  c.lugar_preboda,
  c.web_abierta
from public.configuracion_boda as c;

-- El panel escribe la columna por PostgREST: que la vea en cuanto exista.
notify pgrst, 'reload schema';

commit;
