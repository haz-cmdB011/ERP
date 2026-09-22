-- Bitácora de auditoría: quién, qué y cuándo en los eventos que importan
-- (cancelar / revertir, papelera / restaurar, borrado definitivo, liberación a
-- producción, cambios de estado de revisión). Solo la escriben los triggers
-- (security definer); nadie puede editarla ni borrarla desde la app.
create table public.auditoria (
  id bigint generated always as identity primary key,
  en timestamptz not null default now(),
  -- Sin FK a propósito: el registro debe sobrevivir aunque se borre el usuario
  -- o el pedido/ítem al que se refiere.
  usuario_id uuid,
  tabla text not null,
  registro_id uuid not null,
  accion text not null,
  detalle jsonb not null default '{}'::jsonb
);
create index idx_auditoria_en on public.auditoria (en desc);
create index idx_auditoria_registro on public.auditoria (tabla, registro_id);

alter table public.auditoria enable row level security;
-- Solo lectura para desarrolladores y administradores de área.
create policy "admin_select_auditoria" on public.auditoria
  for select using (
    (select public.is_admin())
    or (select public.is_admin_area('planeacion'))
    or (select public.is_admin_area('produccion'))
    or (select public.is_admin_area('calidad'))
  );
revoke insert, update, delete on public.auditoria from anon, authenticated;

create or replace function public.auditar_cambios()
returns trigger language plpgsql security definer set search_path = '' as $$
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

  -- planeacion_items
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
$$;

-- Función de trigger: no debe poder llamarse desde la API pública.
revoke execute on function public.auditar_cambios() from public, anon, authenticated;

create trigger trg_auditar_pedidos
  after update or delete on public.pedidos
  for each row execute function public.auditar_cambios();

create trigger trg_auditar_planeacion_items
  after update or delete on public.planeacion_items
  for each row execute function public.auditar_cambios();
