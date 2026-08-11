-- ============================================================================
-- 20260811140700_proveedores_iva.sql
-- Ticket: BODA-73 (#54) · Comparar presupuestos de proveedores
--
-- Qué hace este fichero:
--   1. `proveedores.iva_incluido`: si el importe presupuestado lleva el IVA
--      dentro o no.
--
-- LA MITAD DE LOS SUSTOS DE UNA BODA SON ESTE BOOLEANO. Tres fotógrafos, tres
-- presupuestos, y uno da la cifra sin IVA: comparado a pelo parece el barato
-- y es el caro. La comparativa necesita saber qué significa cada cifra para
-- ponerlas en la misma base antes de ordenarlas.
--
-- Es un booleano con NULL y no un importe duplicado: guardar «con IVA» y
-- «sin IVA» como dos columnas acabaría con una actualizada y la otra no. El
-- tipo (21 %) es configuración de la aplicación, no un dato por proveedor —
-- si algún servicio va al 10 %, la cifra que se guarda es la del presupuesto
-- y el panel lo enseña tal cual, sin inventar la otra.
--
-- Rollback: supabase/migrations/rollback/20260811140700_proveedores_iva.sql
-- ============================================================================

begin;

alter table public.proveedores
  add column if not exists iva_incluido boolean;

comment on column public.proveedores.iva_incluido is
  'Si `importe_presupuestado` lleva el IVA dentro. NULL es «no lo dice el '
  'presupuesto», que es un estado real y un aviso en la comparativa: una '
  'cifra que no se sabe qué incluye no se puede comparar todavía.';

commit;
