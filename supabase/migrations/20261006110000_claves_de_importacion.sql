-- ============================================================================
-- 20261006110000_claves_de_importacion.sql
-- Motor:  PostgreSQL 17 (Supabase)
--
-- Qué hace este fichero: que «es la misma invitación» y «es la misma persona»
-- se decidan en UN solo sitio, y que la vista previa de la importación le
-- pregunte a ese sitio en vez de imitarlo.
--
--
-- EL FALLO.
--
-- 20261005110000 igualó el criterio de la base y el de la vista previa... por
-- imitación: la base compara con `lower(sin_acentos(btrim(x)))` y la vista
-- previa con una normalización de JavaScript que se le parece. Se parece en
-- las tildes y en nada más. `unaccent` traduce más de doscientos signos que
-- JavaScript deja como están —«ß» → «ss», «ø» → «o», «’» → «'», «–» → «-»—, y
-- el `lower()` de una base en locale C sólo pasa a minúsculas el ASCII.
--
-- Con «Família Col·lell» en la base y una hoja que trae «Familia Collell», la
-- vista previa la daba por la misma invitación y la base creaba una SEGUNDA,
-- con su propio enlace. Con el apóstrofo del móvil, al revés: «D’Angelo» y
-- «D'Angelo» eran dos personas para la pantalla y la misma para la base, que
-- rechazaba la importación entera con un «no se ha podido importar» sin fila.
--
--
-- EL ARREGLO.
--
-- `clave_de_importacion(texto)` es la única definición. La usa
-- `importar_invitados()` —que se redefine aquí, idéntica salvo por las tres
-- comparaciones— y `claves_de_importacion(textos)`, la versión en bloque que
-- llama la vista previa con todos los nombres del fichero de una vez. Nadie
-- imita a nadie: si un día cambia el criterio, cambia para los dos.
--
-- Rollback: supabase/migrations/rollback/20261006110000_claves_de_importacion.sql
-- ============================================================================

create or replace function public.clave_de_importacion(p_texto text)
returns text
language sql
immutable
strict
parallel safe
set search_path = ''
as $$
  select lower(public.sin_acentos(btrim(p_texto)));
$$;

comment on function public.clave_de_importacion(text) is
  'Cuándo dos nombres son el mismo al importar invitados: sin espacios en los '
  'bordes, sin acentos (con todo lo que traduce unaccent) y en minúsculas. Es '
  'la única definición: la usan importar_invitados() y la vista previa, a '
  'través de claves_de_importacion().';

create or replace function public.claves_de_importacion(p_textos text[])
returns text[]
language sql
immutable
strict
parallel safe
set search_path = ''
as $$
  select coalesce(
    array_agg(public.clave_de_importacion(texto) order by posicion),
    '{}'::text[]
  )
    from unnest(p_textos) with ordinality as fila(texto, posicion);
$$;

comment on function public.claves_de_importacion(text[]) is
  'La clave de importación de cada texto, en el mismo orden. La llama la vista '
  'previa con todos los nombres del fichero de una vez, para decidir con el '
  'criterio de la base qué filas van a una invitación que ya existe.';

revoke all on function public.clave_de_importacion(text) from public, anon, authenticated;
revoke all on function public.claves_de_importacion(text[]) from public, anon, authenticated;
grant execute on function public.clave_de_importacion(text) to authenticated;
grant execute on function public.claves_de_importacion(text[]) to authenticated;


create or replace function public.importar_invitados(p_filas jsonb)
returns table (grupos_creados integer, personas_creadas integer)
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_fila        jsonb;
  v_indice      integer := 0;
  v_grupo_id    uuid;
  v_nombre_gr   text;
  v_lado        public.lado_invitacion;
  v_nombre      text;
  v_apellidos   text;
  v_nino        boolean;
  v_grupos      integer := 0;
  v_personas    integer := 0;
