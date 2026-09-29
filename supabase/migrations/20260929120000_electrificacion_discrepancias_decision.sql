-- ============================================================================
-- Electrificación — conciliación por OT + modelo contra el PM, y decisión del
-- administrador sobre los descuadres.
--
-- 1. La conciliación pasa a ser por OT + modelo, no por una fila del PM: en un
--    mismo pedido el mismo modelo aparece en muchas filas de planeacion_items
--    (una por mueble), así que "lo declarado" es la SUMA de cantidad_total de
--    esas filas (versión activa, sin canceladas ni eliminaciones solicitadas).
--    Lo capturado es la suma de los renglones de recibos no cancelados de esa
--    OT con ese modelo. El recibo debe llevar una OT que exista en el PM; los
--    renglones guardan `pedido_id` (la columna planeacion_item_id queda sin
--    uso). Si el modelo no existe en esa OT, o la suma no cuadra, se exige
--    motivo y se registra la discrepancia.
-- 2. discrepancias_electrificacion gana `estado` (pendiente / aceptada /
--    rechazada). Aceptada: el motivo es válido y el proceso sigue. Rechazada:
--    queda el reporte con la nota del administrador, visible para quien
--    capturó el recibo. No bloquea la revisión ni el pago del recibo.
-- 3. Deciden el desarrollador y el administrador de Estimaciones. Quien
--    capturó puede ver sus propias discrepancias. Nadie escribe la tabla
--    directamente: solo las funciones.
-- 4. CORRECCIÓN: guardar_recibo_electrificacion era `security invoker` pero
--    inserta en discrepancias_electrificacion, donde authenticated no tiene
--    INSERT: cualquier captura con descuadre fallaba con "permission denied".
--    Ahora es `security definer` (como modificar_recibo_electrificacion) y
--    conserva sus validaciones de rol.
-- 5. CORRECCIÓN: el acumulado contaba también los renglones de recibos
--    cancelados; ahora los excluye.
-- 6. Catálogos para el generador: todas las OT subidas al PM y los modelos de
--    cada una (sin precios ni datos de cliente).
-- ============================================================================

alter table public.renglones_electrificacion
  add column pedido_id uuid references public.pedidos(id);
create index idx_renglones_electrificacion_pedido_modelo
  on public.renglones_electrificacion (pedido_id)
  where pedido_id is not null;

-- ---------------------------------------------------------------------------
-- Ayudantes (solo los usan las funciones de abajo, que corren como su dueño).
-- ---------------------------------------------------------------------------
create or replace function public.norm_modelo(p_modelo text)
returns text
language sql
immutable
set search_path = ''
as $$
  select upper(regexp_replace(btrim(coalesce(p_modelo, '')), '\s+', ' ', 'g'));
$$;

-- Lo que Planeación declaró para ese modelo en esa OT; null si no existe.
create or replace function public.cantidad_pm_modelo(p_pedido uuid, p_modelo text)
returns numeric
language sql
stable
set search_path = ''
as $$
  select sum(pi.cantidad_total)
  from public.planeacion_items pi
  join public.pedido_versiones pv on pv.id = pi.pedido_version_id and pv.es_version_activa
  where pv.pedido_id = p_pedido
    and public.norm_modelo(pi.modelo) = public.norm_modelo(p_modelo)
    and (pi.estado_revision is null or pi.estado_revision <> 'cancelado')
    and pi.eliminacion_solicitada_en is null;
$$;

-- Lo ya capturado en recibos no cancelados para ese modelo en esa OT.
create or replace function public.cantidad_registrada_modelo(
  p_pedido uuid, p_modelo text, p_excluir_recibo uuid default null
)
returns numeric
language sql
stable
set search_path = ''
as $$
  select coalesce(sum(re.cantidad), 0)
  from public.renglones_electrificacion re
  join public.recibos_electrificacion rc on rc.id = re.recibo_id
  where re.pedido_id = p_pedido
    and public.norm_modelo(re.modelo) = public.norm_modelo(p_modelo)
    and rc.estado <> 'cancelado'
    and (p_excluir_recibo is null or rc.id <> p_excluir_recibo);
$$;

-- Pedido activo (no eliminado) con ese número de OT.
create or replace function public.pedido_id_por_ot(p_ot text)
returns uuid
language plpgsql
stable
set search_path = ''
as $$
declare
  v_ids uuid[];
