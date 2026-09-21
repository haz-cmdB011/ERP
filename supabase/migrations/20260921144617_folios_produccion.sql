-- Folio único por ítem, asignado la PRIMERA vez que se libera a producción.
-- Es un registro permanente: la fila sobrevive aunque el ítem o el pedido se
-- borren (FK ON DELETE SET NULL + copia de los datos del ítem), y si el ítem
-- se restaura o se revierte y se vuelve a liberar, conserva el mismo folio.
create sequence public.folios_produccion_folio_seq;

create table public.folios_produccion (
  id uuid primary key default gen_random_uuid(),
  folio text not null unique,
  planeacion_item_id uuid unique references public.planeacion_items(id) on delete set null,
  generado_en timestamptz not null default now(),
  -- Copia (snapshot) para poder mostrar el folio aunque el ítem ya no exista.
  numero_pedido text,
  proyecto text,
  cliente text,
  item_code numeric,
  modelo text,
  tipo_material text,
  descripcion text,
  cantidad_total numeric,
  unidad text
);
create index idx_folios_produccion_generado on public.folios_produccion (generado_en desc);

alter table public.folios_produccion enable row level security;
create policy "authenticated_select_folios_produccion" on public.folios_produccion
  for select using (auth.role() = 'authenticated');
-- Sin políticas de INSERT/UPDATE/DELETE: solo los triggers (security definer)
-- escriben aquí, y nadie puede borrar ni editar un folio desde la app.

create or replace function public.asignar_folio_produccion()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_numero_pedido text;
  v_proyecto text;
  v_cliente text;
begin
  if new.estado_liberacion = 'enviado_a_produccion'
     and (tg_op = 'INSERT' or old.estado_liberacion is distinct from 'enviado_a_produccion')
     and not exists (
       select 1 from public.folios_produccion where planeacion_item_id = new.id
     ) then
    select p.numero_pedido, pr.nombre, pr.cliente
      into v_numero_pedido, v_proyecto, v_cliente
      from public.pedido_versiones pv
      join public.pedidos p on p.id = pv.pedido_id
      left join public.proyectos pr on pr.id = p.proyecto_id
      where pv.id = new.pedido_version_id;

    insert into public.folios_produccion (
      folio, planeacion_item_id, numero_pedido, proyecto, cliente,
      item_code, modelo, tipo_material, descripcion, cantidad_total, unidad
    ) values (
      'PRD-' || lpad(nextval('public.folios_produccion_folio_seq')::text, 6, '0'),
      new.id, v_numero_pedido, v_proyecto, v_cliente,
      new.item_code, new.modelo, new.tipo_material, new.descripcion,
      new.cantidad_total, new.unidad
    );
  end if;
  return new;
end;
$$;

create trigger trg_asignar_folio_produccion
  after insert or update of estado_liberacion on public.planeacion_items
  for each row execute function public.asignar_folio_produccion();

-- Antes de borrar un ítem (directo o en cascada al borrar un pedido) se
-- refresca la copia de sus datos; el FK deja planeacion_item_id en null.
create or replace function public.conservar_folio_produccion()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.folios_produccion
    set item_code = old.item_code,
        modelo = old.modelo,
        tipo_material = old.tipo_material,
        descripcion = old.descripcion,
        cantidad_total = old.cantidad_total,
        unidad = old.unidad
    where planeacion_item_id = old.id;
  return old;
end;
$$;

create trigger trg_conservar_folio_produccion
  before delete on public.planeacion_items
  for each row execute function public.conservar_folio_produccion();

-- Ítems que ya estaban liberados antes de existir esta función.
insert into public.folios_produccion (
  folio, planeacion_item_id, generado_en, numero_pedido, proyecto, cliente,
  item_code, modelo, tipo_material, descripcion, cantidad_total, unidad
)
select 'PRD-' || lpad(nextval('public.folios_produccion_folio_seq')::text, 6, '0'),
       s.id, s.generado_en, s.numero_pedido, s.proyecto, s.cliente,
       s.item_code, s.modelo, s.tipo_material, s.descripcion, s.cantidad_total, s.unidad
from (
  select pi.id, coalesce(pi.liberado_en, now()) as generado_en,
         p.numero_pedido, pr.nombre as proyecto, pr.cliente,
         pi.item_code, pi.modelo, pi.tipo_material, pi.descripcion,
         pi.cantidad_total, pi.unidad
  from public.planeacion_items pi
  join public.pedido_versiones pv on pv.id = pi.pedido_version_id
  join public.pedidos p on p.id = pv.pedido_id
  left join public.proyectos pr on pr.id = p.proyecto_id
  where pi.estado_liberacion = 'enviado_a_produccion'
  order by coalesce(pi.liberado_en, now()), pi.item_code
) s;
