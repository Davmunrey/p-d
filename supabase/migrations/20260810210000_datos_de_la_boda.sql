-- ============================================================================
-- Los datos de la boda, los de verdad
--
-- Hasta ahora la web enseñaba el seed de desarrollo —«(DES) Ana y (DES) Luis»,
-- «(DES) Finca de pruebas»— porque los datos reales viven en la base y todavía
-- no hay nadie que pueda entrar al panel a escribirlos. Esto los mete.
--
-- SALEN DE LA ENTREGA, no de ningún sitio inventado: nombres, fecha, finca,
-- dirección, plazo y correo son los del HTML de «Sistema completo de boda».
--
-- LAS COORDENADAS NO SE PONEN, y es a propósito. La entrega no las trae, y
-- teclear unas de León «que estarán cerca» mandaría a ciento veinte personas a
-- un punto equivocado el día de la boda. Sin coordenadas, el enlace del mapa no
-- se pinta —que es honesto— y se rellenan desde el panel en cuanto se sepan.
--
-- Esto es una migración y no un `seed` porque el seed sólo corre en desarrollo
-- y lo que hace falta es que la web de producción deje de enseñar datos falsos.
-- Es escritura de datos, no de esquema: por eso todo va con `where` sobre la
-- fila única y nada se duplica si se aplica dos veces.
--
-- Rollback: supabase/migrations/rollback/20260810210000_datos_de_la_boda.sql
-- ============================================================================

update public.configuracion_boda set
  nombre_novia         = 'Paloma',
  nombre_novio         = 'David',
  -- Sábado 26 de junio de 2027, ceremonia a las 13:00 en hora peninsular.
  fecha_hora_ceremonia = timestamptz '2027-06-26 13:00:00+02',
  fecha_hora_banquete  = timestamptz '2027-06-26 16:00:00+02',
  -- «Antes del 1 de mayo de 2027»: se cuenta el día entero.
  fecha_limite_rsvp    = timestamptz '2027-05-01 23:59:59+02',
  lugar_ceremonia      = 'Finca La Sierra',
  direccion_ceremonia  = 'Ctra. de la Sierra, km 4 · 24193 León',
  lugar_banquete       = 'Finca La Sierra',
  correo_contacto      = 'hola@palomaydavid.es';

-- ----------------------------------------------------------------------------
-- El día, hora a hora, y la víspera
-- ----------------------------------------------------------------------------
-- Sólo si no hay nada: si alguien ya los ha escrito desde el panel, mandan los
-- suyos. Una migración no puede pisar lo que edite quien organiza.

insert into public.hitos_programa (momento, hora, titulo, descripcion, orden)
select * from (values
  ('preboda'::public.momento_programa, '18:00', 'Visita a la catedral',
   'Los que lleguéis pronto, quedamos en la puerta oeste. Media hora larga y merece cada minuto.', 0::smallint),
  ('preboda', '20:30', 'Vinos por el Barrio Húmedo',
   'Ruta corta de tapa y vino sin plan fijo. Empezamos en la Plaza de San Martín.', 10),
  ('preboda', '22:30', 'Cena informal',
   'Mesa reservada a nombre de David. Avisadnos por WhatsApp si os apuntáis para ampliarla.', 20)
) as nuevos
where not exists (select 1 from public.hitos_programa where momento = 'preboda');

insert into public.hitos_programa (momento, hora, titulo, descripcion, orden)
select * from (values
  ('boda'::public.momento_programa, '11:00', 'Café antes de la boda',
   'En la cafetería del Parador, para los que durmáis allí. Sin prisa: el autobús sale a las 12:00.', 0::smallint),
  ('boda', '12:00', 'Autobús desde León',
   'Salida desde la Plaza de Santo Domingo. Intentad estar cinco minutos antes.', 10),
  ('boda', '13:00', 'Ceremonia',
   'En el olivar de la finca, a la sombra. Habrá abanicos y agua fría esperando.', 20),
  ('boda', '14:00', 'Aperitivo y vermut',
   'Cava, cecina y música en directo en la terraza baja.', 30),
  ('boda', '16:00', 'Banquete',
   'Comida sentada en el invernadero. Encontraréis vuestro sitio en el plano de mesas.', 40),
  ('boda', '19:30', 'Baile y barra',
   'Primer baile, DJ y barra libre hasta el final.', 50),
  ('boda', '02:00', 'Recena y vuelta',
   'Sopa de ajo para los que sigan en pie. Autobuses de vuelta a las 02:00 y 04:30.', 60)
) as nuevos
where not exists (select 1 from public.hitos_programa where momento = 'boda');

-- La preboda ya tiene contenido, así que se enciende.
update public.secciones_landing set visible = true where seccion = 'preboda';
