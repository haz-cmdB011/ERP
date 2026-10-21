-- Objetos que esta migración debe dejar en la base (los comprueba `npm run db:verificar`):
-- (Los quita 20261021172225_quitar_salidas_obra: la salida a obra se probó y no se usa; por eso
-- este archivo ya no declara @verifica.)

-- ============================================================================
-- Salida a obra: Producción escanea el QR del mueble al cargar el camión y anota
-- cuántas piezas salen en ese viaje (3 de 7), con la fecha y una nota opcional
-- (camión, remisión).
--
--   * Solo sale lo que la revisión final de Calidad ya aprobó: aprobadas en la
--     revisión final − lo que ya salió. Con la revisión final apagada no hay
--     nada liberado a obra y no se registra.
--   * Solo muebles padre, de la versión activa, sin cancelar.
--   * Por ahora solo la salida de planta, no la recepción en obra.
--   * Una salida capturada por error la anula el administrador de Producción
--     (o el desarrollador), con motivo; no se borra.
--   * Sin políticas de escritura: solo entra por registrar_salida_obra y
--     anular_salida_obra. Cada alta y anulación queda en la auditoría.
-- ============================================================================

create table public.salidas_obra (
  id uuid primary key default gen_random_uuid(),
  planeacion_item_id uuid not null references public.planeacion_items(id) on delete cascade,
  cantidad numeric not null,
  fecha_salida date not null,
  notas text,
  registrado_por uuid references auth.users(id) default auth.uid(),
  registrado_en timestamptz not null default now(),
  anulada_en timestamptz,
  anulada_por uuid references auth.users(id),
  motivo_anulacion text,
  constraint salidas_obra_cantidad_check check (cantidad > 0),
  constraint salidas_obra_notas_check check (notas is null or char_length(notas) <= 300),
  constraint salidas_obra_anulacion_check check (
    anulada_en is null or nullif(btrim(coalesce(motivo_anulacion, '')), '') is not null
  )
);
create index idx_salidas_obra_item on public.salidas_obra (planeacion_item_id);
create index idx_salidas_obra_registrado_por on public.salidas_obra (registrado_por);
create index idx_salidas_obra_anulada_por on public.salidas_obra (anulada_por);

alter table public.salidas_obra enable row level security;
create policy "select_salidas_obra" on public.salidas_obra
  for select to authenticated using ((select public.is_staff()));

