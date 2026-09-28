-- ============================================================================
-- Electrificación — conciliar cantidades contra el PM de Planeación.
--
-- Al capturar un renglón se puede vincular su modelo a un ítem real del PM
-- (planeacion_items). Si se vincula, se compara la cantidad ACUMULADA de
-- todos los renglones que alguna vez se hayan vinculado a ese ítem (de
-- cualquier recibo, no solo el actual, porque un mueble se puede cobrar en
-- varios recibos parciales) contra planeacion_items.cantidad_total. Si no
-- coincide, o si no se encontró ningún ítem con el que vincular, se exige un
-- motivo y queda registrado en `discrepancias_electrificacion` para que los
-- desarrolladores lo revisen en /admin.
-- ============================================================================

alter table public.renglones_electrificacion
  add column planeacion_item_id uuid references public.planeacion_items(id);
create index idx_renglones_electrificacion_planeacion_item
  on public.renglones_electrificacion (planeacion_item_id)
  where planeacion_item_id is not null;

-- ---------------------------------------------------------------------------
-- Bandeja de discrepancias: solo se guarda una fila cuando algo NO cuadra
-- (o no se encontró el ítem). Nada la inserta salvo las funciones de guardado
-- (security definer); solo los desarrolladores la leen y la resuelven.
-- ---------------------------------------------------------------------------
create table public.discrepancias_electrificacion (
  id uuid primary key default gen_random_uuid(),
  renglon_id uuid not null references public.renglones_electrificacion(id) on delete cascade,
  recibo_id uuid not null references public.recibos_electrificacion(id) on delete cascade,
  planeacion_item_id uuid references public.planeacion_items(id) on delete set null,
  modelo text not null,
  cantidad_capturada numeric(12, 2) not null,
  cantidad_acumulada numeric(12, 2),
  cantidad_pm numeric(12, 2),
  motivo text not null,
  creado_por uuid not null references auth.users(id),
  creado_en timestamptz not null default now(),
  resuelta boolean not null default false,
  resuelta_por uuid references auth.users(id),
  resuelta_en timestamptz,
  nota_resolucion text
);
create index idx_discrepancias_electrificacion_pendientes
  on public.discrepancias_electrificacion (resuelta, creado_en desc);

alter table public.discrepancias_electrificacion enable row level security;

create policy "admin_select_discrepancias_electrificacion"
  on public.discrepancias_electrificacion
  for select using ((select public.is_admin()));

create policy "admin_update_discrepancias_electrificacion"
  on public.discrepancias_electrificacion
  for update using ((select public.is_admin())) with check ((select public.is_admin()));

-- Solo las insertan guardar_recibo_electrificacion / modificar_recibo_electrificacion
-- (security definer); nadie más tiene INSERT ni DELETE.
revoke insert, update, delete on public.discrepancias_electrificacion from anon, authenticated;
grant update on public.discrepancias_electrificacion to authenticated;

