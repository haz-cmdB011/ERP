// Empareja las imágenes de un Excel con las miniaturas YA guardadas de una
// versión de pedido, para poder generarles su versión grande sin volver a
// ingerir el archivo (no crea versión, ítems ni folios nuevos).
//
// El vínculo es la fila del Excel: cada ítem guarda su fila_excel_origen y cada
// miniatura se guardó como "<carga>/<fila>-<orden>.webp". Para no asociar una
// imagen a un ítem equivocado (p. ej. si suben un Excel distinto al de esa
// versión), la fila solo cuenta si el código de ítem también coincide.

export interface ItemGuardado {
  id: string;
  fila_excel_origen: number | null;
  item_code: number | string;
}

export interface ImagenGuardada {
  planeacion_item_id: string;
  storage_path: string;
  orden: number;
}

export interface ItemDelExcel {
  fila_excel_origen: number;
  item_code: number | string;
  imagenes: { buffer: Buffer }[];
}

export interface ParImagen {
  // Ruta de la miniatura ya guardada; la versión grande va junto a ella.
  rutaMiniatura: string;
  buffer: Buffer;
}

export interface ResultadoEmparejamiento {
  pares: ParImagen[];
  // Ítems del Excel con imagen cuya fila no existe en la versión, o cuyo código
  // de ítem no coincide con el guardado en esa fila.
  itemsSinCoincidencia: number;
  // Imágenes del Excel que no tienen miniatura guardada en esa posición.
  imagenesSinRegistro: number;
}

export function emparejarImagenes(
  itemsGuardados: ItemGuardado[],
  imagenesGuardadas: ImagenGuardada[],
  itemsExcel: ItemDelExcel[]
): ResultadoEmparejamiento {
  const itemPorFila = new Map<number, ItemGuardado>();
  for (const item of itemsGuardados) {
    if (item.fila_excel_origen !== null) itemPorFila.set(item.fila_excel_origen, item);
  }

  const imagenesPorItem = new Map<string, ImagenGuardada[]>();
  for (const img of imagenesGuardadas) {
    const lista = imagenesPorItem.get(img.planeacion_item_id) ?? [];
    lista.push(img);
    imagenesPorItem.set(img.planeacion_item_id, lista);
  }

  const pares: ParImagen[] = [];
  let itemsSinCoincidencia = 0;
  let imagenesSinRegistro = 0;

  for (const itemExcel of itemsExcel) {
    if (itemExcel.imagenes.length === 0) continue;

    const guardado = itemPorFila.get(itemExcel.fila_excel_origen);
    if (!guardado || Number(guardado.item_code) !== Number(itemExcel.item_code)) {
      itemsSinCoincidencia += 1;
      continue;
    }

    const registros = imagenesPorItem.get(guardado.id) ?? [];
    itemExcel.imagenes.forEach((imagen, indice) => {
      const registro = registros.find((r) => r.orden === indice);
      if (!registro) {
        imagenesSinRegistro += 1;
        return;
      }
      pares.push({ rutaMiniatura: registro.storage_path, buffer: imagen.buffer });
    });
  }

  return { pares, itemsSinCoincidencia, imagenesSinRegistro };
}

// Ejecuta `tarea` sobre cada elemento con como máximo `limite` a la vez, para no
// disparar cientos de conversiones y subidas simultáneas.
export async function enParalelo<T>(
  elementos: T[],
  limite: number,
  tarea: (elemento: T) => Promise<void>
): Promise<void> {
  let siguiente = 0;
  const trabajador = async () => {
    while (siguiente < elementos.length) {
      const actual = elementos[siguiente];
      siguiente += 1;
      await tarea(actual);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limite, elementos.length) }, trabajador));
}
