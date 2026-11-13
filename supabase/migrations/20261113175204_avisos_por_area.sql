-- Objetos que esta migración debe dejar en la base (los comprueba `npm run db:verificar`):
-- @verifica table public.avisos
-- @verifica table public.avisos_leidos
-- @verifica column public.avisos.push_enviado_en
-- @verifica policy public.avisos.select_avisos
-- @verifica policy public.avisos_leidos.select_avisos_leidos
-- @verifica policy public.avisos_leidos.insert_avisos_leidos
-- @verifica policy public.avisos_leidos.delete_avisos_leidos
-- @verifica function public.aviso_visible
-- @verifica function public.crear_aviso
-- @verifica trigger public.planeacion_items.trg_aviso_liberado
-- @verifica trigger public.entregas_produccion.trg_aviso_entrega
-- @verifica trigger public.informes_calidad.trg_aviso_informe_calidad
-- @verifica trigger public.revisiones_finales_calidad.trg_aviso_revision_final
-- @verifica trigger public.recibos.trg_aviso_recibo_nuevo
-- @verifica trigger public.recibos.trg_aviso_recibo_revisado
--
-- Avisos por área (campanita dentro de la app y notificaciones al celular). Cada aviso nace de un
-- trigger, no de la pantalla: así no se pueden inventar desde el navegador y cubre toda vía por la
-- que ocurre el hecho (rutas de servidor o funciones que llama la app directo).
--
--   Se liberaron muebles a Producción      → Producción
--   Producción registró una entrega        → Calidad
--   Calidad aprobó o rechazó (lote o final) → Producción
--   Recibo nuevo                           → Estimaciones
--   Recibo revisado                        → quien lo capturó (el maquilador)
--
-- Un aviso es de un área (lo ve el administrador y el trabajador de esa área; el desarrollador, el
-- de cada área en la que entra) o de una persona (`destinatario_id`). Quién lo leyó se guarda aparte
-- (avisos_leidos), porque el mismo aviso lo ven varias personas. Los triggers NUNCA frenan la
-- operación: si armar el aviso falla, el hecho (liberar, entregar, evaluar…) sigue como si nada.
-- `push_enviado_en` marca los que ya se mandaron al celular (lo hace el servidor).

create table public.avisos (
  id uuid primary key default gen_random_uuid(),
  area text not null check (area in ('planeacion', 'produccion', 'calidad', 'estimaciones')),
  destinatario_id uuid references auth.users(id) on delete cascade,
  tipo text not null check (char_length(tipo) <= 40),
  titulo text not null check (char_length(titulo) <= 80),
  cuerpo text not null default '' check (char_length(cuerpo) <= 200),
  url text check (url is null or (char_length(url) <= 300 and url like '/%' and url not like '//%')),
  creado_por uuid references auth.users(id) on delete set null default auth.uid(),
  creado_en timestamptz not null default now(),
  push_enviado_en timestamptz
);
create index idx_avisos_area_fecha on public.avisos (area, creado_en desc);
create index idx_avisos_destinatario_fecha on public.avisos (destinatario_id, creado_en desc) where destinatario_id is not null;
create index idx_avisos_creado_por on public.avisos (creado_por) where push_enviado_en is null;

create table public.avisos_leidos (
  aviso_id uuid not null references public.avisos(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  leido_en timestamptz not null default now(),
  primary key (aviso_id, user_id)
);
create index idx_avisos_leidos_usuario on public.avisos_leidos (user_id);

-- ¿La persona con la sesión abierta puede ver este aviso? De ella, o de su área (administrador y
-- trabajador), o cualquiera si es desarrollador. El maquilador solo ve los que son suyos.
create or replace function public.aviso_visible(p_area text, p_destinatario uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p_destinatario is not null then p_destinatario = auth.uid()
    else exists (
      select 1 from public.perfiles p
      where p.id = auth.uid()
        and (p.rol = 'desarrollador' or (p.rol in ('administrador', 'trabajador') and p.area::text = p_area))
    )
  end;
$$;
revoke execute on function public.aviso_visible(text, uuid) from public, anon;
grant execute on function public.aviso_visible(text, uuid) to authenticated;

alter table public.avisos enable row level security;
alter table public.avisos_leidos enable row level security;

-- Los avisos solo los escriben los triggers (y el servidor con la clave de servicio): no hay política
-- de alta, edición ni baja para la app.
create policy "select_avisos" on public.avisos
  for select to authenticated using ((select public.aviso_visible(area, destinatario_id)));

-- Cada persona marca como leídos solo los avisos que puede ver, y solo a su nombre.
create policy "select_avisos_leidos" on public.avisos_leidos
  for select to authenticated using (user_id = (select auth.uid()));
create policy "insert_avisos_leidos" on public.avisos_leidos
  for insert to authenticated with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.avisos a where a.id = aviso_id)
  );