begin
  select array_agg(id) into v_ids
    from public.pedidos
    where numero_pedido = btrim(coalesce(p_ot, '')) and eliminado_en is null;
  if v_ids is null then
    raise exception 'La OT % no está en el PM de Planeación; elige una de la lista.', p_ot;
  end if;
  if array_length(v_ids, 1) > 1 then
    raise exception 'La OT % está repetida en el PM; avisa a Planeación.', p_ot;
  end if;
  return v_ids[1];
end;
$$;

revoke execute on function public.cantidad_pm_modelo(uuid, text) from public, anon, authenticated;
revoke execute on function public.cantidad_registrada_modelo(uuid, text, uuid) from public, anon, authenticated;
revoke execute on function public.pedido_id_por_ot(text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Catálogos para el generador de recibos. security definer porque el
-- maquilador no tiene SELECT directo sobre el PM.
-- ---------------------------------------------------------------------------
drop function public.buscar_items_pm_electrificacion(text, text);

create or replace function public.listar_ots_pm_electrificacion()
returns table (
  pedido_id uuid,
  numero_pedido text,
  proyecto text,
  num_modelos bigint,
  piezas numeric
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (public.is_estimaciones() or public.is_maquilador()) then
    raise exception 'No tienes permiso para consultar el PM de Planeación.';
  end if;

  return query
    select p.id, p.numero_pedido, pr.nombre,
      count(distinct public.norm_modelo(pi.modelo)) filter (where btrim(coalesce(pi.modelo, '')) <> ''),
      coalesce(sum(pi.cantidad_total), 0)
    from public.pedidos p
    join public.pedido_versiones pv on pv.pedido_id = p.id and pv.es_version_activa
    left join public.proyectos pr on pr.id = p.proyecto_id
    left join public.planeacion_items pi
      on pi.pedido_version_id = pv.id
      and (pi.estado_revision is null or pi.estado_revision <> 'cancelado')
      and pi.eliminacion_solicitada_en is null
    where p.eliminado_en is null
    group by p.id, p.numero_pedido, pr.nombre
    order by p.numero_pedido;
end;
$$;
revoke execute on function public.listar_ots_pm_electrificacion() from public, anon;
grant execute on function public.listar_ots_pm_electrificacion() to authenticated;

-- Modelos de una OT con lo declarado y lo ya registrado en otros recibos.
-- p_excluir_recibo: al modificar un recibo, no contar sus propios renglones.
create or replace function public.listar_modelos_pm_electrificacion(
  p_pedido uuid,
  p_excluir_recibo uuid default null
)
returns table (
  modelo text,
  cantidad_pm numeric,
  cantidad_registrada numeric
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (public.is_estimaciones() or public.is_maquilador()) then
    raise exception 'No tienes permiso para consultar el PM de Planeación.';
  end if;

  return query
    select min(pi.modelo), sum(pi.cantidad_total),
      public.cantidad_registrada_modelo(p_pedido, min(pi.modelo), p_excluir_recibo)
    from public.planeacion_items pi
    join public.pedido_versiones pv on pv.id = pi.pedido_version_id and pv.es_version_activa
    join public.pedidos p on p.id = pv.pedido_id and p.eliminado_en is null
    where pv.pedido_id = p_pedido
      and btrim(coalesce(pi.modelo, '')) <> ''
      and (pi.estado_revision is null or pi.estado_revision <> 'cancelado')
      and pi.eliminacion_solicitada_en is null
    group by public.norm_modelo(pi.modelo)
    order by min(pi.modelo);
end;
$$;
revoke execute on function public.listar_modelos_pm_electrificacion(uuid, uuid) from public, anon;
grant execute on function public.listar_modelos_pm_electrificacion(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Estado de la discrepancia
-- ---------------------------------------------------------------------------
alter table public.discrepancias_electrificacion
  add column estado text not null default 'pendiente'
    check (estado in ('pendiente', 'aceptada', 'rechazada'));

update public.discrepancias_electrificacion set estado = 'aceptada' where resuelta;

drop index if exists public.idx_discrepancias_electrificacion_pendientes;
create index idx_discrepancias_electrificacion_estado
  on public.discrepancias_electrificacion (estado, creado_en desc);

-- ---------------------------------------------------------------------------
-- Acceso: aprobadores ven todo; quien capturó ve las suyas. Sin UPDATE directo.
-- ---------------------------------------------------------------------------
create or replace function public.puede_decidir_discrepancias()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_admin() or public.is_admin_area('estimaciones'::public.area_tipo);
$$;
revoke execute on function public.puede_decidir_discrepancias() from public, anon;
grant execute on function public.puede_decidir_discrepancias() to authenticated;

drop policy "admin_select_discrepancias_electrificacion" on public.discrepancias_electrificacion;
drop policy "admin_update_discrepancias_electrificacion" on public.discrepancias_electrificacion;

create policy "select_discrepancias_electrificacion"
  on public.discrepancias_electrificacion
  for select using (
    (select public.puede_decidir_discrepancias()) or creado_por = (select auth.uid())
  );

revoke update on public.discrepancias_electrificacion from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Decidir: reemplaza a resolver_discrepancia_electrificacion(uuid, text).
-- ---------------------------------------------------------------------------
drop function public.resolver_discrepancia_electrificacion(uuid, text);

create or replace function public.decidir_discrepancia_electrificacion(
  p_id uuid,
  p_decision text,
  p_nota text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_nota text := nullif(btrim(coalesce(p_nota, '')), '');
  v_estado text;
begin
  if not public.puede_decidir_discrepancias() then
    raise exception 'Solo el administrador de Estimaciones o un desarrollador puede decidir discrepancias.';
  end if;
  if p_decision not in ('aceptada', 'rechazada') then
    raise exception 'Decisión no válida.';
  end if;
  if p_decision = 'rechazada' and v_nota is null then
    raise exception 'Para rechazar el motivo hay que explicar por qué no se acepta.';
  end if;

  select estado into v_estado from public.discrepancias_electrificacion where id = p_id;
  if v_estado is null then
    raise exception 'Discrepancia no encontrada.';
  end if;
  if v_estado <> 'pendiente' then
    raise exception 'Esta discrepancia ya fue %.', v_estado;
  end if;

  update public.discrepancias_electrificacion set
    estado = p_decision,
    resuelta = true,
    resuelta_por = auth.uid(),
    resuelta_en = now(),
    nota_resolucion = v_nota
  where id = p_id;
end;
$$;
revoke execute on function public.decidir_discrepancia_electrificacion(uuid, text, text) from public, anon;
grant execute on function public.decidir_discrepancia_electrificacion(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- guardar_recibo_electrificacion: igual que antes, pero security definer, con
-- la OT obligatoria del PM y la conciliación por OT + modelo.
-- ---------------------------------------------------------------------------
create or replace function public.guardar_recibo_electrificacion(
  p_folio text, p_fecha_recibo date, p_contratista text, p_obra text, p_ot text,
  p_prioridad public.est_prioridad, p_motivo_prioridad text, p_renglones jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_maq boolean := public.is_maquilador();
  v_contratista text := p_contratista;
  v_recibo_id uuid;
  v_renglon_id uuid;
  v_estado text;
  v_siguiente_numero integer;
  v_num_charola integer;
  v_aceptado numeric;
  v_propuesto numeric;
  v_pedido_id uuid;
  v_cantidad_pm numeric;
  v_cantidad_acumulada numeric;
  v_motivo_descuadre text;
  r jsonb;
  c jsonb;
begin
  if not (public.is_estimaciones() or v_maq) then
    raise exception 'No tienes permiso para capturar recibos de Estimaciones.';
  end if;
  if p_renglones is null or jsonb_array_length(p_renglones) = 0 then
    raise exception 'El recibo no tiene renglones.';
  end if;
  if v_maq then
    v_contratista := public.mi_contratista();
  end if;
  v_pedido_id := public.pedido_id_por_ot(p_ot);

  select id, estado into v_recibo_id, v_estado
    from public.recibos_electrificacion where folio = p_folio and estado <> 'cancelado';

  if v_recibo_id is null then
    begin
      insert into public.recibos_electrificacion (
        folio, fecha_recibo, contratista, obra, ot, prioridad, motivo_prioridad, capturado_por
      ) values (
        p_folio, p_fecha_recibo, v_contratista, nullif(p_obra, ''), btrim(p_ot),
        p_prioridad, nullif(p_motivo_prioridad, ''), auth.uid()
      )
      returning id into v_recibo_id;
    exception when unique_violation then
      raise exception 'El folio % ya está registrado.', p_folio;
    end;
    v_siguiente_numero := 1;
  else
    if v_estado in ('pagado') or (v_maq and v_estado <> 'pendiente') then
      raise exception 'El folio % ya fue %; no se le pueden agregar renglones.', p_folio, v_estado;
    end if;
    select coalesce(max(numero), 0) + 1 into v_siguiente_numero
      from public.renglones_electrificacion where recibo_id = v_recibo_id;
  end if;

  for r in select * from jsonb_array_elements(p_renglones)
  loop
    v_propuesto := (r->>'propuesto')::numeric;
    v_aceptado := case when v_maq then 0 else (r->>'aceptado')::numeric end;

    insert into public.renglones_electrificacion (
      recibo_id, numero, modelo, cantidad, metros_led, complejidad_led, pu_sugerido,
      fuente_sugerido, pu_propuesto, pu_aceptado, banda, justificacion, nota, decision,
      pedido_id
    ) values (
      v_recibo_id,
      v_siguiente_numero,
      r->>'modelo',
      coalesce((r->>'cantidad')::numeric, 1),
      coalesce((r->>'metrosLed')::numeric, 0),
      nullif(r->>'complejidadLed', '')::public.est_complejidad_led,
      case when v_maq then null else nullif(r->>'puSugerido', '')::numeric end,
      case when v_maq then 'manual' else r->>'fuente' end,
      v_propuesto,
      v_aceptado,
      case when v_maq then null else (r->>'banda')::public.est_banda end,
      case when v_maq then null else nullif(r->>'justificacion', '') end,
      nullif(r->>'nota', ''),
      case
        when v_maq or (v_aceptado = 0 and v_propuesto > 0) then null
        when v_aceptado = v_propuesto then 'aceptado'
        else 'modificado'
      end,
      v_pedido_id
    )
    returning id into v_renglon_id;

    v_num_charola := 1;
    for c in select * from jsonb_array_elements(coalesce(r->'charolas', '[]'::jsonb))
    loop
      insert into public.charolas_electrificacion (renglon_id, numero, drivers)
      values (v_renglon_id, v_num_charola, (c->>'drivers')::integer);
      v_num_charola := v_num_charola + 1;
    end loop;

    -- Conciliación por OT + modelo (ver comentario al inicio del archivo).
    v_cantidad_pm := public.cantidad_pm_modelo(v_pedido_id, r->>'modelo');
    v_cantidad_acumulada := public.cantidad_registrada_modelo(v_pedido_id, r->>'modelo');

    v_motivo_descuadre := nullif(btrim(coalesce(r->>'motivoDescuadre', '')), '');
    if v_cantidad_pm is null or v_cantidad_acumulada <> v_cantidad_pm then
      if v_motivo_descuadre is null then
        raise exception
          'Renglón %: la cantidad no cuadra con el PM (o el modelo no está en la OT); captura el motivo.',
          v_siguiente_numero;
      end if;
      insert into public.discrepancias_electrificacion (
        renglon_id, recibo_id, planeacion_item_id, modelo, cantidad_capturada,
        cantidad_acumulada, cantidad_pm, motivo, creado_por
      ) values (
        v_renglon_id, v_recibo_id, null, r->>'modelo',
        coalesce((r->>'cantidad')::numeric, 1), v_cantidad_acumulada, v_cantidad_pm,
        v_motivo_descuadre, auth.uid()
      );
    end if;

    v_siguiente_numero := v_siguiente_numero + 1;
  end loop;

  perform public.est_actualizar_estado_recibo('electrificacion', v_recibo_id);
  return v_recibo_id;
end;
$$;
revoke execute on function public.guardar_recibo_electrificacion(
  text, date, text, text, text, public.est_prioridad, text, jsonb) from public, anon;
grant execute on function public.guardar_recibo_electrificacion(
  text, date, text, text, text, public.est_prioridad, text, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- modificar_recibo_electrificacion: igual que antes, con la OT del PM y la
-- misma conciliación por OT + modelo.
-- ---------------------------------------------------------------------------
create or replace function public.modificar_recibo_electrificacion(
  p_recibo_id uuid,
  p_fecha_recibo date,
  p_obra text,
  p_ot text,
  p_prioridad public.est_prioridad,
  p_motivo_prioridad text,
  p_renglones jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_capturado_por uuid;
  v_estado text;
  v_decididos integer;
  v_numero integer := 1;
  v_num_charola integer;
  v_renglon_id uuid;
  v_pedido_id uuid;
  v_cantidad_pm numeric;
  v_cantidad_acumulada numeric;
  v_motivo_descuadre text;
  r jsonb;
  c jsonb;
begin
  if not public.is_maquilador() then
    raise exception 'Solo el maquilador que capturó el recibo puede modificarlo.';
  end if;
  if p_renglones is null or jsonb_array_length(p_renglones) = 0 then
    raise exception 'El recibo no tiene renglones.';
  end if;

  select capturado_por, estado into v_capturado_por, v_estado
    from public.recibos_electrificacion where id = p_recibo_id;
  if v_estado is null or v_capturado_por is distinct from auth.uid() then
    raise exception 'Recibo no encontrado.';
  end if;
  if v_estado <> 'pendiente' then
    raise exception 'Solo se puede modificar un recibo pendiente de revisión.';
  end if;

  select count(*) into v_decididos from public.renglones_electrificacion
    where recibo_id = p_recibo_id and decision is not null;
  if v_decididos > 0 then
    raise exception 'Este recibo ya está en revisión; pide al personal de Estimaciones que lo corrija.';
  end if;

  v_pedido_id := public.pedido_id_por_ot(p_ot);

  update public.recibos_electrificacion set
    fecha_recibo = p_fecha_recibo,
    obra = nullif(p_obra, ''),
    ot = btrim(p_ot),
    prioridad = p_prioridad,
    motivo_prioridad = nullif(p_motivo_prioridad, '')
  where id = p_recibo_id;

  -- Borra también las discrepancias del recibo (cascade): se vuelven a evaluar
  -- con lo que se guarda ahora.
  delete from public.renglones_electrificacion where recibo_id = p_recibo_id;

  for r in select * from jsonb_array_elements(p_renglones)
  loop
    insert into public.renglones_electrificacion (
      recibo_id, numero, modelo, cantidad, metros_led, complejidad_led, pu_sugerido,
      fuente_sugerido, pu_propuesto, pu_aceptado, banda, justificacion, nota, decision,
      pedido_id
    ) values (
      p_recibo_id,
      v_numero,
      r->>'modelo',
      coalesce((r->>'cantidad')::numeric, 1),
      coalesce((r->>'metrosLed')::numeric, 0),
      nullif(r->>'complejidadLed', '')::public.est_complejidad_led,
      null,
      'manual',
      (r->>'propuesto')::numeric,
      0,
      null,
      null,
      nullif(r->>'nota', ''),
      null,
      v_pedido_id
    )
    returning id into v_renglon_id;

    v_num_charola := 1;
    for c in select * from jsonb_array_elements(coalesce(r->'charolas', '[]'::jsonb))
    loop
      insert into public.charolas_electrificacion (renglon_id, numero, drivers)
      values (v_renglon_id, v_num_charola, (c->>'drivers')::integer);
      v_num_charola := v_num_charola + 1;
    end loop;

    v_cantidad_pm := public.cantidad_pm_modelo(v_pedido_id, r->>'modelo');
    v_cantidad_acumulada := public.cantidad_registrada_modelo(v_pedido_id, r->>'modelo');

    v_motivo_descuadre := nullif(btrim(coalesce(r->>'motivoDescuadre', '')), '');
    if v_cantidad_pm is null or v_cantidad_acumulada <> v_cantidad_pm then
      if v_motivo_descuadre is null then
        raise exception
          'Renglón %: la cantidad no cuadra con el PM (o el modelo no está en la OT); captura el motivo.',
          v_numero;
      end if;
      insert into public.discrepancias_electrificacion (
        renglon_id, recibo_id, planeacion_item_id, modelo, cantidad_capturada,
        cantidad_acumulada, cantidad_pm, motivo, creado_por
      ) values (
        v_renglon_id, p_recibo_id, null, r->>'modelo',
        coalesce((r->>'cantidad')::numeric, 1), v_cantidad_acumulada, v_cantidad_pm,
        v_motivo_descuadre, auth.uid()
      );
    end if;

    v_numero := v_numero + 1;
  end loop;
end;
$$;
