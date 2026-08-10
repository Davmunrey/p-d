-- BODA-62 · Pagos y calendario de vencimientos
--
-- La tabla `pagos` ya existía con lo esencial —importe, vencimiento, `pagado_en`
-- y su clave ajena `on delete restrict`—. Esta migración añade las dos cosas que
-- el módulo necesita y no estaban:
--
--   1. QUIÉN PAGA. En una boda no es un detalle administrativo: el reparto entre
--      las dos familias es una conversación real, y sin la columna la respuesta
--      acaba en las notas, donde no se puede sumar.
--
--   2. QUE UN PAGO NO SE SALGA DE SU GASTO. Apuntar 9.000 € de pagos contra un
--      catering de 8.600 € no es un error de dedo que se vea: cuadra en la
--      pantalla de pagos, descuadra el presupuesto entero, y se descubre el mes
--      que no llega el dinero.

-- ---------------------------------------------------------------------------
-- 1. Quién paga
-- ---------------------------------------------------------------------------

/*
  UN ENUMERADO Y UN TEXTO, Y NO UNO DE LOS DOS.

  Sólo el enumerado dejaría fuera «los padrinos pagan el ramo», que pasa en
  todas las bodas, y obligaría a esconderlo en las notas — donde no suma.

  Sólo texto libre haría imposible la pregunta que justifica la columna: cuánto
  pone cada familia. «mis padres» y «Mis padres» son dos pagadores distintos
  para la base, y el total por pagador deja de existir en cuanto alguien teclea
  con prisa.

  Así que el reparto normal es cerrado y sumable, y `otros` es la puerta para lo
  que no encaja, con su nombre al lado.

  El orden de los valores no es alfabético a propósito: define el operador `<`
  del tipo y con él el ORDER BY de los listados.
*/
select public.asegurar_enum('pagador_boda', array['novia', 'novio', 'ambos', 'otros']);

alter table public.pagos
  add column if not exists paga public.pagador_boda;

alter table public.pagos
  add column if not exists paga_detalle text;

comment on column public.pagos.paga is
  'Quién asume este pago. NULL es «todavía no se ha decidido», que es un estado '
  'de verdad: se apunta la señal del fotógrafo mucho antes de hablar de quién la '
  'pone. Por eso no tiene valor por defecto: inventar «ambos» daría por zanjada '
  'una conversación que no se ha tenido.';

comment on column public.pagos.paga_detalle is
  'Quién es, cuando `paga` es `otros`. Sólo puede existir en ese caso: guardado '
  'junto a «ambos» sería una segunda verdad sobre lo mismo, y la base no sabría '
  'cuál de las dos manda.';

/*
  LA RESTRICCIÓN TIENE DOS MITADES, y las dos hacen falta.

  Sin la primera, `otros` se queda sin decir quién — que es justo lo único que
  `otros` aporta sobre no haber puesto nada.

  Sin la segunda, cambiar «otros · los padrinos» a «ambos» deja el nombre de los
  padrinos colgando: la ficha diría que pagan los dos y a la vez que lo pagan
  los padrinos.

  Entra `not valid`: valida de aquí en adelante sin exigir que las filas
  anteriores —escritas cuando la columna no existía— se inventen nada.
*/
alter table public.pagos
  drop constraint if exists pagos_detalle_solo_de_otros;

alter table public.pagos
  add constraint pagos_detalle_solo_de_otros
  check (
    (paga = 'otros'
       and paga_detalle is not null
       and char_length(btrim(paga_detalle)) between 2 and 120)
    or
    (paga is distinct from 'otros' and paga_detalle is null)
  )
  not valid;

-- ---------------------------------------------------------------------------
-- 2. Un pago no puede salirse de su gasto
-- ---------------------------------------------------------------------------

/*
  EL TOPE ES EL ACORDADO CUANDO LO HAY Y EL ESTIMADO MIENTRAS NO, que es el
  mismo criterio con el que `v_resumen_presupuesto` calcula la desviación. Dos
  criterios sobre lo mismo es cómo dos cifras de la misma pantalla acaban sin
  cuadrar.

  SIN TOPE NO SE COMPARA. Un gasto recién apuntado tiene cero estimado —todavía
  no se ha calculado— y ahí la regla estorbaría en vez de proteger: se apunta la
  señal del fotógrafo antes de saber el total. Cero no es «no cabe nada», es «no
  hay contra qué comparar».

  ES UN TRIGGER Y NO UNA COMPROBACIÓN EN LA PANTALLA porque mira OTRAS filas: un
  `check` sólo ve la suya, y aquí lo que importa es la suma de todos los pagos
  del gasto. La pantalla lo repite antes de enviar para poder decir cuánto queda,
  pero quien manda es esto.
*/
create or replace function public.exigir_pago_dentro_del_gasto()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tope     numeric(12, 2);
  v_apuntado numeric(12, 2);
