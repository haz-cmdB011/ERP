-- Objetos que esta migración debe dejar en la base (los comprueba `npm run db:verificar`):
-- @verifica column public.marcas_taller_produccion.nota
-- @verifica table public.historial_marcas_taller_produccion
-- @verifica function public.registrar_historial_marca_taller
-- @verifica trigger public.marcas_taller_produccion.trg_historial_marca_taller
-- @verifica policy public.historial_marcas_taller_produccion.select_historial_marcas_taller_produccion
-- @verifica constraint public.marcas_taller_produccion.marcas_taller_nota_check
--
-- Control de la bitácora de taller: la palomita o el tache (marcas_taller_produccion) ahora puede
-- llevar una nota corta (el motivo) y cada cambio queda en un historial. El historial se escribe solo,
-- con un trigger: nadie lo edita ni lo borra desde la app, y sobrevive a que se borre el mueble o la
-- asignación (por eso no tiene llaves foráneas y guarda una copia del modelo, el PM, la O.T. y el
-- equipo de ese momento). Una fila por cambio: marca anterior, marca nueva (null = la quitó), nota,
-- quién y cuándo. Sigue siendo solo informativo: no cambia estados, cantidades ni cobros.

alter table public.marcas_taller_produccion add column nota text;
alter table public.marcas_taller_produccion
  add constraint marcas_taller_nota_check check (nota is null or (btrim(nota) <> '' and char_length(nota) <= 300));

create table public.historial_marcas_taller_produccion (
  id uuid primary key default gen_random_uuid(),
  -- De qué es la marca: una asignación o un mueble (sin llaves foráneas: el historial se conserva).
  asignacion_id uuid,
  item_id uuid,
  -- Marca antes y después del cambio: true = palomita, false = tache, null = sin marca.
  esta_anterior boolean,
  esta boolean,
  nota text,
  -- Copia del contexto en el momento del cambio.
  modelo text,
  numero_pedido text,
  orden_trabajo text,
  equipo text,
  hecho_por uuid references auth.users(id) on delete set null default auth.uid(),
  -- Copia del nombre (o correo) de quien lo hizo, para mostrarlo sin leer los perfiles de otros.
  hecho_por_nombre text,
  hecho_en timestamptz not null default now(),
  constraint historial_marcas_taller_una_clave_check check ((asignacion_id is null) <> (item_id is null))
);
create index idx_historial_marcas_taller_hecho_en on public.historial_marcas_taller_produccion (hecho_en desc);
create index idx_historial_marcas_taller_asignacion on public.historial_marcas_taller_produccion (asignacion_id);
create index idx_historial_marcas_taller_item on public.historial_marcas_taller_produccion (item_id);
create index idx_historial_marcas_taller_hecho_por on public.historial_marcas_taller_produccion (hecho_por);

alter table public.historial_marcas_taller_produccion enable row level security;
-- Lo ve todo el personal interno. Sin políticas de escritura: solo lo llena el trigger.
create policy "select_historial_marcas_taller_produccion" on public.historial_marcas_taller_produccion
  for select to authenticated using ((select public.is_staff()));

create or replace function public.registrar_historial_marca_taller()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_fila public.marcas_taller_produccion;
  v_anterior boolean;
  v_esta boolean;
  v_nota text;
  v_modelo text;
  v_pm text;
  v_ot text;
  v_equipo text;
  v_quien text;
begin
  if tg_op = 'DELETE' then
    v_fila := old;
    v_anterior := old.esta;
    v_esta := null;
    v_nota := null;
  elsif tg_op = 'INSERT' then
    v_fila := new;
    v_anterior := null;
    v_esta := new.esta;
    v_nota := new.nota;
  else
    -- Solo si cambió la marca o la nota.
    if new.esta is not distinct from old.esta and new.nota is not distinct from old.nota then
      return new;
    end if;
    v_fila := new;
    v_anterior := old.esta;
    v_esta := new.esta;
    v_nota := new.nota;
  end if;

  if v_fila.asignacion_id is not null then
    select a.modelo, a.numero_pedido, p.orden_trabajo, e.nombre
      into v_modelo, v_pm, v_ot, v_equipo
      from public.asignaciones_produccion a
      left join public.pedidos p on p.id = a.pedido_id
      left join public.equipos_produccion e on e.id = a.equipo_id
      where a.id = v_fila.asignacion_id;
  else
    select i.modelo, p.numero_pedido, p.orden_trabajo
      into v_modelo, v_pm, v_ot
      from public.planeacion_items i
      join public.pedido_versiones pv on pv.id = i.pedido_version_id
      join public.pedidos p on p.id = pv.pedido_id
      where i.id = v_fila.item_id;
  end if;

  select coalesce(nullif(btrim(pf.nombre_completo), ''), pf.email) into v_quien
    from public.perfiles pf where pf.id = auth.uid();

  insert into public.historial_marcas_taller_produccion (
    asignacion_id, item_id, esta_anterior, esta, nota, modelo, numero_pedido, orden_trabajo, equipo, hecho_por_nombre
  ) values (
    v_fila.asignacion_id, v_fila.item_id, v_anterior, v_esta, v_nota, v_modelo, v_pm, v_ot, v_equipo, v_quien
  );
  return null;
end;
$$;
revoke execute on function public.registrar_historial_marca_taller() from public, anon, authenticated;

create trigger trg_historial_marca_taller
  after insert or update or delete on public.marcas_taller_produccion
  for each row execute function public.registrar_historial_marca_taller();
