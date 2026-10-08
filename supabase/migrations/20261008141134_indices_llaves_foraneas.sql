-- Objetos que esta migración debe dejar en la base (los comprueba `npm run db:verificar`):
-- @verifica index public.idx_equipos_produccion_creado_por
-- @verifica index public.idx_promociones_tarifa_resuelta_por
-- @verifica index public.idx_recibos_cancelado_por
-- @verifica index public.idx_recibos_pagado_por
-- @verifica index public.idx_recibos_revisado_por
-- @verifica index public.idx_recibos_electrificacion_cancelado_por
-- @verifica index public.idx_recibos_electrificacion_pagado_por
-- @verifica index public.idx_recibos_electrificacion_revisado_por
-- @verifica index public.idx_reporte_semanal_cierres_cerrado_por

-- Índices para las 9 llaves foráneas que el avisador de rendimiento de Supabase marcaba
-- sin índice (unindexed_foreign_keys). Son columnas "quién hizo qué" hacia perfiles.
-- Hoy las tablas son diminutas y no se nota; sirven para que, al crecer, borrar o
-- actualizar un perfil no recorra tablas enteras buscando referencias.

create index if not exists idx_equipos_produccion_creado_por on public.equipos_produccion (creado_por);
create index if not exists idx_promociones_tarifa_resuelta_por on public.promociones_tarifa (resuelta_por);
create index if not exists idx_recibos_cancelado_por on public.recibos (cancelado_por);
create index if not exists idx_recibos_pagado_por on public.recibos (pagado_por);
create index if not exists idx_recibos_revisado_por on public.recibos (revisado_por);
create index if not exists idx_recibos_electrificacion_cancelado_por on public.recibos_electrificacion (cancelado_por);
create index if not exists idx_recibos_electrificacion_pagado_por on public.recibos_electrificacion (pagado_por);
create index if not exists idx_recibos_electrificacion_revisado_por on public.recibos_electrificacion (revisado_por);
create index if not exists idx_reporte_semanal_cierres_cerrado_por on public.reporte_semanal_cierres (cerrado_por);
