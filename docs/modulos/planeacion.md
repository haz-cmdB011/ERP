# Planeación: carga del PM

Detalle del módulo: cómo funciona, qué migración hizo cada cosa y las trampas conocidas. Las reglas
generales del proyecto (migraciones, seguridad, flujo de trabajo) están en `CLAUDE.md`. Al cambiar este módulo,
actualizar este archivo.

## Carga del Excel "PEDIDO DE MANUFACTURA"

`src/lib/planeacion/`: parser del Excel "PEDIDO DE MANUFACTURA", números PM,
jerarquía MO/FU, imágenes. **Errores vs. avisos al subir un PM**: un error (rojo) rechaza el archivo; un aviso (recuadro
amarillo, "Se cargó, pero revisa…") carga igual. Los nombres de columna de plantillas anteriores (`CANT TOTAL`, `TOTAL`,
`COMP`, `CANTIDAD POR MUEBLE`, `CANT X MUEBLE`; `ALIAS_COLUMNAS` en `formato.ts`) se leen y avisan, y la columna
`COMPONENTE` puede faltar (`COLUMNAS_TOLERADAS`: queda sin categoría y avisa). Sigue siendo error: una columna obligatoria
sin nombre reconocible (se señala la parecida), la falta de las etiquetas `PROYECTO`/`CLIENTE`, y una hoja sin fila de
encabezados. Una entrega anterior al pedido también avisa (año mal escrito). Se probó contra 589 PM reales (2024–2026): los 451
que ya cargaban no cambian y 65 más cargan.
**Carga masiva (medido el 20 nov 2026)**: la pantalla sube un archivo a la vez y el servidor deja 40 cargas por 10 minutos por persona
(80 las confirmaciones): al topar, el resto queda en espera con aviso y se vuelve a pulsar "Subir". La base carga un PM de 600 filas en
~0.9 s, de 1500 en ~2.3 s y de 3000 en ~4.7 s (el tope de las llamadas de la app es 8 s; el PM real más grande trae 598 filas y 104
imágenes) y 200 PM seguidos tardan lo mismo cada uno (~42 ms); con 600 muebles liberados, asignados y aprobados las pantallas siguen en
milisegundos. Procesar las imágenes del PM más grande tarda ~1 s y ~216 MB. Dos cargas simultáneas del mismo archivo no duplican versiones
(candado `pg_advisory_xact_lock`; la versión vieja de la función, sin candado, se quitó).
**Con 5000 PM de 20 muebles (100 mil filas, 20 nov 2026)**: cargarlos tardó 105 s (~20 ms por PM, sin enlentecerse), el PM 5001
entró en 31 ms y abrir un PM, la lista de pedidos o `muebles_en_calidad` siguen en milisegundos. Lo que sí crece es
`listar_ots_recibos` (la lista de O.T. de los recibos): 1.9 s con 5011 O.T., lineal, así que llegaría al tope de 8 s hacia las
20 mil O.T. Dos reglas que ese volumen exige: toda lista que pueda pasar de 1000 filas usa `paginarTodo`, y todo `.in()` con muchos
ids va en lotes de 100 (`enLotes`). Las pantallas **Cancelados** (Planeación, Producción y Calidad) leían todos los PM y todos sus
muebles: con cientos de PM fallaban por la dirección demasiado larga y la lista principal de Planeación se cortaba en 1000 PM.
Ahora leen solo lo que tiene cancelaciones o papelera (`cargarCancelados`, `src/lib/planeacion/cancelados-db.ts`) y la lista
principal de Planeación pagina.
**Imagen del mueble** (20 nov 2026): en muchos PM la foto va junto al primer componente, no junto a la fila del mueble (de 36 muebles reales, 29 no traían foto propia). `imagenesDeItems` (`src/lib/compartido/imagenes.ts`) le da al mueble sin foto la del primer componente que tenga; no cambia datos.
