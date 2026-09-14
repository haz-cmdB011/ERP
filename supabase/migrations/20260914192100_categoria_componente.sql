create type public.categoria_componente_tipo as enum ('MOBILIARIO', 'FUNCION', 'PERIMETRO');

alter table public.planeacion_items
  add column categoria_componente public.categoria_componente_tipo;

update public.planeacion_items
  set categoria_componente = (case when tipo_registro = 'MO' then 'MOBILIARIO' else 'FUNCION' end)::public.categoria_componente_tipo
  where categoria_componente is null;

alter table public.planeacion_items
  alter column categoria_componente set not null;
