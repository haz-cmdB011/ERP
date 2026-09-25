-- Advisor de seguridad (lint 0028): dos funciones SECURITY DEFINER eran
-- ejecutables por el rol anon vía /rest/v1/rpc.

-- is_calidad() se creó solo con GRANT a authenticated, así que PUBLIC (y por
-- ende anon) conservaba EXECUTE. Las políticas RLS la siguen usando con
-- authenticated, por eso se conserva ese grant.
revoke execute on function public.is_calidad() from public, anon;
grant execute on function public.is_calidad() to authenticated;

-- Función de trigger: quien dispara el trigger no necesita EXECUTE sobre ella,
-- así que no debe ser invocable desde la API pública por nadie.
revoke execute on function public.protect_planeacion_items_columns_produccion()
  from public, anon, authenticated;