-- Registrar ------------------------------------------------------------------------
create or replace function public.registrar_salida_obra(
  p_item_id uuid,
  p_cantidad numeric,
  p_fecha date default null,
  p_notas text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item record;
  v_cantidad numeric := coalesce(p_cantidad, 0);
  v_fecha date := coalesce(p_fecha, (now() at time zone 'America/Mexico_City')::date);
  v_notas text := nullif(btrim(coalesce(p_notas, '')), '');
  v_aprobadas numeric;
  v_salido numeric;
  v_id uuid;
begin
  if not public.is_produccion() then
    raise exception 'No tienes permiso para registrar salidas a obra.';
  end if;
  if not public.revision_final_activa() then
    raise exception 'La revisión final está apagada: no hay nada liberado a obra.';
  end if;
  if v_cantidad <= 0 then
    raise exception 'La cantidad debe ser mayor que cero.';
  end if;
  if v_fecha > (now() at time zone 'America/Mexico_City')::date then
    raise exception 'La fecha de salida no puede ser futura.';
  end if;
  if v_notas is not null and char_length(v_notas) > 300 then
    raise exception 'La nota es muy larga (máximo 300 caracteres).';
  end if;

  -- Bloquea el mueble: dos salidas a la vez no pasan juntas de lo liberado.
  select pi.id, pi.tipo_registro, pi.estado_revision, pi.eliminacion_solicitada_en,
         pv.es_version_activa, p.eliminado_en, p.cancelado_en
    into v_item
    from public.planeacion_items pi
    join public.pedido_versiones pv on pv.id = pi.pedido_version_id
    join public.pedidos p on p.id = pv.pedido_id
    where pi.id = p_item_id
    for update of pi;
  if not found then
    raise exception 'El ítem no existe.';
  end if;
  if v_item.tipo_registro <> 'MO' then
    raise exception 'La salida a obra es de los muebles (ítems padre), no de sus componentes.';
  end if;
  if not v_item.es_version_activa
     or v_item.estado_revision = 'cancelado'
     or v_item.eliminacion_solicitada_en is not null
     or v_item.eliminado_en is not null
     or v_item.cancelado_en is not null then
    raise exception 'El mueble o su PM está cancelado, eliminado o es de una versión anterior.';
  end if;

  select coalesce(sum(r.cantidad) filter (where r.aprobado), 0)
    into v_aprobadas
    from public.revisiones_finales_calidad r
    where r.planeacion_item_id = p_item_id;
  select coalesce(sum(s.cantidad), 0)
    into v_salido
    from public.salidas_obra s
    where s.planeacion_item_id = p_item_id and s.anulada_en is null;
  if v_cantidad > v_aprobadas - v_salido then
    raise exception 'Solo hay % pieza(s) liberadas a obra que no han salido.', greatest(v_aprobadas - v_salido, 0);
  end if;

  insert into public.salidas_obra (planeacion_item_id, cantidad, fecha_salida, notas)
    values (p_item_id, v_cantidad, v_fecha, v_notas)
    returning id into v_id;
  return v_id;
end;
$$;

revoke execute on function public.registrar_salida_obra(uuid, numeric, date, text) from public, anon;
grant execute on function public.registrar_salida_obra(uuid, numeric, date, text) to authenticated;

-- Anular ---------------------------------------------------------------------------
create or replace function public.anular_salida_obra(p_salida_id uuid, p_motivo text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
begin
  if not public.is_admin_area('produccion') then
    raise exception 'Solo el administrador de Producción puede anular una salida a obra.';
  end if;
  if v_motivo is null then
    raise exception 'Indica el motivo de la anulación.';
  end if;
  update public.salidas_obra
     set anulada_en = now(), anulada_por = auth.uid(), motivo_anulacion = v_motivo
   where id = p_salida_id and anulada_en is null;
  if not found then
    raise exception 'La salida no existe o ya estaba anulada.';
  end if;
end;
$$;

revoke execute on function public.anular_salida_obra(uuid, text) from public, anon;
grant execute on function public.anular_salida_obra(uuid, text) to authenticated;

-- Auditoría ------------------------------------------------------------------------
create or replace function public.auditar_salidas_obra()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item record;
begin
  select pi.item_code, pi.modelo, p.numero_pedido
    into v_item
    from public.planeacion_items pi
    join public.pedido_versiones pv on pv.id = pi.pedido_version_id
    join public.pedidos p on p.id = pv.pedido_id
    where pi.id = new.planeacion_item_id;
  if tg_op = 'INSERT' then
    insert into public.auditoria (usuario_id, tabla, registro_id, accion, detalle)
      values (auth.uid(), tg_table_name, new.id, 'salida_obra',
              jsonb_build_object(
                'numero_pedido', v_item.numero_pedido, 'item_code', v_item.item_code, 'modelo', v_item.modelo,
                'cantidad', new.cantidad, 'fecha', new.fecha_salida, 'notas', new.notas
              ));
  elsif old.anulada_en is null and new.anulada_en is not null then
    insert into public.auditoria (usuario_id, tabla, registro_id, accion, detalle)
      values (auth.uid(), tg_table_name, new.id, 'salida_obra_anulada',
              jsonb_build_object(
                'numero_pedido', v_item.numero_pedido, 'item_code', v_item.item_code, 'modelo', v_item.modelo,
                'cantidad', new.cantidad, 'motivo', new.motivo_anulacion
              ));
  end if;
  return new;
end;
$$;

-- Función de trigger: no debe poder llamarse desde la API pública.
revoke execute on function public.auditar_salidas_obra() from public, anon, authenticated;

create trigger trg_auditar_salidas_obra
  after insert or update on public.salidas_obra
  for each row execute function public.auditar_salidas_obra();
