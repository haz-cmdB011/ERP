-- Objetos que esta migración debe dejar en la base (los comprueba `npm run db:verificar`):
-- @verifica table public.discrepancias_pm
-- @verifica policy public.discrepancias_pm.select_discrepancias_pm
-- @verifica column public.recibos.pedido_id
-- @verifica column public.renglones.motivo_descuadre
-- @verifica column public.renglones_electrificacion.motivo_descuadre
-- @verifica function public.est_conciliar_renglon_pm
-- @verifica trigger public.renglones.trg_conciliar_renglon_pm
-- @verifica trigger public.renglones_electrificacion.trg_conciliar_renglon_electrificacion_pm
-- @verifica function public.decidir_discrepancia_pm
-- @verifica sin-function public.decidir_discrepancia_electrificacion
-- @verifica function-contiene public.marcar_recibo_pagado discrepancias_pm

-- Control único de piezas contra el PM para los recibos de Acabados, Armado y
-- Electrificación.
--
-- Antes solo Electrificación comparaba lo capturado con el PM, y dentro de
-- sus funciones de guardado; Acabados y Armado guardaban la OT y el modelo
-- como texto libre, sin tope de cantidad. Ahora:
--
-- - Cada recibo de Acabados/Armado queda ligado a su PM (recibos.pedido_id).
-- - Un trigger en los renglones de las tres áreas (est_conciliar_renglon_pm)
--   compara, por OT + modelo + área, lo acumulado en recibos vigentes contra
--   lo que Planeación declaró. Si el modelo no está en el PM o lo acumulado
--   lo supera, exige un motivo y guarda una discrepancia para que el
--   administrador de Estimaciones la acepte o la rechace. Al vivir en un
--   trigger aplica a cualquier inserción o cambio, no solo a las funciones de
--   guardado.
-- - Cada área tiene su propio saldo (una pieza se acaba, se arma y se
--   electrifica una vez). Los reprocesos de Acabados/Armado no gastan saldo.
-- - Un candado por OT + modelo + área (pg_advisory_xact_lock) atiende uno tras
--   otro dos recibos simultáneos del mismo modelo, para que no se pasen del PM
--   entre los dos.
-- - discrepancias_pm reemplaza a discrepancias_electrificacion (estaba vacía)
--   para las tres áreas, y decidir_discrepancia_pm a
--   decidir_discrepancia_electrificacion.
-- - Un recibo no se puede marcar como pagado con discrepancias pendientes, ni
--   con discrepancias rechazadas cuyo renglón conserve precio aceptado.

-- 1. Liga de los recibos de Acabados/Armado con su PM ------------------------

alter table public.recibos
  add column pedido_id uuid references public.pedidos(id) on delete set null;
create index idx_recibos_pedido on public.recibos (pedido_id);

alter table public.renglones add column motivo_descuadre text;
alter table public.renglones_electrificacion add column motivo_descuadre text;

-- 2. Discrepancias de las tres áreas -----------------------------------------

drop function if exists public.decidir_discrepancia_electrificacion(uuid, text, text);
drop table if exists public.discrepancias_electrificacion;

create table public.discrepancias_pm (
  id uuid primary key default gen_random_uuid(),
  area text not null check (area in ('acabados', 'armado', 'electrificacion')),
  recibo_id uuid references public.recibos(id) on delete cascade,
  renglon_id uuid references public.renglones(id) on delete cascade,
  recibo_electrificacion_id uuid references public.recibos_electrificacion(id) on delete cascade,
  renglon_electrificacion_id uuid references public.renglones_electrificacion(id) on delete cascade,
  pedido_id uuid references public.pedidos(id) on delete set null,
  modelo text not null,
  cantidad_capturada numeric not null,
  -- Lo acumulado en recibos vigentes del modelo, contando este renglón.
  cantidad_acumulada numeric not null,
  -- null: el modelo no está en el PM de la OT (o la OT no está ligada a un PM).
  cantidad_pm numeric,
  motivo text not null,
  estado text not null default 'pendiente' check (estado in ('pendiente', 'aceptada', 'rechazada')),
  creado_por uuid references auth.users(id),
  creado_en timestamptz not null default now(),
  resuelta_por uuid references auth.users(id),
  resuelta_en timestamptz,
  nota_resolucion text,
  constraint discrepancias_pm_origen check (
    (area = 'electrificacion'
      and recibo_electrificacion_id is not null and renglon_electrificacion_id is not null
      and recibo_id is null and renglon_id is null)
    or (area <> 'electrificacion'
      and recibo_id is not null and renglon_id is not null
      and recibo_electrificacion_id is null and renglon_electrificacion_id is null)
  )
);

