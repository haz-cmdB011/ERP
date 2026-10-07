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
   **Límite de intentos en la base** (`consumir_limite`, tabla `limites_tasa`, `src/lib/seguridad/limite-tasa.ts`):
   cuenta compartida por todas las instancias de Vercel, a diferencia de un contador en memoria. Se aplica
   al registro (por IP), la carga de Excel, la foto de perfil, el buscador y la creación de cuentas / cambio de
   contraseñas desde Administración (por usuario). Si la base no responde **no bloquea** a nadie (es un freno
   contra abusos, no un control de acceso). Los topes se ajustan en cada ruta.
   **Anti-robots (opcional):** Cloudflare Turnstile en el registro (`src/lib/seguridad/turnstile.ts`). Se activa con
   `NEXT_PUBLIC_TURNSTILE_SITE_KEY` y `TURNSTILE_SECRET_KEY`; con el captcha activo, un token ausente o una falla de
   Cloudflare cuentan como rechazo. Sin la clave secreta, el registro solo tiene sus topes.
4. **Archivos.** Los buckets son privados. Las imágenes (foto de perfil, foto de entrega, imágenes del
   Excel) se validan por su **contenido real** antes de pasar a `sharp` (solo JPG/PNG/WebP/GIF, con tope de
   píxeles): un SVG disfrazado de PNG no llega al decodificador. Solo Planeación puede subir Excel e
   imágenes de pedidos. El Excel (`.xlsx`/`.xlsm`) también se valida por su contenido antes de `exceljs`
   (`src/lib/seguridad/excel.ts`): tiene que ser un ZIP con las partes de un libro, con topes de partes y de
   tamaño descomprimido (anti "bomba zip"; ver sus límites en el propio archivo).
5. **Dependencias.** Dependabot (`.github/dependabot.yml`) abre PR semanales y por avisos de seguridad; el CI
   corre `npm audit --omit=dev --audit-level=high` y falla con avisos altos o críticos.
6. **Navegador.** Cabeceras en `next.config.ts`: CSP, `X-Frame-Options: DENY` (anti-clickjacking),
   `nosniff`, `Referrer-Policy`, `Permissions-Policy`, COOP y HSTS. Si una función legítima chocara con
   la CSP: `CSP_SOLO_REPORTE=1` en Vercel la deja en modo "solo reporte" sin tocar código.
7. **Redirecciones.** `/auth/callback` solo acepta destinos internos (`rutaInternaSegura`).
8. **Verificación en dos pasos (opcional).** Cada persona la activa en *Mi perfil* con una app de
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
- [ ] **Turnstile (opcional):** crear el widget en dash.cloudflare.com > Turnstile (dominio del sitio) y definir
      `NEXT_PUBLIC_TURNSTILE_SITE_KEY` y `TURNSTILE_SECRET_KEY` en Vercel; redesplegar.
- [ ] **Aviso de privacidad (`/privacidad`):** es un borrador. Que lo revise quien corresponda en la empresa y definir
      `NEXT_PUBLIC_PRIVACIDAD_RESPONSABLE` (razón social) y `NEXT_PUBLIC_PRIVACIDAD_CORREO` (contacto ARCO) en Vercel.
- [ ] **Activar la verificación en dos pasos** en las 3 cuentas de desarrollador (*Mi perfil*).
- [ ] **Cuentas:** revisar *Administración → Usuarios* de vez en cuando; una cuenta con rol `usuario` que
      nadie reconoce se elimina.

## Prácticas del equipo

- El `.env.local` de cada laptop apunta a **producción** y trae la clave `service_role`, que se salta todos los
  permisos. Si una laptop se pierde o se infecta, hay que **rotar esa clave** (Supabase → Settings → API).
  Lo recomendable es un proyecto de Supabase aparte para pruebas y usar producción solo en el despliegue.

### Rotar la clave secreta (`SUPABASE_SERVICE_ROLE_KEY`)

Se hace a mano (no hay forma de hacerlo desde el código) cuando una laptop se pierde o se infecta, cuando alguien
con acceso deja el equipo, o cada cierto tiempo. El proyecto usa las claves nuevas (`sb_secret_...`), que se
pueden cambiar sin dejar a nadie fuera:

1. **Supabase → Project Settings → API Keys → Secret keys:** crear una clave nueva (con otro nombre) sin borrar la
   actual. Copiarla directo a Vercel; **no pegarla en chats, issues ni commits**.
2. **Vercel → Environment Variables:** reemplazar `SUPABASE_SERVICE_ROLE_KEY` en Production (y Preview si la tiene) y
   **redesplegar**.
3. Comprobar en el sitio desplegado algo que use la clave: crear un usuario de prueba desde *Administración* o
   registrarse en `/registro`. Si falla, la clave vieja sigue activa y se puede volver atrás.
4. **Borrar la clave vieja** en Supabase. Desde ese momento la clave que traen las laptops viejas ya no sirve.
5. Cada persona que necesite correr en local pone la clave nueva en su `.env.local` (o, mejor, usa la base de pruebas
   de abajo y nunca la de producción).
6. Las claves heredadas (`anon` y `service_role`, basadas en el JWT secret) siguen funcionando hasta que se
   desactiven y **no se pueden rotar**: cuando la app esté comprobada con las nuevas, desactivarlas en el panel
   (sección de claves heredadas). Si no, una laptop con la `service_role` vieja seguiría teniendo acceso total.

### Base de pruebas para las laptops (pendiente)

Hoy todas las laptops apuntan a **producción** (ver `CLAUDE.md`). Quedó pospuesto: Supabase no deja crear un
segundo proyecto gratuito porque la cuenta ya tiene 2 proyectos activos (límite del plan gratuito). Opciones cuando
se retome: pausar el otro proyecto gratuito y crear `erp-becario-pruebas` (costo 0, misma región), usar Supabase
local con Docker, o pasar a Pro. Al tenerla: aplicar las migraciones de `supabase/migrations/`, comprobar con
`npm run db:verificar` y repartir a las laptops solo las claves de esa base.
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
