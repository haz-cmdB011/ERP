-- Objetos que esta migración debe dejar en la base (los comprueba `npm run db:verificar`):
-- @verifica column public.informes_calidad.tipo_reporte
-- @verifica column public.informes_calidad.area_deteccion
-- @verifica column public.informes_calidad.responsable_deteccion
-- @verifica column public.informes_calidad.acciones_correctivas
-- @verifica column public.informes_calidad.solucion
-- @verifica column public.informes_calidad.piezas_afectadas
-- @verifica table public.informe_calidad_fotos
-- @verifica function public.guardar_no_conformidad
-- @verifica function public.cerrar_no_conformidad
-- @verifica column public.informes_calidad.area_origen
-- @verifica column public.informes_calidad.responsable_origen
-- @verifica column public.informes_calidad.severidad
-- @verifica column public.informes_calidad.causa_raiz
-- @verifica column public.informes_calidad.cerrado_en
-- @verifica table public.motivos_calidad
-- @verifica table public.areas_calidad
-- @verifica table public.autorizadores_calidad
-- @verifica column public.informes_calidad.motivo_codigo
-- @verifica column public.informes_calidad.autoriza
-- @verifica policy public.motivos_calidad.select_motivos_calidad
-- @verifica function public.agregar_foto_informe_calidad
-- @verifica policy public.informe_calidad_fotos.select_informe_calidad_fotos
-- @verifica policy public.objects.select_calidad_no_conformidades_bucket

-- ============================================================================
-- Calidad — informe de no conformidad.
--
-- Un informe "No aprobado" ahora lleva el detalle de la no conformidad (formato
-- "Producto no conforme" de Calidad):
--   * motivo (catálogo), tipo de reporte y tipo de problema (el del motivo);
--   * área donde se detectó y su responsable; área de origen y su responsable;
--   * piezas afectadas (los muebles afectados de un lote son su cantidad);
--   * acciones correctivas, descripción de la solución, material y mano de obra,
--     quien autoriza, severidad (manual) y análisis de causa raíz;
--   * estatus (abierto, en proceso, cerrado): se calcula con el retrabajo de
--     Producción; solo un reporte sin lote se cierra a mano (cerrado_en);
--   * fotos de la no conformidad.
--
-- El folio y el veredicto (aprobado, cantidad, motivo, categoría) siguen siendo
-- inmutables: los crean crear_informe_calidad / evaluar_entrega_calidad como
-- hasta ahora. Estos campos son un complemento que Calidad llena al emitir el
-- informe y completa después (la solución casi nunca se conoce ese día), con
-- guardar_no_conformidad. Solo se escribe por funciones (security definer con
-- is_calidad()), igual que el resto de Calidad.
--
-- Motivos, áreas con sus responsables y quienes autorizan salen del catálogo
-- M-R-A.xlsx (tablas motivos_calidad, areas_calidad, autorizadores_calidad). La
-- lista de tipos de reporte vive en la app (src/lib/calidad/no-conformidad.ts).
-- El responsable se guarda como texto: es el nombre vigente al emitir el informe.
--
-- Las fechas de inicio y término de producción no se guardan: se calculan al
-- mostrar el informe desde las asignaciones y entregas del mueble.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Catálogos de Calidad (de M-R-A.xlsx): motivos, áreas con sus responsables y
-- quienes autorizan. Solo lectura desde la app; se ajustan con una migración.
-- ---------------------------------------------------------------------------
create table public.motivos_calidad (
  codigo text primary key,
  nombre text not null,
  -- Tipo de problema: proceso, informacion o capacitacion.
  tipo text not null,
  activo boolean not null default true,
  constraint motivos_calidad_tipo_check check (tipo in ('proceso', 'informacion', 'capacitacion')),
  constraint motivos_calidad_nombre_check check (nullif(btrim(nombre), '') is not null)
);

-- Un área puede tener varios responsables (una fila por persona) o ninguno
-- (cliente, obras, residencia, maquilador): entonces el responsable se escribe.
create table public.areas_calidad (
  id uuid primary key default gen_random_uuid(),
  area text not null,
  responsable text,
  activo boolean not null default true,
  constraint areas_calidad_area_check check (nullif(btrim(area), '') is not null)
);
create unique index areas_calidad_area_responsable_key
  on public.areas_calidad (area, coalesce(responsable, ''));

create table public.autorizadores_calidad (
  nombre text primary key,
  puesto text not null,
  activo boolean not null default true
);

alter table public.motivos_calidad enable row level security;
alter table public.areas_calidad enable row level security;
alter table public.autorizadores_calidad enable row level security;
create policy "select_motivos_calidad" on public.motivos_calidad
  for select to authenticated using ((select public.is_staff()));
create policy "select_areas_calidad" on public.areas_calidad
  for select to authenticated using ((select public.is_staff()));
create policy "select_autorizadores_calidad" on public.autorizadores_calidad
  for select to authenticated using ((select public.is_staff()));

