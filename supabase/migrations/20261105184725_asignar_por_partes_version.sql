-- @verifica function-contiene public.activar_asignacion_por_partes asignar_por_partes_version

-- ============================================================================
-- Producción — corrige activar_asignacion_por_partes en muebles sin ruta guardada.
--
-- La pantalla manda la versión de la ruta que tenía abierta (0 = aún no se guarda). La función
-- creaba la ruta primero (versión 1) y comparaba después, así que un mueble sin ruta se rechazaba
-- con "Alguien más cambió la ruta (versión 1, tú tenías la 0)". Ahora compara ANTES de crearla
-- (sin ruta = versión 0), igual que guardar_ruta_produccion.
-- ============================================================================

create or replace function public.activar_asignacion_por_partes(p_item_id uuid, p_version_esperada integer)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actual integer;
  v_ruta record;
  v_base text[];
  v_parte record;
  v_proceso text;
  v_n integer;
  v_version integer;
begin
  -- asignar_por_partes_version: la versión se compara antes de crear la ruta.
  if not public.is_produccion() then
    raise exception 'Solo Producción puede cambiar cómo se asigna un mueble.';
  end if;
  if p_version_esperada is null or p_version_esperada < 0 then
    raise exception 'Falta la versión de la ruta que tenías abierta.';
  end if;
  if not exists (select 1 from public.planeacion_items where id = p_item_id and tipo_registro = 'MO') then
    raise exception 'El mueble no existe.';
  end if;

  select coalesce((select r.version from public.rutas_produccion r where r.planeacion_item_id = p_item_id), 0)
    into v_actual;
  if v_actual <> p_version_esperada then
    raise exception 'Alguien más cambió la ruta de este mueble (versión %, tú tenías la %). Recarga la página.',
      v_actual, p_version_esperada;
  end if;

  perform public.asegurar_ruta_produccion(p_item_id);
  select version, por_partes into v_ruta
    from public.rutas_produccion where planeacion_item_id = p_item_id for update;

  if not exists (
    select 1 from public.partes_despiece where planeacion_item_id = p_item_id and retirada_en is null
  ) then
    raise exception 'Este mueble no tiene despiece: divide primero sus componentes en partes.';
  end if;
  if exists (
    select 1 from public.asignaciones_produccion a
    where a.planeacion_item_id = p_item_id and a.parte_id is null and a.cancelada_en is null
  ) then
    raise exception 'El mueble ya tiene asignaciones del mueble completo; cancélalas antes de asignar por partes.';
  end if;

  select coalesce(array_agg(s.proceso order by s.orden), '{}') into v_base
    from public.pasos_ruta_produccion s
    where s.planeacion_item_id = p_item_id and s.parte_id is null and s.retirado_en is null;
  if cardinality(v_base) = 0 then
    v_base := public.ruta_sugerida_produccion(p_item_id);
  end if;

  update public.pasos_ruta_produccion
    set retirado_en = now(), retirado_por = auth.uid()
    where planeacion_item_id = p_item_id and parte_id is null and retirado_en is null;

  for v_parte in
    select pd.id, pd.descripcion, pd.procesos_omitidos
      from public.partes_despiece pd
      where pd.planeacion_item_id = p_item_id and pd.retirada_en is null
      order by pd.orden
  loop
    if exists (
      select 1 from public.pasos_ruta_produccion s
      where s.parte_id = v_parte.id and s.retirado_en is null
    ) then
      continue;
    end if;
    v_n := 0;
    foreach v_proceso in array v_base loop
      if not (v_proceso = any (v_parte.procesos_omitidos)) then
        v_n := v_n + 1;
        insert into public.pasos_ruta_produccion (planeacion_item_id, parte_id, orden, proceso, creado_por)
        values (p_item_id, v_parte.id, v_n, v_proceso, auth.uid());
      end if;
    end loop;
    if v_n = 0 then
      raise exception 'La parte "%" no lleva ninguno de los procesos de la ruta del mueble (%). Cambia su "Pasa por" en el despiece o agrega esos procesos a la ruta.',
        v_parte.descripcion, array_to_string(v_base, ', ');
    end if;
    update public.partes_despiece set ruta_guardada_en = coalesce(ruta_guardada_en, now()) where id = v_parte.id;
  end loop;

  v_version := v_ruta.version + 1;
  update public.rutas_produccion
    set por_partes = true, version = v_version, actualizado_por = auth.uid(), actualizado_en = now()
    where planeacion_item_id = p_item_id;
  return v_version;
end;
$$;

revoke execute on function public.activar_asignacion_por_partes(uuid, integer) from public, anon;
grant execute on function public.activar_asignacion_por_partes(uuid, integer) to authenticated;
