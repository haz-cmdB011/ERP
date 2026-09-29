-- ============================================================================
-- Electrificación — un padre entra al filtro del maquilador si su descripción
-- MENCIONA iluminación (iluminación, iluminado, etc.), salvo que lo niegue
-- ("NO INCLUYE ILUMINACIÓN", "SIN ILUMINACIÓN", "NO LLEVA ILUMINACIÓN"). Los que
-- no la mencionan no cuentan.
--
-- Sustituye la regla anterior ("incluye iluminación" / "con iluminación").
-- Con los datos de hoy da el mismo resultado (38 padres, 26 modelos, 5 OT);
-- cambia solo para descripciones futuras que la mencionen de otra forma.
-- Se busca sin distinguir mayúsculas, acentos ni espacios repetidos. La función
-- conserva su nombre porque ya la usan las funciones del generador.
-- ============================================================================

create or replace function public.descripcion_incluye_iluminacion(p_descripcion text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select d like '%ilumina%'
  from (
    select replace(replace(replace(
             regexp_replace(
               translate(lower(coalesce(p_descripcion, '')), 'áéíóúÁÉÍÓÚ', 'aeiouaeiou'),
               '\s+', ' ', 'g'),
             'no incluye iluminacion', ''),
             'sin iluminacion', ''),
             'no lleva iluminacion', '') as d
  ) t;
$$;
