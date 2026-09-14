-- item_code no es único por versión (un mismo mueble puede tener varias
-- filas FU con distinto material). La fila_excel_origen sí lo es.
alter table public.planeacion_items
  drop constraint planeacion_items_pedido_version_id_item_code_key;

alter table public.planeacion_items
  add constraint planeacion_items_pedido_version_id_fila_excel_origen_key
  unique (pedido_version_id, fila_excel_origen);
