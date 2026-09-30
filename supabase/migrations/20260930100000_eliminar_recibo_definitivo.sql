-- ============================================================================
-- Eliminar un recibo de maquila DEFINITIVAMENTE (solo el desarrollador).
--
-- Borra de verdad el recibo (acabados, armado o electrificación) y, en cascada,
-- sus renglones, charolas y discrepancias con el PM. Para el resto de roles
-- sigue existiendo solo "cancelar" (cancelar_recibo), que conserva el registro.
-- El folio queda libre para volver a usarse.
--
-- Security definer: el permiso se valida explícitamente con is_admin()
-- (desarrollador) al inicio, igual que eliminar_pedido_definitivo.
-- ============================================================================

create or replace function public.eliminar_recibo_definitivo(p_tipo text, p_recibo_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_folio text;
begin
  if not public.is_admin() then
    raise exception 'Solo el desarrollador puede eliminar recibos definitivamente.';
  end if;

  if p_tipo = 'electrificacion' then
    delete from public.recibos_electrificacion where id = p_recibo_id returning folio into v_folio;
  elsif p_tipo in ('acabados', 'armado') then
    delete from public.recibos where id = p_recibo_id and tipo = p_tipo returning folio into v_folio;
  else
    raise exception 'Tipo de recibo no válido.';
  end if;

  if v_folio is null then
    raise exception 'Recibo no encontrado.';
  end if;
  return v_folio;
end;
$$;
revoke execute on function public.eliminar_recibo_definitivo(text, uuid) from public, anon;
grant execute on function public.eliminar_recibo_definitivo(text, uuid) to authenticated;
