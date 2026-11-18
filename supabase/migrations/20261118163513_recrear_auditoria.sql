-- Objetos que esta migración debe dejar en la base (los comprueba `npm run db:verificar`):
-- @verifica table public.auditoria
-- @verifica index public.idx_auditoria_en
-- @verifica index public.idx_auditoria_registro
-- @verifica policy public.auditoria.admin_select_auditoria
--
-- Recrea la tabla `auditoria` (bitácora de quién hizo qué), que no estaba en la base: los triggers
-- (auditar_cambios, auditar_recibos, auditar_produccion_calidad) y las funciones guardar_despiece_produccion,
-- guardar_ruta_produccion y registrar_revision_final escriben en ella, así que sin la tabla fallaba
-- cancelar o eliminar un pedido, asignar, entregar, evaluar en Calidad, cambiar el estado de un recibo,
-- guardar un despiece o una ruta, y la revisión final. La pantalla Administración › Auditoría tampoco abría.
-- Misma definición de la migración auditoria (20260921190300) con el ajuste posterior de políticas
-- (solo `authenticated`). Vuelve VACÍA. Es idempotente: si la tabla ya existe, no cambia nada.

create table if not exists public.auditoria (
  id bigint generated always as identity primary key,
  en timestamptz not null default now(),
  -- Sin FK a propósito: el registro debe sobrevivir aunque se borre el usuario
  -- o el pedido/ítem al que se refiere.
  usuario_id uuid,
  tabla text not null,
  registro_id uuid not null,
  accion text not null,
  detalle jsonb not null default '{}'::jsonb
);
create index if not exists idx_auditoria_en on public.auditoria (en desc);
create index if not exists idx_auditoria_registro on public.auditoria (tabla, registro_id);

alter table public.auditoria enable row level security;
-- Solo lectura para desarrolladores y administradores de área.
drop policy if exists "admin_select_auditoria" on public.auditoria;
create policy "admin_select_auditoria" on public.auditoria
  for select to authenticated using (
    (select public.is_admin())
    or (select public.is_admin_area('planeacion'))
    or (select public.is_admin_area('produccion'))
    or (select public.is_admin_area('calidad'))
  );
revoke insert, update, delete on public.auditoria from anon, authenticated;
