-- Rollback de 20260810210000_datos_de_la_boda.sql
--
-- OJO: esto NO devuelve los datos de desarrollo, porque no debe. Deja la
-- configuración con los nombres y la fecha puestos: borrarlos dejaría la web
-- diciendo «estamos preparando la web» en producción, que es peor que
-- cualquier dato que se quisiera deshacer.
--
-- Lo único que se retira son los hitos del programa que metió la migración, y
-- sólo si nadie los ha tocado desde entonces.

delete from public.hitos_programa
 where creado_en = actualizado_en
   and titulo in (
     'Visita a la catedral', 'Vinos por el Barrio Húmedo', 'Cena informal',
     'Café antes de la boda', 'Autobús desde León', 'Ceremonia',
     'Aperitivo y vermut', 'Banquete', 'Baile y barra', 'Recena y vuelta'
   );

update public.secciones_landing set visible = false where seccion = 'preboda';
