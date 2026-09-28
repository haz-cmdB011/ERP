-- ============================================================================
-- Estimaciones — área(s) del maquilador.
--
-- Cada maquilador trabaja un área de maquila (acabados, armado o
-- electrificación) y solo puede capturar recibos de esa área. Lo normal es
-- una sola; como excepción un administrador le puede asignar varias.
-- * perfiles.areas_maquila: arreglo con al menos un área para el rol
--   maquilador (null para los demás roles).
-- * Solo un administrador la cambia (mismo trigger que rol/área/contratista).
-- * Triggers en recibos y renglones: el maquilador no puede insertar nada
--   fuera de sus áreas, aunque llame las RPC de guardado directamente.
-- ============================================================================

alter table public.perfiles add column areas_maquila text[];

alter table public.perfiles add constraint perfiles_areas_maquila_validas check (
  areas_maquila is null
  or areas_maquila <@ array['acabados', 'armado', 'electrificacion']::text[]
);

-- Maquiladores existentes: las áreas de los recibos que ya capturaron; si no
-- tienen ninguno, acabados.
update public.perfiles p set areas_maquila = coalesce(
  (
    select array_agg(distinct t order by t) from (
      select r.tipo::text as t from public.recibos r where r.capturado_por = p.id
      union
      select 'electrificacion' from public.recibos_electrificacion r where r.capturado_por = p.id
    ) x
  ),
  array['acabados']::text[]
)
where p.rol = 'maquilador';

alter table public.perfiles drop constraint perfiles_maquilador_check;
alter table public.perfiles add constraint perfiles_maquilador_check check (
  rol <> 'maquilador'
  or (
    area = 'estimaciones'
    and nullif(btrim(coalesce(contratista, '')), '') is not null
    and coalesce(cardinality(areas_maquila), 0) > 0
  )
);

create or replace function public.protect_perfiles_privileged_fields()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (public.is_admin() or auth.role() = 'service_role') then
    if new.rol is distinct from old.rol
       or new.area is distinct from old.area
       or new.contratista is distinct from old.contratista
       or new.areas_maquila is distinct from old.areas_maquila then
      raise exception 'Solo un administrador puede cambiar rol, área, contratista o áreas de maquila';
    end if;
  end if;
  return new;
end;
$$;

-- ¿Puede el usuario actual capturar recibos de este tipo? Siempre true para
-- quien no es maquilador (su permiso lo validan las RPC como antes).
create or replace function public.puede_capturar_tipo(p_tipo text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not public.is_maquilador() or exists (
    select 1 from public.perfiles
    where id = auth.uid() and p_tipo = any(areas_maquila)
  );
$$;
revoke execute on function public.puede_capturar_tipo(text) from public, anon;
grant execute on function public.puede_capturar_tipo(text) to authenticated;

create or replace function public.est_validar_area_maquilador()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tipo text;
begin
  if tg_table_name = 'recibos' then
    v_tipo := new.tipo::text;
  elsif tg_table_name = 'recibos_electrificacion' then
    v_tipo := 'electrificacion';
  elsif tg_table_name = 'renglones' then
    select tipo::text into v_tipo from public.recibos where id = new.recibo_id;
  else
    v_tipo := 'electrificacion';
  end if;

  if not public.puede_capturar_tipo(v_tipo) then
    raise exception 'Tu usuario de maquilador no tiene asignada el área de %; solo puedes generar recibos de tu área.',
      v_tipo;
  end if;
  return new;
end;
$$;
revoke execute on function public.est_validar_area_maquilador() from public, anon, authenticated;

create trigger recibos_validar_area_maquilador
  before insert on public.recibos
  for each row execute function public.est_validar_area_maquilador();
create trigger renglones_validar_area_maquilador
  before insert on public.renglones
  for each row execute function public.est_validar_area_maquilador();
create trigger recibos_electrificacion_validar_area_maquilador
  before insert on public.recibos_electrificacion
  for each row execute function public.est_validar_area_maquilador();
create trigger renglones_electrificacion_validar_area_maquilador
  before insert on public.renglones_electrificacion
  for each row execute function public.est_validar_area_maquilador();
