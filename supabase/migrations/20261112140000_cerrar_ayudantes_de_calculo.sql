-- @verifica function public.cobertura_partes_vez
-- @verifica function public.item_verificado_por_produccion
-- @verifica function public.revision_final_activa
--
-- Cierra tres funciones auxiliares (SECURITY DEFINER) que cualquier sesión iniciada podía llamar por
-- /rest/v1/rpc/ (aviso "authenticated_security_definer_function_executable" del asesor de Supabase)
-- y que no revisan el rol de quien las llama:
--
--   cobertura_partes_vez(uuid, jsonb, text, integer)  la usan solo aprobado_calidad_variante y
--                                                     verificado_produccion_variante
--   item_verificado_por_produccion(uuid)              no la llama ninguna otra función ni la app
--   revision_final_activa()                           la usa solo registrar_revision_final
--
-- Quienes las llaman por dentro son funciones SECURITY DEFINER cuyo dueño es postgres, así que siguen
-- funcionando (como ya pasa con aprobado_calidad_variante, que no tiene permiso para `authenticated` y
-- aun así la ejecuta el trigger del recibo). `service_role` y `postgres` conservan el permiso.
--
-- NO se cierran, a propósito, tres funciones que el asesor también lista, porque las llaman funciones
-- SECURITY INVOKER (corren con los permisos de quien las ejecuta) y quitar el permiso las rompería:
--   muebles_por_partes             <- piezas_listas_revision_final
--   piezas_verificadas_mueble      <- crear_informes_calidad_aprobados
--   verificacion_produccion_activa <- crear_informes_calidad_aprobados
-- Solo devuelven cantidades o una bandera de un mueble a quien ya tiene sesión y conoce su id. Para
-- cerrarlas habría que pasar esas dos funciones a SECURITY DEFINER con su propia revisión de rol.
--
-- Para deshacer: grant execute on function <la función> to authenticated;

revoke execute on function public.cobertura_partes_vez(uuid, jsonb, text, integer) from public, anon, authenticated;
revoke execute on function public.item_verificado_por_produccion(uuid) from public, anon, authenticated;
revoke execute on function public.revision_final_activa() from public, anon, authenticated;