insert into public.motivos_calidad (codigo, nombre, tipo) values
  ('0001', 'ABATIMIENTO EN PUERTA ERRONEO', 'proceso'),
  ('0002', 'ACABADO CONTAMINADO PINTURA-BARNIZ', 'proceso'),
  ('0003', 'ACABADO ERRONEO EN CEDULA BARNIZ', 'informacion'),
  ('0004', 'ACABADO ERRONEO EN CEDULA LP', 'informacion'),
  ('0005', 'ACABADO ERRONEO EN CEDULA MADERA', 'informacion'),
  ('0006', 'ACABADO ERRONEO EN COMPONENTE METALICO', 'proceso'),
  ('0007', 'ACABADO ERRONEO EN PLANO BARNIZ', 'informacion'),
  ('0008', 'ACABADO ERRONEO EN PLANO LP', 'informacion'),
  ('0009', 'ACRILICO CON CORTE VIBRADO EN EL CANTO', 'proceso'),
  ('0010', 'ACRILICO CON CORTE ZESGADO EN EL CANTO', 'proceso'),
  ('0011', 'ACRILICO CON INTERRUPCIONES DE CORTE EN EL CANTO', 'proceso'),
  ('0012', 'ARCHIVO DE CORTE FUERA DE DIMENSIÓN (DXF)', 'informacion'),
  ('0013', 'ARMADO FUERA DE ESPECIFICACIÓN', 'proceso'),
  ('0014', 'ARMADO Y SOLDADURA FUERA DE ESPECIFICACIÓN', 'proceso'),
  ('0015', 'AUTORIZAR TRASPASO DE MOBILIARIO SIN LIBERACIÓN DE CALIDAD', 'proceso'),
  ('0016', 'BARNIZ DAÑADO', 'proceso'),
  ('0017', 'BARRENOS EN ESTRUCTURA FUERA DE POSICIÓN', 'proceso'),
  ('0018', 'BISAGRA BIDIMENSIONAL ERRONEA', 'capacitacion'),
  ('0019', 'CABLE DE CONEXIÓN FUERA DE ESPECIFICACIÓN', 'proceso'),
  ('0020', 'CALIBRE DE LAMINA ERRONEO EN CEDULA', 'informacion'),
  ('0021', 'CANTIDAD ERRONEA EN CEDULA', 'informacion'),
  ('0022', 'CASCARA DE NARANJA', 'capacitacion'),
  ('0023', 'CERRADURA PARA PUERTA FUERA DE ESPECIFICACIÓN', 'informacion'),
  ('0024', 'CONSIDERAR APLICACIÓN DE PELICULA', 'informacion'),
  ('0025', 'CORREDERA DE EXTENSIÓN ERRONEA', 'capacitacion'),
  ('0026', 'CORTE A MEDIA MADERA FUERA DE ESPECIFICACIÓN', 'proceso'),
  ('0027', 'CORTE ERRONEO EN ACRILICO', 'proceso'),
  ('0028', 'CORTE FUERA DE ESPECIFICACIÓN', 'proceso'),
  ('0029', 'CRISTAL DIMENSIONES INCORRECTAS', 'proceso'),
  ('0030', 'CRISTAL RAYADO', 'proceso'),
  ('0031', 'CRISTAL ROTO', 'proceso'),
  ('0032', 'CRISTAL TEMPLADO CON FALTA DE HUELLA "TEMPLADO" O PUNTO "."', 'proceso'),
  ('0033', 'CUBRE CANTO CON FALTA DE ADHESIÓN', 'capacitacion'),
  ('0034', 'CUBRE CANTO DAÑADO', 'proceso'),
  ('0035', 'DEFECTOS EN COLOCACIÓN DEL CERAMICO', 'proceso'),
  ('0036', 'DESCUADRE EN PIEZA DE MADERA', 'proceso'),
  ('0037', 'DESCUADRE EN ACRILICO', 'proceso'),
  ('0038', 'DESCUADRE EN ESPEJO O CRISTAL', 'proceso'),
  ('0039', 'DESCUADRE EN ESTRUCTURA', 'proceso'),
  ('0040', 'DESCUADRE EN SUPERFICIE SOLIDA, MARMOL, PORCELANATO, PIEDRA', 'proceso'),
  ('0041', 'DIFERENCIA DE ESPESOR EN CUBRE CANTOS', 'proceso'),
  ('0042', 'DIFERENCIA DE VETA EN CHAPA', 'proceso'),
  ('0043', 'DIMENSIÓN DE ESPEJO MAL SOLICITADO EN PM', 'informacion'),
  ('0044', 'DIMENSION DE PIEZAS MEDIDA VS MEDIDA', 'informacion'),
  ('0045', 'DIMENSIÓN ERRONEA EN CEDULA', 'informacion'),
  ('0046', 'DIMENSIÓN ERRONEA EN CEDULA VETA INVERTIDA', 'informacion'),
  ('0047', 'DIMENSIÓN ERRONEA EN PLANO DE INGENIERÍA', 'informacion'),
  ('0048', 'DIMENSIÓN FUERA DE ESPECIFICACIÓN', 'proceso'),
  ('0049', 'DOBLEZ FUERA DE ESPECIFICACIÓN', 'proceso'),
  ('0050', 'ELEMENTO CON ACABADO INCORRECTO BARNIZ', 'proceso'),
  ('0051', 'ELEMENTO CON ACABADO INCORRECTO LP', 'proceso'),
  ('0052', 'ELEMENTO CON MATERIA PRIMA FUERA DE ESPECIFICACION', 'informacion'),
  ('0053', 'ELEMENTO EN ILUMINACION CREA SOMBRA EN VISTA', 'informacion'),
  ('0054', 'ELEMENTO ENVIADO O EMBARCADO ERRONEAMENTE', 'proceso'),
  ('0055', 'ELEMENTO MADERA CON ACABADO INCORRECTO', 'proceso'),
  ('0056', 'ELEMENTO NO ENVIADO O EMBARCADO', 'proceso'),
  ('0057', 'ELEMENTO O PARTE DAÑADA RAYADA O ROTA', 'proceso'),
  ('0058', 'ELEMENTO O PARTE EXTRAVIADA', 'proceso'),
  ('0059', 'ELEMENTO O PARTE FALTANTE', 'proceso'),
  ('0060', 'ELEMENTO O PARTE NO CONSIDERADA EN CEDULA', 'informacion'),
  ('0061', 'ELEMENTO O PARTE NO CONSIDERADA EN PLANO', 'informacion'),
  ('0062', 'ELEMENTO O PARTE SIN ACABADO', 'proceso'),
  ('0063', 'ELEMENTO O PARTES DE MADERA CON GRIETAS O SEPARACIONES EN CARAS', 'proceso'),
  ('0064', 'ELEMENTOS ENVIADOS A OBRA SIN VALIDACIÓN DE CLIENTE', 'proceso'),
  ('0065', 'ELEMENTOS ENVIADOS E INSTALADOS ERRONEAMENTE', 'proceso'),
  ('0066', 'ENTREPAÑOS FUERA DE ESPECIFICACIÓN', 'proceso'),
  ('0067', 'ERROR EN ENTREGA DE INFORMACIÓN TÉCNICA', 'informacion'),
  ('0068', 'ERROR EN LISTA DE INSUMOS', 'informacion'),
  ('0069', 'ESCORIA EN SOLDADURA', 'proceso'),
  ('0070', 'ESPEJO MAL PEGADO', 'proceso'),
  ('0071', 'ESPEJO ROTO', 'proceso'),
  ('0072', 'ESPESOR DE CRISTAL FUERA DE ESPECIFICACIÓN', 'informacion'),
  ('0073', 'ESPESOR DE MDF ERRONEO EN CEDULA', 'informacion'),
  ('0074', 'ESPESOR DE TRIPLAY ERRONEO EN CEDULA', 'informacion'),
  ('0075', 'FABRICACION CON PLANTILLA NO VALIDADA', 'proceso'),
  ('0076', 'FABRICACIÓN DUPLICADA', 'proceso'),
  ('0077', 'FABRICACIÓN EXCEDENTE', 'capacitacion'),
  ('0078', 'FALTA CONSIDERAR DESAHOGOS EN PLANO TECNICO', 'informacion'),
  ('0079', 'FALTA DE ADHERENCIA', 'capacitacion'),
  ('0080', 'FALTA DE FUSIÓN EN SOLDADURA', 'capacitacion'),
  ('0081', 'FALTA DE LIMPIEZA DURANTE EL PROCESO', 'proceso'),
  ('0082', 'FALTA DE MAQUINADO EN CRISTAL', 'proceso'),
  ('0083', 'FALTA DE MAQUINADO EN ELEMENTO O PARTE DE MADERA', 'proceso'),
  ('0084', 'FALTA DE MAQUINADO EN ELEMENTO O PARTE METÁLICA', 'proceso'),
  ('0085', 'FALTA DE NIVELADOR', 'proceso'),
  ('0086', 'FALTA DE PENETRACIÓN EN SOLDADURA', 'capacitacion'),
  ('0087', 'FALTA DE PINTURA/ TRANSPARENCIA', 'proceso'),
  ('0088', 'FALTA DE TUERCA INSERTO', 'proceso'),
  ('0089', 'FALTA DE TUERCA REMACHE', 'proceso'),
  ('0090', 'FALTA DETALLE DE ENSAMBLE EN PLANO DE INGENIERÍA', 'informacion'),
  ('0091', 'FALTO SOLICITAR ELEMENTOS EN LISTA DE INSUMOS', 'informacion'),
  ('0092', 'GARANTIA POR DAÑO O DESGASTE', 'proceso'),
  ('0093', 'HOLGURA EN FRENTE DE CAJON FUERA DE ESPECIFICACIÓN', 'proceso'),
  ('0094', 'HOLGURA EN PUERTA FUERA DE ESPECIFICACIÓN', 'proceso'),
  ('0095', 'HOLGURA FISICA MAYOR A LA ESTABLECIDA', 'proceso'),
  ('0096', 'HOLGURA INSUFICIENTE EN COMPONENTES', 'proceso'),
  ('0097', 'IGUALACION INCORRECTA DE PINTURA', 'proceso'),
  ('0098', 'ILUMINACIÓN LED INADECUADA', 'proceso'),
  ('0099', 'INGENIERÍA CON DIMENSIÓN ERRONEA VS LEVANTAMIENTO', 'informacion'),
  ('0100', 'LEVANTAMIENTO CON DIMENSION ERRONEA', 'capacitacion'),
  ('0101', 'LP DAÑADO, ROTO, DESPOSTILLADO', 'proceso'),
  ('0102', 'LP ERRONEO POR ARMADO', 'proceso'),
  ('0103', 'LP ERRONEO POR HABILITADO', 'proceso'),
  ('0104', 'LP MAL PERFILADO', 'proceso'),
  ('0105', 'LP; SUCIO/CONTAMINADO', 'proceso'),
  ('0106', 'MAL ACABADO PINTURA POR DEFECTO DE PULIDO', 'proceso'),
  ('0107', 'MAL FUNCIONAMIENTO DE CERRADURA', 'proceso'),
  ('0108', 'MALA COLOCACIÓN DE LP EN MUEBLE', 'proceso'),
  ('0109', 'MALA DEFINICIÓN DE ARMADO EN PLANO DE INGENIERÍA', 'informacion'),
  ('0110', 'MALA DEFINICIÓN DE INGENIERÍA VS BIBLIA', 'informacion'),
  ('0111', 'MAQUINA DESAJUSTADA (VARIACIÓN EN CORTE', 'proceso'),
  ('0112', 'MAQUINADO DE CERRADURA EN PUERTA ERRONEO', 'proceso'),
  ('0113', 'MAQUINADO INCOMPLETO', 'proceso'),
  ('0114', 'MAQUINADO INCORRECTO EN ELEMENTO O PARTE DE MADERA', 'proceso'),
  ('0115', 'MAQUINADO INCORRECTO EN ELEMENTO O PARTE METÁLICA', 'proceso'),
  ('0116', 'MARCA POR PEGAMENTO EN SUPERFICIE SOLIDA', 'proceso'),
  ('0117', 'MARMOL FUERA DE ESPECIFICACIÓN O ERRONEO', 'proceso'),
  ('0118', 'MATERIAL ERRONEO EN CEDULA', 'informacion'),
  ('0119', 'MEDIDA VS MEDIDA ENTRE ELEMENTOS O PARTES', 'capacitacion'),
  ('0120', 'METAL; FALTA DE LIMPIEZA', 'proceso'),
  ('0121', 'MEZCLA DE CUBRE CANTOS EN MOBILIARIO PVC Y LP', 'capacitacion'),
  ('0122', 'MOBILIARIO DAÑADO POR LLUVIA O HUMEDAD', 'proceso'),
  ('0123', 'MONOMANDO PARA LAVABO DAÑADO', 'proceso'),
  ('0124', 'MUEBLE PRESENTA INESTABILIDAD', 'capacitacion'),
  ('0125', 'NIVELADOR FUERA DE ESPECIFICACIÓN', 'informacion'),
  ('0126', 'NO SE HIZO CAMBIO ADECUADO DE INFORMACIÓN TÉCNICA', 'proceso'),
  ('0127', 'NO SE REPORTO MATERIAL SOBRANTE', 'proceso'),
  ('0128', 'OPTIMIZACION INCORRECTA', 'informacion'),
  ('0129', 'PANDEAMIENTO EN CRISTAL', 'proceso'),
  ('0130', 'PANDEAMIENTO EN PERFIL CUADRADO', 'proceso'),
  ('0131', 'PANDEAMIENTO EN PIEZA O PARTE DE MADERA', 'proceso'),
  ('0132', 'PANDEAMIENTO EN PIEZA O PARTE DE PVC', 'proceso'),
  ('0133', 'PANDEAMIENTO EN SUPERFICIE SOLIDA', 'proceso'),
  ('0134', 'PEGAMENTO NO FUNCIONAL', 'proceso'),
  ('0135', 'PELICULA ANTI-IMPACTO CON BURBUJAS', 'proceso'),
  ('0136', 'PELICULA ANTI-IMPACTO CON CONTAMINACIÓN', 'proceso'),
  ('0137', 'PERFIL DE ALUMINIO FUERA DE ESPECIFICACIÓN CON RESPECTO A TIRA LED', 'proceso'),
  ('0138', 'PINTURA ELECTROSTATICA DAÑADA', 'proceso'),
  ('0139', 'PINTURA ELECTROSTATICA ERRONEA EN PLANO DE INGENIERÍA', 'informacion'),
  ('0140', 'PREFLECHADO FUERA DE ESPECIFICACIÓN', 'proceso'),
  ('0141', 'PROBLEMA CON COTAS EN PLANO DE INGENIERÍA', 'informacion'),
  ('0142', 'PROBLEMA CON EL ARCHIVO DE CORTE (DXF)', 'informacion'),
  ('0143', 'PROPUESTA DE MEJORA/ RE-INGENIERÍA', 'capacitacion'),
  ('0144', 'PUERTA CON ALTURA DE CERRADURA ERRONEA', 'proceso'),
  ('0145', 'PUNTOS DE ALFILER', 'proceso'),
  ('0146', 'S.S. O PIEDRA ROTA', 'proceso'),
  ('0147', 'SE FABRICA CON BIBLIA', 'proceso'),
  ('0148', 'SIN ARCHIVO DE CORTE DXF', 'proceso'),
  ('0149', 'SOCAVACIÓN EN SOLDADURA', 'capacitacion'),
  ('0150', 'TAPICERIA CON RESTOS DE ADHESIVO', 'proceso'),
  ('0151', 'TAPICERIA DAÑADA', 'proceso'),
  ('0152', 'TONALIDAD DIFERENTE AL AUTORIZADO', 'proceso'),
  ('0153', 'VINIL CON ARTE FUERA DE ESPECIFICACIÓN', 'proceso'),
  ('0154', 'VINIL CON DEFECTO EN LA APLICACIÓN', 'proceso'),
  ('0155', 'VINIL CON IMPRESIÓN FUERA DE REGISTRO', 'informacion'),
  ('0156', 'VINIL CON TONO FUERA DE ESPECIFICACIÓN', 'proceso'),
  ('0157', 'VINIL DAÑADO', 'proceso'),
  ('0158', 'VINIL FUERA DE DIMENSIÓN', 'informacion');

