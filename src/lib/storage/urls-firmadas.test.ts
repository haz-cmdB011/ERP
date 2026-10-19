import { describe, expect, it, vi } from "vitest";
import { CacheUrlsFirmadas, firmarUrls, VIGENCIA_URL_S } from "./urls-firmadas";
import type { SupabaseClient } from "@supabase/supabase-js";

describe("CacheUrlsFirmadas", () => {
  it("reusa la URL mientras le quede al menos una hora de vigencia", () => {
    const c = new CacheUrlsFirmadas();
    c.guardar("b/a.webp", "url-1", 0);
    const reuso = (VIGENCIA_URL_S - 3600) * 1000;
    expect(c.obtener("b/a.webp", reuso - 1)).toBe("url-1");
    expect(c.obtener("b/a.webp", reuso)).toBeUndefined();
  });

  it("al llenarse saca la más vieja", () => {
    const c = new CacheUrlsFirmadas(2);
    c.guardar("a", "1", 0);
    c.guardar("b", "2", 0);
    c.guardar("c", "3", 0);
    expect(c.obtener("a", 0)).toBeUndefined();
    expect(c.obtener("b", 0)).toBe("2");
    expect(c.obtener("c", 0)).toBe("3");
  });
});

function clienteFalso(respuesta: (rutas: string[]) => { path: string; signedUrl: string; error: string | null }[]) {
  const createSignedUrls = vi.fn(async (rutas: string[]) => ({ data: respuesta(rutas), error: null }));
  const supabase = { storage: { from: () => ({ createSignedUrls }) } } as unknown as SupabaseClient;
  return { supabase, createSignedUrls };
}

describe("firmarUrls", () => {
  it("la segunda vez devuelve la misma URL sin volver a firmar", async () => {
    const { supabase, createSignedUrls } = clienteFalso((rutas) =>
      rutas.map((path) => ({ path, signedUrl: `https://x/${path}?token=${Math.random()}`, error: null }))
    );
    const primera = await firmarUrls(supabase, "bucket-prueba-1", ["a.webp", "b.webp"]);
    const segunda = await firmarUrls(supabase, "bucket-prueba-1", ["a.webp", "b.webp"]);
    expect(segunda).toEqual(primera);
    expect(createSignedUrls).toHaveBeenCalledTimes(1);
  });

  it("solo firma las que faltan y no guarda las que fallaron", async () => {
    const { supabase, createSignedUrls } = clienteFalso((rutas) =>
      rutas.map((path) =>
        path === "no-existe.webp"
          ? { path, signedUrl: "", error: "Object not found" }
          : { path, signedUrl: `https://x/${path}`, error: null }
      )
    );
    const urls = await firmarUrls(supabase, "bucket-prueba-2", ["a.webp", "no-existe.webp"]);
    expect([...urls.keys()]).toEqual(["a.webp"]);
    await firmarUrls(supabase, "bucket-prueba-2", ["a.webp", "no-existe.webp", "c.webp"]);
    expect(createSignedUrls).toHaveBeenLastCalledWith(["no-existe.webp", "c.webp"], VIGENCIA_URL_S);
  });
});
