# Estimaciones

Detalle del módulo: cómo funciona, qué migración hizo cada cosa y las trampas conocidas. Las reglas
generales del proyecto (migraciones, seguridad, flujo de trabajo) están en `CLAUDE.md`. Al cambiar este módulo,
actualizar este archivo.

## Cuadre con Calidad (Estimaciones)

"PM contra cobrado" (`/estimaciones/pm-cobrado/<OT>` y el reporte semanal) cruza, por O.T. y variante del
modelo (código + descripción), lo que declaró Planeación, lo que Calidad aprobó y lo cobrado en recibos
(migración `cuadre_calidad_recibos`). Sin campos nuevos para el maquilador:

- **Componentes (hijos)**: salen como filas aparte bajo su mueble y el campo "Modelo" del recibo de
  Acabados/Armado también los ofrece (`CampoModeloOt`). Un recibo puede cobrar un componente suelto y se
  compara contra la cantidad de ese componente: el trigger `est_conciliar_renglon_pm` no cambió, solo
  `cantidad_pm_variante` los incluye. **Si Producción guardó un despiece que no es el sugerido**
  (`igual_a_sugerencia` = false), los componentes de ese mueble son sus partes (piezas por mueble ×
  cantidad del mueble en el PM) en vez de los hijos del PM; una parte ligada a un hijo conserva la
  descripción del hijo (`componentes_recibo_ot`, migración `recibos_segun_despiece`). El reporte usa la misma
  regla: en pantalla es **"PM de Producción contra cobrado"** (migración `pm_cobrado_segun_despiece`; la ruta
  y la función siguen siendo `pm-cobrado` y `ot_contra_cobrado`). Electrificación sigue solo con padres, pero cuenta los que llevan iluminación o electrificación en él o en sus componentes (`admite_electrificacion`, migración `electrificacion_estimaciones_por_componentes`). El saldo por
  código (`cantidad_pm_ot`, `saldosDeVariantes`) NO suma componentes.
- **"Calidad aprobó" por área** (`aprobado_calidad_variante`, interna): barniz → Acabados y armado → Armado, de
  lotes de equipos que no son de planta (la planta no cobra recibo); en un componente, su último informe (todo
  o nada). Solo hay dato si Producción asignó el mueble en el sistema; si no, es null y no se marca nada.
  Electrificación no se compara con Calidad.
- **Tope duro al guardar un recibo** (migraciones `cobro_limitado_por_pm_y_calidad` y `mensajes_cobro_cortos`, 3 nov
  2026; `reprocesos_segun_produccion` las sobrescribió el 4 nov y `tope_cobro_sobre_reprocesos` las volvió a poner):
  el trigger `est_conciliar_renglon_pm` no deja guardar un renglón **normal** que cobre más que el PM de la OT (ni con
  motivo; un modelo que no está en la OT tampoco) ni, en Acabados y Armado, más que lo que **Calidad aprobó** del
  mueble en el área (`aprobado_calidad_variante`, revisión final incluida; un mueble que no pasó por Producción y
  Calidad en el sistema no se cobra). Electrificación también se topa con lo que Calidad aprobó de ese proceso
  (`aprobado_calidad_electrificacion`, migración `cobro_por_partes`); S.S. no tiene recibo. La pantalla
  (`dialogo-descuadres.tsx`) avisa el PM antes de guardar; lo de Calidad lo dice la base al guardar. El **reproceso**
  conserva su regla (se mide contra el retrabajo reasignado y, si se pasa, pide motivo y deja discrepancia). **Cuidado
  al reescribir esa función: tomar la versión vigente de la base, no la de una migración vieja.**
- **(Apagado desde el 3 nov 2026) Se cobra según Producción** (migración `cobro_segun_produccion`, ajuste `cobro_segun_produccion` de
  `ajustes_flujo`, hoy APAGADO: manda Calidad): Calidad revisa el mueble completo, no cada proceso, así que lo liberado para
  cobrar es lo que **Producción verificó** al registrar la entrega (`verificado_produccion_variante`, interna,
  mismas reglas que la de Calidad y sin retrabajos; un componente, en la proporción de su mueble). "Calidad
  aprobó" queda solo informativo. Apagado el ajuste, todo vuelve a medirse contra Calidad. La app lo lee con
  `cobroSegunProduccion` (`src/lib/compartido/ajustes-flujo.ts`); si no puede, asume Calidad.
- **Listo para cobrar** = liberado − cobrado (filtro de la O.T. y del reporte; `liberadoArea` en
  `src/lib/estimaciones/pm-cobrado.ts`). Un recibo cobrado de más se **marca al revisarlo**
  (`recibo_contra_calidad`, que trae lo aprobado y lo verificado; `src/app/estimaciones/calidad-recibo.tsx`): es
  un aviso, no bloquea ni le pide motivo al maquilador; se calcula al abrir, así que desaparece al liberarse.
- No cubre el doble cobro (el mueble y también sus componentes por el mismo trabajo): salen juntos en pantalla.
- **Reprocesos** (migración `reprocesos_segun_produccion`): no gastan saldo del PM; se comparan contra el
  retrabajo que **Producción reasignó** tras un rechazo de Calidad (asignaciones con `informe_rechazo_id` o
  `revision_final_rechazo_id`, equipos que no son de planta, proceso del área; `retrabajo_recibo_ot`), en las
  mismas unidades (mueble o piezas de la parte). Pasarse, o cobrar reproceso sin retrabajo, pide motivo y deja
  una discrepancia `es_reproceso`. La causa es obligatoria (`renglones_causa_reproceso_check`) y la revisión
  la muestra junto al renglón.
- **Recibos por llegar** (panel de Estimaciones y `/estimaciones/por-llegar`, solo quien revisa recibos): lo que
  **Calidad aprobó** y aún no se cobra, por área (Acabados, Armado), con base Calidad siempre (el maquilador solo
  cobra lo aprobado), aunque `cobro_segun_produccion` esté encendido. "Calidad aprobó" incluye la revisión final
  del mueble (sin pasar de lo que Producción verificó de equipos externos; migración `recibos_por_llegar`). Cuenta
  muebles, al menos un recibo por O.T. y área (los equipos no están ligados al contratista) y un importe con el
  último precio pagado del modelo. Cada área muestra una tarjeta por mueble **entregado a Calidad** aunque no
  esté aprobado (`muebles_en_calidad`, migración `muebles_en_calidad`): aprobados, en revisión, sin entregar y,
  por parte del despiece, piezas entregadas y aprobadas. Lógica en `src/lib/estimaciones/por-llegar.ts`,
  lectura en `-db.ts`.
