-- ============================================================================
-- seed.sql — DATOS DE DESARROLLO
--
--   ⚠  NADA DE ESTE FICHERO SON DATOS REALES DE LA BODA.  ⚠
--
-- Todo lo que hay aquí está marcado con el prefijo «(DES)», usa el dominio
-- reservado `.test` (RFC 2606, nunca resoluble en internet) y lleva fechas
-- relativas a `now()`. Si en una pantalla aparece «(DES)», es que está leyendo
-- del seed y no de la base de datos real.
--
-- Se ejecuta con `supabase db reset`, DESPUÉS de las migraciones, y sólo en
-- local. Los datos reales de la boda se cargan desde el panel: la regla 3 del
-- proyecto prohíbe los datos de ejemplo incrustados en producción.
--
-- Lo mínimo imprescindible para que la landing pinte algo y para que la suite
-- E2E tenga contra qué correr:
--   · configuración de la boda y su parte privada
--   · dos grupos de invitación CON TOKEN CONOCIDO (los tests los necesitan)
--   · cuatro invitados, uno de ellos niña celíaca y otro acompañante
--   · un proveedor con servicio, categoría de gasto, partida y pago
--   · una tarea, dos mesas y una foto publicada
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Tokens de desarrollo
--
-- La base de datos NUNCA guarda el token en claro, sólo su SHA-256. En
-- producción el texto plano lo devuelve `crear_grupo_invitacion()` una única
-- vez y no se puede recuperar. Aquí se fijan dos valores conocidos para que los
-- tests E2E puedan visitar /rsvp/<token> sin tener que capturar nada:
--
--   Familia Uno  ->  desarrollo-familia-uno-000000
--   Familia Dos  ->  desarrollo-familia-dos-000000
--
-- Son públicos, están en git y sólo abren datos «(DES)». Que un token de
-- desarrollo esté versionado es seguro justamente porque este fichero jamás se
-- ejecuta contra la base de producción.
-- ----------------------------------------------------------------------------

begin;

-- ----------------------------------------------------------------------------
-- `force row level security` durante la carga
--
-- Catorce tablas llevan RLS forzada, y `force` también le aplica al PROPIETARIO
-- de la tabla — que es justamente el rol con el que corre este seed—. Sin
-- levantarla, cada INSERT de aquí moriría con 42501 porque no hay ninguna
-- política escrita para `postgres`, y escribir una sería abrir en producción un
-- agujero para comodidad del entorno local.
--
-- Se levanta, se carga y se vuelve a poner al final del fichero. Si el seed
-- falla a mitad, el `begin/commit` que lo envuelve revierte también estos
-- ALTER: la base nunca se queda con la RLS relajada.
-- ----------------------------------------------------------------------------

do $$
declare
  v_tabla text;
begin
  foreach v_tabla in array array[
    'configuracion_privada', 'secciones_landing', 'notas_grupo', 'notas_invitado',
    'categorias_proveedor', 'proveedores', 'documentos_proveedor', 'servicios',
    'categorias_presupuesto', 'partidas_presupuesto', 'pagos', 'tareas', 'mesas',
    'medios'
  ]
  loop
    execute format('alter table public.%I no force row level security', v_tabla);
  end loop;
end;
$$;


-- ----------------------------------------------------------------------------
-- 1. Configuración de la boda
--    La fila ya existe (la siembra la migración base): se actualiza, no se
--    inserta. Fechas relativas para que el seed no caduque.
-- ----------------------------------------------------------------------------