begin
  if not public.puede_editar() then
    raise exception 'RSV06'
      using errcode = 'insufficient_privilege',
            hint    = 'Sólo un editor puede importar invitados.';
  end if;

  if jsonb_typeof(p_filas) is distinct from 'array' then
    raise exception 'IMP01'
      using errcode = 'invalid_parameter_value',
            hint    = 'Se esperaba una lista de filas.';
  end if;

  for v_fila in select * from jsonb_array_elements(p_filas) loop
    v_indice := v_indice + 1;

    v_nombre_gr := btrim(coalesce(v_fila ->> 'grupo', ''));
    v_nombre    := btrim(coalesce(v_fila ->> 'nombre', ''));
    v_apellidos := nullif(btrim(coalesce(v_fila ->> 'apellidos', '')), '');
    v_nino      := coalesce((v_fila ->> 'nino')::boolean, false);
    v_lado      := coalesce((v_fila ->> 'lado')::public.lado_invitacion, 'ambos');

    -- La pantalla ya valida fila a fila y en castellano; esto es la red de
    -- seguridad, y el número de fila va en el detalle para poder señalarla.
    if v_nombre_gr = '' or v_nombre = '' then
      raise exception 'IMP02'
        using errcode = 'check_violation',
              detail  = format('fila=%s', v_indice),
              hint    = 'Cada fila necesita grupo y nombre.';
    end if;

    -- Un grupo por nombre, sin distinguir mayúsculas ni acentos: quien
    -- rellena la hoja escribe «Familia Zubeldía» y «familia zubeldia» sin
    -- pensar que son dos invitaciones distintas. El criterio es
    -- `clave_de_importacion()`, el mismo al que pregunta la vista previa, y si
    -- hubiera dos grupos que sólo se distinguen por una tilde, gana el más
    -- antiguo, siempre el mismo.
    select g.id into v_grupo_id
      from public.grupos_invitacion as g
     where public.clave_de_importacion(g.nombre) = public.clave_de_importacion(v_nombre_gr)
     order by g.creado_en, g.id
     limit 1;

    if v_grupo_id is null then
      insert into public.grupos_invitacion (nombre, lado)
      values (v_nombre_gr, v_lado)
      returning id into v_grupo_id;
      v_grupos := v_grupos + 1;
    end if;

    -- DUPLICADOS. La pantalla los enseña en la vista previa, pero entre mirar
    -- y confirmar puede haber pasado cualquier cosa —otra importación, alguien
    -- dando de alta a mano—, así que la comprobación de verdad va aquí dentro,
    -- donde nadie puede colarse en medio.
    if exists (
      select 1
        from public.invitados as i
       where i.grupo_id = v_grupo_id
         and public.clave_de_importacion(i.nombre) = public.clave_de_importacion(v_nombre)
         and public.clave_de_importacion(coalesce(i.apellidos, ''))
             = public.clave_de_importacion(coalesce(v_apellidos, ''))
    ) then
      raise exception 'IMP03'
        using errcode = 'unique_violation',
              detail  = format('fila=%s', v_indice),
              hint    = 'Esa persona ya está en esa invitación.';
    end if;

    insert into public.invitados (grupo_id, nombre, apellidos, es_nino)
    values (v_grupo_id, v_nombre, v_apellidos, v_nino);
    v_personas := v_personas + 1;
  end loop;

  grupos_creados   := v_grupos;
  personas_creadas := v_personas;
  return next;
end;
$function$;

comment on function public.importar_invitados(jsonb) is
  'Da de alta en bloque a la gente de un CSV, en UNA transacción: o entran todas '
  'o no entra ninguna. Reutiliza el grupo cuando ya existe uno con ese nombre '
  '(con clave_de_importacion(), el mismo criterio que la vista previa), porque un CSV '
  'trae una fila por persona y una invitación son varias. No emite enlaces: eso '
  'lo hace quien organiza cuando va a mandarlos.';

revoke all on function public.importar_invitados(jsonb) from public, anon, authenticated;
grant execute on function public.importar_invitados(jsonb) to authenticated;
