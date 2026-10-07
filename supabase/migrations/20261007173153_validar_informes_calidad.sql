-- Objetos que esta migración debe dejar en la base (los comprueba `npm run db:verificar`):
-- @verifica function-contiene public.crear_informe_calidad Indica el motivo
-- @verifica function-contiene public.crear_informe_calidad ya no se evalúa
-- @verifica function public.crear_informes_calidad_aprobados
-- @verifica column public.informes_calidad.categoria
-- @verifica constraint public.informes_calidad.informes_calidad_categoria_check
-- @verifica column public.informes_calidad_estado.categoria

-- ============================================================================
-- Informes de Calidad: las reglas que solo cumplía la pantalla ahora las exige
-- la base.
--
--   * Un informe "No aprobado" lleva motivo (antes solo lo pedía el formulario;
--     llamando a la función directo se podía emitir un folio permanente sin él).
--   * Solo se evalúan ítems que existen, están enviados a producción y no están
--     cancelados ni eliminados.
--
-- Los informes "No aprobado" pueden llevar una categoría del defecto (acabado,
-- medidas, daño…) para poder medir qué falla más. Es opcional y solo aplica a
-- los no aprobados; la lista es la de src/lib/calidad/categorias.ts.
--
-- Además, crear_informes_calidad_aprobados aprueba varios ítems de una vez en
-- una sola transacción: si uno falla, ninguno queda aprobado. Cada folio sale
-- de crear_informe_calidad, así que las validaciones son las mismas.
-- ============================================================================

alter table public.informes_calidad
  add column categoria text,
  add constraint informes_calidad_categoria_check check (
    categoria is null
    or (aprobado = false and categoria in ('acabado', 'medidas', 'dano', 'faltante', 'material', 'armado', 'otro'))
  );

-- La firma cambia (p_categoria): se quita la anterior para que llamar con tres
-- argumentos no sea ambiguo entre dos versiones.
drop function if exists public.crear_informe_calidad(uuid, boolean, text);

create or replace function public.crear_informe_calidad(
  p_item_id uuid,
  p_aprobado boolean,
  p_descripcion text,
  p_categoria text default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_folio text;
  v_id uuid;
  v_item record;
begin
  if not public.is_calidad() then
    raise exception 'No tienes permiso para generar informes de calidad.';
  end if;

  if not p_aprobado and nullif(btrim(coalesce(p_descripcion, '')), '') is null then
    raise exception 'Indica el motivo por el que no se aprueba.';
  end if;

  select estado_liberacion, estado_revision, eliminacion_solicitada_en
    into v_item
    from public.planeacion_items
    where id = p_item_id;
  if not found then
    raise exception 'El ítem no existe.';
  end if;
  if v_item.estado_liberacion is distinct from 'enviado_a_produccion' then
    raise exception 'El ítem todavía no se envió a producción.';
  end if;
  if v_item.estado_revision = 'cancelado' then
    raise exception 'El ítem está cancelado y ya no se evalúa.';
  end if;
  if v_item.eliminacion_solicitada_en is not null then
    raise exception 'El ítem fue eliminado y ya no se evalúa.';
  end if;

  v_folio := 'CAL-' || lpad(nextval('public.informes_calidad_folio_seq')::text, 6, '0');

  insert into public.informes_calidad (planeacion_item_id, folio, aprobado, descripcion, categoria, elaborado_por)
    values (
      p_item_id, v_folio, p_aprobado, nullif(btrim(coalesce(p_descripcion, '')), ''),
      case when p_aprobado then null else nullif(btrim(coalesce(p_categoria, '')), '') end,
      auth.uid()
    )
    returning id into v_id;

  return v_id;
end;
$$;

revoke execute on function public.crear_informe_calidad(uuid, boolean, text, text) from public, anon;
grant execute on function public.crear_informe_calidad(uuid, boolean, text, text) to authenticated;

create or replace function public.crear_informes_calidad_aprobados(p_item_ids uuid[])
returns table (item_id uuid, informe_id uuid)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_item uuid;
begin
  if p_item_ids is null or cardinality(p_item_ids) = 0 then
    raise exception 'No hay ítems que aprobar.';
  end if;
  if cardinality(p_item_ids) > 200 then
    raise exception 'Se pueden aprobar hasta 200 ítems a la vez.';
  end if;

  for v_item in select distinct x from unnest(p_item_ids) as x order by x
  loop
    item_id := v_item;
    informe_id := public.crear_informe_calidad(v_item, true, '', null);
    return next;
  end loop;
end;
$$;

revoke execute on function public.crear_informes_calidad_aprobados(uuid[]) from public, anon;
grant execute on function public.crear_informes_calidad_aprobados(uuid[]) to authenticated;

-- La vista de folios gana la categoría del defecto (al final, para no mover las
-- columnas existentes) y así se puede filtrar por ella.
create or replace view public.informes_calidad_estado
with (security_invoker = true) as
select
  ic.id,
  ic.folio,
  ic.aprobado,
  ic.elaborado_en,
  coalesce(
    pi.id is null
    or p.eliminado_en is not null
    or pi.eliminacion_solicitada_en is not null
    or pi.estado_revision = 'cancelado'
    or p.cancelado_en is not null,
    false
  ) as con_situacion,
  ic.categoria
from public.informes_calidad ic
left join public.planeacion_items pi on pi.id = ic.planeacion_item_id
left join public.pedido_versiones pv on pv.id = pi.pedido_version_id
left join public.pedidos p on p.id = pv.pedido_id;
