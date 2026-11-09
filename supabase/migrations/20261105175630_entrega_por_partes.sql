-- @verifica table public.entregas_partes_produccion
-- @verifica policy public.entregas_partes_produccion.select_entregas_partes_produccion
-- @verifica function public.registrar_entrega_partes

-- ============================================================================
-- Producción — entregas parciales por parte del despiece.
--
-- El mueble se asigna completo (una sola ruta), pero sus partes ("Puerta" y "Marco" de un
-- componente "Puerta con marco") no siempre se entregan juntas. Esta migración deja registrar
-- lo que se entregó de cada parte sin tocar nada de lo que ya cuenta muebles:
--
--   * entregas_partes_produccion: cuántas piezas de cada parte se entregaron, de qué asignación
--     (del mueble completo), con su fecha y folio. Es el detalle por parte.
--   * registrar_entrega_partes: guarda ese detalle y, cuando la parte más atrasada alcanza para
--     más muebles de los ya entregados, registra por sí misma la entrega del mueble completo
--     (registrar_entrega_produccion, con sus mismas reglas) por la diferencia. Así Calidad, el
--     cobro y la revisión final siguen contando muebles completos, como hasta ahora.
--
-- Muebles completos = lo que alcanza la parte más atrasada: piezas entregadas ÷ piezas por
-- mueble, hacia abajo (como encuadreMueble en src/lib/produccion/flujo-mueble.ts). Si además se
-- registra una entrega del mueble completo a mano, cuenta en lo ya entregado y no se duplica.
-- Anular la entrega de un mueble generada aquí no devuelve las piezas por parte.
-- ============================================================================

create table public.entregas_partes_produccion (
  id uuid primary key default gen_random_uuid(),
  asignacion_id uuid not null references public.asignaciones_produccion(id) on delete cascade,
  parte_id uuid not null references public.partes_despiece(id),
  piezas numeric not null,
  fecha_entrega date not null,
  folios_calidad text not null,
  -- Del envío que la creó (el celular lo repite al reintentar); único por parte.
  clave_envio text,
  registrado_por uuid references auth.users(id) default auth.uid(),
  registrado_en timestamptz not null default now(),
  constraint entregas_partes_produccion_piezas_check check (piezas > 0)
);

create index idx_entregas_partes_asignacion on public.entregas_partes_produccion (asignacion_id);
create unique index idx_entregas_partes_clave_unica
  on public.entregas_partes_produccion (clave_envio, parte_id)
  where clave_envio is not null;

alter table public.entregas_partes_produccion enable row level security;
-- Lo ve el personal interno; sin políticas de escritura: solo entra por registrar_entrega_partes.
create policy "select_entregas_partes_produccion" on public.entregas_partes_produccion
  for select to authenticated using ((select public.is_staff()));