create index idx_discrepancias_pm_estado on public.discrepancias_pm (estado);
create index idx_discrepancias_pm_recibo on public.discrepancias_pm (recibo_id);
create index idx_discrepancias_pm_renglon on public.discrepancias_pm (renglon_id);
create index idx_discrepancias_pm_recibo_elec on public.discrepancias_pm (recibo_electrificacion_id);
create index idx_discrepancias_pm_renglon_elec on public.discrepancias_pm (renglon_electrificacion_id);
create index idx_discrepancias_pm_pedido on public.discrepancias_pm (pedido_id);
create index idx_discrepancias_pm_creado_por on public.discrepancias_pm (creado_por);
create index idx_discrepancias_pm_resuelta_por on public.discrepancias_pm (resuelta_por);

alter table public.discrepancias_pm enable row level security;

-- Las ven quien decide, el personal de Estimaciones que revisa los recibos y
-- quien capturó el renglón. Solo se escriben desde el trigger y
-- decidir_discrepancia_pm (SECURITY DEFINER): no hay políticas de escritura.
create policy select_discrepancias_pm on public.discrepancias_pm
  for select to authenticated
  using (
    (select public.puede_decidir_discrepancias())
    or (select public.is_estimaciones())
    or creado_por = (select auth.uid())
  );

-- 3. Cantidades por área ------------------------------------------------------

-- Lo que Planeación declaró de un modelo en el PM, para Acabados y Armado:
-- todos los muebles (MO padres) vigentes de la versión activa. Electrificación
-- sigue usando cantidad_pm_modelo (que para el maquilador cuenta solo los
-- muebles con iluminación).
create or replace function public.cantidad_pm_modelo_recibos(p_pedido uuid, p_modelo text)
returns numeric
language sql
stable
set search_path = ''
as $function$
  select sum(pi.cantidad_total)
  from public.planeacion_items pi
  join public.pedido_versiones pv on pv.id = pi.pedido_version_id and pv.es_version_activa
  where pv.pedido_id = p_pedido
    and public.norm_modelo(pi.modelo) = public.norm_modelo(p_modelo)
    and pi.tipo_registro = 'MO' and pi.parent_item_id is null
    and (pi.estado_revision is null or pi.estado_revision <> 'cancelado')
    and pi.eliminacion_solicitada_en is null;
$function$;

-- Lo ya capturado de un modelo en recibos vigentes de un área (acabados o
-- armado), sin reprocesos: una pieza que se vuelve a acabar no es una pieza
-- más del PM.
create or replace function public.cantidad_registrada_recibos(
  p_pedido uuid, p_modelo text, p_tipo text, p_excluir_recibo uuid default null
)
returns numeric
language sql
stable
set search_path = ''
as $function$
  select coalesce(sum(g.cantidad), 0)
  from public.renglones g
  join public.recibos rc on rc.id = g.recibo_id
  where rc.pedido_id = p_pedido
    and rc.tipo = p_tipo
    and rc.estado <> 'cancelado'
    and g.tipo_trabajo <> 'reproceso'
    and public.norm_modelo(g.modelo) = public.norm_modelo(p_modelo)
    and (p_excluir_recibo is null or rc.id <> p_excluir_recibo);
$function$;

revoke execute on function public.cantidad_pm_modelo_recibos(uuid, text) from public, anon, authenticated;
revoke execute on function public.cantidad_registrada_recibos(uuid, text, text, uuid) from public, anon, authenticated;

-- 4. El control: trigger en los renglones de las tres áreas -------------------