insert into public.areas_calidad (area, responsable) values
  ('ALMACEN', 'YAHIR GALLARDO'),
  ('BARNIZ', 'RUBEN BELTRAN'),
  ('CALIDAD', 'SUHEILLI GALICIA'),
  ('CLIENTE', null),
  ('COMPRAS', 'GUADALUPE TOVAR'),
  ('CUANTIFICACIONES', 'ADRIAN TREJO'),
  ('EMBARQUES', 'ANTONIO ANGUIANO'),
  ('FINANZAS', 'JACOB HERNANDEZ'),
  ('INGENIERIA', 'ANTONIO SOLIS'),
  ('MANTENIMIENTO', 'MIGUEL ISLAS'),
  ('OBRAS', null),
  ('PLANEACION', 'RUBEN MEJIA'),
  ('PRESUPUESTOS', 'ELBA GARCIA'),
  ('PROD-ACRILICO', 'MARTIN PEREA'),
  ('PROD-ARMADO-MAD', 'RUBEN BELTRAN'),
  ('PROD-CRISTAL', 'MARTIN PEREA'),
  ('PROD-ELECTRIC', 'RAMIRO BARRIOS'),
  ('PROD-ELECTRIC', 'JUAN CALIXTO'),
  ('PROD-GENERAL', 'REYNALDO ORTIZ'),
  ('PROD-HAB-MADERA', 'MARCOS SALAZAR'),
  ('PROD-HAB-METAL', 'RENE MORALES'),
  ('PROD-HERRAJES', 'DANIELA MARTINEZ'),
  ('PROD-MONT-MADERA', 'FELIX HERNANDEZ'),
  ('PROD-MONT-METAL', 'HERMENEGILDO CASTRO'),
  ('PROD-PINTURA', 'ALEJANDRO CANSECO'),
  ('PROD-PULIDO', 'RENE MORALES'),
  ('PROD-SOLDADURA', 'RENE MORALES'),
  ('PROD-TAPIZ', 'MARTIN PEREA'),
  ('PROYECTOS', 'ERICK SANCHEZ'),
  ('PROYECTOS', 'JAIRO GONZALEZ'),
  ('PROYECTOS', 'ESTEFANIA MARQUEZ'),
  ('PROYECTOS', 'LUIS TREJO'),
  ('PROYECTOS', 'FERNANDA ROSAS'),
  ('PROYECTOS', 'EMMANUEL HEREDIA'),
  ('PROYECTOS', 'ADRIAN TREJO'),
  ('RECURSOS HUMANOS', 'JOSE COCA'),
  ('RESIDENCIA', null),
  ('SEGURIDAD-INDUSTRIAL', 'MARIEL VERA'),
  ('SISTEMAS', 'HUGO PACHECO'),
  ('VIGILANCIA', 'OMAR VILLAR'),
  ('CONTRATISTA', 'EMILIO HERNANDEZ'),
  ('CONTRATISTA', 'CAYETANO MARQUEZ'),
  ('CONTRATISTA', 'DANIEL BAZAN'),
  ('CONTRATISTA', 'CARLOS PALACIOS'),
  ('CONTRATISTA', 'CARLOS SERRANO'),
  ('CONTRATISTA', 'REYNA JIMENEZ'),
  ('MAQUILADOR', null);

