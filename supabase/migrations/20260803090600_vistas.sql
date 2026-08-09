-- ============================================================================
-- 20260803090600_vistas.sql
-- Ticket: BODA-14 (vistas de lectura para la landing y el panel)
-- Motor:  PostgreSQL 17 (Supabase)
--
-- Qué hace este fichero:
--   Las vistas que el frontend consume, de modo que ninguna regla de negocio
--   —el coste por invitado confirmado, la desviación del presupuesto— acabe
--   reimplementada en TypeScript y deje de coincidir con la base de datos.
--
-- ---------------------------------------------------------------------------
-- DOS REGLAS INNEGOCIABLES PARA TODA VISTA DE `public`:
--
--   1. `with (security_invoker = on)`. En PostgreSQL una vista se ejecuta con
--      los privilegios de su PROPIETARIO salvo que se diga lo contrario. En
--      Supabase el propietario es `postgres`, dueño de todas estas tablas: una
--      vista normal ignora TODA la RLS de las tablas base. `v_resumen_presupuesto`
--      cruza por definición categorías, partidas, pagos y proveedores — es
--      exactamente el agregado que un atacante quiere, servido sin que ninguna
--      política intervenga.
--
--   2. Columnas ENUMERADAS una a una. Nunca `select *`: con el asterisco,
--      cualquier `alter table ... add column` futuro se publica solo, en
--      silencio y sin que nadie lo revise.
--
--   Prohibidas además las vistas MATERIALIZADAS sobre estas tablas: no admiten
--   `security_invoker` en absoluto y saltan RLS siempre. Si alguna vez hiciera
--   falta una, va a un esquema no expuesto y se accede por función SECURITY
--   DEFINER acotada.
-- ---------------------------------------------------------------------------
--
-- Rollback: supabase/migrations/rollback/20260803090600_vistas.sql
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1. Landing pública
-- ----------------------------------------------------------------------------

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
  c.idioma_por_defecto
from public.configuracion_boda as c;

comment on view public.v_configuracion_publica is
  'Lo que la landing necesita para pintarse. Las columnas van enumeradas aunque '
  '`configuracion_boda` sea publicable entera: es la disciplina que impide que '
  'una columna añadida mañana aparezca sola en la web.';

create or replace view public.v_secciones_publicas
with (security_invoker = on) as
select
  s.seccion,
  s.orden
from public.secciones_landing as s
where s.visible
order by s.orden;

comment on view public.v_secciones_publicas is
  'Secciones visibles de la landing, en orden. Sustituye a los nueve flags '
  '`mostrar_*` y evita que el frontend tenga que traducir a mano nombres de '
  'columna a nombres de sección.';

create or replace view public.v_medios_publicados
with (security_invoker = on) as
select
  m.id,
  m.ruta_almacenamiento,
  m.texto_alternativo,
  m.seccion,
  m.orden,
  m.ancho,
  m.alto,
  m.marcador_borroso
from public.medios as m
where m.publicado
order by m.seccion, m.orden;

comment on view public.v_medios_publicados is
  'Fotos publicadas, ya ordenadas por sección. No expone `subido_por` ni las '
  'fechas internas: a la landing no le hacen falta.';


-- ----------------------------------------------------------------------------
-- 2. Estadísticas de invitados
-- ----------------------------------------------------------------------------

create or replace view public.v_estadisticas_invitados
with (security_invoker = on) as
select
  count(*)                                                   as personas,
  count(*) filter (where f.estado = 'confirmado')             as confirmados,
  count(*) filter (where f.estado = 'confirmado' and not i.es_nino) as adultos_confirmados,
  count(*) filter (where f.estado = 'confirmado' and i.es_nino)     as ninos_confirmados,
  count(*) filter (where f.estado = 'rechazado')              as rechazados,
  count(*) filter (where f.estado = 'tentativo')              as tentativos,
  count(*) filter (where f.estado = 'pendiente')              as pendientes,
  count(*) filter (where f.estado = 'confirmado' and f.necesita_autobus)     as plazas_autobus,
  count(*) filter (where f.estado = 'confirmado' and f.necesita_alojamiento) as necesitan_alojamiento
from public.invitados as i
join public.confirmaciones as f
  on f.invitado_id = i.id and f.es_vigente;

comment on view public.v_estadisticas_invitados is
  'Recuento del panel en una sola fila. El JOIN es limpio, sin COALESCE ni LEFT '
  'JOIN, porque todo invitado tiene siempre una confirmación vigente: lo garantiza '
  '`invitados_confirmacion_inicial` al darlo de alta y '
  '`confirmaciones_siempre_vigente` a partir de entonces.';

create or replace view public.v_menus_confirmados
with (security_invoker = on) as
select
  i.tipo_menu,
  count(*) as personas,
  count(*) filter (where i.alergias is not null) as con_alergias
from public.invitados as i
join public.confirmaciones as f
  on f.invitado_id = i.id and f.es_vigente
where f.estado = 'confirmado'
group by i.tipo_menu;

comment on view public.v_menus_confirmados is
  'Lo que se le manda al catering: cuántos menús de cada tipo y cuántos llevan '
  'alergias anotadas. El recuento de niños NO sale de aquí sino de `es_nino`, '
  'porque un menor puede llevar menú sin gluten o vegetariano.';


-- ----------------------------------------------------------------------------
-- 3. Economía
-- ----------------------------------------------------------------------------