create or replace function public.est_conciliar_renglon_pm()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_fila jsonb := to_jsonb(new);
  v_area text;
  v_estado text;
  v_pedido uuid;
  v_pm numeric;
  v_acumulada numeric;
  v_motivo text;
begin
  if tg_table_name = 'renglones_electrificacion' then
    v_area := 'electrificacion';
    v_pedido := new.pedido_id;
    select estado into v_estado from public.recibos_electrificacion where id = new.recibo_id;
    if tg_op = 'UPDATE' then
      delete from public.discrepancias_pm where renglon_electrificacion_id = new.id;
    end if;
  else
    select tipo, pedido_id, estado into v_area, v_pedido, v_estado
      from public.recibos where id = new.recibo_id;
    if tg_op = 'UPDATE' then
      delete from public.discrepancias_pm where renglon_id = new.id;
    end if;
    -- Un reproceso no gasta saldo del PM.
    if v_fila->>'tipo_trabajo' = 'reproceso' then
      return new;
    end if;
  end if;

  if v_estado = 'cancelado' then
    return new;
  end if;

  -- Uno tras otro por OT + modelo + área: el segundo espera a que el primero
  -- termine y ya cuenta sus piezas.
  perform pg_advisory_xact_lock(hashtextextended(
    'conciliacion_pm:' || v_area || ':' || coalesce(v_pedido::text, '-') || ':'
      || public.norm_modelo(new.modelo), 0));

  if v_area = 'electrificacion' then
    v_pm := public.cantidad_pm_modelo(v_pedido, new.modelo);
    v_acumulada := public.cantidad_registrada_modelo(v_pedido, new.modelo);
  else
    v_pm := public.cantidad_pm_modelo_recibos(v_pedido, new.modelo);
    v_acumulada := public.cantidad_registrada_recibos(v_pedido, new.modelo, v_area);
  end if;

  if v_pm is not null and v_acumulada <= v_pm then
    return new;
  end if;

  v_motivo := nullif(btrim(coalesce(new.motivo_descuadre, '')), '');
  if v_motivo is null then
    raise exception
      'Renglón %: la cantidad supera lo declarado en el PM (o el modelo no está en la OT); captura el motivo.',
      new.numero;
  end if;

  if v_area = 'electrificacion' then
    insert into public.discrepancias_pm (
      area, recibo_electrificacion_id, renglon_electrificacion_id, pedido_id, modelo,
      cantidad_capturada, cantidad_acumulada, cantidad_pm, motivo, creado_por
    ) values (
      v_area, new.recibo_id, new.id, v_pedido, new.modelo,
      new.cantidad, v_acumulada, v_pm, v_motivo, auth.uid()
    );
  else
    insert into public.discrepancias_pm (
      area, recibo_id, renglon_id, pedido_id, modelo,
      cantidad_capturada, cantidad_acumulada, cantidad_pm, motivo, creado_por
    ) values (
      v_area, new.recibo_id, new.id, v_pedido, new.modelo,
      new.cantidad, v_acumulada, v_pm, v_motivo, auth.uid()
    );
  end if;
  return new;
end;
$function$;

revoke execute on function public.est_conciliar_renglon_pm() from public, anon, authenticated;

create trigger trg_conciliar_renglon_pm
  after insert or update of modelo, cantidad, tipo_trabajo, motivo_descuadre
  on public.renglones
  for each row execute function public.est_conciliar_renglon_pm();

create trigger trg_conciliar_renglon_electrificacion_pm
  -- Sin pedido_id: al borrar un pedido la base lo pone en null (on delete set
  -- null) y eso no debe exigir un motivo.
  after insert or update of modelo, cantidad, motivo_descuadre
  on public.renglones_electrificacion
  for each row execute function public.est_conciliar_renglon_pm();

-- 5. Decidir y pagar ----------------------------------------------------------

