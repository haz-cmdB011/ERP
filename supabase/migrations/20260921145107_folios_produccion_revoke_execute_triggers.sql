-- Son funciones de trigger (security definer): solo las dispara la base de
-- datos; no deben poder llamarse desde la API pública.
revoke execute on function public.asignar_folio_produccion() from public, anon, authenticated;
revoke execute on function public.conservar_folio_produccion() from public, anon, authenticated;
