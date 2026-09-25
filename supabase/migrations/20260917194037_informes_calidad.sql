-- ============================================================================
-- Informes de Calidad: un ítem puede tener varios informes a lo largo del
-- tiempo (historial de auditoría). Cada evaluación (aprobada o no) genera
-- un registro nuevo e inmutable — el folio funciona como "firma digital de
-- rastreo" (referenciada también por el QR de la ficha impresa). No hay
-- política de UPDATE/DELETE a propósito.
-- ============================================================================

create sequence public.informes_calidad_folio_seq;

create table public.informes_calidad (
  id uuid primary key default gen_random_uuid(),
  planeacion_item_id uuid not null references public.planeacion_items(id) on delete cascade,
  folio text not null unique,
  aprobado boolean not null,
  descripcion text,
  elaborado_por uuid references auth.users(id),
  elaborado_en timestamptz not null default now()
);
create index idx_informes_calidad_item on public.informes_calidad (planeacion_item_id);

-- Mismo estilo que is_produccion()/is_planeacion(): trabajador o
-- administrador del área 'calidad', o desarrollador.
create or replace function public.is_calidad()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_admin() or exists (
    select 1 from public.perfiles
    where id = auth.uid() and rol in ('administrador', 'trabajador') and area = 'calidad'
  );
$$;
grant execute on function public.is_calidad() to authenticated;

alter table public.informes_calidad enable row level security;
create policy "authenticated_select_informes_calidad" on public.informes_calidad
  for select using (auth.role() = 'authenticated');
create policy "calidad_insert_informes_calidad" on public.informes_calidad
  for insert with check (public.is_calidad());

create or replace function public.crear_informe_calidad(
  p_item_id uuid,
  p_aprobado boolean,
  p_descripcion text
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_folio text;
  v_id uuid;
begin
  if not public.is_calidad() then
    raise exception 'No tienes permiso para generar informes de calidad.';
  end if;

  v_folio := 'CAL-' || lpad(nextval('public.informes_calidad_folio_seq')::text, 6, '0');

  insert into public.informes_calidad (planeacion_item_id, folio, aprobado, descripcion, elaborado_por)
    values (p_item_id, v_folio, p_aprobado, nullif(p_descripcion, ''), auth.uid())
    returning id into v_id;

  return v_id;
end;
$$;

revoke execute on function public.crear_informe_calidad(uuid, boolean, text) from public, anon;
grant execute on function public.crear_informe_calidad(uuid, boolean, text) to authenticated;
