-- ============================================================================
-- Producción — Corrige las rutas ya guardadas de las partes con la regla por parte
-- (migración ruta_sugerida_por_parte): la charola de electrificación solo Electrificación,
-- las demás sin Electrificación.
--
-- Solo las partes que siguen con la sugerida vieja del mueble (nadie las editó), cuya
-- sugerida nueva es distinta y sin asignaciones vigentes. Las editadas a mano y las que
-- ya tienen asignaciones se quedan como están (Producción las cambia con "Ruta").
-- Los pasos viejos quedan retirados (retirado_en), como al quitarlos en pantalla.
-- ============================================================================

do $$
declare
  v_parte record;
begin
  for v_parte in
    select pd.id, pd.planeacion_item_id, pd.descripcion
    from public.partes_despiece pd
    where pd.retirada_en is null
      and pd.ruta_guardada_en is not null
      and not exists (
        select 1 from public.asignaciones_produccion a where a.parte_id = pd.id and a.cancelada_en is null
      )
      and (
        select array_agg(s.proceso order by s.orden) from public.pasos_ruta_produccion s
        where s.parte_id = pd.id and s.retirado_en is null
      ) is not distinct from public.ruta_sugerida_produccion(pd.planeacion_item_id)
      and public.ruta_sugerida_produccion(pd.planeacion_item_id) is distinct from public.ruta_sugerida_parte(pd.descripcion)
  loop
    update public.pasos_ruta_produccion set retirado_en = now()
    where parte_id = v_parte.id and retirado_en is null;

    insert into public.pasos_ruta_produccion (planeacion_item_id, parte_id, orden, proceso)
    select v_parte.planeacion_item_id, v_parte.id, s.n, s.proceso
    from unnest(public.ruta_sugerida_parte(v_parte.descripcion)) with ordinality as s(proceso, n);

    -- Quien tenga la ruta abierta debe recargarla (bloqueo optimista por versión).
    update public.rutas_produccion set version = version + 1
    where planeacion_item_id = v_parte.planeacion_item_id;
  end loop;
end;
$$;