create or replace function public.decidir_discrepancia_pm(p_id uuid, p_decision text, p_nota text)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
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

  select estado into v_estado from public.discrepancias_pm where id = p_id for update;
  if v_estado is null then
    raise exception 'Discrepancia no encontrada.';
  end if;
  if v_estado <> 'pendiente' then
    raise exception 'Esta discrepancia ya fue %.', v_estado;
  end if;

  update public.discrepancias_pm set
    estado = p_decision,
    resuelta_por = auth.uid(),
    resuelta_en = now(),
    nota_resolucion = v_nota
  where id = p_id;
end;
$function$;

revoke execute on function public.decidir_discrepancia_pm(uuid, text, text) from public, anon;
grant execute on function public.decidir_discrepancia_pm(uuid, text, text) to authenticated;

create or replace function public.marcar_recibo_pagado(p_tipo text, p_recibo_id uuid)
returns void
language plpgsql
set search_path = ''
as $function$
declare
  v_filas integer;
begin
  if not public.is_estimaciones() then
    raise exception 'Solo el personal de Estimaciones puede marcar recibos como pagados.';
  end if;

  -- Diferencias con el PM: una pendiente bloquea el pago; una rechazada solo
  -- deja pagar si su renglón quedó con precio aceptado en 0.
  if exists (
    select 1
    from public.discrepancias_pm d
    left join public.renglones g on g.id = d.renglon_id
    left join public.renglones_electrificacion ge on ge.id = d.renglon_electrificacion_id
    where (d.recibo_id = p_recibo_id or d.recibo_electrificacion_id = p_recibo_id)
      and (d.estado = 'pendiente'
           or (d.estado = 'rechazada' and coalesce(g.pu_aceptado, ge.pu_aceptado, 0) > 0))
  ) then
    raise exception 'El recibo tiene diferencias con el PM sin resolver: el administrador de Estimaciones debe decidirlas, y un renglón rechazado solo se paga con precio aceptado en 0.';
  end if;

  if p_tipo = 'electrificacion' then
    update public.recibos_electrificacion
      set estado = 'pagado', pagado_por = auth.uid(), pagado_en = now()
      where id = p_recibo_id and estado = 'revisado';
  else
    update public.recibos
      set estado = 'pagado', pagado_por = auth.uid(), pagado_en = now()
      where id = p_recibo_id and tipo = p_tipo and estado = 'revisado';
  end if;
  get diagnostics v_filas = row_count;
  if v_filas = 0 then
    raise exception 'Solo se puede pagar un recibo revisado (todos sus renglones decididos).';
  end if;
end;
$function$;

-- 6. Modelos del PM con lo ya capturado, para el generador --------------------

drop function if exists public.listar_modelos_pm_recibos(uuid);

create or replace function public.listar_modelos_pm_recibos(
  p_pedido uuid, p_tipo text default null, p_excluir_recibo uuid default null
)
returns table(modelo text, cantidad_pm numeric, descripcion text, cantidad_registrada numeric)
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if not (public.is_estimaciones() or public.is_maquilador()) then
    raise exception 'No tienes permiso para consultar el PM de Planeación.';
  end if;

  return query
    select min(pi.modelo), sum(pi.cantidad_total),
      min(split_part(btrim(coalesce(pi.descripcion, '')), E'\n', 1)),
      case when p_tipo is null then 0::numeric
           else public.cantidad_registrada_recibos(p_pedido, min(pi.modelo), p_tipo, p_excluir_recibo) end
    from public.planeacion_items pi
    join public.pedido_versiones pv on pv.id = pi.pedido_version_id and pv.es_version_activa
    join public.pedidos p on p.id = pv.pedido_id
      and p.eliminado_en is null and p.eliminado_definitivo_en is null
    where pv.pedido_id = p_pedido
      and pi.tipo_registro = 'MO' and pi.parent_item_id is null
      and btrim(coalesce(pi.modelo, '')) <> ''
      and (pi.estado_revision is null or pi.estado_revision <> 'cancelado')
      and pi.eliminacion_solicitada_en is null
    group by public.norm_modelo(pi.modelo)
    order by min(pi.modelo);
end;
$function$;

revoke execute on function public.listar_modelos_pm_recibos(uuid, text, uuid) from public, anon;
grant execute on function public.listar_modelos_pm_recibos(uuid, text, uuid) to authenticated;

