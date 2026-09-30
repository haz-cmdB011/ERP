-- est_actualizar_estado_recibo es de uso interno (la llaman guardar_recibo_*,
-- modificar/decidir_renglon), pero como guardar_recibo_acabados/armado y
-- decidir_renglon son SECURITY INVOKER necesita EXECUTE para authenticated, así
-- que no se le puede quitar el permiso. En su lugar se blinda por dentro para
-- que llamarla directo (/rest/v1/rpc/est_actualizar_estado_recibo) nunca deje
-- un estado incorrecto:
-- - Solo el personal de Estimaciones pasa un recibo a "revisado". Un
--   maquilador nunca dispara esa transición en el flujo normal (sus renglones
--   se guardan sin decisión), así que excluirlo no cambia nada del uso real.
-- - Un recibo sin renglones no se marca como revisado (antes 0 pendientes
--   bastaba).
create or replace function public.est_actualizar_estado_recibo(p_tipo text, p_recibo_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_total integer;
  v_pendientes integer;
begin
  if not public.is_estimaciones() then
    return;
  end if;

  if p_tipo = 'electrificacion' then
    select count(*), count(*) filter (where decision is null)
      into v_total, v_pendientes
      from public.renglones_electrificacion where recibo_id = p_recibo_id;
    if v_total > 0 and v_pendientes = 0 then
      update public.recibos_electrificacion
        set estado = 'revisado', revisado_por = auth.uid(), revisado_en = now()
        where id = p_recibo_id and estado = 'pendiente';
    end if;
  elsif p_tipo in ('acabados', 'armado') then
    select count(*), count(*) filter (where decision is null)
      into v_total, v_pendientes
      from public.renglones where recibo_id = p_recibo_id;
    if v_total > 0 and v_pendientes = 0 then
      update public.recibos
        set estado = 'revisado', revisado_por = auth.uid(), revisado_en = now()
        where id = p_recibo_id and tipo = p_tipo and estado = 'pendiente';
    end if;
  end if;
end;
$function$;

revoke execute on function public.est_actualizar_estado_recibo(text, uuid) from public, anon;
grant execute on function public.est_actualizar_estado_recibo(text, uuid) to authenticated;