create or replace view public.v_servicios_importe
with (security_invoker = on) as
select
  s.id,
  s.proveedor_id,
  s.nombre,
  s.descripcion,
  s.precio_unitario,
  s.cantidad,
  s.por_invitado,
  s.importe_fijo,
  case
    when s.por_invitado
      then s.precio_unitario * s.cantidad
           * coalesce((select e.confirmados from public.v_estadisticas_invitados as e), 0)
    else s.importe_fijo
  end as importe_total
from public.servicios as s;

comment on view public.v_servicios_importe is
  'Importe real de cada servicio, resolviendo aquí —y no en el frontend— los de '
  'precio por invitado. Si el criterio cambia (por ejemplo, contar a los niños a '
  'media tarifa), se cambia en esta vista y el panel entero se entera; con la '
  'fórmula replicada en TypeScript, dejaría de coincidir en silencio.';

create or replace view public.v_resumen_presupuesto
with (security_invoker = on) as
select
  c.id                                           as categoria_id,
  c.nombre                                       as categoria,
  c.orden,
  c.importe_previsto,
  coalesce(sum(p.importe_estimado), 0)           as estimado,
  coalesce(sum(p.importe_real), 0)               as real,
  coalesce(sum(g.pagado), 0)                     as pagado,
  coalesce(sum(g.pendiente), 0)                  as pendiente,
  c.importe_previsto - coalesce(sum(coalesce(p.importe_real, p.importe_estimado)), 0)
                                                 as desviacion
from public.categorias_presupuesto as c
left join public.partidas_presupuesto as p
  on p.categoria_id = c.id
left join lateral (
  select
    coalesce(sum(pg.importe) filter (where pg.pagado_en is not null), 0) as pagado,
    coalesce(sum(pg.importe) filter (where pg.pagado_en is null), 0)     as pendiente
  from public.pagos as pg
  where pg.partida_id = p.id
) as g on true
group by c.id, c.nombre, c.orden, c.importe_previsto;

comment on view public.v_resumen_presupuesto is
  'Previsto contra estimado, real y pagado, por categoría. `desviacion` usa el '
  'importe real cuando existe y el estimado mientras no: es la cifra que de '
  'verdad interesa mirar, no la suma de lo que ya se ha pagado.';

create or replace view public.v_proximos_pagos
with (security_invoker = on) as
select
  pg.id,
  pg.partida_id,
  pa.concepto,
  ca.nombre        as categoria,
  pr.nombre        as proveedor,
  pg.importe,
  pg.fecha_vencimiento,
  pg.fecha_vencimiento < current_date as vencido
from public.pagos as pg
join public.partidas_presupuesto as pa on pa.id = pg.partida_id
join public.categorias_presupuesto as ca on ca.id = pa.categoria_id
left join public.proveedores as pr on pr.id = pa.proveedor_id
where pg.pagado_en is null
order by pg.fecha_vencimiento;

comment on view public.v_proximos_pagos is
  'Qué hay que pagar y cuándo, con su contexto ya resuelto. Es el aviso del panel '
  'y la única consulta que responde a la pregunta operativa del día a día.';


-- ----------------------------------------------------------------------------
-- 4. Privilegios de las vistas
--    Con `security_invoker = on`, quien consulta necesita permiso sobre la vista
--    Y sobre las tablas base, y además pasa por las políticas RLS de éstas. Los
--    GRANT de aquí no abren nada por su cuenta: sin política que lo permita, la
--    vista devuelve cero filas.
-- ----------------------------------------------------------------------------

grant select on public.v_configuracion_publica to anon, authenticated;
grant select on public.v_secciones_publicas    to anon, authenticated;
grant select on public.v_medios_publicados     to anon, authenticated;

grant select on
  public.v_estadisticas_invitados,
  public.v_menus_confirmados,
  public.v_servicios_importe,
  public.v_resumen_presupuesto,
  public.v_proximos_pagos
  to authenticated;


-- ----------------------------------------------------------------------------
-- 5. Red de seguridad: barrido final de EXECUTE
--
--    Ésta es la última migración del esquema, así que aquí se pasa una escoba
--    por TODAS las funciones de `public`.
--
--    Motivo, comprobado empíricamente sobre una base limpia: revocar las default
--    privileges NO impide que una función nueva nazca con EXECUTE para el
--    pseudo-rol PUBLIC, del que `anon` y `authenticated` heredan. Es decir: la
--    única defensa real es un REVOKE explícito por función, y ese REVOKE es
--    justo lo que alguien olvidará el día que añada la función número treinta.
--    Un olvido así no da un error: publica una RPC.
--
--    El barrido revoca EXECUTE a PUBLIC y a `anon` en todo `public`, y devuelve
--    el permiso únicamente a las tres puertas del RSVP. No toca las concesiones
--    a `authenticated`, que son explícitas y están justificadas una a una.
-- ----------------------------------------------------------------------------

do $$
declare
  v_funcion record;
begin
  for v_funcion in
    select p.oid::regprocedure as firma
      from pg_catalog.pg_proc as p
     where p.pronamespace = 'public'::regnamespace
  loop
    execute format('revoke execute on function %s from public, anon', v_funcion.firma);
  end loop;
end;
$$;

grant execute on function public.obtener_invitacion(text)            to anon;
grant execute on function public.registrar_confirmacion(text, jsonb) to anon;
grant execute on function public.anadir_acompanante(text, text, text, boolean, public.tipo_menu, text) to anon;

commit;