-- 7. Funciones de guardado ----------------------------------------------------
-- Acabados y Armado: ligan el recibo al PM de la OT (pedido_id_por_ot exige
-- que la OT exista) y pasan el motivo de descuadre a cada renglón. El
-- guardado pasa a SECURITY DEFINER, como el de Electrificación: el maquilador
-- no puede leer pedidos (RLS) y pedido_id_por_ot no es ejecutable por los
-- usuarios. Los permisos los sigue validando la función (Estimaciones o
-- maquilador, contratista fijo del maquilador, estado del folio) y los
-- triggers *_validar_area_maquilador.
-- Electrificación: la conciliación que tenía dentro pasa al trigger; solo
-- pasa el motivo.

create or replace function public.guardar_recibo_acabados(p_folio text, p_fecha_recibo date, p_contratista text, p_obra text, p_ot text, p_prioridad public.est_prioridad, p_motivo_prioridad text, p_renglones jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_maq boolean := public.is_maquilador();
  v_contratista text := p_contratista;
  v_recibo_id uuid;
  v_estado text;
  v_siguiente_numero integer;
  v_aceptado numeric;
  v_propuesto numeric;
  r jsonb;
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
    from public.recibos where folio = p_folio and tipo = 'acabados' and estado <> 'cancelado';

  if v_recibo_id is null then
    begin
      insert into public.recibos (
        folio, tipo, fecha_recibo, contratista, obra, ot, pedido_id, prioridad, motivo_prioridad, capturado_por
      ) values (
        p_folio, 'acabados', p_fecha_recibo, v_contratista, nullif(p_obra, ''), btrim(p_ot),
        public.pedido_id_por_ot(p_ot), p_prioridad, nullif(p_motivo_prioridad, ''), auth.uid()
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
      from public.renglones where recibo_id = v_recibo_id;
  end if;

  for r in select * from jsonb_array_elements(p_renglones)
  loop
    v_propuesto := (r->>'propuesto')::numeric;
    v_aceptado := case when v_maq then 0 else (r->>'aceptado')::numeric end;

    insert into public.renglones (
      recibo_id, numero, modelo, familia, acabado, acabado_2, tipo_trabajo, causa_reproceso,
      cantidad, tamano, fases, pu_sugerido, fuente_sugerido, sin_tamano, pu_propuesto,
      pu_aceptado, banda, justificacion, nota, decision, motivo_descuadre
    ) values (
      v_recibo_id,
      v_siguiente_numero,
      r->>'modelo',
      r->>'familia',
      nullif(r->>'acabado', ''),
      nullif(r->>'acabado2', ''),
      coalesce((r->>'tipoTrabajo')::public.est_tipo_trabajo, 'produccion'),
      nullif(r->>'causa', ''),
      (r->>'cantidad')::numeric,
      nullif(r->>'tamano', '')::public.est_tamano,
      coalesce(
        (select array_agg(f) from jsonb_array_elements_text(coalesce(r->'fases', '[]'::jsonb)) f),
        '{}'
      ),
      case when v_maq then null else nullif(r->>'puSugerido', '')::numeric end,
      case when v_maq then 'manual' else (r->>'fuente')::public.est_fuente_sugerido end,
      coalesce((r->>'sinTamano')::boolean, false),
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
      nullif(btrim(coalesce(r->>'motivoDescuadre', '')), '')
    );
    v_siguiente_numero := v_siguiente_numero + 1;
  end loop;

  perform public.est_actualizar_estado_recibo('acabados', v_recibo_id);
  return v_recibo_id;
end;
$function$;

create or replace function public.guardar_recibo_armado(p_folio text, p_fecha_recibo date, p_contratista text, p_obra text, p_ot text, p_prioridad public.est_prioridad, p_motivo_prioridad text, p_renglones jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_maq boolean := public.is_maquilador();
  v_contratista text := p_contratista;
  v_recibo_id uuid;
  v_estado text;
  v_siguiente_numero integer;
  v_aceptado numeric;
  v_propuesto numeric;
  r jsonb;
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
    from public.recibos where folio = p_folio and tipo = 'armado' and estado <> 'cancelado';

  if v_recibo_id is null then
    begin
      insert into public.recibos (
        folio, tipo, fecha_recibo, contratista, obra, ot, pedido_id, prioridad, motivo_prioridad, capturado_por
      ) values (
        p_folio, 'armado', p_fecha_recibo, v_contratista, nullif(p_obra, ''), btrim(p_ot),
        public.pedido_id_por_ot(p_ot), p_prioridad, nullif(p_motivo_prioridad, ''), auth.uid()
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
      from public.renglones where recibo_id = v_recibo_id;
  end if;

  for r in select * from jsonb_array_elements(p_renglones)
  loop
    if coalesce(r->>'tipoArmado', '') not in ('Natural', 'Laminado') then
      raise exception 'Renglón %: falta el tipo de armado (Natural o Laminado).',
        v_siguiente_numero;
    end if;

    v_propuesto := (r->>'propuesto')::numeric;
    v_aceptado := case when v_maq then 0 else (r->>'aceptado')::numeric end;

    insert into public.renglones (
      recibo_id, numero, modelo, familia, tipo_armado, colocacion_herrajes, tipo_trabajo,
      causa_reproceso, cantidad, tamano, pu_sugerido, fuente_sugerido, sin_tamano,
      pu_propuesto, pu_aceptado, banda, justificacion, nota, decision, motivo_descuadre
    ) values (
      v_recibo_id,
      v_siguiente_numero,
      r->>'modelo',
      r->>'familia',
      r->>'tipoArmado',
      coalesce((r->>'colocacionHerrajes')::boolean, false),
      coalesce((r->>'tipoTrabajo')::public.est_tipo_trabajo, 'produccion'),
      nullif(r->>'causa', ''),
      (r->>'cantidad')::numeric,
      nullif(r->>'tamano', '')::public.est_tamano,
      case when v_maq then null else nullif(r->>'puSugerido', '')::numeric end,
      case when v_maq then 'manual' else (r->>'fuente')::public.est_fuente_sugerido end,
      coalesce((r->>'sinTamano')::boolean, false),
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
      nullif(btrim(coalesce(r->>'motivoDescuadre', '')), '')
    );
    v_siguiente_numero := v_siguiente_numero + 1;
  end loop;

  perform public.est_actualizar_estado_recibo('armado', v_recibo_id);
  return v_recibo_id;
end;
$function$;

create or replace function public.modificar_recibo_acabados(p_recibo_id uuid, p_fecha_recibo date, p_obra text, p_ot text, p_prioridad public.est_prioridad, p_motivo_prioridad text, p_renglones jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_capturado_por uuid;
  v_estado text;
  v_decididos integer;
  v_numero integer := 1;
  r jsonb;
begin
  if not public.is_maquilador() then
    raise exception 'Solo el maquilador que capturó el recibo puede modificarlo.';
  end if;
  if p_renglones is null or jsonb_array_length(p_renglones) = 0 then
    raise exception 'El recibo no tiene renglones.';
  end if;

  select capturado_por, estado into v_capturado_por, v_estado
    from public.recibos where id = p_recibo_id and tipo = 'acabados';
  if v_estado is null or v_capturado_por is distinct from auth.uid() then
    raise exception 'Recibo no encontrado.';
  end if;
  if v_estado <> 'pendiente' then
    raise exception 'Solo se puede modificar un recibo pendiente de revisión.';
  end if;

  select count(*) into v_decididos from public.renglones
    where recibo_id = p_recibo_id and decision is not null;
  if v_decididos > 0 then
    raise exception 'Este recibo ya está en revisión; pide al personal de Estimaciones que lo corrija.';
  end if;

  update public.recibos set
    fecha_recibo = p_fecha_recibo,
    obra = nullif(p_obra, ''),
    ot = btrim(p_ot),
    pedido_id = public.pedido_id_por_ot(p_ot),
    prioridad = p_prioridad,
    motivo_prioridad = nullif(p_motivo_prioridad, '')
  where id = p_recibo_id;

  -- Borra también sus discrepancias (cascade): se vuelven a evaluar con lo
  -- que se guarda ahora.
  delete from public.renglones where recibo_id = p_recibo_id;

  for r in select * from jsonb_array_elements(p_renglones)
  loop
    insert into public.renglones (
      recibo_id, numero, modelo, familia, acabado, acabado_2, tipo_trabajo, causa_reproceso,
      cantidad, tamano, fases, pu_sugerido, fuente_sugerido, sin_tamano, pu_propuesto,
      pu_aceptado, banda, justificacion, nota, decision, motivo_descuadre
    ) values (
      p_recibo_id,
      v_numero,
      r->>'modelo',
      r->>'familia',
      nullif(r->>'acabado', ''),
      nullif(r->>'acabado2', ''),
      coalesce((r->>'tipoTrabajo')::public.est_tipo_trabajo, 'produccion'),
      nullif(r->>'causa', ''),
      (r->>'cantidad')::numeric,
      nullif(r->>'tamano', '')::public.est_tamano,
      coalesce(
        (select array_agg(f) from jsonb_array_elements_text(coalesce(r->'fases', '[]'::jsonb)) f),
        '{}'
      ),
      null,
      'manual',
      coalesce((r->>'sinTamano')::boolean, false),
      (r->>'propuesto')::numeric,
      0,
      null,
      null,
      nullif(r->>'nota', ''),
      null,
      nullif(btrim(coalesce(r->>'motivoDescuadre', '')), '')
    );
    v_numero := v_numero + 1;
  end loop;
end;
$function$;

create or replace function public.modificar_recibo_armado(p_recibo_id uuid, p_fecha_recibo date, p_obra text, p_ot text, p_prioridad public.est_prioridad, p_motivo_prioridad text, p_renglones jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_capturado_por uuid;
  v_estado text;
  v_decididos integer;
  v_numero integer := 1;
  r jsonb;
begin
  if not public.is_maquilador() then
    raise exception 'Solo el maquilador que capturó el recibo puede modificarlo.';
  end if;
  if p_renglones is null or jsonb_array_length(p_renglones) = 0 then
    raise exception 'El recibo no tiene renglones.';
  end if;

  select capturado_por, estado into v_capturado_por, v_estado
    from public.recibos where id = p_recibo_id and tipo = 'armado';
  if v_estado is null or v_capturado_por is distinct from auth.uid() then
    raise exception 'Recibo no encontrado.';
  end if;
  if v_estado <> 'pendiente' then
    raise exception 'Solo se puede modificar un recibo pendiente de revisión.';
  end if;

  select count(*) into v_decididos from public.renglones
    where recibo_id = p_recibo_id and decision is not null;
  if v_decididos > 0 then
    raise exception 'Este recibo ya está en revisión; pide al personal de Estimaciones que lo corrija.';
  end if;

  update public.recibos set
    fecha_recibo = p_fecha_recibo,
    obra = nullif(p_obra, ''),
    ot = btrim(p_ot),
    pedido_id = public.pedido_id_por_ot(p_ot),
    prioridad = p_prioridad,
    motivo_prioridad = nullif(p_motivo_prioridad, '')
  where id = p_recibo_id;

  -- Borra también sus discrepancias (cascade): se vuelven a evaluar con lo
  -- que se guarda ahora.
  delete from public.renglones where recibo_id = p_recibo_id;

  for r in select * from jsonb_array_elements(p_renglones)
  loop
    if coalesce(r->>'tipoArmado', '') not in ('Natural', 'Laminado') then
      raise exception 'Renglón %: falta el tipo de armado (Natural o Laminado).', v_numero;
    end if;

    insert into public.renglones (
      recibo_id, numero, modelo, familia, tipo_armado, colocacion_herrajes, tipo_trabajo,
      causa_reproceso, cantidad, tamano, pu_sugerido, fuente_sugerido, sin_tamano,
      pu_propuesto, pu_aceptado, banda, justificacion, nota, decision, motivo_descuadre
    ) values (
      p_recibo_id,
      v_numero,
      r->>'modelo',
      r->>'familia',
      r->>'tipoArmado',
      coalesce((r->>'colocacionHerrajes')::boolean, false),
      coalesce((r->>'tipoTrabajo')::public.est_tipo_trabajo, 'produccion'),
      nullif(r->>'causa', ''),
      (r->>'cantidad')::numeric,
      nullif(r->>'tamano', '')::public.est_tamano,
      null,
      'manual',
      coalesce((r->>'sinTamano')::boolean, false),
      (r->>'propuesto')::numeric,
      0,
      null,
      null,
      nullif(r->>'nota', ''),
      null,
      nullif(btrim(coalesce(r->>'motivoDescuadre', '')), '')
    );
    v_numero := v_numero + 1;
  end loop;
end;
$function$;

create or replace function public.guardar_recibo_electrificacion(
  p_folio text, p_fecha_recibo date, p_contratista text, p_obra text, p_ot text,
  p_prioridad public.est_prioridad, p_motivo_prioridad text, p_renglones jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
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

    -- La conciliación con el PM la hace el trigger trg_conciliar_renglon_electrificacion_pm.
    insert into public.renglones_electrificacion (
      recibo_id, numero, modelo, cantidad, metros_led, complejidad_led, pu_sugerido,
      fuente_sugerido, pu_propuesto, pu_aceptado, banda, justificacion, nota, decision,
      pedido_id, motivo_descuadre
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
      v_pedido_id,
      nullif(btrim(coalesce(r->>'motivoDescuadre', '')), '')
    )
    returning id into v_renglon_id;

    v_num_charola := 1;
    for c in select * from jsonb_array_elements(coalesce(r->'charolas', '[]'::jsonb))
    loop
      insert into public.charolas_electrificacion (renglon_id, numero, drivers)
      values (v_renglon_id, v_num_charola, (c->>'drivers')::integer);
      v_num_charola := v_num_charola + 1;
    end loop;

    v_siguiente_numero := v_siguiente_numero + 1;
  end loop;

  perform public.est_actualizar_estado_recibo('electrificacion', v_recibo_id);
  return v_recibo_id;
end;
$function$;

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
as $function$
declare
  v_capturado_por uuid;
  v_estado text;
  v_decididos integer;
  v_numero integer := 1;
  v_num_charola integer;
  v_renglon_id uuid;
  v_pedido_id uuid;
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

  -- Borra también sus discrepancias (cascade): se vuelven a evaluar con lo
  -- que se guarda ahora.
  delete from public.renglones_electrificacion where recibo_id = p_recibo_id;

  for r in select * from jsonb_array_elements(p_renglones)
  loop
    insert into public.renglones_electrificacion (
      recibo_id, numero, modelo, cantidad, metros_led, complejidad_led, pu_sugerido,
      fuente_sugerido, pu_propuesto, pu_aceptado, banda, justificacion, nota, decision,
      pedido_id, motivo_descuadre
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
      v_pedido_id,
      nullif(btrim(coalesce(r->>'motivoDescuadre', '')), '')
    )
    returning id into v_renglon_id;

    v_num_charola := 1;
    for c in select * from jsonb_array_elements(coalesce(r->'charolas', '[]'::jsonb))
    loop
      insert into public.charolas_electrificacion (renglon_id, numero, drivers)
      values (v_renglon_id, v_num_charola, (c->>'drivers')::integer);
      v_num_charola := v_num_charola + 1;
    end loop;

    v_numero := v_numero + 1;
  end loop;
end;
$function$;

revoke execute on function public.guardar_recibo_acabados(text, date, text, text, text, public.est_prioridad, text, jsonb) from public, anon;
grant execute on function public.guardar_recibo_acabados(text, date, text, text, text, public.est_prioridad, text, jsonb) to authenticated;
revoke execute on function public.guardar_recibo_armado(text, date, text, text, text, public.est_prioridad, text, jsonb) from public, anon;
grant execute on function public.guardar_recibo_armado(text, date, text, text, text, public.est_prioridad, text, jsonb) to authenticated;
