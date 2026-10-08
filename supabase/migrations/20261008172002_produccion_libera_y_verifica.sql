-- Objetos que esta migración debe dejar en la base (los comprueba `npm run db:verificar`):
-- @verifica trigger public.planeacion_items.trg_protect_planeacion_items_columns_produccion
-- @verifica function-contiene public.protect_planeacion_items_columns_produccion estado_liberacion
-- @verifica column public.entregas_produccion.verificada_en
-- @verifica column public.entregas_produccion.rechazada_en
-- @verifica column public.entregas_produccion.motivo_rechazo
-- @verifica constraint public.entregas_produccion.entregas_produccion_revision_check
-- @verifica function public.verificar_entrega_produccion
-- @verifica function public.rechazar_entrega_produccion
-- @verifica function-contiene public.registrar_entrega_produccion rechazada_en is null
-- @verifica function-contiene public.cancelar_asignacion_produccion rechazada_en is null
-- @verifica column public.asignaciones_produccion_resumen.por_verificar
-- @verifica column public.asignaciones_produccion_resumen.verificado

-- ============================================================================
-- Producción libera ítems e inspecciona lo que entregan los equipos.
--
-- 1. Liberar a producción. Planeación decide qué se libera, pero quien lo
--    marca en el sistema es el trabajador de Producción. El trigger que
--    limitaba a Producción a la solicitud de eliminación no estaba en la base
--    (Producción podía cambiar cualquier columna del ítem); se vuelve a crear
--    dejando, además, las columnas de liberación:
--      * estado_liberacion, liberado_en, liberado_por;
--      * liberado_por solo puede ser quien hace el cambio (o vacío al revertir);
--      * no se regresa a "pendiente" un ítem con asignaciones vigentes (primero
--        se cancelan).
--
-- 2. Inspección de Producción. Cuando un equipo entrega, el trabajador revisa
--    las piezas antes de que lleguen a Calidad:
--      * la entrega nace "por verificar";
--      * verificar_entrega_produccion la manda a Calidad;
--      * rechazar_entrega_produccion la regresa al equipo con motivo: deja de
--        contar como entregada y el equipo tiene que volver a entregarla.
--    Calidad solo ve lo verificado (columna `verificado` de la vista).
--    Las entregas que ya existían se dan por verificadas: antes de este cambio
--    registrar la entrega ya las mandaba a Calidad.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Liberación por Producción
-- ---------------------------------------------------------------------------
create or replace function public.protect_planeacion_items_columns_produccion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.is_produccion() and not public.is_planeacion() then
    if (to_jsonb(old) - 'eliminacion_solicitada_en' - 'eliminacion_solicitada_por'
          - 'estado_liberacion' - 'liberado_en' - 'liberado_por')
       is distinct from
       (to_jsonb(new) - 'eliminacion_solicitada_en' - 'eliminacion_solicitada_por'
          - 'estado_liberacion' - 'liberado_en' - 'liberado_por')
    then
      raise exception 'Producción solo puede liberar ítems o solicitar su eliminación.';
    end if;

    if new.liberado_por is distinct from old.liberado_por
       and new.liberado_por is not null
       and new.liberado_por is distinct from auth.uid() then
      raise exception 'La liberación queda a nombre de quien la hace.';
    end if;

    if old.estado_liberacion = 'enviado_a_produccion'
       and new.estado_liberacion is distinct from 'enviado_a_produccion'
       and exists (
         select 1 from public.asignaciones_produccion
         where planeacion_item_id = old.id and cancelada_en is null
       ) then
      raise exception 'El ítem % ya tiene asignaciones a equipos; cancélalas antes de regresarlo a pendiente.',
        old.item_code;
    end if;
  end if;
  return new;
end;
$$;

revoke execute on function public.protect_planeacion_items_columns_produccion()
  from public, anon, authenticated;

drop trigger if exists trg_protect_planeacion_items_columns_produccion on public.planeacion_items;
create trigger trg_protect_planeacion_items_columns_produccion
  before update on public.planeacion_items
  for each row execute function public.protect_planeacion_items_columns_produccion();

-- ---------------------------------------------------------------------------
-- 2. Inspección de Producción sobre las entregas
-- ---------------------------------------------------------------------------
alter table public.entregas_produccion
  add column verificada_en timestamptz,
  add column verificada_por uuid references auth.users(id),
  add column rechazada_en timestamptz,
  add column rechazada_por uuid references auth.users(id),
  add column motivo_rechazo text,
  add constraint entregas_produccion_revision_check check (
    (verificada_en is null or rechazada_en is null)
    and (rechazada_en is null or nullif(btrim(coalesce(motivo_rechazo, '')), '') is not null)
  );

