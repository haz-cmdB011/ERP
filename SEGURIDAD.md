# Seguridad del ERP

Resumen de las defensas del sistema, qué hay que mantener al día y qué pasos se hacen
**a mano** en Supabase/Vercel (el código no puede hacerlos solo).

## Capas de defensa

1. **Permisos en la base (RLS).** Todas las tablas tienen seguridad por filas. Las escrituras
   exigen rol y área (`is_planeacion()`, `is_produccion()`, etc.). La **lectura** de los datos de
   la empresa exige un rol asignado por un administrador: `is_staff()` (desarrollador,
   administrador o trabajador). Un `usuario` recién registrado solo ve su propio perfil hasta que se
   le asigne rol y área (migración `lectura_solo_personal`). El maquilador sigue limitado a sus recibos.
2. **Rutas del servidor.** Todas piden sesión (salvo `/api/registro`, público a propósito) y las de
   administración exigen rol `desarrollador` (`requireAdmin`). Los permisos finos los vuelven a validar
   las funciones SQL.
3. **Registro público acotado.** Tope por IP y tope global por hora (`/api/registro`), correos de
   dominios permitidos opcionales (`REGISTRO_DOMINIOS_PERMITIDOS`), errores genéricos que no revelan
   qué correos existen. La cuenta nace con rol `usuario` (pendiente de aprobación).
4. **Archivos.** Los buckets son privados. Las imágenes (foto de perfil, foto de entrega, imágenes del
   Excel) se validan por su **contenido real** antes de pasar a `sharp` (solo JPG/PNG/WebP/GIF, con tope de
   píxeles): un SVG disfrazado de PNG no llega al decodificador. Solo Planeación puede subir Excel e
   imágenes de pedidos.
5. **Navegador.** Cabeceras en `next.config.ts`: CSP, `X-Frame-Options: DENY` (anti-clickjacking),
   `nosniff`, `Referrer-Policy`, `Permissions-Policy`, COOP y HSTS. Si una función legítima chocara con
   la CSP: `CSP_SOLO_REPORTE=1` en Vercel la deja en modo "solo reporte" sin tocar código. La cámara
   está bloqueada en toda la app salvo en `/produccion/escanear` (escáner de QR de las hojas de
   viajero), donde `Permissions-Policy` la permite solo para el propio sitio; el escáner nunca abre
   la URL que lee, solo extrae los ids y navega a una ruta propia (`src/lib/produccion/qr-viajero.ts`).
6. **Redirecciones.** `/auth/callback` solo acepta destinos internos (`rutaInternaSegura`).
7. **Verificación en dos pasos (opcional).** Cada persona la activa en *Mi perfil* con una app de
   autenticación. Quien la activa no puede usar la app ni `/api/*` hasta poner su código (se exige en
   `src/lib/supabase/middleware.ts`). Se recomienda para todas las cuentas de **desarrollador**.

## Pasos manuales (panel de Supabase / Vercel)

- [ ] **Authentication → Sign In / Providers → Email:** desactivar *Allow new users to sign up*. El registro
      de la app usa la API de administración y sigue funcionando; así nadie puede crear cuentas llamando
      directo a Supabase con la clave pública, saltándose los topes y el chequeo de contraseñas filtradas.
- [ ] **Authentication → Policies → Leaked password protection:** activarla (requiere plan Pro). La app ya
      comprueba contraseñas filtradas en sus propias pantallas; esto lo cubre también en Supabase.
- [ ] **Authentication → URL Configuration:** dejar solo las URL reales del sitio en *Redirect URLs*.
- [ ] **Vercel → Environment Variables:** definir `NEXT_PUBLIC_SITE_URL` (URL pública) y, si el registro
      solo debe ser para correos de la empresa, `REGISTRO_DOMINIOS_PERMITIDOS`.
- [ ] **Activar la verificación en dos pasos** en las 3 cuentas de desarrollador (*Mi perfil*).
- [ ] **Cuentas:** revisar *Administración → Usuarios* de vez en cuando; una cuenta con rol `usuario` que
      nadie reconoce se elimina.

## Prácticas del equipo

- El `.env.local` de cada laptop apunta a **producción** y trae la clave `service_role`, que se salta todos los
  permisos. Si una laptop se pierde o se infecta, hay que **rotar esa clave** (Supabase → Settings → API).
  Lo recomendable es un proyecto de Supabase aparte para pruebas y usar producción solo en el despliegue.
- Nunca subir `.env*` (ya está en `.gitignore`) ni pegar claves en el chat, issues o commits.
- Antes de fusionar: `npm test`, `npm run lint` y `npm audit --omit=dev`.
- Cambios de permisos en la base: siempre como migración en `supabase/migrations/` (ver `CLAUDE.md`).

## Riesgos conocidos y aceptados

- `exceljs` depende de `uuid` con un aviso de gravedad media (comprobación de límites cuando se le pasa un
  buffer a v3/v5/v6). `exceljs` no usa esa vía, y la corrección propuesta por `npm` es **bajar** a `exceljs@3.4.0`
  (cambio incompatible). Se revisa al actualizar `exceljs`.
- La verificación en dos pasos se exige en la app (`proxy`), no en la base: una sesión de solo contraseña que
  llame directo a la API de datos con la clave pública seguiría bajo las reglas de RLS (que son estrictas), pero
  sin el segundo paso. El registro cerrado en Supabase (paso manual 1) reduce esa superficie.
