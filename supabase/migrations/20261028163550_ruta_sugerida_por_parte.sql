-- @verifica function public.ruta_sugerida_parte
-- @verifica function-contiene public.asegurar_ruta_produccion ruta_sugerida_parte

-- ============================================================================
-- Producción — La ruta sugerida de cada parte sale de SU descripción, no del mueble.
--
-- Antes toda parte tomaba la sugerida del mueble completo (Armado → Barniz →
-- Electrificación si el mueble o algún componente la lleva), así que la "CHAROLA
-- ELECTRIFICACIÓN" llevaba Armado y Barniz, y las demás partes Electrificación. Ahora:
-- una parte de electrificación (o iluminación) solo lleva Electrificación; las demás,
-- Armado (+ Superficie Sólida si la menciona) y Barniz. Solo afecta a las partes que
-- nunca guardaron su ruta. Espejo de rutaSugeridaParte en src/lib/produccion/ruta.ts.
-- ============================================================================

create or replace function public.ruta_sugerida_parte(p_descripcion text)
returns text[]
language sql
stable
set search_path = ''
as $$
  with d as (
    select translate(lower(coalesce(p_descripcion, '')), 'áéíóúüÁÉÍÓÚÜ', 'aeiouuaeiouu') as t
  )
  select case
    when public.descripcion_incluye_iluminacion(p_descripcion)
      or regexp_replace(regexp_replace(d.t, '\s+', ' ', 'g'),
           '\m(no incluyen?|no llevan?|sin)( (la|el|las|los))? electrificacion\M', '', 'g') ~ 'electrific'
      then array['electrificacion']
    else array['armado']
      || case when regexp_replace(regexp_replace(d.t, '[\s-]+', ' ', 'g'),
             '\m(no incluyen?|no llevan?|sin)( (la|el|las|los|de))? (superficie solida|solid surface|corian|krion|hi ?macs)\M', '', 'g')
           ~ '\m(superficie solida|solid surface|corian|krion|hi ?macs)\M'
         then array['superficie_solida'] else '{}'::text[] end
      || array['barniz']
  end
  from d;
$$;

revoke execute on function public.ruta_sugerida_parte(text) from public, anon;
grant execute on function public.ruta_sugerida_parte(text) to authenticated;

create or replace function public.asegurar_ruta_produccion(p_item_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_parte record;
begin
  insert into public.rutas_produccion (planeacion_item_id)
  values (p_item_id)
  on conflict (planeacion_item_id) do nothing;
  if found and not exists (
    select 1 from public.partes_despiece pd
    where pd.planeacion_item_id = p_item_id and pd.retirada_en is null
  ) then
    insert into public.pasos_ruta_produccion (planeacion_item_id, orden, proceso)
    select p_item_id, s.n, s.proceso
    from unnest(public.ruta_sugerida_produccion(p_item_id)) with ordinality as s(proceso, n);
  end if;

  for v_parte in
    select pd.id, pd.descripcion from public.partes_despiece pd
    where pd.planeacion_item_id = p_item_id and pd.retirada_en is null and pd.ruta_guardada_en is null
    for update
  loop
    insert into public.pasos_ruta_produccion (planeacion_item_id, parte_id, orden, proceso)
    select p_item_id, v_parte.id, s.n, s.proceso
    from unnest(public.ruta_sugerida_parte(v_parte.descripcion)) with ordinality as s(proceso, n);
    update public.partes_despiece set ruta_guardada_en = now() where id = v_parte.id;
  end loop;
end;
$$;
