-- La vista de folios solo se lee. El rol authenticated tenía todos los permisos sobre
-- ella (INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER); la vista no admite
-- escritura, así que esos permisos no servían. Se quitan y queda solo SELECT.
-- security_invoker sigue activo: RLS se aplica al usuario que consulta.

revoke insert, update, delete, truncate, references, trigger on public.informes_calidad_estado from authenticated;