begin
  select coalesce(p.importe_real, p.importe_estimado)
    into v_tope
    from public.partidas_presupuesto as p
   where p.id = new.partida_id;

  if coalesce(v_tope, 0) <= 0 then
    return new;
  end if;

  -- `is distinct from` y no `<>`: al INSERTAR no hay fila previa que excluir y
  -- `new.id <> pg.id` con un id nuevo funcionaría igual, pero al ACTUALIZAR el
  -- importe hay que dejar fuera el pago que se está cambiando o se sumaría dos
  -- veces contra sí mismo.
  select coalesce(sum(pg.importe), 0)
    into v_apuntado
    from public.pagos as pg
   where pg.partida_id = new.partida_id
     and pg.id is distinct from new.id;

  if v_apuntado + new.importe > v_tope then
    raise exception 'PAG01'
      using errcode = 'check_violation',
            detail  = format(
              'gasto=%s tope=%s apuntado=%s intento=%s',
              new.partida_id, v_tope, v_apuntado, new.importe
            ),
            hint    = 'El pago no cabe en el gasto. Subid antes el importe del gasto.';
  end if;

  return new;
end;
$$;

comment on function public.exigir_pago_dentro_del_gasto() is
  'Impide que la suma de los pagos de una partida pase de su importe acordado '
  '—o del estimado mientras no haya acuerdo—. Lanza PAG01. Sin tope (cero) no '
  'compara: un gasto sin calcular todavía admite su señal.';

create or replace trigger pagos_dentro_del_gasto
  before insert or update of importe, partida_id on public.pagos
  for each row
  execute function public.exigir_pago_dentro_del_gasto();

/*
  EL REVOKE ES EXPLÍCITO Y NO SOBRA.

  El barrido de EXECUTE vive en la última migración del esquema base, así que no
  alcanza a las funciones que llegan después: ésta nace con EXECUTE para el
  pseudo-rol PUBLIC, del que heredan `anon` y `authenticated`. Que sea una
  función de trigger no la hace inofensiva —se puede invocar por RPC— y aunque
  sin contexto de trigger sólo daría error, publicar una puerta que no lleva a
  ningún sitio sigue siendo publicar una puerta.
*/
revoke execute on function public.exigir_pago_dentro_del_gasto() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Los pagos con su contexto, y el calendario encima
-- ---------------------------------------------------------------------------

/*
  UNA SOLA DEFINICIÓN DE «VENCIDO» Y DE LOS JOINS.

  `v_proximos_pagos` ya resolvía el contexto de cada pago pendiente, pero la
  pantalla de pagos necesita también los que YA están hechos —para poder
  deshacerlos y para enseñar lo que se lleva pagado—. Duplicar los joins en una
  segunda vista era garantizar que un día digan cosas distintas, así que
  `v_proximos_pagos` pasa a leerse de ésta y se queda como lo que siempre fue:
  el filtro «lo que falta», que es lo que mira el resumen del panel.

  `vencido` lo calcula la base con SU fecha. Preguntárselo al navegador es
  preguntárselo a un reloj que puede estar mal puesto o en otro huso, y un pago
  que aparece vencido un día antes —o un día después— no sirve para nada.
*/
create or replace view public.v_pagos
with (security_invoker = on) as
select
  pg.id,
  pg.partida_id,
  pa.concepto,
  ca.id            as categoria_id,
  ca.nombre        as categoria,
  pr.nombre        as proveedor,
  pg.importe,
  pg.fecha_vencimiento,
  pg.pagado_en,
  pg.metodo,
  pg.paga,
  pg.paga_detalle,
  pg.notas,
  pg.pagado_en is null and pg.fecha_vencimiento < current_date as vencido
from public.pagos as pg
join public.partidas_presupuesto as pa on pa.id = pg.partida_id
join public.categorias_presupuesto as ca on ca.id = pa.categoria_id
left join public.proveedores as pr on pr.id = pa.proveedor_id;

comment on view public.v_pagos is
  'Todos los pagos con su gasto, su categoría y su proveedor ya resueltos, y si '
  'están vencidos según la fecha del servidor. Es la única definición de '
  '«vencido» del proyecto.';

/*
  Se mantiene el nombre, el orden y los tipos de las columnas de antes —hay
  código leyéndola— y las nuevas van detrás, que es lo único que `create or
  replace view` admite.
*/
create or replace view public.v_proximos_pagos
with (security_invoker = on) as
select
  p.id,
  p.partida_id,
  p.concepto,
  p.categoria,
  p.proveedor,
  p.importe,
  p.fecha_vencimiento,
  p.vencido,
  p.categoria_id,
  p.paga,
  p.paga_detalle
from public.v_pagos as p
where p.pagado_en is null
order by p.fecha_vencimiento;

comment on view public.v_proximos_pagos is
  'Qué falta por pagar y cuándo, ordenado por vencimiento. Es el filtro de '
  '`v_pagos`, no una segunda consulta: así «vencido» significa lo mismo en el '
  'aviso del panel y en la pantalla de pagos.';

grant select on public.v_pagos to authenticated;
