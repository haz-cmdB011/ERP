## Qué cambia

<!-- Una o dos frases: qué se hizo y por qué. -->

## Cómo se probó

<!-- Pruebas automáticas y lo que se revisó a mano (pantallas, celular, datos). -->

## Antes de fusionar

- [ ] `npm test` y `npm run lint` pasan, y el CI está en verde (no se fusiona en rojo)
- [ ] Si toca la base: hay archivo nuevo en `supabase/migrations/` con `-- @verifica …`, ya aplicado y verificado con `npm run db:verificar`
- [ ] Si agrega una tabla: lleva RLS desde su migración
- [ ] Si agrega variables de entorno: están en `.env.example` y se avisó para definirlas en Vercel
- [ ] Si toca permisos, subidas de archivos o rutas `/api`: se revisó contra `SEGURIDAD.md`
- [ ] Probado en celular si cambia una pantalla (sin desbordes, botones fáciles de tocar)

## Después de fusionar

<!-- Pasos manuales pendientes (Vercel, Supabase…), o "ninguno". -->