insert into public.autorizadores_calidad (nombre, puesto) values
  ('PEDRO SIMON', 'DIRECTOR DE PLANTA'),
  ('REYNALDO ORTIZ', 'GERENTE PLANTA'),
  ('ANTONIO SOLIS', 'GERENTE INGENIERIA'),
  ('SUHEILLI GALICIA', 'GERENTE CALIDAD');

alter table public.informes_calidad
  add column tipo_reporte text,
  add column motivo_codigo text references public.motivos_calidad(codigo),
  add column autoriza text,
  add column area_deteccion text,
  add column responsable_deteccion text,
  add column area_origen text,
  add column responsable_origen text,
  add column acciones_correctivas text,
  add column solucion text,
  add column material text,
  add column mano_obra text,
  add column severidad text,
  add column causa_raiz_tipo text,
  add column causa_raiz text,
  -- Piezas (partes) afectadas. Los muebles afectados de un lote son su cantidad.
  add column piezas_afectadas numeric,
  add column solucion_en timestamptz,
  add column solucion_por uuid references auth.users(id),
  -- Cierre manual de un reporte sin lote; el de un lote se calcula con su retrabajo.
  add column cerrado_en timestamptz,
  add column cerrado_por uuid references auth.users(id),
  add column detalle_actualizado_en timestamptz,
  add column detalle_actualizado_por uuid references auth.users(id),
  add constraint informes_calidad_detalle_solo_no_aprobado check (
    aprobado = false
    or (
      tipo_reporte is null and motivo_codigo is null and autoriza is null
      and area_deteccion is null and responsable_deteccion is null
      and area_origen is null and responsable_origen is null
      and acciones_correctivas is null and solucion is null
      and material is null and mano_obra is null and severidad is null
      and causa_raiz_tipo is null and causa_raiz is null
      and piezas_afectadas is null and cerrado_en is null
    )
  ),
  add constraint informes_calidad_piezas_afectadas_check check (
    piezas_afectadas is null or piezas_afectadas > 0
  ),
  add constraint informes_calidad_severidad_check check (
    severidad is null or severidad in ('baja', 'media', 'alta')
  ),
  add constraint informes_calidad_detalle_largo_check check (
    char_length(coalesce(tipo_reporte, '')) <= 80
    and char_length(coalesce(area_deteccion, '')) <= 80
    and char_length(coalesce(area_origen, '')) <= 80
    and char_length(coalesce(responsable_deteccion, '')) <= 120
    and char_length(coalesce(responsable_origen, '')) <= 120
    and char_length(coalesce(acciones_correctivas, '')) <= 1000
    and char_length(coalesce(solucion, '')) <= 1000
    and char_length(coalesce(material, '')) <= 500
    and char_length(coalesce(mano_obra, '')) <= 500
    and char_length(coalesce(causa_raiz_tipo, '')) <= 80
    and char_length(coalesce(causa_raiz, '')) <= 1000
    and char_length(coalesce(autoriza, '')) <= 120
  );

