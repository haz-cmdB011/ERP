import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

const remove = vi.fn(async () => ({ data: [], error: null }));
// Filas que siguen usando alguna de las rutas después del borrado (otros pedidos).
let enUso: { storage_path: string }[] = [];
let errorEnUso: { message: string } | null = null;
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({
        in: (_col: string, rutas: string[]) => ({
          returns: async () => ({
            data: errorEnUso ? null : enUso.filter((f) => rutas.includes(f.storage_path)),
            error: errorEnUso,
          }),
        }),
      }),
    }),
    storage: { from: () => ({ remove }) },
  }),
}));

import { eliminarPedidoDefinitivo } from "./eliminar-pedido-db";

function clienteConImagenes(rutas: string[], conservadoPorFolio = false) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({ returns: async () => ({ data: rutas.map((storage_path) => ({ storage_path })) }) }),
      }),
    }),
    rpc: async () => ({ data: conservadoPorFolio, error: null }),
  } as unknown as SupabaseClient;
}

describe("eliminarPedidoDefinitivo", () => {
  beforeEach(() => {
    remove.mockClear();
    enUso = [];
    errorEnUso = null;
  });

  it("borra las imágenes (y su versión grande) que ya nadie usa", async () => {
    await eliminarPedidoDefinitivo(clienteConImagenes(["contenido/v1/a.webp"]), "p1");
    expect(remove).toHaveBeenCalledWith(["contenido/v1/a.webp", "contenido/v1/a-hd.webp"]);
  });

  it("conserva las que otro pedido todavía usa (una imagen se guarda una vez)", async () => {
    enUso = [{ storage_path: "contenido/v1/compartida.webp" }];
    await eliminarPedidoDefinitivo(
      clienteConImagenes(["contenido/v1/propia.webp", "contenido/v1/compartida.webp"]),
      "p1"
    );
    expect(remove).toHaveBeenCalledWith(["contenido/v1/propia.webp", "contenido/v1/propia-hd.webp"]);
  });

  it("no borra nada si no puede saber quién más las usa", async () => {
    errorEnUso = { message: "sin red" };
    const r = await eliminarPedidoDefinitivo(clienteConImagenes(["contenido/v1/a.webp"]), "p1");
    expect(r.error).toBeNull();
    expect(remove).not.toHaveBeenCalled();
  });

  it("no toca Storage si el pedido se conservó por tener folios", async () => {
    await eliminarPedidoDefinitivo(clienteConImagenes(["contenido/v1/a.webp"], true), "p1");
    expect(remove).not.toHaveBeenCalled();
  });
});
