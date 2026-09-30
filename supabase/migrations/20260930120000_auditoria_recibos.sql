-- RECONSTRUIDA. Esta migración se aplicó en producción el 2026-09-30 pero su
-- archivo nunca se subió al repo (y Supabase no guardó su SQL). Se rehízo
-- comparando la base de producción contra lo que producen las demás
-- migraciones del repo: lo que está aquí deja una base nueva igual a
-- producción. El reparto exacto entre esta y 20260930130000 es una
-- suposición por el nombre de cada una.
--
-- Auditoría de recibos de Estimaciones: registra en public.auditoria cada
-- cambio de estado (pendiente → revisado → pagado, cancelado) y cada
-- eliminación definitiva, con folio, tipo, contratista, OT, número de
-- renglones y total del recibo borrado.

create or replace function public.auditar_recibos()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
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
$function$;

-- Solo la usan los triggers: nadie la llama por /rest/v1/rpc.
revoke execute on function public.auditar_recibos() from public, anon, authenticated;

-- BEFORE DELETE: los renglones todavía existen para contarlos y sumarlos.
drop trigger if exists trg_auditar_recibos_borrado on public.recibos;
create trigger trg_auditar_recibos_borrado
  before delete on public.recibos
  for each row execute function public.auditar_recibos();

drop trigger if exists trg_auditar_recibos_estado on public.recibos;
create trigger trg_auditar_recibos_estado
  after update of estado on public.recibos
  for each row execute function public.auditar_recibos();

drop trigger if exists trg_auditar_recibos_electrificacion_borrado on public.recibos_electrificacion;
create trigger trg_auditar_recibos_electrificacion_borrado
  before delete on public.recibos_electrificacion
  for each row execute function public.auditar_recibos();

drop trigger if exists trg_auditar_recibos_electrificacion_estado on public.recibos_electrificacion;
create trigger trg_auditar_recibos_electrificacion_estado
  after update of estado on public.recibos_electrificacion
  for each row execute function public.auditar_recibos();

-- auditar_cambios se volvió a crear sin cambios de lógica (solo sin el
-- comentario "-- planeacion_items"); se deja igual a producción.
create or replace function public.auditar_cambios()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_usuario uuid := auth.uid();
begin
  if tg_table_name = 'pedidos' then
    if tg_op = 'DELETE' then
      insert into public.auditoria (usuario_id, tabla, registro_id, accion, detalle)
        values (v_usuario, 'pedidos', old.id, 'eliminado_definitivo',
                jsonb_build_object('numero_pedido', old.numero_pedido));
      return old;
    end if;

    if old.cancelado_en is distinct from new.cancelado_en then
      insert into public.auditoria (usuario_id, tabla, registro_id, accion, detalle)
        values (v_usuario, 'pedidos', new.id,
                case when new.cancelado_en is not null then 'cancelado' else 'cancelacion_revertida' end,
                jsonb_build_object('numero_pedido', new.numero_pedido,
                                   'motivo', new.motivo_cancelacion));
    end if;
    if old.eliminado_en is distinct from new.eliminado_en then
      insert into public.auditoria (usuario_id, tabla, registro_id, accion, detalle)
        values (v_usuario, 'pedidos', new.id,
                case when new.eliminado_en is not null then 'enviado_a_papelera' else 'restaurado' end,
                jsonb_build_object('numero_pedido', new.numero_pedido));
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    insert into public.auditoria (usuario_id, tabla, registro_id, accion, detalle)
      values (v_usuario, 'planeacion_items', old.id, 'eliminado_definitivo',
              jsonb_build_object('item_code', old.item_code, 'modelo', old.modelo));
    return old;
  end if;

  if old.estado_revision is distinct from new.estado_revision then
    insert into public.auditoria (usuario_id, tabla, registro_id, accion, detalle)
      values (v_usuario, 'planeacion_items', new.id,
              'revision_' || coalesce(new.estado_revision, 'normal'),
              jsonb_build_object('item_code', new.item_code, 'modelo', new.modelo,
                                 'motivo', new.motivo_cancelacion));
  end if;
  if old.eliminacion_solicitada_en is distinct from new.eliminacion_solicitada_en then
    insert into public.auditoria (usuario_id, tabla, registro_id, accion, detalle)
      values (v_usuario, 'planeacion_items', new.id,
              case when new.eliminacion_solicitada_en is not null then 'enviado_a_papelera' else 'restaurado' end,
              jsonb_build_object('item_code', new.item_code, 'modelo', new.modelo));
  end if;
  if old.estado_liberacion is distinct from new.estado_liberacion then
    insert into public.auditoria (usuario_id, tabla, registro_id, accion, detalle)
      values (v_usuario, 'planeacion_items', new.id,
              'liberacion_' || new.estado_liberacion,
              jsonb_build_object('item_code', new.item_code, 'modelo', new.modelo));
  end if;
  return new;
end;
$function$;

revoke execute on function public.auditar_cambios() from public, anon, authenticated;