create or replace function public.registrar_entrega_partes(
  p_asignacion_id uuid,
  p_fecha_entrega date,
  p_partes jsonb,
  p_folios_calidad text,
  p_clave_envio text default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_asignacion record;
  v_clave text := nullif(btrim(coalesce(p_clave_envio, '')), '');
  v_folio text := nullif(btrim(coalesce(p_folios_calidad, '')), '');
  v_linea jsonb;
  v_parte record;
  v_parte_id uuid;
  v_piezas numeric;
  v_ya numeric;
  v_vistas uuid[] := '{}';
  v_completos numeric;
  v_entregado numeric;
  v_nuevos numeric;
begin
  if not public.is_produccion() then
    raise exception 'Solo Producción puede registrar entregas.';
  end if;
  if v_clave is not null and length(v_clave) > 100 then
    raise exception 'La clave de envío no es válida.';
  end if;

  -- El mismo envío repetido (la red se cortó antes de la respuesta): ya está guardado.
  if v_clave is not null and exists (
    select 1 from public.entregas_partes_produccion
    where clave_envio = v_clave and asignacion_id = p_asignacion_id
  ) then
    return 0;
  end if;

  if p_partes is null or jsonb_typeof(p_partes) <> 'array' or jsonb_array_length(p_partes) = 0 then
    raise exception 'Escribe cuántas piezas se entregaron de al menos una parte.';
  end if;
  if jsonb_array_length(p_partes) > 50 then
    raise exception 'Son demasiadas partes en una sola entrega.';
  end if;
  if p_fecha_entrega is null then
    raise exception 'Falta la fecha de entrega.';
  end if;
  if v_folio is null then
    raise exception 'Escribe el folio de la hoja de entrega.';
  end if;

  select id, planeacion_item_id, cantidad, fecha_asignacion, cancelada_en, parte_id into v_asignacion
    from public.asignaciones_produccion where id = p_asignacion_id for update;
  if not found then
    raise exception 'La asignación no existe.';
  end if;
  if v_asignacion.cancelada_en is not null then
    raise exception 'La asignación está cancelada.';
  end if;
  if v_asignacion.parte_id is not null then
    raise exception 'Esta asignación es de una parte: su entrega se registra completa.';
  end if;
  if p_fecha_entrega < v_asignacion.fecha_asignacion then
    raise exception 'La fecha de entrega no puede ser anterior a la de asignación (%).',
      to_char(v_asignacion.fecha_asignacion, 'DD/MM/YYYY');
  end if;
  if p_fecha_entrega > (now() at time zone 'America/Mexico_City')::date then
    raise exception 'La fecha de entrega no puede ser futura.';
  end if;

  for v_linea in select * from jsonb_array_elements(p_partes) loop
    begin
      v_parte_id := (v_linea ->> 'parteId')::uuid;
      v_piezas := (v_linea ->> 'piezas')::numeric;
    exception when others then
      raise exception 'Una de las partes no es válida.';
    end;
    if v_piezas is null or v_piezas <= 0 then
      raise exception 'Las piezas de cada parte deben ser mayores que cero.';
    end if;
    if v_parte_id = any (v_vistas) then
      raise exception 'Una parte está repetida en la entrega.';
    end if;
    v_vistas := v_vistas || v_parte_id;

    select pd.id, pd.descripcion, pd.piezas_por_mueble into v_parte
      from public.partes_despiece pd
      where pd.id = v_parte_id
        and pd.planeacion_item_id = v_asignacion.planeacion_item_id
        and pd.retirada_en is null;
    if not found then
      raise exception 'Una de las partes ya no es del despiece de este mueble.';
    end if;

    select coalesce(sum(piezas), 0) into v_ya
      from public.entregas_partes_produccion
      where asignacion_id = p_asignacion_id and parte_id = v_parte_id;
    if v_ya + v_piezas > v_parte.piezas_por_mueble * v_asignacion.cantidad then
      raise exception 'De "%" solo faltan % por entregar de %.',
        v_parte.descripcion,
        v_parte.piezas_por_mueble * v_asignacion.cantidad - v_ya,
        v_parte.piezas_por_mueble * v_asignacion.cantidad;
    end if;

    insert into public.entregas_partes_produccion (
      asignacion_id, parte_id, piezas, fecha_entrega, folios_calidad, clave_envio
    ) values (
      p_asignacion_id, v_parte_id, v_piezas, p_fecha_entrega, v_folio, v_clave
    );
  end loop;

  -- Muebles completos que alcanzan todas las partes vigentes (la más atrasada manda).
  select min(floor(coalesce(e.total, 0) / pd.piezas_por_mueble)) into v_completos
    from public.partes_despiece pd
    left join (
      select parte_id, sum(piezas) as total
      from public.entregas_partes_produccion
      where asignacion_id = p_asignacion_id
      group by parte_id
    ) e on e.parte_id = pd.id
    where pd.planeacion_item_id = v_asignacion.planeacion_item_id and pd.retirada_en is null;
  v_completos := least(coalesce(v_completos, 0), v_asignacion.cantidad);

  select coalesce(sum(cantidad), 0) into v_entregado
    from public.entregas_produccion
    where asignacion_id = p_asignacion_id and anulada_en is null and rechazada_en is null;

  v_nuevos := v_completos - v_entregado;
  if v_nuevos > 0 then
    perform public.registrar_entrega_produccion(
      p_asignacion_id, p_fecha_entrega, v_nuevos, v_folio,
      case when v_clave is not null then v_clave || ':mueble' end
    );
    return v_nuevos::integer;
  end if;
  return 0;
end;
$$;

revoke execute on function public.registrar_entrega_partes(uuid, date, jsonb, text, text) from public, anon;
grant execute on function public.registrar_entrega_partes(uuid, date, jsonb, text, text) to authenticated;
