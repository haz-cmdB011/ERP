-- Defensa en profundidad: las políticas de RLS de las tablas de la aplicación pasan de aplicarse al
-- rol "public" (que incluye a los visitantes anónimos) a aplicarse solo a "authenticated".
--
-- Antes: 81 políticas sin cláusula TO, que PostgreSQL toma como "public". Hoy no es explotable: todas
-- exigen un usuario (auth.uid()) o una función de rol (is_staff(), is_planeacion()…) y los anónimos
-- no pueden ejecutar esas funciones; se comprobó con la clave pública (401 en todas las tablas).
-- Pero el contrato queda escrito en la propia política en lugar de depender de eso, y de paso el
-- avisador de rendimiento de Supabase deja de marcar a anon, authenticator, dashboard_user… como
-- roles con políticas duplicadas.
--
-- No cambia ninguna condición (USING / WITH CHECK): solo a quién se aplican. service_role se salta
-- RLS y no se ve afectado. Las otras 9 políticas ya eran TO authenticated.
--
-- Cómo comprobar después de aplicarla:
--   select count(*) from pg_policies where schemaname = 'public' and roles = array['public']::name[];  -- 0
--   y repetir la lectura como anónimo con la clave pública (debe seguir en 401) y npm run test:db.
--
-- Cómo deshacerla (si algún flujo legítimo leyera como anónimo, que no se encontró ninguno):
--   alter policy <nombre> on public.<tabla> to public;   -- una por política
--
-- Generada con:
--   select format('alter policy %I on public.%I to authenticated;', policyname, tablename)
--   from pg_policies where schemaname = 'public' and roles = array['public']::name[];