create index idx_informes_calidad_motivo on public.informes_calidad (motivo_codigo);
create index idx_informes_calidad_solucion_por on public.informes_calidad (solucion_por);
create index idx_informes_calidad_cerrado_por on public.informes_calidad (cerrado_por);
create index idx_informes_calidad_detalle_actualizado_por on public.informes_calidad (detalle_actualizado_por);

-- ---------------------------------------------------------------------------
-- Fotos de la no conformidad
-- ---------------------------------------------------------------------------
create table public.informe_calidad_fotos (
  id uuid primary key default gen_random_uuid(),
  informe_id uuid not null references public.informes_calidad(id) on delete cascade,
  foto_path text not null unique,
  subida_por uuid references auth.users(id) default auth.uid(),
  subida_en timestamptz not null default now(),
  constraint informe_calidad_fotos_path_check check (nullif(btrim(foto_path), '') is not null)
);
create index idx_informe_calidad_fotos_informe on public.informe_calidad_fotos (informe_id);
create index idx_informe_calidad_fotos_subida_por on public.informe_calidad_fotos (subida_por);

-- Sin políticas de escritura: solo agregar_foto_informe_calidad inserta.
alter table public.informe_calidad_fotos enable row level security;
create policy "select_informe_calidad_fotos" on public.informe_calidad_fotos
  for select to authenticated using ((select public.is_staff()));

