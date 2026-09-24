create or replace function public.est_tamano_texto(t public.est_tamano)
returns text
language sql
immutable
set search_path = ''
as $$ select t::text $$;