alter policy admin_select_auditoria on public.auditoria to authenticated;
alter policy area_insert_cargas_archivo on public.cargas_archivo to authenticated;
alter policy area_update_cargas_archivo on public.cargas_archivo to authenticated;
alter policy authenticated_select_cargas_archivo on public.cargas_archivo to authenticated;
alter policy estimaciones_insert_modelos on public.catalogo_modelos to authenticated;
alter policy estimaciones_select_modelos on public.catalogo_modelos to authenticated;
alter policy estimaciones_update_modelos on public.catalogo_modelos to authenticated;
alter policy estimaciones_insert_charolas_electrificacion on public.charolas_electrificacion to authenticated;
alter policy estimaciones_select_charolas_electrificacion on public.charolas_electrificacion to authenticated;
alter policy estimaciones_update_charolas_electrificacion on public.charolas_electrificacion to authenticated;
alter policy maquilador_insert_charolas_electrificacion on public.charolas_electrificacion to authenticated;
alter policy maquilador_select_charolas_electrificacion on public.charolas_electrificacion to authenticated;
alter policy admin_estimaciones_insert_catalogos on public.estimaciones_catalogos to authenticated;
alter policy admin_estimaciones_update_catalogos on public.estimaciones_catalogos to authenticated;
alter policy estimaciones_select_catalogos on public.estimaciones_catalogos to authenticated;
alter policy admin_estimaciones_insert_factores on public.factores to authenticated;
alter policy admin_estimaciones_update_factores on public.factores to authenticated;
alter policy estimaciones_select_factores on public.factores to authenticated;
alter policy authenticated_select_folios_produccion on public.folios_produccion to authenticated;
alter policy authenticated_select_informes_calidad on public.informes_calidad to authenticated;
alter policy calidad_insert_informes_calidad on public.informes_calidad to authenticated;
alter policy authenticated_select_pedido_versiones on public.pedido_versiones to authenticated;
alter policy planeacion_insert_pedido_versiones on public.pedido_versiones to authenticated;
alter policy planeacion_update_pedido_versiones on public.pedido_versiones to authenticated;
alter policy authenticated_select_pedidos on public.pedidos to authenticated;
alter policy planeacion_admin_delete_pedidos on public.pedidos to authenticated;
alter policy planeacion_insert_pedidos on public.pedidos to authenticated;
alter policy planeacion_update_pedidos on public.pedidos to authenticated;
alter policy admin_update_any_perfil on public.perfiles to authenticated;
alter policy perfiles_insert_own on public.perfiles to authenticated;
alter policy perfiles_select_all_authenticated on public.perfiles to authenticated;
alter policy perfiles_update_own on public.perfiles to authenticated;
alter policy authenticated_select_planeacion_item_imagenes on public.planeacion_item_imagenes to authenticated;
alter policy planeacion_insert_planeacion_item_imagenes on public.planeacion_item_imagenes to authenticated;
alter policy authenticated_select_planeacion_items on public.planeacion_items to authenticated;
alter policy planeacion_insert_planeacion_items on public.planeacion_items to authenticated;
alter policy planeacion_update_planeacion_items on public.planeacion_items to authenticated;
alter policy produccion_admin_delete_planeacion_items on public.planeacion_items to authenticated;
alter policy produccion_solicitar_eliminacion_planeacion_items on public.planeacion_items to authenticated;
alter policy authenticated_select_planos on public.planos to authenticated;
alter policy admin_estimaciones_update_promociones on public.promociones_tarifa to authenticated;
alter policy estimaciones_insert_promociones on public.promociones_tarifa to authenticated;
alter policy estimaciones_select_promociones on public.promociones_tarifa to authenticated;
alter policy authenticated_select_proyectos on public.proyectos to authenticated;
alter policy planeacion_insert_proyectos on public.proyectos to authenticated;
alter policy planeacion_update_proyectos on public.proyectos to authenticated;
alter policy estimaciones_insert_recibos on public.recibos to authenticated;
alter policy estimaciones_select_recibos on public.recibos to authenticated;
alter policy estimaciones_update_recibos on public.recibos to authenticated;
alter policy maquilador_insert_recibos on public.recibos to authenticated;
alter policy maquilador_select_recibos on public.recibos to authenticated;
alter policy estimaciones_insert_recibos_electrificacion on public.recibos_electrificacion to authenticated;
alter policy estimaciones_select_recibos_electrificacion on public.recibos_electrificacion to authenticated;
alter policy estimaciones_update_recibos_electrificacion on public.recibos_electrificacion to authenticated;
alter policy maquilador_insert_recibos_electrificacion on public.recibos_electrificacion to authenticated;
alter policy maquilador_select_recibos_electrificacion on public.recibos_electrificacion to authenticated;
alter policy estimaciones_insert_renglones on public.renglones to authenticated;
alter policy estimaciones_select_renglones on public.renglones to authenticated;
alter policy estimaciones_update_renglones on public.renglones to authenticated;
alter policy maquilador_insert_renglones on public.renglones to authenticated;
alter policy maquilador_select_renglones on public.renglones to authenticated;
alter policy estimaciones_insert_renglones_electrificacion on public.renglones_electrificacion to authenticated;
alter policy estimaciones_select_renglones_electrificacion on public.renglones_electrificacion to authenticated;
alter policy estimaciones_update_renglones_electrificacion on public.renglones_electrificacion to authenticated;
alter policy maquilador_insert_renglones_electrificacion on public.renglones_electrificacion to authenticated;
alter policy maquilador_select_renglones_electrificacion on public.renglones_electrificacion to authenticated;
alter policy area_insert_retroalimentaciones on public.retroalimentaciones to authenticated;
alter policy area_update_retroalimentaciones on public.retroalimentaciones to authenticated;
alter policy authenticated_select_retroalimentaciones on public.retroalimentaciones to authenticated;
alter policy authenticated_select_revisiones_cantidad on public.revisiones_cantidad to authenticated;
alter policy planeacion_insert_revisiones_cantidad on public.revisiones_cantidad to authenticated;
alter policy planeacion_update_revisiones_cantidad on public.revisiones_cantidad to authenticated;
alter policy admin_estimaciones_insert_tarifas_electrificacion on public.tarifas_electrificacion to authenticated;
alter policy admin_estimaciones_update_tarifas_electrificacion on public.tarifas_electrificacion to authenticated;
alter policy estimaciones_select_tarifas_electrificacion on public.tarifas_electrificacion to authenticated;
alter policy admin_estimaciones_insert_tarifas_familia on public.tarifas_familia to authenticated;
alter policy admin_estimaciones_update_tarifas_familia on public.tarifas_familia to authenticated;
alter policy estimaciones_select_tarifas_familia on public.tarifas_familia to authenticated;
alter policy admin_estimaciones_insert_tarifas_proyecto on public.tarifas_proyecto to authenticated;
alter policy admin_estimaciones_update_tarifas_proyecto on public.tarifas_proyecto to authenticated;
alter policy estimaciones_select_tarifas_proyecto on public.tarifas_proyecto to authenticated;
