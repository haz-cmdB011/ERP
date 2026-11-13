-- @verifica function-contiene public.asegurar_ruta_produccion ruta_por_mueble_completo
-- @verifica function public.parte_sin_ruta_propia
-- @verifica trigger public.partes_despiece.trg_parte_sin_ruta_propia
-- @verifica function-contiene public.guardar_ruta_produccion ruta_por_mueble_completo
-- @verifica function-contiene public.crear_asignacion_produccion ruta_por_mueble_completo

-- ============================================================================
-- Producción — La ruta es del mueble completo; las partes del despiece ya no llevan ruta.
--
-- Antes (migración rutas_por_parte) cada parte del despiece tenía su ruta y se asignaba
-- en sus piezas, y el mueble con partes nacía con su ruta vacía. Ahora el mueble se asigna
-- completo: su ruta (la sugerida o la que se elige en el carrito) es la única, y el
-- despiece queda para saber de qué está hecho (material, piezas por mueble).
--
--   * asegurar_ruta_produccion: el mueble toma la sugerida aunque tenga despiece y sus
--     partes ya no reciben ruta.
--   * Una parte nueva nace con su ruta "guardada" vacía (ruta_guardada_en), así el resto
--     de la base (muebles_en_calidad, cobro por vez) la trata como parte sin procesos.
--   * Muebles que ya tienen despiece: si ninguna de sus partes tiene asignaciones vigentes
--     ni piezas de la revisión final por reasignar, se retiran los pasos de sus partes y,
--     si el mueble no tiene pasos, toma la sugerida. Los que ya trabajan por partes se
--     quedan como están (sus asignaciones se siguen viendo y entregando).
--
-- crear_asignacion_produccion solo pierde la validación de Electrificación / S.S. (2b): sin
-- partes con ruta, lo listo del primer paso del mueble es todo (muebles_por_partes da null)
-- y el cobro cuenta solo los pasos del mueble.
-- Espejo de rutaDelMueble / rutaDeParte en src/lib/produccion/ruta.ts.
-- ============================================================================

-- 1. El mueble siempre toma la sugerida al crear su ruta; las partes, nada.
create or replace function public.asegurar_ruta_produccion(p_item_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- ruta_por_mueble_completo: la ruta es del mueble aunque tenga despiece.
  insert into public.rutas_produccion (planeacion_item_id)
  values (p_item_id)
  on conflict (planeacion_item_id) do nothing;
  if found then
    insert into public.pasos_ruta_produccion (planeacion_item_id, orden, proceso)
    select p_item_id, s.n, s.proceso
    from unnest(public.ruta_sugerida_produccion(p_item_id)) with ordinality as s(proceso, n);
  end if;
end;
$$;

-- 2. Una parte nueva nace sin ruta propia (guardada vacía).
create or replace function public.parte_sin_ruta_propia()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.ruta_guardada_en := coalesce(new.ruta_guardada_en, now());
  return new;
end;
$$;

revoke execute on function public.parte_sin_ruta_propia() from public, anon, authenticated;

drop trigger if exists trg_parte_sin_ruta_propia on public.partes_despiece;
create trigger trg_parte_sin_ruta_propia
  before insert on public.partes_despiece
  for each row execute function public.parte_sin_ruta_propia();

-- ¡OJO! En crear_asignacion_produccion esta expresión regular borró de más (en PostgreSQL el
-- '.*?' no es perezoso si el primer cuantificador de la expresión es codicioso). La migración
-- restaurar_crear_asignacion la repone completa. No copiar este patrón.
-- 2b. Electrificación y Superficie Sólida se pueden agregar a cualquier ruta (se eligen en el
-- carrito), aunque la descripción no las mencione. Asignar sigue exigiendo que el proceso
-- esté en la ruta. Se quitan las dos validaciones de guardar_ruta_produccion y de
-- crear_asignacion_produccion sin reescribir las funciones completas.
do $$
declare
  v_def text;
  v_nueva text;
begin
  select pg_get_functiondef('public.guardar_ruta_produccion(uuid, jsonb, integer, uuid)'::regprocedure) into v_def;
  v_nueva := regexp_replace(v_def,
    'if v_proceso = ''electrificacion'' and not public\.admite_electrificacion\(p_item_id\) then.*?end if;\s*if v_proceso = ''superficie_solida'' and not public\.admite_superficie_solida\(p_item_id\) then.*?end if;',
    'null; -- ruta_por_mueble_completo: cualquier proceso', 's');
  if v_nueva = v_def then
    raise exception 'guardar_ruta_produccion no trae las validaciones de electrificación y S.S.';
  end if;
  execute v_nueva;

  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'crear_asignacion_produccion';
  v_nueva := regexp_replace(v_def,
    'if p_proceso = ''electrificacion''\s+and not public\.admite_electrificacion\(v_item\.id\) then.*?end if;\s*if p_proceso = ''superficie_solida''\s+and not public\.admite_superficie_solida\(v_item\.id\) then.*?end if;',
    'null; -- ruta_por_mueble_completo: lo decide la ruta', 's');
  if v_nueva = v_def then
    raise exception 'crear_asignacion_produccion no trae las validaciones de electrificación y S.S.';
  end if;
  execute v_nueva;
end;
$$;

-- 3. Muebles con despiece que todavía no trabajan por partes.
do $$
declare
  v_item record;
begin
  for v_item in
    select distinct pd.planeacion_item_id as id
    from public.partes_despiece pd
    where pd.retirada_en is null
      and not exists (
        select 1 from public.asignaciones_produccion a
        where a.planeacion_item_id = pd.planeacion_item_id
          and a.parte_id is not null and a.cancelada_en is null
      )
      and not exists (
        select 1 from public.revisiones_finales_calidad r
        join public.pasos_ruta_produccion s on s.id = r.paso_retrabajo_id
        where s.planeacion_item_id = pd.planeacion_item_id and s.parte_id is not null and not r.aprobado
      )
  loop
    update public.pasos_ruta_produccion
      set retirado_en = now()
      where planeacion_item_id = v_item.id and parte_id is not null and retirado_en is null;

    update public.partes_despiece
      set ruta_guardada_en = now()
      where planeacion_item_id = v_item.id and ruta_guardada_en is null;

    if exists (select 1 from public.rutas_produccion where planeacion_item_id = v_item.id)
       and not exists (
         select 1 from public.pasos_ruta_produccion
         where planeacion_item_id = v_item.id and parte_id is null and retirado_en is null
       ) then
      insert into public.pasos_ruta_produccion (planeacion_item_id, orden, proceso)
      select v_item.id, s.n, s.proceso
      from unnest(public.ruta_sugerida_produccion(v_item.id)) with ordinality as s(proceso, n);
    end if;

    -- Quien tenga la ruta abierta debe recargarla (bloqueo optimista por versión).
    update public.rutas_produccion set version = version + 1
      where planeacion_item_id = v_item.id;
  end loop;
end;
$$;
