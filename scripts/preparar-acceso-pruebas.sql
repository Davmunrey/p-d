-- Los perfiles de los dos usuarios con los que se prueba el acceso al panel.
--
-- Los usuarios de `auth.users` ya existen cuando esto corre: los crea
-- `preparar-acceso-pruebas.sh` por la API de administración de GoTrue, y pasa
-- sus identificadores aquí. Este fichero no se ejecuta suelto.
--
-- Los dos tienen la MISMA contraseña, y correcta. La gracia está en el
-- segundo: se identifica bien —existe y acierta la contraseña— y aun así no
-- entra, porque su perfil está desactivado. Es el caso que separa
-- «autenticado» de «con acceso», y el que se rompería sin que nadie se
-- enterase si sólo probáramos el camino bueno.

-- Sin las variables no hay nada que hacer. El aviso es sólo para quien lo
-- lance a mano: `\quit` no sabe devolver un código de salida, así que lo que
-- de verdad corta es el error de sintaxis de la primera `:'…'` sin definir,
-- que con `ON_ERROR_STOP` sale con 3.
\if :{?id_con_acceso}
\else
  \echo 'Falta -v id_con_acceso: este fichero lo lanza preparar-acceso-pruebas.sh'
\endif

begin;

-- El primero entra: perfil activo. `designar_primer_propietario` es la vía
-- oficial para el primero, y esquiva el trigger que exige un propietario ya
-- activo — el arranque en frío que se arregló en BODA-14.
select public.designar_primer_propietario(
  :'id_con_acceso'::uuid,
  '(PRUEBA) Con acceso'
);

-- El segundo NO entra: tiene perfil, pero desactivado. Es lo que le pasa a
-- cualquiera que se registrase por su cuenta.
insert into public.perfiles (usuario_id, correo_electronico, nombre_completo, rol, activo)
select
  u.id,
  u.email,
  '(PRUEBA) Sin acceso',
  'lector',
  false
from auth.users as u
where u.id = :'id_sin_acceso'::uuid
on conflict (usuario_id) do update set activo = false;

commit;
