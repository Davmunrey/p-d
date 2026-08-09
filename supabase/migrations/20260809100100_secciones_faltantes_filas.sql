-- BODA-20 · Alta de las secciones `programa` y `playlist`
--
-- Segunda mitad de la migración anterior: allí se añadieron los valores al
-- enumerado, aquí se usan. Van en ficheros distintos porque PostgreSQL no
-- permite usar un valor de enumerado en la misma transacción que lo crea.
--
-- Los huecos de `orden` estaban pensados para esto: se intercalan sin tocar el
-- orden de ninguna de las secciones que ya existían, así que la restricción de
-- unicidad no llega ni a rozarse.
--
--   … galeria 30 · [programa 35] · ubicaciones 40 …
--   … preguntas_frecuentes 70 · [playlist 75] · rsvp 80 …
--
-- Visibles desde el primer momento: son secciones que la web ya está pintando,
-- no funcionalidad nueva a la espera de que alguien la encienda.

insert into public.secciones_landing (seccion, visible, orden) values
  ('programa', true, 35),
  ('playlist', true, 75)
on conflict (seccion) do nothing;