update public.configuracion_boda set
  nombre_novia         = '(DES) Ana',
  nombre_novio         = '(DES) Luis',
  hashtag              = '#DESAnaYLuis',
  fecha_hora_ceremonia = date_trunc('hour', now()) + interval '200 days' + interval '12 hours',
  fecha_hora_banquete  = date_trunc('hour', now()) + interval '200 days' + interval '14 hours',
  zona_horaria         = 'Europe/Madrid',
  fecha_limite_rsvp    = date_trunc('day', now()) + interval '150 days',
  lugar_ceremonia      = '(DES) Finca de pruebas',
  direccion_ceremonia  = '(DES) Camino del Ejemplo, 1',
  latitud_ceremonia    = 40.416775,
  longitud_ceremonia   = -3.703790,
  lugar_banquete       = '(DES) Finca de pruebas',
  direccion_banquete   = '(DES) Camino del Ejemplo, 1',
  latitud_banquete     = 40.416775,
  longitud_banquete    = -3.703790,
  correo_contacto      = 'hola@ejemplo.test',
  moneda               = 'EUR',
  idioma_por_defecto   = 'es';

update public.configuracion_privada set
  presupuesto_objetivo = 42000.00,
  aforo_maximo         = 150,
  telefono_contacto    = '+34 600 000 000',
  notas_privadas       = '(DES) Fila de desarrollo. No son cifras reales.';


-- ----------------------------------------------------------------------------
-- 2. Invitados
-- ----------------------------------------------------------------------------

insert into public.grupos_invitacion
  (id, nombre, huella_token, token_emitido_en, maximo_acompanantes, lado, invitado_a,
   direccion, codigo_postal, ciudad, provincia, pais, idioma)
values
  ('aaaaaaaa-0000-4000-8000-000000000001',
   '(DES) Familia Uno',
   public.huella_token('desarrollo-familia-uno-000000'),
   now(), 2, 'novia',
   array['ceremonia','banquete','fiesta']::public.evento_boda[],
   '(DES) Calle Uno, 1', '28001', 'Madrid', 'Madrid', 'España', 'es'),

  ('aaaaaaaa-0000-4000-8000-000000000002',
   '(DES) Familia Dos',
   public.huella_token('desarrollo-familia-dos-000000'),
   now(), 0, 'novio',
   -- Sólo a la ceremonia: sirve para probar que la invitación no enseña el
   -- banquete a quien no está invitado.
   array['ceremonia']::public.evento_boda[],
   '(DES) Calle Dos, 2', '08001', 'Barcelona', 'Barcelona', 'España', 'es');

insert into public.notas_grupo (grupo_id, texto) values
  ('aaaaaaaa-0000-4000-8000-000000000001',
   '(DES) Nota privada. Si esto aparece en el RSVP público, hay una fuga.');

insert into public.invitados
  (id, grupo_id, nombre, apellidos, correo_electronico, telefono,
   es_nino, es_acompanante, tipo_menu, alergias)
values
  ('bbbbbbbb-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000001',
   '(DES) Ana', 'Uno', 'ana.uno@ejemplo.test', '+34 600 000 001',
   false, false, 'estandar', null),

  ('bbbbbbbb-0000-4000-8000-000000000002', 'aaaaaaaa-0000-4000-8000-000000000001',
   '(DES) Luis', 'Uno', 'luis.uno@ejemplo.test', null,
   false, false, 'vegetariano', null),

  -- Niña celíaca: el caso que la restricción antigua hacía imposible registrar.
  ('bbbbbbbb-0000-4000-8000-000000000003', 'aaaaaaaa-0000-4000-8000-000000000001',
   '(DES) Nina', 'Uno', null, null,
   true, false, 'sin_gluten', '(DES) Celíaca.'),

  ('bbbbbbbb-0000-4000-8000-000000000004', 'aaaaaaaa-0000-4000-8000-000000000002',
   '(DES) Bea', 'Dos', 'bea.dos@ejemplo.test', null,
   false, false, 'estandar', null);

insert into public.notas_invitado (invitado_id, texto) values
  ('bbbbbbbb-0000-4000-8000-000000000001',
   '(DES) Nota privada sobre una persona. Tampoco debe salir por el RSVP.');

