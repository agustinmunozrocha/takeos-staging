# Changelog — TakeOS

## V11.17.0 — 22 de junio de 2026
### Panel de Equipo: cambiar interno/externo y quitar del equipo

Rama `feat/personal-cambiar-tipo-echar`. En **Configuración → Equipo**, el
Administrador ahora puede gestionar la relación de cada persona con la productora,
no solo invitarla. Cambio acotado al **frontend** (monolito), sin tocar la base.

- **Cambiar tipo de relación (interno ↔ externo).** La columna "Tipo" pasa de
  texto a desplegable. El tipo define qué proyectos ve la persona (ADR-004):
  interno → todos; externo → solo los asignados. Pide confirmación antes de aplicar.
- **Quitar del equipo.** Botón "Quitar" por fila: pasa la membresía a
  `estado='inactivo'` (el estado "revocada" del ADR-004; **no** es borrado físico),
  corta el acceso de inmediato y la oculta de la lista; queda registro en la
  auditoría. Para reincorporarla hay que volver a invitarla.
- **Guarda de coherencia tipo×perfil.** No permite dejar a alguien como externo
  con perfil Administrador o Finanzas (misma regla que el RPC de invitación), en
  ambos sentidos (al cambiar tipo y al cambiar perfil).
- **Seguros (reutiliza el patrón del cambio de perfil ya existente):** UPDATE
  directo a `memberships` protegido por la RLS (solo Administrador) y el trigger
  del último Administrador (no se puede quitar ni degradar al único admin). Los
  diálogos usan el modal del software (`showModal`), no el popup del navegador.

## Seguridad basal del beta (§6) — 16 de junio de 2026
### CSP acotada vía `<meta>` (ítem 5) + cierre confirmado del XSS de `<img src>` (ítem 3)

Cierre de los dos ítems de seguridad del frontend de la lista corta del beta
(rama `seguridad-csp`). No cambia comportamiento de la app; es endurecimiento.

**Ítem 5 · Content-Security-Policy (camino 1)**
- Se agregó una **CSP acotada** en el `<head>` de `frontend/index.html`, vía
  `<meta http-equiv="Content-Security-Policy">`.
- Conserva `'unsafe-inline'` en script/style (el monolito usa manejadores
  inline, un `<script>` inline gigante y `style="..."` por todos lados; una
  CSP estricta sin `'unsafe-inline'` rompería la app), pero cierra el resto de
  vectores: `object-src 'none'`, `base-uri 'self'` y orígenes restringidos.
- Orígenes permitidos según el uso **real** del código: scripts de
  `cdn.jsdelivr.net` (supabase-js + xlsx) y `cdnjs.cloudflare.com`
  (xlsx/exceljs bajo demanda); estilos de Google Fonts; datos a `*.supabase.co`
  (REST + realtime `wss`); imágenes `data:`/`blob:`/`https:` (URLs firmadas de
  Storage); `frame-src 'self' blob:` para el preview de cotización (`srcdoc`),
  la impresión (`about:blank`) y los PDF/descargas.
- `frame-ancestors` (anti-clickjacking) **no aplica vía `<meta>`**: queda
  documentado en el código para ir como header de hosting
  (`Content-Security-Policy: frame-ancestors 'self'` o `X-Frame-Options: SAMEORIGIN`).

**Ítem 3 · XSS en `<img src>`**
- Verificado **ya cerrado**: `safeUrl()` valida el esquema (solo `http`/`https`/
  `blob`/`data:image`; bloquea `javascript:` y `data:text/html`) y escapa el
  resultado; se usa en todos los `<img src>` construidos por template. Sin
  cambios de código.

**Pendiente (post-beta):** CSP estricta con nonce/hash (retirar `'unsafe-inline'`)
durante/después de la modularización; `frame-ancestors` por header de hosting.

## V11.14.0 — 15 de junio de 2026
### Flujo de creación de productora + Centro de privacidad y datos

Integración de los tres flujos de los mockups al monolito (rama `flujo-productora`).
Las operaciones sensibles (crear organización, exportar, revocar, borrar/anonimizar,
registrar cookies) son **server-side**: la UI quedó cableada o contra contrato, con
los puntos pendientes documentados para el BD Expert (`Handoff_BD_Expert.md`).

**Frente A · Crear productora (flujo nuevo)**
- Flujo completo disparado por `?plan=<gratis|rodaje|produccion>` desde la landing:
  datos de la productora (con **RUT validado**, módulo 11) → términos y condiciones
  (texto provisional) → pago (resumen con **IVA leído de `tax_rates`**, tras un
  *feature flag* apagado) → **creación real** (`provisionar_organizacion`) → entrada
  al Control Room.
- **Tour inicial** de 6 pasos sobre el Control Room real, con proyectos de ejemplo.
- Plan **Gratis** sin fricción (solo el nombre); la organización nace `free`.

**Frente B · Centro de privacidad y datos (Ley 21.719)**
- Hub **«Privacidad y datos»** en el Panel Personal, con los cinco derechos del titular.
- **Descargar mis datos** (export / portabilidad).
- **Productoras con acceso** + **revocar consentimiento** (lista real desde `data_consents`).
- **Eliminar mi cuenta**: **anonimizar** (no borrado físico) + período de gracia de
  **30 días**, con **guard de único administrador**.
- **Verificación de edad** (condicional, "si aplica" — no bloquea).
- **Cookies y analítica** (preferencias + banner).

**Frente C · Navegación multi-organización**
- Selector **«Cambiar de espacio»** en la barra superior: Panel personal · tus
  productoras (Control Room) · proyectos externos (solo el proyecto, nunca un
  Control Room ajeno).

**Otros**
- Botón **«Salir»** en el Panel Personal.

**Pendiente de backend (BD Expert)** — ver `Handoff_BD_Expert.md`: RPCs de
exportación, revocación, borrado/anonimización (+ transferir administración) y
registro versionado del consentimiento de cookies; RLS interno/externo (C2/C3);
y que `provisionar_organizacion` rechace a usuarios menores de edad.