-- ---------------------------------------------------------------------------
-- Buscar ítems del PM por modelo (y opcionalmente por número de pedido/OT),
-- para el autocompletar de captura. Solo trae lo necesario para vincular:
-- nunca precios ni datos de cliente. security definer porque el maquilador
-- no tiene SELECT directo sobre planeacion_items.
-- ---------------------------------------------------------------------------
create or replace function public.buscar_items_pm_electrificacion(
  p_modelo text,
  p_ot text default null
)
returns table (
  id uuid,
  modelo text,
  descripcion text,
  cantidad_total numeric,
  numero_pedido text,
  proyecto text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (public.is_estimaciones() or public.is_maquilador()) then
    raise exception 'No tienes permiso para buscar en el PM de Planeación.';
  end if;
  if btrim(coalesce(p_modelo, '')) = '' then
    return;
  end if;

  return query
    select pi.id, pi.modelo, pi.descripcion, pi.cantidad_total, p.numero_pedido, pr.nombre
    from public.planeacion_items pi
    join public.pedido_versiones pv
      on pv.id = pi.pedido_version_id and pv.es_version_activa
    join public.pedidos p
      on p.id = pv.pedido_id and p.eliminado_en is null
    left join public.proyectos pr on pr.id = p.proyecto_id
    where pi.modelo ilike ('%' || p_modelo || '%')
      and (pi.estado_revision is null or pi.estado_revision <> 'cancelado')
      and pi.eliminacion_solicitada_en is null
      and (p_ot is null or btrim(p_ot) = '' or p.numero_pedido ilike ('%' || p_ot || '%'))
    order by pi.modelo
    limit 20;
end;
$$;
revoke execute on function public.buscar_items_pm_electrificacion(text, text) from public, anon;
grant execute on function public.buscar_items_pm_electrificacion(text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- guardar_recibo_electrificacion: mismo comportamiento de antes + la
-- conciliación contra el PM al final de cada renglón.
-- ---------------------------------------------------------------------------
create or replace function public.guardar_recibo_electrificacion(
  p_folio text, p_fecha_recibo date, p_contratista text, p_obra text, p_ot text,
  p_prioridad public.est_prioridad, p_motivo_prioridad text, p_renglones jsonb
)
returns uuid
language plpgsql
security invoker
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
  v_planeacion_item_id uuid;
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

  select id, estado into v_recibo_id, v_estado
    from public.recibos_electrificacion where folio = p_folio and estado <> 'cancelado';

  if v_recibo_id is null then
    begin
      insert into public.recibos_electrificacion (
        folio, fecha_recibo, contratista, obra, ot, prioridad, motivo_prioridad, capturado_por
      ) values (
        p_folio, p_fecha_recibo, v_contratista, nullif(p_obra, ''), nullif(p_ot, ''),
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
    v_planeacion_item_id := nullif(r->>'planeacionItemId', '')::uuid;

    insert into public.renglones_electrificacion (
      recibo_id, numero, modelo, cantidad, metros_led, complejidad_led, pu_sugerido,
      fuente_sugerido, pu_propuesto, pu_aceptado, banda, justificacion, nota, decision,
      planeacion_item_id
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
      v_planeacion_item_id
    )
    returning id into v_renglon_id;

    v_num_charola := 1;
    for c in select * from jsonb_array_elements(coalesce(r->'charolas', '[]'::jsonb))
    loop
      insert into public.charolas_electrificacion (renglon_id, numero, drivers)
      values (v_renglon_id, v_num_charola, (c->>'drivers')::integer);
      v_num_charola := v_num_charola + 1;
    end loop;

    -- Conciliación con el PM: ver comentario al inicio del archivo.
    if v_planeacion_item_id is not null then
      select cantidad_total into v_cantidad_pm
        from public.planeacion_items where id = v_planeacion_item_id;
      if v_cantidad_pm is null then
        raise exception 'Renglón %: el ítem del PM ya no existe.', v_siguiente_numero;
      end if;
      select coalesce(sum(cantidad), 0) into v_cantidad_acumulada
        from public.renglones_electrificacion where planeacion_item_id = v_planeacion_item_id;
    else
      v_cantidad_pm := null;
      v_cantidad_acumulada := null;
    end if;

    v_motivo_descuadre := nullif(btrim(coalesce(r->>'motivoDescuadre', '')), '');
    if v_planeacion_item_id is null or v_cantidad_acumulada <> v_cantidad_pm then
      if v_motivo_descuadre is null then
        raise exception
          'Renglón %: la cantidad no cuadra con el PM (o no se encontró el modelo); captura el motivo.',
          v_siguiente_numero;
      end if;
      insert into public.discrepancias_electrificacion (
        renglon_id, recibo_id, planeacion_item_id, modelo, cantidad_capturada,
        cantidad_acumulada, cantidad_pm, motivo, creado_por
      ) values (
        v_renglon_id, v_recibo_id, v_planeacion_item_id, r->>'modelo',
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

-- ---------------------------------------------------------------------------
-- modificar_recibo_electrificacion: mismo reemplazo de renglones de antes +
-- la misma conciliación contra el PM.
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
  v_planeacion_item_id uuid;
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

  update public.recibos_electrificacion set
    fecha_recibo = p_fecha_recibo,
    obra = nullif(p_obra, ''),
    ot = nullif(p_ot, ''),
    prioridad = p_prioridad,
    motivo_prioridad = nullif(p_motivo_prioridad, '')
  where id = p_recibo_id;

  delete from public.renglones_electrificacion where recibo_id = p_recibo_id;

  for r in select * from jsonb_array_elements(p_renglones)
  loop
    v_planeacion_item_id := nullif(r->>'planeacionItemId', '')::uuid;

    insert into public.renglones_electrificacion (
      recibo_id, numero, modelo, cantidad, metros_led, complejidad_led, pu_sugerido,
      fuente_sugerido, pu_propuesto, pu_aceptado, banda, justificacion, nota, decision,
      planeacion_item_id
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
      v_planeacion_item_id
    )
    returning id into v_renglon_id;

    v_num_charola := 1;
    for c in select * from jsonb_array_elements(coalesce(r->'charolas', '[]'::jsonb))
    loop
      insert into public.charolas_electrificacion (renglon_id, numero, drivers)
      values (v_renglon_id, v_num_charola, (c->>'drivers')::integer);
      v_num_charola := v_num_charola + 1;
    end loop;

    -- Conciliación con el PM: ver comentario al inicio del archivo.
    if v_planeacion_item_id is not null then
      select cantidad_total into v_cantidad_pm
        from public.planeacion_items where id = v_planeacion_item_id;
      if v_cantidad_pm is null then
        raise exception 'Renglón %: el ítem del PM ya no existe.', v_numero;
      end if;
      select coalesce(sum(cantidad), 0) into v_cantidad_acumulada
        from public.renglones_electrificacion where planeacion_item_id = v_planeacion_item_id;
    else
      v_cantidad_pm := null;
      v_cantidad_acumulada := null;
    end if;

    v_motivo_descuadre := nullif(btrim(coalesce(r->>'motivoDescuadre', '')), '');
    if v_planeacion_item_id is null or v_cantidad_acumulada <> v_cantidad_pm then
      if v_motivo_descuadre is null then
        raise exception
          'Renglón %: la cantidad no cuadra con el PM (o no se encontró el modelo); captura el motivo.',
          v_numero;
      end if;
      insert into public.discrepancias_electrificacion (
        renglon_id, recibo_id, planeacion_item_id, modelo, cantidad_capturada,
        cantidad_acumulada, cantidad_pm, motivo, creado_por
      ) values (
        v_renglon_id, p_recibo_id, v_planeacion_item_id, r->>'modelo',
        coalesce((r->>'cantidad')::numeric, 1), v_cantidad_acumulada, v_cantidad_pm,
        v_motivo_descuadre, auth.uid()
      );
    end if;

    v_numero := v_numero + 1;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Marcar una discrepancia como resuelta (solo desarrolladores; RLS ya lo
-- exige, esto solo evita depender del cliente para poner los campos bien).
-- ---------------------------------------------------------------------------
create or replace function public.resolver_discrepancia_electrificacion(
  p_id uuid,
  p_nota text
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Solo un desarrollador puede resolver discrepancias.';
  end if;
  update public.discrepancias_electrificacion set
    resuelta = true,
    resuelta_por = auth.uid(),
    resuelta_en = now(),
    nota_resolucion = nullif(btrim(coalesce(p_nota, '')), '')
  where id = p_id;
end;
$$;
revoke execute on function public.resolver_discrepancia_electrificacion(uuid, text) from public, anon;
grant execute on function public.resolver_discrepancia_electrificacion(uuid, text) to authenticated;