-- Bucket privado. Las sube la ruta de servidor (con la sesión de Calidad) y se
-- leen con URL firmada. Sin DELETE desde la app: la evidencia no se borra (la
-- ruta de servidor limpia con service role si el registro falla).
insert into storage.buckets (id, name, public)
values ('calidad-no-conformidades', 'calidad-no-conformidades', false)
on conflict (id) do nothing;

create policy "calidad_insert_calidad_no_conformidades_bucket"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'calidad-no-conformidades' and (select public.is_calidad()));

create policy "select_calidad_no_conformidades_bucket"
  on storage.objects for select to authenticated
  using (bucket_id = 'calidad-no-conformidades' and (select public.is_staff()));

-- ---------------------------------------------------------------------------
-- Funciones de escritura
-- ---------------------------------------------------------------------------

-- Guarda (o actualiza) el detalle de un informe No aprobado. Obligatorios: tipo
-- de reporte, motivo, área donde se detectó y su responsable, área de origen y su
-- responsable, y acciones correctivas (y las piezas afectadas si no hay lote).
-- Lo demás (solución, quien autoriza, material, mano de obra, severidad y causa
-- raíz) se completa cuando se tiene. Reemplaza todo el detalle: la pantalla
-- manda lo que ya había.
create or replace function public.guardar_no_conformidad(
  p_informe_id uuid,
  p_tipo_reporte text,
  p_motivo_codigo text,
  p_area_deteccion text,
  p_responsable_deteccion text,
  p_area_origen text,
  p_responsable_origen text,
  p_acciones_correctivas text,
  p_solucion text default null,
  p_piezas_afectadas numeric default null,
  p_autoriza text default null,
  p_material text default null,
  p_mano_obra text default null,
  p_severidad text default null,
  p_causa_raiz_tipo text default null,
  p_causa_raiz text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_i record;
  v_tipo text := nullif(btrim(coalesce(p_tipo_reporte, '')), '');
  v_area_det text := nullif(btrim(coalesce(p_area_deteccion, '')), '');
  v_resp_det text := nullif(btrim(coalesce(p_responsable_deteccion, '')), '');
  v_area_ori text := nullif(btrim(coalesce(p_area_origen, '')), '');
  v_resp_ori text := nullif(btrim(coalesce(p_responsable_origen, '')), '');
  v_acc text := nullif(btrim(coalesce(p_acciones_correctivas, '')), '');
  v_sol text := nullif(btrim(coalesce(p_solucion, '')), '');
  v_aut text := nullif(btrim(coalesce(p_autoriza, '')), '');
  v_sev text := nullif(btrim(coalesce(p_severidad, '')), '');
begin
  if not public.is_calidad() then
    raise exception 'No tienes permiso para editar informes de calidad.';
  end if;

  select aprobado, solucion, entrega_id
    into v_i
    from public.informes_calidad
    where id = p_informe_id
    for update;
  if not found then
    raise exception 'El informe no existe.';
  end if;
  if v_i.aprobado then
    raise exception 'Solo un informe No aprobado lleva detalle de no conformidad.';
  end if;

  if v_tipo is null then raise exception 'Indica el tipo de reporte.'; end if;
  if not exists (select 1 from public.motivos_calidad where codigo = p_motivo_codigo and activo) then
    raise exception 'Elige un motivo de la lista.';
  end if;
  if v_area_det is null
     or not exists (select 1 from public.areas_calidad where area = v_area_det and activo) then
    raise exception 'Elige el área donde se detectó.';
  end if;
  if v_resp_det is null then raise exception 'Indica el responsable del área donde se detectó.'; end if;
  if v_area_ori is null
     or not exists (select 1 from public.areas_calidad where area = v_area_ori and activo) then
    raise exception 'Elige el área de origen.';
  end if;
  if v_resp_ori is null then raise exception 'Indica el responsable del área de origen.'; end if;
  if v_acc is null then raise exception 'Escribe las acciones correctivas.'; end if;
  if v_aut is not null
     and not exists (select 1 from public.autorizadores_calidad where nombre = v_aut and activo) then
    raise exception 'Elige a quien autoriza de la lista.';
  end if;
  if v_sev is not null and v_sev not in ('baja', 'media', 'alta') then
    raise exception 'Severidad no válida.';
  end if;
  if v_i.entrega_id is null and (p_piezas_afectadas is null or p_piezas_afectadas <= 0) then
    raise exception 'Indica cuántas piezas están afectadas.';
  end if;
  if p_piezas_afectadas is not null and p_piezas_afectadas <= 0 then
    raise exception 'Las piezas afectadas deben ser mayores que cero.';
  end if;

  update public.informes_calidad set
    tipo_reporte = v_tipo,
    motivo_codigo = p_motivo_codigo,
    area_deteccion = v_area_det,
    responsable_deteccion = v_resp_det,
    area_origen = v_area_ori,
    responsable_origen = v_resp_ori,
    acciones_correctivas = v_acc,
    piezas_afectadas = p_piezas_afectadas,
    autoriza = v_aut,
    material = nullif(btrim(coalesce(p_material, '')), ''),
    mano_obra = nullif(btrim(coalesce(p_mano_obra, '')), ''),
    severidad = v_sev,
    causa_raiz_tipo = nullif(btrim(coalesce(p_causa_raiz_tipo, '')), ''),
    causa_raiz = nullif(btrim(coalesce(p_causa_raiz, '')), ''),
    solucion = v_sol,
    solucion_en = case
      when v_sol is null then null
      when v_i.solucion is distinct from v_sol then now()
      else solucion_en
    end,
    solucion_por = case
      when v_sol is null then null
      when v_i.solucion is distinct from v_sol then auth.uid()
      else solucion_por
    end,
    detalle_actualizado_en = now(),
    detalle_actualizado_por = auth.uid()
  where id = p_informe_id;
end;
$$;

revoke execute on function public.guardar_no_conformidad(uuid, text, text, text, text, text, text, text, text, numeric, text, text, text, text, text, text) from public, anon;
grant execute on function public.guardar_no_conformidad(uuid, text, text, text, text, text, text, text, text, numeric, text, text, text, text, text, text) to authenticated;

-- Cierra (o reabre) un reporte sin lote. El de un lote no se cierra a mano: queda
-- cerrado cuando Calidad aprueba las piezas del retrabajo.
create or replace function public.cerrar_no_conformidad(p_informe_id uuid, p_cerrar boolean default true)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_i record;
begin
  if not public.is_calidad() then
    raise exception 'No tienes permiso para editar informes de calidad.';
  end if;
  select aprobado, entrega_id, solucion into v_i
    from public.informes_calidad where id = p_informe_id for update;
  if not found then
    raise exception 'El informe no existe.';
  end if;
  if v_i.aprobado then
    raise exception 'Solo un informe No aprobado se cierra.';
  end if;
  if v_i.entrega_id is not null then
    raise exception 'El reporte de un lote se cierra solo cuando Calidad aprueba el retrabajo.';
  end if;
  if p_cerrar and v_i.solucion is null then
    raise exception 'Describe la solución antes de cerrar el reporte.';
  end if;
  update public.informes_calidad set
    cerrado_en = case when p_cerrar then now() else null end,
    cerrado_por = case when p_cerrar then auth.uid() else null end
  where id = p_informe_id;
end;
$$;

revoke execute on function public.cerrar_no_conformidad(uuid, boolean) from public, anon;
grant execute on function public.cerrar_no_conformidad(uuid, boolean) to authenticated;

-- Registra una foto ya subida al bucket (carpeta con el id del informe). Solo
-- informes No aprobado; máximo 10 fotos por informe.
create or replace function public.agregar_foto_informe_calidad(
  p_informe_id uuid,
  p_foto_path text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_aprobado boolean;
  v_id uuid;
begin
  if not public.is_calidad() then
    raise exception 'No tienes permiso para editar informes de calidad.';
  end if;

  select aprobado into v_aprobado
    from public.informes_calidad where id = p_informe_id for update;
  if not found then
    raise exception 'El informe no existe.';
  end if;
  if v_aprobado then
    raise exception 'Solo un informe No aprobado lleva fotos de no conformidad.';
  end if;
  if p_foto_path is null or p_foto_path not like p_informe_id::text || '/%' then
    raise exception 'La foto no corresponde a este informe.';
  end if;
  if (select count(*) from public.informe_calidad_fotos where informe_id = p_informe_id) >= 10 then
    raise exception 'Un informe puede llevar hasta 10 fotos.';
  end if;

  insert into public.informe_calidad_fotos (informe_id, foto_path)
    values (p_informe_id, p_foto_path)
    returning id into v_id;
  return v_id;
end;
$$;

revoke execute on function public.agregar_foto_informe_calidad(uuid, text) from public, anon;
grant execute on function public.agregar_foto_informe_calidad(uuid, text) to authenticated;

-- La tabla de fotos también se escribe solo por su función. Misma función de
-- verificación de 20261008183835, con informe_calidad_fotos añadida.
create or replace function public.faltantes_reglas_produccion_calidad()
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(falta order by falta), '{}')
  from (
    select 'trigger ' || t.tabla || '.' || t.nombre as falta
    from (values
      ('planeacion_items', 'trg_protect_planeacion_items_columns_produccion'),
      ('planeacion_items', 'trg_proteger_liberacion_con_trabajo'),
      ('planeacion_items', 'trg_asignar_folio_produccion'),
      ('asignaciones_produccion', 'trg_auditar_asignaciones_produccion'),
      ('entregas_produccion', 'trg_auditar_entregas_produccion'),
      ('informes_calidad', 'trg_auditar_informes_calidad'),
      ('equipos_produccion', 'trg_auditar_equipos_produccion')
    ) as t(tabla, nombre)
    where not exists (
      select 1 from pg_trigger g
      join pg_class c on c.oid = g.tgrelid
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relname = t.tabla
        and g.tgname = t.nombre
        and not g.tgisinternal
        and g.tgenabled <> 'D'
    )
    union all
    select 'rls ' || r.tabla
    from (values
      ('planeacion_items'),
      ('asignaciones_produccion'),
      ('entregas_produccion'),
      ('informes_calidad'),
      ('informe_calidad_fotos'),
      ('equipos_produccion')
    ) as r(tabla)
    where not exists (
      select 1 from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = r.tabla and c.relrowsecurity
    )
    union all
    -- Escribir en estas tablas solo por sus funciones (security definer).
    select 'politica de escritura directa ' || p.tablename || '.' || p.policyname
    from pg_policies p
    where p.schemaname = 'public'
      and p.tablename in ('informes_calidad', 'informe_calidad_fotos', 'asignaciones_produccion', 'entregas_produccion')
      and p.cmd <> 'SELECT'
  ) x;
$$;

revoke execute on function public.faltantes_reglas_produccion_calidad() from public, anon, authenticated;
grant execute on function public.faltantes_reglas_produccion_calidad() to service_role;
