-- @verifica column public.rutas_produccion.por_partes
-- @verifica function public.activar_asignacion_por_partes
-- @verifica function public.desactivar_asignacion_por_partes

-- ============================================================================
-- Producción — asignar por partes, como interruptor de cada mueble.
--
-- Por omisión el mueble se asigna completo, con una sola ruta (ruta_por_mueble_completo). Cuando un
-- componente se dividió en partes (puerta y marco) y se quiere asignarlas y registrarlas por
-- separado, el mueble pasa a "asignar por partes":
--
--   * rutas_produccion.por_partes: el interruptor (false = mueble completo, lo normal).
--   * activar_asignacion_por_partes: la ruta del mueble se retira (no puede tener asignaciones
--     completas vigentes) y cada parte recibe la suya: los procesos de la ruta del mueble menos los
--     que la parte no lleva (partes_despiece.procesos_omitidos, "Pasa por" del despiece). Las
--     partes que ya tienen ruta (muebles que se trabajaron por partes antes) la conservan. Es
--     idempotente: volver a llamarla le da ruta a una parte agregada después.
--   * desactivar_asignacion_por_partes: vuelve al mueble completo si ninguna parte tiene
--     asignaciones vigentes ni piezas de la revisión final por reasignar.
--
-- Lo demás ya existía en la base: crear_asignacion_produccion con p_parte_id (en piezas de la parte,
-- dentro de un paso de su ruta), sus entregas y lotes, el cobro por partes por vez y la revisión
-- final (sin pasos del mueble cuenta lo que alcanza la parte más atrasada en su último paso).
-- ============================================================================

alter table public.rutas_produccion
  add column por_partes boolean not null default false;

create or replace function public.activar_asignacion_por_partes(p_item_id uuid, p_version_esperada integer)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ruta record;
  v_base text[];
  v_parte record;
  v_proceso text;
  v_n integer;
  v_version integer;
begin
  if not public.is_produccion() then
    raise exception 'Solo Producción puede cambiar cómo se asigna un mueble.';
  end if;
  if p_version_esperada is null or p_version_esperada < 0 then
    raise exception 'Falta la versión de la ruta que tenías abierta.';
  end if;
  if not exists (select 1 from public.planeacion_items where id = p_item_id and tipo_registro = 'MO') then
    raise exception 'El mueble no existe.';
  end if;

  perform public.asegurar_ruta_produccion(p_item_id);
  select version, por_partes into v_ruta
    from public.rutas_produccion where planeacion_item_id = p_item_id for update;
  if v_ruta.version <> p_version_esperada then
    raise exception 'Alguien más cambió la ruta de este mueble (versión %, tú tenías la %). Recarga la página.',
      v_ruta.version, p_version_esperada;
  end if;

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

  -- Los procesos del mueble (su ruta o, si no tiene pasos, la sugerida) son la base de cada parte.
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

create or replace function public.desactivar_asignacion_por_partes(p_item_id uuid, p_version_esperada integer)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ruta record;
  v_version integer;
begin
  if not public.is_produccion() then
    raise exception 'Solo Producción puede cambiar cómo se asigna un mueble.';
  end if;
  if p_version_esperada is null or p_version_esperada < 0 then
    raise exception 'Falta la versión de la ruta que tenías abierta.';
  end if;

  select version, por_partes into v_ruta
    from public.rutas_produccion where planeacion_item_id = p_item_id for update;
  if not found then
    raise exception 'El mueble no tiene ruta.';
  end if;
  if v_ruta.version <> p_version_esperada then
    raise exception 'Alguien más cambió la ruta de este mueble (versión %, tú tenías la %). Recarga la página.',
      v_ruta.version, p_version_esperada;
  end if;
  if not v_ruta.por_partes then
    return v_ruta.version;
  end if;

  if exists (
    select 1 from public.asignaciones_produccion a
    where a.planeacion_item_id = p_item_id and a.parte_id is not null and a.cancelada_en is null
  ) then
    raise exception 'Hay asignaciones de partes vigentes; cancélalas antes de volver a asignar el mueble completo.';
  end if;
  if exists (
    select 1 from public.revisiones_finales_calidad r
    join public.pasos_ruta_produccion s on s.id = r.paso_retrabajo_id
    where s.planeacion_item_id = p_item_id and s.parte_id is not null and not r.aprobado
  ) then
    raise exception 'Calidad rechazó piezas de alguna parte y faltan por reasignar; resuélvelo antes de volver al mueble completo.';
  end if;

  update public.pasos_ruta_produccion
    set retirado_en = now(), retirado_por = auth.uid()
    where planeacion_item_id = p_item_id and parte_id is not null and retirado_en is null;

  if not exists (
    select 1 from public.pasos_ruta_produccion
    where planeacion_item_id = p_item_id and parte_id is null and retirado_en is null
  ) then
    insert into public.pasos_ruta_produccion (planeacion_item_id, orden, proceso, creado_por)
    select p_item_id, s.n, s.proceso, auth.uid()
    from unnest(public.ruta_sugerida_produccion(p_item_id)) with ordinality as s(proceso, n);
  end if;

  v_version := v_ruta.version + 1;
  update public.rutas_produccion
    set por_partes = false, version = v_version, actualizado_por = auth.uid(), actualizado_en = now()
    where planeacion_item_id = p_item_id;
  return v_version;
end;
$$;

revoke execute on function public.activar_asignacion_por_partes(uuid, integer) from public, anon;
revoke execute on function public.desactivar_asignacion_por_partes(uuid, integer) from public, anon;
grant execute on function public.activar_asignacion_por_partes(uuid, integer) to authenticated;
grant execute on function public.desactivar_asignacion_por_partes(uuid, integer) to authenticated;
