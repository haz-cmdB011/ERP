-- Objetos que esta migración debe dejar en la base (los comprueba `npm run db:verificar`):
-- @verifica table public.limites_tasa
-- @verifica function public.consumir_limite
-- @verifica function-contiene public.consumir_limite on conflict

-- Límite de intentos compartido por todas las instancias del servidor.
--
-- Antes: el tope por IP del registro vivía en la memoria de cada instancia
-- serverless de Vercel (se reinicia y no se comparte), así que protegía poco.
-- Ahora la cuenta vive en Postgres: una ventana fija por clave (p. ej.
-- 'registro:ip:1.2.3.4' o 'upload:<id de usuario>').
--
-- Solo la usa el servidor con la clave service_role (src/lib/seguridad/limite-tasa.ts):
-- la tabla tiene RLS sin políticas y la función no se puede ejecutar desde la API
-- pública (ni anon ni authenticated).

create table if not exists public.limites_tasa (
  clave text not null,
  ventana timestamptz not null,
  cuenta integer not null default 0,
  primary key (clave, ventana)
);
alter table public.limites_tasa enable row level security;

create index if not exists limites_tasa_ventana_idx on public.limites_tasa (ventana);

-- Suma un intento a la clave y dice si todavía cabe: true = permitido,
-- false = se pasó de `p_maximo` intentos en la ventana de `p_ventana_segundos`.
create or replace function public.consumir_limite(
  p_clave text,
  p_maximo integer,
  p_ventana_segundos integer
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ventana timestamptz;
  v_cuenta integer;
begin
  if p_clave is null or length(p_clave) = 0 or length(p_clave) > 200
     or p_maximo < 1 or p_ventana_segundos < 1 then
    raise exception 'consumir_limite: parámetros inválidos';
  end if;

  -- Inicio de la ventana actual (redondeado hacia abajo).
  v_ventana := to_timestamp(floor(extract(epoch from now()) / p_ventana_segundos) * p_ventana_segundos);

  insert into public.limites_tasa as l (clave, ventana, cuenta)
  values (p_clave, v_ventana, 1)
  on conflict (clave, ventana) do update set cuenta = l.cuenta + 1
  returning l.cuenta into v_cuenta;

  -- Limpieza ocasional de ventanas viejas, para que la tabla no crezca.
  if random() < 0.02 then
    delete from public.limites_tasa where ventana < now() - interval '1 day';
  end if;

  return v_cuenta <= p_maximo;
end;
$$;

revoke execute on function public.consumir_limite(text, integer, integer) from public, anon, authenticated;
grant execute on function public.consumir_limite(text, integer, integer) to service_role;
