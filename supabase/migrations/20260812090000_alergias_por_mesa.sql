-- ============================================================================
-- 20260812090000_alergias_por_mesa.sql
-- Ticket: BODA-84 (#60) · Las alergias, vistas por mesa
-- Motor:  PostgreSQL 17 (Supabase)
--
-- Qué hace este fichero:
--   Publica `v_alergias_por_mesa`, que contesta la única pregunta que el
--   maître hace la noche antes: «¿en qué mesas hay algo que avisar?».
--
--
-- POR QUÉ ES UNA VISTA Y NO UNA CONSULTA EN LA PANTALLA
--
-- Porque la definición de «alergia que importa» tiene tres condiciones y las
-- tres son fáciles de olvidar en una de las dos copias:
--
--   · sólo cuenta la confirmación VIGENTE (el histórico guarda las anteriores);
--   · sólo cuenta quien ha CONFIRMADO (quien no viene no come);
--   · una cadena vacía NO es una alergia, y la columna admite ''.
--
-- Con la consulta escrita en TypeScript, el día que alguien afine una de las
-- tres la exportación para el catering seguiría diciendo otra cosa. Y este es
-- el dato del proyecto donde equivocarse tiene consecuencias médicas.
--
--
-- LEFT JOIN CONTRA `mesas`, A PROPÓSITO
--
-- Quien tiene alergia y todavía NO está sentado sale igual, con `mesa` a NULL.
-- Es la fila más importante de todas: es la que recuerda que falta colocar a
-- alguien de quien hay que avisar a la cocina. Con un JOIN normal desaparecería
-- justo mientras el reparto está a medias, que es cuando se mira esta lista.
--
--
-- LAS DOS REGLAS DE TODA VISTA DE `public` (ver 20260803090600_vistas.sql):
--   1. `with (security_invoker = on)` — sin esto la vista se ejecutaría con los
--      privilegios de `postgres` y saltaría TODA la RLS de `invitados`. Sería
--      publicar la lista de alergias de ciento veinte personas.
--   2. Columnas enumeradas una a una, nunca `select *`.
--
-- Se hace `drop` antes de crear en vez de `create or replace`: cambiar el orden
-- o el nombre de una columna con `replace` falla («cannot change name of view
-- column»), y una migración que se niega a aplicarse por un reordenamiento es
-- un despliegue parado por nada. Al soltarla y rehacerla se vuelve a conceder
-- el `select`, que es lo único que la vista tenía colgando.
--
-- Rollback: supabase/migrations/rollback/20260812090000_alergias_por_mesa.sql
-- ============================================================================

begin;

drop view if exists public.v_alergias_por_mesa;

create view public.v_alergias_por_mesa
with (security_invoker = on) as
select
  m.nombre    as mesa,
  i.mesa_id,
  i.nombre,
  i.apellidos,
  i.tipo_menu,
  i.es_nino,
  i.alergias
from public.invitados as i
join public.confirmaciones as f
  on f.invitado_id = i.id and f.es_vigente
left join public.mesas as m
  on m.id = i.mesa_id
where f.estado = 'confirmado'
  and i.alergias is not null
  and btrim(i.alergias) <> '';

comment on view public.v_alergias_por_mesa is
  'Quién tiene alergia anotada, en qué mesa se sienta y qué menú lleva. Sólo '
  'confirmados: quien no viene no come. `mesa` a NULL significa que esa persona '
  'todavía no está sentada, que es la fila que hay que resolver antes de mandar '
  'el reparto a la cocina.';

grant select on public.v_alergias_por_mesa to authenticated;

commit;
