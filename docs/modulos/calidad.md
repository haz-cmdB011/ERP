# Calidad

Detalle del módulo: cómo funciona, qué migración hizo cada cosa y las trampas conocidas. Las reglas
generales del proyecto (migraciones, seguridad, flujo de trabajo) están en `CLAUDE.md`. Al cambiar este módulo,
actualizar este archivo.

## Preaprobación de Producción

Calidad solo **evalúa** piezas que Producción preaprobó, pero **ve** todo lo enviado a producción (desde el
20 oct 2026; antes lo de taller no aparecía): arriba lo listo (preaprobado o con informes,
`listosParaCalidad` en `src/lib/calidad/estado-item.ts`, lectura en `preaprobados-db.ts`) y abajo, plegado,
"En taller" (`enTallerParaCalidad`, el mueble va junto con sus componentes). Lo de taller no se aprueba ni
cuenta como pendiente en el panel ni en la O.T.; tiene "Reportar falla", que abre el alta de no conformidades
prellenada (`?reportar=1&reportar_proyecto=…&reportar_mueble=…`). Producción **ya no califica** al registrar la
entrega ni sube foto (migración `entrega_sin_foto_ni_calificacion`): solo fecha, cantidad y folio, y la
entrega nace verificada y pasa a Calidad, que es quien evalúa. Las entregas viejas conservan su foto y su
"cumplen / no cumplen". Lo controla el ajuste `verificacion_produccion` de la tabla
`ajustes_flujo`, hoy ENCENDIDO (migración `entrega_con_preaprobacion`). Apagado, Calidad evalúa todo
ítem liberado aunque no haya entregas (un mueble sin entregas se evalúa completo) y las entregas nacen
verificadas. Cómo apagarlo o encenderlo y qué anotar después: `docs/operacion.md` ("Si Calidad no puede
evaluar un mueble"). La pantalla lee el ajuste con `src/lib/compartido/ajustes-flujo.ts`; si no puede
leerlo asume el flujo con verificación.

## Revisión final de Calidad

Calidad revisa el **mueble completo** antes de mandarlo a obra, no cada proceso (migraciones
`revision_final_calidad` y `revision_final_obligatoria`). Revisar un lote por proceso queda como opción,
para cuando hay una falla ahí: en pantalla no se habla de "lotes" sino de **entregas identificadas por su
fecha** ("Revisar 3 pz del 20/10", página Entregas de `/calidad/entregas`), y el panel ya no tiene tarjeta ni
alerta de días sin evaluar (los datos siguen en la vista `lotes_calidad`). Está detrás del ajuste `revision_final` de `ajustes_flujo`, que se enciende
**después de fusionar** la pantalla que pide el origen de la falla (cómo: `docs/operacion.md`); encendida es
la puerta obligatoria hacia obra.

- Listas = lo que **Producción verificó** en el **último paso** de la ruta (entregas preaprobadas, incluidos
  los retrabajos que ya llegaron ahí) − lo que Calidad rechazó en esos lotes si los revisó − lo revisado
  (`piezas_listas_revision_final`, vista `revision_final_muebles`). Antes era lo que Calidad aprobó.
- `registrar_revision_final`: folio `FIN-` por resultado; lo rechazado lleva motivo, **dónde nació la falla**
  (`origen_paso_id`, un paso de la ruta, u `origen_area`: ingenieria, planeacion, compras, diseno, otra;
  exactamente uno; `AREAS_ORIGEN` en `src/lib/calidad/revision-final.ts`) y el paso de la ruta al
  que regresa, y desde ahí **sigue el resto de la ruta**: Producción lo reasigna paso por paso con
  `crear_retrabajo_revision_final`, que toma el siguiente paso (`siguiente_paso_revision_final`; vista
  `rechazos_revision_final`, pantalla Rechazado por Calidad). Ese retrabajo no cuenta contra el tope del
  paso; el retrabajo de sus lotes hereda el vínculo (`trg_paso_de_retrabajo`). Un paso con piezas de la
  revisión final pendientes no se quita de la ruta.
- Solo muebles padre. No cambia el cobro ni la revisión por lotes: lo retrabajado por la revisión final no
  suma a "Calidad aprobó" de Estimaciones (ya se aprobó una vez). Liberado a obra = la final aprobó la
  cantidad del mueble.

## No conformidades (Calidad)

`/calidad/incidencias` (menú "No conformidades"): reportes de no conformidad, desviación, incidencia o mejora, con
resumen, gráficas, "Nuevo reporte" y "Descargar Excel" (tabla `incidencias_calidad`). Vienen del Excel de control
`BD-CONTROL` (hojas MADERA y METAL) y siguen entrando desde él: el botón **Importar Excel** (`importar-excel.tsx`,
`POST /api/calidad/incidencias/importar?modo=simular|aplicar`, solo Calidad) lee el libro, enseña cuántas son nuevas,
cuántos reportes son nuevos, cuáles ya cargados cambian (p. ej. los cerraron en el Excel), cuántos quedan sin cambios y
cuáles tienen problema; al confirmar **agrega lo nuevo y actualiza lo que el Excel trae distinto** (el Excel manda, para
que las gráficas y los pendientes de +30 días sigan al libro de control). Reglas de la actualización
(`cambiosDeUnReporte`): una celda vacía del Excel no borra lo que ya hay; un reporte cerrado en la app no se reabre aunque
el Excel lo tenga abierto; la línea nunca cambia; lo que el Excel trae con valor y es distinto sí se escribe (también
sobre lo editado en la pantalla: la vista previa lo muestra). Cada fila se reconoce por su clave (`origen_importacion`:
`madera:427`; las hojas de otro año llevan el año, `madera-27:12`) y también por su contenido (línea, tipo, fecha,
proyecto, muebles y motivo). `clasificarImportacion` empareja en tres pasos: misma clave y mismo contenido; mismo
contenido con otra clave (el Excel se ordenó o se le insertaron filas: el reporte no se carga dos veces, recibe sus
cambios —por ejemplo, que lo cerraron— y se le anota la clave nueva; lo mismo con uno capturado a mano); y misma clave
con contenido casi igual (3 de 5 datos: corregido en su sitio). Una fila con la misma clave pero otro reporte NO pisa al
anterior: se agrega como nueva. Como la clave es única, al escribir primero se les quita la clave a quienes la sueltan
(`liberarClaves`) y luego se asignan; si se corta a la mitad, repetir es seguro. Repetirlo es seguro. Lógica sin base en
`src/lib/calidad/importar-incidencias.ts` (la lectura es la misma que usa
`npm run calidad:importar-incidencias -- "ruta.xlsx" [--aplicar]`). Una fila con tipo desconocido o que pasa los topes de
la base (motivo 300 letras, etc.) se omite diciendo cuál es.
