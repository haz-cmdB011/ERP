# Celular e instalación (PWA)

Detalle del módulo: cómo funciona, qué migración hizo cada cosa y las trampas conocidas. Las reglas
generales del proyecto (migraciones, seguridad, flujo de trabajo) están en `CLAUDE.md`. Al cambiar este módulo,
actualizar este archivo.

## Vista de celular

En pantallas táctiles (`pointer: coarse`) `src/app/globals.css` da a todo botón, enlace, `summary`, pestaña y
casilla con su texto una zona de toque de al menos 44 × 44 px con un `::after` invisible (no mueve el diseño), y
los campos y `select` miden 44 px de alto. No la reciben los controles dentro de algo que se desliza de lado
(`overflow-x-auto`: tablas, tiras del tablero), porque volvía desplazable el contenedor unos píxeles y atrapaba el
dedo; ahí se agrandan en su pantalla (`pointer-coarse:min-h-11`, `min-h-11 sm:min-h-9`). Tampoco los que ya
dibujan su `::after` (`after:` de Tailwind) ni **los que llevan otro control dentro** (`:has(...)`): el `::after`
se pinta encima del contenido y en una fila que se despliega con botones adentro (renglón del recibo, `summary`
con acciones) tapaba esos botones y el toque abría la fila. Por eso, **un control dentro de otro no recibe la
zona extra**: si es chico, se agranda en su pantalla. Dos controles chicos pegados (✓ y ✗ de la bitácora,
filas de barras) se roban toques en la orilla: se les da 44 px reales con `pointer-coarse:` en vez de confiar en
el `::after`.

También en táctil: `touch-action: manipulation` (dos toques rápidos no hacen zoom ni se pierden), los botones no
seleccionan su texto al dejar el dedo, y todo control se aclara mientras se presiona (`:active`, opacidad 0.6; un
`active:` o una opacidad propia de la pantalla gana). Los avisos salen **arriba** en celular (abajo tapaban la
barra de "Guardar"). **Tocar un botón deshabilitado ya responde** (`src/components/toque-deshabilitado.tsx`, en el
layout raíz; lógica en `src/lib/ui/toque-deshabilitado.ts`): si es el de enviar y falta un campo obligatorio, el
navegador lo marca y lo enfoca y sale "Falta llenar: …"; si no, sale como aviso su `title` (o `aria-description`
/ `data-motivo`). Por eso, en un formulario, marcar `required` los campos obligatorios y poner en el `title` de un
botón apagado el porqué. El visor de imágenes acepta pellizco y doble toque. Fichas que también se imprimen o se
pasan a PDF (viajero) se acomodan con consultas de contenedor (`@container`, `@xl:`), no con `sm:`: el PDF las
maqueta a 640 px aunque se descargue desde el celular.

Para que nada se corte a 375 px: filtros segmentados a todo lo ancho (2 × 2 o con texto que parte renglón),
`line-clamp-2` en vez de `truncate` cuando hay espacio abajo, y tablas anchas como tarjetas en celular (ejemplo:
Calidad › O.T.). Para revisar una pantalla: a 375 px, en cada control visible `document.elementFromPoint` en su
centro y orillas debe devolver el control o algo dentro de él.

## Instalar la app (PWA)

La app se instala desde Chrome o Safari (manifest en `src/app/manifest.ts`, íconos en `public/icons`, sin service
worker: Chrome ya no lo exige para instalar). **`/instalar`** (pública, `src/app/instalar/`): en Chrome un botón pide la
instalación con el aviso `beforeinstallprompt` y, al aceptar (o con `appinstalled`), muestra el aviso de **registrarse primero si es la primera vez / ingresar los datos si ya
tiene cuenta** (botones "Registrarme" y "Ya tengo cuenta", y una pausa de `PAUSA_AL_INSTALAR_MS` que se cancela al tocarlos)
y pasa solo a `/login`; en iPhone
explica *Compartir → Agregar a inicio*; siempre queda "Entrar sin instalar". La app instalada abre en `/` y sin sesión
cae al login de siempre (correo y contraseña). **`/instalar/hoja`** (pública) es la hoja carta con el QR y los tres pasos
(Escanea, Instala, Entra); el QR lleva `getBaseUrl()` + `/instalar`, así que se imprime desde la dirección real del ERP.
Lógica sin navegador en `src/lib/ui/instalar-app.ts`; pruebas en `e2e/humo.spec.ts` ("instalar la app"). Solo se pide
instalar: no se piden permisos del navegador (cámara, notificaciones) al instalar.
