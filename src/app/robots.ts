import type { MetadataRoute } from "next";

// Aplicación interna: ningún buscador debe rastrearla. Refuerza el
// `robots: { index: false }` del layout raíz.
export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: "*", disallow: "/" } };
}
