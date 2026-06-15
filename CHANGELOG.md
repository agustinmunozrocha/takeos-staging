# Changelog — TakeOS

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