create index idx_entregas_produccion_verificada_por on public.entregas_produccion (verificada_por);
create index idx_entregas_produccion_rechazada_por on public.entregas_produccion (rechazada_por);

update public.entregas_produccion
  set verificada_en = registrado_en, verificada_por = registrado_por
  where verificada_en is null and rechazada_en is null;

-- El trabajador revisó las piezas y cumplen: pasan a Calidad.
create or replace function public.verificar_entrega_produccion(p_entrega_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_entrega record;
begin
  if not public.is_produccion() then
    raise exception 'Solo Producción puede verificar entregas.';
  end if;

  select anulada_en, verificada_en, rechazada_en into v_entrega
    from public.entregas_produccion where id = p_entrega_id for update;
  if not found then
    raise exception 'La entrega no existe.';
  end if;
  if v_entrega.anulada_en is not null then
    raise exception 'La entrega está anulada.';
  end if;
  if v_entrega.verificada_en is not null then
    raise exception 'La entrega ya estaba verificada.';
  end if;
  if v_entrega.rechazada_en is not null then
    raise exception 'La entrega ya fue rechazada.';
  end if;

  update public.entregas_produccion
    set verificada_en = now(), verificada_por = auth.uid()
    where id = p_entrega_id;
end;
$$;

-- Las piezas no cumplen: regresan al equipo. La entrega deja de contar y el
-- equipo vuelve a entregarlas (una entrega nueva).
create or replace function public.rechazar_entrega_produccion(
  p_entrega_id uuid,
  p_motivo text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_entrega record;
begin
  if not public.is_produccion() then
    raise exception 'Solo Producción puede rechazar entregas.';
  end if;
  if nullif(btrim(coalesce(p_motivo, '')), '') is null then
    raise exception 'Escribe el motivo del rechazo.';
  end if;

  select anulada_en, verificada_en, rechazada_en into v_entrega
    from public.entregas_produccion where id = p_entrega_id for update;
  if not found then
    raise exception 'La entrega no existe.';
  end if;
  if v_entrega.anulada_en is not null then
    raise exception 'La entrega está anulada.';
  end if;
  if v_entrega.verificada_en is not null then
    raise exception 'La entrega ya se verificó y está en Calidad.';
  end if;
  if v_entrega.rechazada_en is not null then
    raise exception 'La entrega ya estaba rechazada.';
  end if;

  update public.entregas_produccion
    set rechazada_en = now(), rechazada_por = auth.uid(), motivo_rechazo = btrim(p_motivo)
    where id = p_entrega_id;
end;
$$;

revoke execute on function public.verificar_entrega_produccion(uuid) from public, anon;
revoke execute on function public.rechazar_entrega_produccion(uuid, text) from public, anon;
grant execute on function public.verificar_entrega_produccion(uuid) to authenticated;
grant execute on function public.rechazar_entrega_produccion(uuid, text) to authenticated;

-- Una entrega rechazada no cuenta: el equipo puede volver a entregar esas piezas.
create or replace function public.registrar_entrega_produccion(
  p_asignacion_id uuid,
  p_fecha_entrega date,
  p_cantidad numeric,
  p_folios_calidad text,
  p_foto_path text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_asignacion record;
  v_entregado numeric;
  v_id uuid;
begin
  if not public.is_produccion() then
    raise exception 'Solo Producción puede registrar entregas.';
  end if;
  if p_cantidad is null or p_cantidad <= 0 then
    raise exception 'La cantidad debe ser mayor que cero.';
  end if;
  if p_fecha_entrega is null then
    raise exception 'Falta la fecha de entrega.';
  end if;
  if nullif(btrim(coalesce(p_folios_calidad, '')), '') is null then
    raise exception 'Escribe los folios de Calidad.';
  end if;
  -- La foto se sube antes, en una carpeta con el id de la asignación.
  if p_foto_path is null or p_foto_path not like p_asignacion_id::text || '/%' then
    raise exception 'Falta la foto de los folios.';
  end if;

  select id, cantidad, fecha_asignacion, cancelada_en into v_asignacion
    from public.asignaciones_produccion where id = p_asignacion_id for update;
  if not found then
    raise exception 'La asignación no existe.';
  end if;
  if v_asignacion.cancelada_en is not null then
    raise exception 'La asignación está cancelada.';
  end if;
  if p_fecha_entrega < v_asignacion.fecha_asignacion then
    raise exception 'La fecha de entrega no puede ser anterior a la de asignación (%).',
      to_char(v_asignacion.fecha_asignacion, 'DD/MM/YYYY');
  end if;
  if p_fecha_entrega > (now() at time zone 'America/Mexico_City')::date then
    raise exception 'La fecha de entrega no puede ser futura.';
  end if;

  select coalesce(sum(cantidad), 0) into v_entregado
    from public.entregas_produccion
    where asignacion_id = p_asignacion_id and anulada_en is null and rechazada_en is null;
  if v_entregado + p_cantidad > v_asignacion.cantidad then
    raise exception 'Solo faltan % por entregar de %.',
      v_asignacion.cantidad - v_entregado, v_asignacion.cantidad;
  end if;

  insert into public.entregas_produccion (
    asignacion_id, fecha_entrega, cantidad, folios_calidad, foto_path, registrado_por
  ) values (
    p_asignacion_id, p_fecha_entrega, p_cantidad, btrim(p_folios_calidad), p_foto_path, auth.uid()
  )
  returning id into v_id;

  return v_id;
end;
$$;

-- Una asignación cuyas entregas fueron todas rechazadas o anuladas se puede cancelar.
create or replace function public.cancelar_asignacion_produccion(
  p_asignacion_id uuid,
  p_motivo text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cancelada timestamptz;
begin
  if not public.is_produccion() then
    raise exception 'Solo Producción puede cancelar asignaciones.';
  end if;
  if nullif(btrim(coalesce(p_motivo, '')), '') is null then
    raise exception 'Escribe el motivo de la cancelación.';
  end if;

  select cancelada_en into v_cancelada
    from public.asignaciones_produccion where id = p_asignacion_id for update;
  if not found then
    raise exception 'La asignación no existe.';
  end if;
  if v_cancelada is not null then
    raise exception 'La asignación ya estaba cancelada.';
  end if;
  if exists (
    select 1 from public.entregas_produccion
    where asignacion_id = p_asignacion_id and anulada_en is null and rechazada_en is null
  ) then
    raise exception 'La asignación ya tiene entregas registradas; no se puede cancelar.';
  end if;

  update public.asignaciones_produccion
    set cancelada_en = now(), cancelada_por = auth.uid(), motivo_cancelacion = btrim(p_motivo)
    where id = p_asignacion_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Vista: `entregado` ya no cuenta lo rechazado. Columnas nuevas al final
-- (create or replace view no deja reordenar):
--   * verificado: piezas que Producción ya mandó a Calidad;
--   * por_verificar: piezas entregadas que el trabajador todavía no revisa;
--   * ultima_verificacion: día (México) de la última verificación, para que
--     Calidad sepa si hay piezas nuevas desde su última evaluación.
-- ---------------------------------------------------------------------------
create or replace view public.asignaciones_produccion_resumen
with (security_invoker = true) as
select
  a.id,
  a.planeacion_item_id,
  a.pedido_id,
  a.numero_pedido,
  a.item_code,
  a.modelo,
  a.descripcion,
  a.unidad,
  a.equipo_id,
  e.nombre as equipo,
  e.encargado as equipo_encargado,
  e.es_planta,
  a.proceso,
  a.cantidad,
  a.fecha_asignacion,
  a.notas,
  a.creado_en,
  a.cancelada_en,
  a.motivo_cancelacion,
  coalesce(en.entregado, 0) as entregado,
  en.ultima_entrega,
  en.folios_calidad,
  coalesce(en.num_entregas, 0) as num_entregas,
  case
    when a.cancelada_en is not null then 'cancelada'
    when coalesce(en.entregado, 0) >= a.cantidad then 'entregada'
    when coalesce(en.entregado, 0) > 0 then 'parcial'
    else 'en_proceso'
  end as estado,
  coalesce(en.verificado, 0) as verificado,
  coalesce(en.entregado, 0) - coalesce(en.verificado, 0) as por_verificar,
  en.ultima_verificacion
from public.asignaciones_produccion a
join public.equipos_produccion e on e.id = a.equipo_id
left join lateral (
  select sum(x.cantidad) as entregado,
         max(x.fecha_entrega) as ultima_entrega,
         string_agg(x.folios_calidad, ', ' order by x.fecha_entrega, x.registrado_en) as folios_calidad,
         count(*) as num_entregas,
         sum(x.cantidad) filter (where x.verificada_en is not null) as verificado,
         max((x.verificada_en at time zone 'America/Mexico_City')::date) as ultima_verificacion
  from public.entregas_produccion x
  where x.asignacion_id = a.id and x.anulada_en is null and x.rechazada_en is null
) en on true;
