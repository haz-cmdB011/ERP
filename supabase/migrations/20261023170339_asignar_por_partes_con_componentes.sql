-- Objetos que esta migración debe dejar en la base (los comprueba `npm run db:verificar`):
-- @verifica function public.tiene_componentes
-- @verifica function-contiene public.crear_asignacion_produccion tiene_componentes

-- ============================================================================
-- Producción — un mueble con componentes se asigna solo por partes.
--
-- "Mueble completo" queda solo para los muebles sin componentes en el PM. Uno con
-- componentes se asigna por partes de su despiece (sin despiece, ya lo rechaza
-- requiere_despiece). El retrabajo no pasa por aquí y hereda la parte de su lote.
-- Las asignaciones de mueble completo que ya existen se quedan como están.
-- ============================================================================

create or replace function public.tiene_componentes(p_item_id uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.planeacion_items h
    where h.parent_item_id = p_item_id
      and h.eliminacion_solicitada_en is null
      and coalesce(h.estado_revision, '') <> 'cancelado'
  );
$$;

revoke execute on function public.tiene_componentes(uuid) from public, anon;
grant execute on function public.tiene_componentes(uuid) to authenticated;

-- Se agrega la comprobación a la definición vigente, justo antes de la de la parte.
do $$
declare
  v_def text;
  v_nueva text;
  v_ancla constant text := '  -- La parte, si se asigna una: vigente y de este mueble.';
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'crear_asignacion_produccion';
  v_nueva := replace(v_def, v_ancla,
    '  -- Con componentes, solo por partes (asignar_por_partes_con_componentes).' || E'\n' ||
    '  if p_parte_id is null and public.tiene_componentes(v_item.id) then' || E'\n' ||
    '    raise exception ''El ítem % tiene componentes: asígnalo por partes de su despiece.'', v_item.item_code;' || E'\n' ||
    '  end if;' || E'\n\n' || v_ancla);
  if v_nueva = v_def then
    raise exception 'crear_asignacion_produccion no trae el punto esperado.';
  end if;
  execute v_nueva;
end;
$$;
