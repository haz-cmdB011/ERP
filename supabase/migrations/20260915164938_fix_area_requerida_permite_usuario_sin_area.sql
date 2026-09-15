-- BUG: la migración anterior exigía área para cualquier rol distinto de
-- 'desarrollador', pero el rol por defecto de un usuario recién creado es
-- 'usuario' con area=null (handle_new_user solo inserta id+email) — eso
-- violaba el constraint en cada alta nueva, rompiendo la creación de
-- CUALQUIER usuario. 'usuario' (el estado "sin asignar todavía") también
-- queda exento de requerir área, igual que 'desarrollador'.
alter table public.perfiles drop constraint perfiles_area_requerida_check;
alter table public.perfiles add constraint perfiles_area_requerida_check
  check (rol in ('desarrollador', 'usuario') or area is not null);