create policy "delete_avisos_leidos" on public.avisos_leidos
  for delete to authenticated using (user_id = (select auth.uid()));

-- Alta de un aviso (solo la usan los triggers de abajo).
create or replace function public.crear_aviso(
  p_area text, p_tipo text, p_titulo text, p_cuerpo text, p_url text, p_destinatario uuid default null
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.avisos (area, destinatario_id, tipo, titulo, cuerpo, url)
  values (p_area, p_destinatario, p_tipo, left(p_titulo, 80), left(coalesce(p_cuerpo, ''), 200), p_url);
$$;
revoke execute on function public.crear_aviso(text, text, text, text, text, uuid) from public, anon, authenticated;

-- "O.T. 102-24" o, si el PM no tiene O.T., "PM 009-26".
create or replace function public.etiqueta_pedido(p_pedido_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce('O.T. ' || nullif(btrim(p.orden_trabajo), ''), 'PM ' || p.numero_pedido)
  from public.pedidos p where p.id = p_pedido_id;
$$;
revoke execute on function public.etiqueta_pedido(uuid) from public, anon, authenticated;

-- Cantidad sin ceros de sobra: 3.00 → "3".
create or replace function public.cantidad_aviso(p_cantidad numeric)
returns text
language sql
immutable
set search_path = ''
as $$ select trim_scale(coalesce(p_cantidad, 0))::text; $$;
revoke execute on function public.cantidad_aviso(numeric) from public, anon, authenticated;

-- ── Se liberaron muebles a Producción ──────────────────────────────────────────────
-- Una sola vez por liberación (por instrucción), no por mueble: se miran los muebles padre que
-- pasaron a "enviado a producción" en esa misma instrucción.
create or replace function public.trg_aviso_liberado()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_n integer;
  v_donde text;
begin
  begin
    select count(*),
           array_to_string((array_agg(distinct public.etiqueta_pedido(pv.pedido_id)))[1:3], ', ')
      into v_n, v_donde
      from nuevos n
      join viejos v on v.id = n.id
      left join public.pedido_versiones pv on pv.id = n.pedido_version_id
     where n.parent_item_id is null
       and n.estado_liberacion = 'enviado_a_produccion'
       and v.estado_liberacion is distinct from 'enviado_a_produccion';
    if v_n > 0 then
      perform public.crear_aviso(
        'produccion', 'liberado',
        case when v_n = 1 then 'Se liberó 1 mueble a Producción' else 'Se liberaron ' || v_n || ' muebles a Producción' end,
        coalesce(v_donde, ''), '/produccion/panel'
      );
    end if;
  exception when others then
    null; -- un aviso que no se pudo armar nunca frena la liberación
  end;
  return null;
end;
$$;
revoke execute on function public.trg_aviso_liberado() from public, anon, authenticated;

create trigger trg_aviso_liberado
  after update on public.planeacion_items
  referencing old table as viejos new table as nuevos
  for each statement execute function public.trg_aviso_liberado();

-- ── Producción registró una entrega ────────────────────────────────────────────────
create or replace function public.trg_aviso_entrega()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  a record;
begin
  begin
    if new.anulada_en is not null then
      return new;
    end if;
    select modelo, unidad, pedido_id into a from public.asignaciones_produccion where id = new.asignacion_id;
    perform public.crear_aviso(
      'calidad', 'entrega',
      'Producción entregó ' || public.cantidad_aviso(new.cantidad) || ' ' || coalesce(nullif(btrim(a.unidad), ''), 'pza'),
      concat_ws(' · ', nullif(btrim(a.modelo), ''), public.etiqueta_pedido(a.pedido_id), nullif('folio ' || btrim(coalesce(new.folios_calidad, '')), 'folio ')),
      '/calidad/entregas'
    );
  exception when others then
    null;
  end;
  return new;
end;
$$;
revoke execute on function public.trg_aviso_entrega() from public, anon, authenticated;

create trigger trg_aviso_entrega
  after insert on public.entregas_produccion
  for each row execute function public.trg_aviso_entrega();

-- ── Calidad evaluó un lote (aprobó o rechazó) ──────────────────────────────────────
create or replace function public.trg_aviso_informe_calidad()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  i record;
begin
  begin
    -- Solo las evaluaciones de entregas; los demás informes (no conformidades, incidencias) no avisan aquí.
    if new.entrega_id is null and new.entrega_parte_id is null then
      return new;
    end if;
    select pi.modelo, pv.pedido_id into i
      from public.planeacion_items pi
      left join public.pedido_versiones pv on pv.id = pi.pedido_version_id
     where pi.id = new.planeacion_item_id;
    perform public.crear_aviso(
      'produccion', case when new.aprobado then 'calidad_aprobo' else 'calidad_rechazo' end,
      case when new.aprobado
        then 'Calidad aprobó ' || public.cantidad_aviso(new.cantidad) || ' pz'
        else 'Calidad rechazó ' || public.cantidad_aviso(new.cantidad) || ' pz' end,
      concat_ws(' · ', nullif(btrim(i.modelo), ''), public.etiqueta_pedido(i.pedido_id),
        case when new.aprobado then null else left(btrim(coalesce(new.descripcion, '')), 80) end),
      case when new.aprobado then '/produccion/panel' else '/produccion/rechazos' end
    );
  exception when others then
    null;
  end;
  return new;
end;
$$;
revoke execute on function public.trg_aviso_informe_calidad() from public, anon, authenticated;

create trigger trg_aviso_informe_calidad
  after insert on public.informes_calidad
  for each row execute function public.trg_aviso_informe_calidad();

-- ── Calidad hizo la revisión final del mueble completo ─────────────────────────────
create or replace function public.trg_aviso_revision_final()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  i record;
begin
  begin
    select pi.modelo, pv.pedido_id into i
      from public.planeacion_items pi
      left join public.pedido_versiones pv on pv.id = pi.pedido_version_id
     where pi.id = new.planeacion_item_id;
    perform public.crear_aviso(
      'produccion', case when new.aprobado then 'calidad_aprobo' else 'calidad_rechazo' end,
      case when new.aprobado
        then 'Calidad aprobó el mueble completo (' || public.cantidad_aviso(new.cantidad) || ' pz)'
        else 'Calidad rechazó en la revisión final ' || public.cantidad_aviso(new.cantidad) || ' pz' end,
      concat_ws(' · ', nullif(btrim(i.modelo), ''), public.etiqueta_pedido(i.pedido_id),
        case when new.aprobado then null else left(btrim(coalesce(new.motivo, '')), 80) end),
      case when new.aprobado then '/produccion/panel' else '/produccion/rechazos' end
    );
  exception when others then
    null;
  end;
  return new;
end;
$$;
revoke execute on function public.trg_aviso_revision_final() from public, anon, authenticated;

create trigger trg_aviso_revision_final
  after insert on public.revisiones_finales_calidad
  for each row execute function public.trg_aviso_revision_final();

-- ── Recibos: uno nuevo llega a Estimaciones; al revisarlo, le avisa a quien lo capturó ──
create or replace function public.trg_aviso_recibo_nuevo()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  begin
    if new.estado = 'pendiente' then
      perform public.crear_aviso(
        'estimaciones', 'recibo_nuevo', 'Recibo nuevo por revisar',
        concat_ws(' · ', nullif(btrim(coalesce(new.folio, '')), ''), nullif(btrim(coalesce(new.contratista, '')), ''),
          case when nullif(btrim(coalesce(new.ot, '')), '') is not null then 'O.T. ' || btrim(new.ot) end),
        '/estimaciones/revision'
      );
    end if;
  exception when others then
    null;
  end;
  return new;
end;
$$;
revoke execute on function public.trg_aviso_recibo_nuevo() from public, anon, authenticated;

create trigger trg_aviso_recibo_nuevo
  after insert on public.recibos
  for each row execute function public.trg_aviso_recibo_nuevo();

create or replace function public.trg_aviso_recibo_revisado()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  begin
    if new.estado = 'revisado' and old.estado is distinct from 'revisado'
       and new.capturado_por is not null and new.capturado_por is distinct from new.revisado_por then
      perform public.crear_aviso(
        'estimaciones', 'recibo_revisado', 'Revisaron tu recibo',
        concat_ws(' · ', nullif(btrim(coalesce(new.folio, '')), ''),
          case when nullif(btrim(coalesce(new.ot, '')), '') is not null then 'O.T. ' || btrim(new.ot) end),
        '/estimaciones/mis-recibos', new.capturado_por
      );
    end if;
  exception when others then
    null;
  end;
  return new;
end;
$$;
revoke execute on function public.trg_aviso_recibo_revisado() from public, anon, authenticated;

create trigger trg_aviso_recibo_revisado
  after update of estado on public.recibos
  for each row execute function public.trg_aviso_recibo_revisado();

-- Para deshacer:
--   drop trigger trg_aviso_liberado on public.planeacion_items;
--   drop trigger trg_aviso_entrega on public.entregas_produccion;
--   drop trigger trg_aviso_informe_calidad on public.informes_calidad;
--   drop trigger trg_aviso_revision_final on public.revisiones_finales_calidad;
--   drop trigger trg_aviso_recibo_nuevo on public.recibos;
--   drop trigger trg_aviso_recibo_revisado on public.recibos;
--   drop table public.avisos_leidos, public.avisos;