-- Respuestas. Cada invitado ya tiene su fila `pendiente` (la crea el trigger
-- `invitados_confirmacion_inicial`): estas INSERT la degradan y pasan a ser las
-- vigentes, dejando además un historial con el que probar la pantalla.
insert into public.confirmaciones
  (invitado_id, estado, origen, necesita_autobus, necesita_alojamiento,
   cancion_solicitada, mensaje)
values
  ('bbbbbbbb-0000-4000-8000-000000000001', 'confirmado', 'publico', true,  false,
   '(DES) Una canción', '(DES) Allí estaremos.'),
  ('bbbbbbbb-0000-4000-8000-000000000002', 'confirmado', 'publico', true,  false,
   null, null),
  ('bbbbbbbb-0000-4000-8000-000000000003', 'confirmado', 'publico', true,  false,
   null, null),
  ('bbbbbbbb-0000-4000-8000-000000000004', 'rechazado',  'publico', null,  null,
   null, '(DES) No podremos ir.');


-- ----------------------------------------------------------------------------
-- 3. Economía
-- ----------------------------------------------------------------------------

insert into public.categorias_proveedor (id, nombre, descripcion, orden) values
  ('cccccccc-0000-4000-8000-000000000001', '(DES) Catering',   '(DES) Comida y bebida.', 0),
  ('cccccccc-0000-4000-8000-000000000002', '(DES) Fotografía', '(DES) Foto y vídeo.',    1);

insert into public.proveedores
  (id, categoria_id, nombre, persona_contacto, correo_electronico, telefono,
   sitio_web, estado, valoracion, importe_presupuestado, importe_acordado, notas)
values
  ('dddddddd-0000-4000-8000-000000000001', 'cccccccc-0000-4000-8000-000000000001',
   '(DES) Catering de pruebas', '(DES) Marta', 'catering@ejemplo.test', '+34 600 000 010',
   'https://ejemplo.test', 'contratado', 4, 9000.00, 8600.00, '(DES) Proveedor ficticio.'),

  ('dddddddd-0000-4000-8000-000000000002', 'cccccccc-0000-4000-8000-000000000002',
   '(DES) Fotógrafo de pruebas', null, 'foto@ejemplo.test', null,
   null, 'presupuesto_recibido', 5, 2200.00, null, null);

-- Un servicio por invitado y otro de precio cerrado: con los dos se puede ver
-- que `v_servicios_importe` recalcula uno y el otro no.
insert into public.servicios
  (proveedor_id, nombre, descripcion, precio_unitario, cantidad, por_invitado)
values
  ('dddddddd-0000-4000-8000-000000000001', '(DES) Menú adulto',
   '(DES) Precio por comensal confirmado.', 75.00, 1, true),
  ('dddddddd-0000-4000-8000-000000000001', '(DES) Barra libre',
   '(DES) Precio cerrado.', 1200.00, 1, false);

insert into public.categorias_presupuesto (id, nombre, descripcion, importe_previsto, orden) values
  ('eeeeeeee-0000-4000-8000-000000000001', '(DES) Banquete',   '(DES)', 20000.00, 0),
  ('eeeeeeee-0000-4000-8000-000000000002', '(DES) Fotografía', '(DES)',  2500.00, 1);

insert into public.partidas_presupuesto
  (id, categoria_id, proveedor_id, concepto, descripcion, importe_estimado, importe_real, pagada)
values
  ('ffffffff-0000-4000-8000-000000000001', 'eeeeeeee-0000-4000-8000-000000000001',
   'dddddddd-0000-4000-8000-000000000001', '(DES) Catering', '(DES)', 9000.00, 8600.00, false),
  ('ffffffff-0000-4000-8000-000000000002', 'eeeeeeee-0000-4000-8000-000000000002',
   'dddddddd-0000-4000-8000-000000000002', '(DES) Reportaje', '(DES)', 2200.00, null, false);

