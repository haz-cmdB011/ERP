# Guía para quien entra al equipo

Lo mínimo para empezar a trabajar sin romper nada. Los detalles de arquitectura están en
[`CLAUDE.md`](../CLAUDE.md) y [`README.md`](../README.md); la seguridad, en
[`SEGURIDAD.md`](../SEGURIDAD.md); qué hacer si algo falla, en [`operacion.md`](operacion.md).

## 1. Antes que nada: tu `.env.local` apunta a PRODUCCIÓN

Hoy no hay una base de pruebas. El `.env.local` que usas en tu laptop se conecta al Supabase **real**,
con una clave (`SUPABASE_SERVICE_ROLE_KEY`) que **se salta todos los permisos**. Lo que cargues o
borres desde tu laptop afecta datos reales.

- No pegues esa clave en chats, issues, commits ni capturas.
- Si pierdes la laptop o sospechas que se filtró, avisa: hay que rotarla (`SEGURIDAD.md`).
- Para probar cargas o cambios de datos, usa un dato de prueba claramente marcado y bórralo al terminar.

## 2. Primer arranque

```bash
git pull
cp .env.example .env.local   # completa las 3 variables de Supabase; pídelas a quien administre el proyecto
npm install
npm run dev                  # http://localhost:3000
```

Next solo lee `.env.local` al arrancar: reinicia `npm run dev` después de cambiarlo.

## 3. Cómo trabajamos

1. `git pull` y una **rama propia** (nunca directo a `main`).
2. Cambios pequeños y con pruebas cuando se pueda.
3. Antes de abrir el PR: `npm test` y `npm run lint` (el CI además corre el build, la auditoría de
   dependencias y las pruebas de navegador).
4. **PR a `main`**; no fusionar con el CI en rojo. Al fusionar, Vercel despliega a producción.

### Comandos útiles

| Comando | Para qué |
|---|---|
| `npm test` | Pruebas unitarias (Vitest) |
| `npm run test:e2e` | Pruebas de navegador (Playwright); necesitan `npm run build` antes y Chrome instalado |
| `npm run test:db` | Pruebas de solo lectura contra la base real |
| `npm run db:verificar` | Genera la consulta que compara las migraciones del repo con la base |
| `npm run lint` / `npm run build` | Lo mismo que corre el CI |

## 4. Mapa del código

| Dónde | Qué hay |
|---|---|
| `src/app/<area>/` | Pantallas por área: `planeacion`, `produccion`, `calidad`, `estimaciones`, `admin` |
| `src/app/api/` | Rutas de servidor (cargas, registro, administración, búsqueda, salud, avisos de error) |
| `src/lib/auth/` | Perfil actual, guard de administrador y roles |
| `src/lib/seguridad/` | Validación de imágenes y Excel, límites de intentos, redirecciones, MFA, captcha |
| `src/lib/observabilidad/` | Avisos de fallos al webhook |
| `src/lib/planeacion`, `estimaciones`, `produccion` | Reglas de negocio de cada área |
| `supabase/migrations/` | Esquema versionado |
| `e2e/` | Pruebas de navegador |

## 5. Reglas que no se rompen

- **El control de acceso real está en la base** (RLS y funciones SQL como `is_staff`, `is_admin_area`), no
  en la interfaz. Ocultar un botón no protege nada.
- **Toda tabla nueva lleva RLS** desde su migración.
- **Cambios de esquema = archivo nuevo en `supabase/migrations/`**, con comentarios `-- @verifica …` al
  inicio, aplicado por una sola vía y comprobado con `npm run db:verificar` (detalle en `CLAUDE.md`).
- **Un componente de servidor no puede pasarle funciones a uno de cliente** (Next lo rechaza al pintar la
  pantalla, no al compilar). Pasa datos, o el nombre de algo que el componente de cliente resuelva. Hay una
  prueba que lo vigila (`src/app/props-de-servidor.test.ts`).
- **Las imágenes y los Excel que sube alguien se validan por su contenido**, no por su extensión
  (`src/lib/seguridad/`).
- **Antes de tocar Next.js**, leer la guía correspondiente en `node_modules/next/dist/docs/`: esta versión
  tiene cambios respecto a lo que se suele conocer.

## 6. Roles en una línea

`desarrollador` (acceso global) · `administrador` y `trabajador` (ligados a un área) · `usuario` (sin
asignar: no ve datos hasta que alguien le dé rol y área) · `maquilador` (externo, solo sus recibos).
Definidos en `src/lib/auth/roles.ts`.

## 7. Si algo sale mal mientras trabajas

- Un cambio de datos por error: avisar enseguida; la auditoría (*Administración → Auditoría*) ayuda a ver
  qué pasó.
- Una migración que no sabes si se aplicó: no la vuelvas a correr; usa `npm run db:verificar`.
- Una clave pegada donde no debía: avisar y rotarla, aunque “solo estuvo un minuto”.
