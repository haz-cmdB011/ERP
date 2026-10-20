-- Objetos que esta migración debe dejar en la base (los comprueba `npm run db:verificar`):
-- @verifica column public.revisiones_finales_calidad.origen_paso_id
-- @verifica column public.revisiones_finales_calidad.origen_area
-- @verifica constraint public.revisiones_finales_calidad.revisiones_finales_origen_check
-- @verifica constraint public.revisiones_finales_calidad.revisiones_finales_origen_area_check
-- @verifica function-contiene public.piezas_listas_revision_final verificó Producción
-- @verifica function-contiene public.registrar_revision_final p_origen_area

-- ============================================================================
-- Revisión final obligatoria, con lo que liberó Producción y el origen de la
-- falla (20 oct 2026).
--
-- Calidad revisa el MUEBLE COMPLETO, no cada proceso; solo entra a un proceso
-- cuando hay una falla. Por eso:
--
-- 1. Lista para la revisión final = lo que Producción verificó en el ÚLTIMO
--    paso de la ruta (entregas preaprobadas), menos lo que Calidad rechazó en
--    esos lotes si llegó a revisarlos. Ya no hace falta que Calidad apruebe cada
--    lote: revisarlo queda como opción, para cuando hay una falla en el proceso.
--    Lo retrabajado (de un lote o de la propia revisión final) vuelve a contar
--    cuando Producción lo entrega y verifica otra vez en el último paso.
--
-- 2. Lo rechazado en la revisión final dice DÓNDE NACIÓ la falla, que puede no
--    ser a donde regresa (se detecta al final, la arregla Armado, pero el plano
--    venía mal de Ingeniería):
--      * origen_paso_id: un paso de la ruta del mueble, o
--      * origen_area: un área fuera de la ruta (ingenieria, planeacion,
--        compras = compras o proveedor, diseno, otra).
--    Exactamente uno de los dos. Las revisiones anteriores no tienen (hoy no hay
--    ninguna registrada).
--
-- 3. La revisión final (ajuste revision_final) se enciende APARTE, después de
--    fusionar la pantalla que pide el origen; encendida, todo lo que libera
--    Producción pasa por ella antes de ir a obra (docs/operacion.md):
--        update public.ajustes_flujo set activo = true, actualizado_en = now()
--          where clave = 'revision_final';
--
-- registrar_revision_final cambia de firma (dos parámetros al final): se borra
-- la anterior para que una llamada no quede ambigua. Aplicar ANTES de fusionar:
-- la pantalla nueva manda el origen.
-- ============================================================================

-- 2. Origen de la falla --------------------------------------------------------------
alter table public.revisiones_finales_calidad
  add column origen_paso_id uuid references public.pasos_ruta_produccion(id),
  add column origen_area text;

alter table public.revisiones_finales_calidad
  add constraint revisiones_finales_origen_area_check check (
    origen_area is null or origen_area in ('ingenieria', 'planeacion', 'compras', 'diseno', 'otra')
  ),
  -- Lo aprobado no lleva origen; lo rechazado, a lo más uno.
  add constraint revisiones_finales_origen_check check (
    (aprobado and origen_paso_id is null and origen_area is null)
    or (not aprobado and not (origen_paso_id is not null and origen_area is not null))
  );

create index idx_revisiones_finales_origen_paso on public.revisiones_finales_calidad (origen_paso_id);

-- 1. Piezas listas: lo que verificó Producción en el último paso -----------------------
create or replace function public.piezas_listas_revision_final(p_item_id uuid)
returns numeric
language sql
stable
set search_path = ''
as $$
  with ultimo as (
    select s.id
    from public.pasos_ruta_produccion s
    where s.planeacion_item_id = p_item_id and s.retirado_en is null
    order by s.orden desc
    limit 1
  )
  -- Todo lo que verificó Producción en el último paso, venga de donde venga,
  -- menos lo que Calidad rechazó en esos lotes (va a retrabajo y vuelve a
  -- contar cuando se entregue otra vez).
  select coalesce(sum(l.cantidad - l.rechazadas), 0)
  from public.lotes_calidad l
  join public.asignaciones_produccion a on a.id = l.asignacion_id
  where a.planeacion_item_id = p_item_id and a.cancelada_en is null and l.vigente
    and a.paso_id = (select id from ultimo);