-- Un pago hecho y otro pendiente: el panel necesita los dos estados.
insert into public.pagos
  (partida_id, importe, fecha_vencimiento, pagado_en, metodo, notas)
values
  ('ffffffff-0000-4000-8000-000000000001', 2000.00,
   (now() - interval '30 days')::date, (now() - interval '30 days')::date,
   'transferencia', '(DES) Señal.'),
  ('ffffffff-0000-4000-8000-000000000001', 6600.00,
   (now() + interval '120 days')::date, null, null, '(DES) Resto.');


-- ----------------------------------------------------------------------------
-- 4. Organización
-- ----------------------------------------------------------------------------

insert into public.tareas (titulo, descripcion, estado, prioridad, fecha_limite, categoria) values
  ('(DES) Cerrar el menú con el catering', '(DES)', 'pendiente', 'alta',
   (now() + interval '60 days')::date, '(DES) Banquete'),
  ('(DES) Reservar el autobús', '(DES)', 'en_progreso', 'media',
   (now() + interval '90 days')::date, '(DES) Transporte');

insert into public.mesas (nombre, capacidad, forma, posicion_x, posicion_y) values
  ('(DES) Mesa 1', 10, 'redonda', 100.00, 100.00),
  ('(DES) Mesa 2', 10, 'redonda', 300.00, 100.00);

-- Sentamos a la Familia Uno para que el plano no salga vacío.
update public.invitados
   set mesa_id = (select id from public.mesas where nombre = '(DES) Mesa 1')
 where grupo_id = 'aaaaaaaa-0000-4000-8000-000000000001';

-- Una publicada y otra sin publicar: así el test comprueba que `anon` sólo ve
-- la primera. La ruta apunta a un objeto que puede no existir en el Storage
-- local; la landing debe degradar con elegancia, y eso también se prueba.
insert into public.medios
  (ruta_almacenamiento, texto_alternativo, seccion, orden, ancho, alto, publicado)
values
  ('desarrollo/portada.jpg',
   '{"es": "(DES) Fotografía de portada de ejemplo"}'::jsonb,
   'portada', 0, 2000, 1333, true),
  ('desarrollo/galeria-borrador.jpg',
   '{"es": "(DES) Borrador que no debe verse en la landing"}'::jsonb,
   'galeria', 0, 1600, 1067, false);


-- ----------------------------------------------------------------------------
-- 5. Se restaura `force row level security`
-- ----------------------------------------------------------------------------

do $$
declare
  v_tabla text;
begin
  foreach v_tabla in array array[
    'configuracion_privada', 'secciones_landing', 'notas_grupo', 'notas_invitado',
    'categorias_proveedor', 'proveedores', 'documentos_proveedor', 'servicios',
    'categorias_presupuesto', 'partidas_presupuesto', 'pagos', 'tareas', 'mesas',
    'medios'
  ]
  loop
    execute format('alter table public.%I force row level security', v_tabla);
  end loop;
end;
$$;

commit;


-- ----------------------------------------------------------------------------
-- Comprobación final: si alguna tabla se quedó sin RLS forzada, el seed avisa
-- en voz alta en vez de dejar el entorno local en un estado que no se parece a
-- producción — que es exactamente cómo se cuela un fallo de seguridad hasta el
-- despliegue.
-- ----------------------------------------------------------------------------

do $$
declare
  v_relajadas text;
begin
  select string_agg(c.relname, ', ' order by c.relname) into v_relajadas
    from pg_catalog.pg_class as c
    join pg_catalog.pg_namespace as n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relkind = 'r'
     and not c.relrowsecurity;

  if v_relajadas is not null then
    raise exception 'El seed ha dejado tablas sin RLS: %', v_relajadas;
  end if;

  raise notice 'Seed de desarrollo cargado. Tokens de prueba: '
    'desarrollo-familia-uno-000000 / desarrollo-familia-dos-000000';
end;
$$;
