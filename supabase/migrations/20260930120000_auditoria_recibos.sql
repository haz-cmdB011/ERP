-- Objetos que esta migración debe dejar en la base (los comprueba `npm run db:verificar`):
-- @verifica function public.auditar_recibos
-- @verifica trigger public.recibos.trg_auditar_recibos_borrado
-- @verifica trigger public.recibos.trg_auditar_recibos_estado
-- @verifica trigger public.recibos_electrificacion.trg_auditar_recibos_electrificacion_borrado
-- @verifica trigger public.recibos_electrificacion.trg_auditar_recibos_electrificacion_estado

-- ============================================================================
-- Auditoría de recibos de maquila (acabados, armado y electrificación).
--
-- Registra en public.auditoria, con quién lo hizo y cuándo:
--   * el borrado definitivo de un recibo (eliminar_recibo_definitivo), con un
--     resumen de lo que se borró: folio, tipo, contratista, obra, OT, estado,
--     número de renglones e importe total;
--   * los cambios de estado (cancelado, revisado, pagado, o vuelto a pendiente).
--
-- El borrado se registra ANTES de borrar (BEFORE DELETE) para poder contar los
-- renglones, que después caen en cascada. Los recibos no llevan FK desde
-- auditoria, así que el registro sobrevive al borrado. Solo lo escriben los
-- triggers (security definer): nadie puede editar ni borrar la bitácora.
-- ============================================================================

create or replace function public.auditar_recibos()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuario uuid := auth.uid();
  v_fila jsonb;
  v_tipo text;
  v_renglones integer := 0;
  v_total numeric := 0;
begin
  if tg_op = 'DELETE' then
    v_fila := to_jsonb(old);
    v_tipo := coalesce(v_fila->>'tipo', 'electrificacion');

    if tg_table_name = 'recibos_electrificacion' then
      select count(*), coalesce(sum(importe), 0) into v_renglones, v_total
        from public.renglones_electrificacion where recibo_id = old.id;
    else
      select count(*), coalesce(sum(importe), 0) into v_renglones, v_total
        from public.renglones where recibo_id = old.id;
    end if;

    insert into public.auditoria (usuario_id, tabla, registro_id, accion, detalle)
      values (v_usuario, tg_table_name, old.id, 'eliminado_definitivo',
              jsonb_build_object(
                'folio', v_fila->>'folio',
                'tipo', v_tipo,
                'contratista', v_fila->>'contratista',
                'obra', v_fila->>'obra',
                'ot', v_fila->>'ot',
                'estado', v_fila->>'estado',
                'renglones', v_renglones,
                'total', v_total));
    return old;
  end if;

  -- UPDATE de estado
  if old.estado is distinct from new.estado then
    v_fila := to_jsonb(new);
    insert into public.auditoria (usuario_id, tabla, registro_id, accion, detalle)
      values (v_usuario, tg_table_name, new.id, 'estado_' || new.estado,
              jsonb_build_object(
                'folio', v_fila->>'folio',
                'tipo', coalesce(v_fila->>'tipo', 'electrificacion'),
                'contratista', v_fila->>'contratista',
                'ot', v_fila->>'ot',
                'estado_anterior', old.estado));
  end if;
  return new;
end;
$$;

-- Función de trigger: no debe poder llamarse desde la API pública.
revoke execute on function public.auditar_recibos() from public, anon, authenticated;

create trigger trg_auditar_recibos_borrado
  before delete on public.recibos
  for each row execute function public.auditar_recibos();
create trigger trg_auditar_recibos_estado
  after update of estado on public.recibos
  for each row execute function public.auditar_recibos();

create trigger trg_auditar_recibos_electrificacion_borrado
  before delete on public.recibos_electrificacion
  for each row execute function public.auditar_recibos();
create trigger trg_auditar_recibos_electrificacion_estado
  after update of estado on public.recibos_electrificacion
  for each row execute function public.auditar_recibos();
