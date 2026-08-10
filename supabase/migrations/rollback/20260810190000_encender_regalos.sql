-- Rollback de 20260810190000_encender_regalos.sql
--
-- Vuelve a apagar la sección de regalos. Con esto `datos_para_regalos()` deja
-- de devolver el IBAN en el acto, aunque siga escrito en el panel: apagar la
-- sección ES despublicar la cuenta.

update public.secciones_landing set visible = false where seccion = 'regalos';
