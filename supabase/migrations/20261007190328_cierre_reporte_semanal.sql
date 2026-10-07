-- Objetos que esta migración debe dejar en la base (los comprueba `npm run db:verificar`):
-- @verifica table public.reporte_semanal_cierres
-- @verifica column public.reporte_semanal_cierres.recibos
-- @verifica constraint public.reporte_semanal_cierres.reporte_semanal_cierres_semana_unica
-- @verifica policy public.reporte_semanal_cierres.select_reporte_semanal_cierres
-- @verifica policy public.reporte_semanal_cierres.insert_reporte_semanal_cierres
-- @verifica policy public.reporte_semanal_cierres.delete_reporte_semanal_cierres

-- ============================================================================
-- Cierre del reporte semanal de Estimaciones.
--
-- El reporte se recalcula en cada visita con los recibos pagados de la semana.
-- Si después se elimina o corrige un recibo ya pagado, un reporte ya entregado
-- cambiaría sin avisar. "Cerrar semana" guarda una copia de lo reportado (un
-- renglón por recibo con su importe) y quién la cerró; la pantalla compara el
-- reporte vivo contra esa copia y señala cualquier diferencia.
--
-- Ver: personal de Estimaciones. Cerrar y reabrir: administrador de
-- Estimaciones o desarrollador. Una semana se cierra una sola vez (hay que
-- reabrirla para volver a cerrarla).
-- ============================================================================

create table public.reporte_semanal_cierres (
  id uuid primary key default gen_random_uuid(),
  anio integer not null check (anio between 2000 and 2100),
  semana integer not null check (semana between 1 and 53),
  cerrado_en timestamptz not null default now(),
  cerrado_por uuid references auth.users(id) on delete set null,
  cerrado_por_correo text,
  num_recibos integer not null check (num_recibos >= 0),
  importe numeric(14, 2) not null check (importe >= 0),
  -- [{ "tipo": "acabados", "folio": "123", "contratista": "…", "importe": 1200.5 }, …]
  recibos jsonb not null default '[]'::jsonb check (jsonb_typeof(recibos) = 'array'),
  constraint reporte_semanal_cierres_semana_unica unique (anio, semana)
);

alter table public.reporte_semanal_cierres enable row level security;

create policy select_reporte_semanal_cierres on public.reporte_semanal_cierres
  for select to authenticated
  using (public.is_estimaciones());

create policy insert_reporte_semanal_cierres on public.reporte_semanal_cierres
  for insert to authenticated
  with check (public.is_admin_area('estimaciones') and cerrado_por = (select auth.uid()));

create policy delete_reporte_semanal_cierres on public.reporte_semanal_cierres
  for delete to authenticated
  using (public.is_admin_area('estimaciones'));

revoke all on public.reporte_semanal_cierres from anon;
grant select, insert, delete on public.reporte_semanal_cierres to authenticated;