$$;

revoke execute on function public.piezas_listas_revision_final(uuid) from public, anon;
grant execute on function public.piezas_listas_revision_final(uuid) to authenticated;

-- 2. Registrar la revisión final con el origen ---------------------------------------
drop function public.registrar_revision_final(uuid, numeric, numeric, text, text, uuid);

create function public.registrar_revision_final(
  p_item_id uuid,
  p_aprobadas numeric,
  p_rechazadas numeric,
  p_motivo text default null,
  p_categoria text default null,
  p_paso_id uuid default null,
  p_origen_paso_id uuid default null,
  p_origen_area text default null
)
returns table (revision_id uuid, folio text, aprobado boolean)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_item record;
  v_aprob numeric := coalesce(p_aprobadas, 0);
  v_rech numeric := coalesce(p_rechazadas, 0);
  v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
  v_categoria text := nullif(btrim(coalesce(p_categoria, '')), '');
  v_origen_area text := nullif(btrim(coalesce(p_origen_area, '')), '');
  v_listas numeric;
  v_revisado numeric;
  v_aprobado_antes numeric;
  v_id uuid;
  v_folio text;
begin
  if not public.is_calidad() then
    raise exception 'No tienes permiso para hacer la revisión final.';
  end if;
  if not public.revision_final_activa() then
    raise exception 'La revisión final está apagada.';
  end if;
  if v_aprob < 0 or v_rech < 0 then
    raise exception 'Las cantidades no pueden ser negativas.';
  end if;
  if v_aprob + v_rech <= 0 then
    raise exception 'Indica cuántas piezas apruebas o rechazas.';
  end if;
  if v_rech > 0 and v_motivo is null then
    raise exception 'Indica el motivo por el que no se aprueban las piezas rechazadas.';
  end if;
  if v_rech > 0 and p_paso_id is null then
    raise exception 'Indica a qué paso de la ruta regresa lo rechazado.';
  end if;
  if v_rech > 0 and (p_origen_paso_id is null) = (v_origen_area is null) then
    raise exception 'Indica dónde nació la falla: un paso de la ruta o un área.';
  end if;
  if v_origen_area is not null
     and v_origen_area not in ('ingenieria', 'planeacion', 'compras', 'diseno', 'otra') then
    raise exception 'Área de origen no válida.';
  end if;
  if v_categoria is not null
     and v_categoria not in ('acabado', 'medidas', 'dano', 'faltante', 'material', 'armado', 'otro') then
    raise exception 'Tipo de defecto no válido.';
  end if;

  -- Bloquea el mueble: dos revisiones a la vez no pasan juntas de lo listo.
  select pi.id, pi.item_code, pi.modelo, pi.tipo_registro, pi.cantidad_total, pi.estado_revision,
         pi.eliminacion_solicitada_en, pv.es_version_activa, p.numero_pedido, p.eliminado_en, p.cancelado_en
    into v_item
    from public.planeacion_items pi
    join public.pedido_versiones pv on pv.id = pi.pedido_version_id
    join public.pedidos p on p.id = pv.pedido_id
    where pi.id = p_item_id
    for update of pi;
  if not found then
    raise exception 'El ítem no existe.';
  end if;
  if v_item.tipo_registro <> 'MO' then
    raise exception 'La revisión final es de los muebles (ítems padre), no de sus componentes.';
  end if;
  if not v_item.es_version_activa
     or v_item.estado_revision = 'cancelado'
     or v_item.eliminacion_solicitada_en is not null
     or v_item.eliminado_en is not null
     or v_item.cancelado_en is not null then
    raise exception 'El mueble o su PM está cancelado, eliminado o es de una versión anterior.';
  end if;
  if v_rech > 0 and not exists (
    select 1 from public.pasos_ruta_produccion s
    where s.id = p_paso_id and s.planeacion_item_id = p_item_id and s.retirado_en is null
  ) then
    raise exception 'Ese paso ya no está en la ruta del mueble; recarga la página.';
  end if;
  if v_rech > 0 and p_origen_paso_id is not null and not exists (
    select 1 from public.pasos_ruta_produccion s
    where s.id = p_origen_paso_id and s.planeacion_item_id = p_item_id and s.retirado_en is null
  ) then
    raise exception 'El paso donde nació la falla ya no está en la ruta del mueble; recarga la página.';
  end if;

  v_listas := public.piezas_listas_revision_final(p_item_id);
  select coalesce(sum(x.cantidad), 0), coalesce(sum(x.cantidad) filter (where x.aprobado), 0)
    into v_revisado, v_aprobado_antes
    from public.revisiones_finales_calidad x where x.planeacion_item_id = p_item_id;
  if v_aprob + v_rech > v_listas - v_revisado then
    raise exception 'Este mueble solo tiene % pieza(s) listas para la revisión final.',
      greatest(0, v_listas - v_revisado);
  end if;
  if v_aprobado_antes + v_aprob > v_item.cantidad_total then
    raise exception 'No se pueden aprobar más piezas que las del mueble (%).', v_item.cantidad_total;
  end if;

  if v_aprob > 0 then
    v_folio := 'FIN-' || lpad(nextval('public.revisiones_finales_folio_seq')::text, 6, '0');
    insert into public.revisiones_finales_calidad (planeacion_item_id, folio, aprobado, cantidad)
    values (p_item_id, v_folio, true, v_aprob)
    returning id into v_id;
    insert into public.auditoria (usuario_id, tabla, registro_id, accion, detalle)
    values (auth.uid(), 'revisiones_finales_calidad', v_id, 'revision_final_aprobada',
            jsonb_build_object('numero_pedido', v_item.numero_pedido, 'item_code', v_item.item_code,
                               'modelo', v_item.modelo, 'folio', v_folio, 'cantidad', v_aprob));
    revision_id := v_id; folio := v_folio; aprobado := true;
    return next;
  end if;

  if v_rech > 0 then
    v_folio := 'FIN-' || lpad(nextval('public.revisiones_finales_folio_seq')::text, 6, '0');
    insert into public.revisiones_finales_calidad (
      planeacion_item_id, folio, aprobado, cantidad, motivo, categoria, paso_retrabajo_id,
      origen_paso_id, origen_area
    ) values (
      p_item_id, v_folio, false, v_rech, v_motivo, v_categoria, p_paso_id,
      p_origen_paso_id, v_origen_area
    )
    returning id into v_id;
    insert into public.auditoria (usuario_id, tabla, registro_id, accion, detalle)
    values (auth.uid(), 'revisiones_finales_calidad', v_id, 'revision_final_rechazada',
            jsonb_build_object('numero_pedido', v_item.numero_pedido, 'item_code', v_item.item_code,
                               'modelo', v_item.modelo, 'folio', v_folio, 'cantidad', v_rech,
                               'motivo', v_motivo, 'origen_paso_id', p_origen_paso_id,
                               'origen_area', v_origen_area));
    revision_id := v_id; folio := v_folio; aprobado := false;
    return next;
  end if;
end;
$$;

revoke execute on function public.registrar_revision_final(uuid, numeric, numeric, text, text, uuid, uuid, text)
  from public, anon;
grant execute on function public.registrar_revision_final(uuid, numeric, numeric, text, text, uuid, uuid, text)
  to authenticated;
