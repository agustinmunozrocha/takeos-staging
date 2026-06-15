# Handoff — Claude Code → **BD Expert**
## Lo que la base necesita para los flujos ya integrados (crear productora + centro de privacidad)

**De:** Claude Code (repo TakeOS, rama `flujo-productora`)
**Para:** BD Expert
**Fecha:** 14 de junio de 2026
**Alcance:** SOLO backend (RPCs, tablas, RLS). No incluye nada de frontend salvo el nombre de la función-costura donde cada pieza se conecta.

---

## 0 · Contexto

Se integró al monolito (`index.html`) el **flujo de creación de productora** (Frente A, ya cableado y funcionando) y el **Centro de privacidad y datos** (Frente B, derechos del titular, Ley 21.719). Frente B está construido como **UI contra contrato**: cada operación sensible quedó con su punto de integración marcado en el código con el comentario `SEAM · BD Expert` y una función concreta. Falta el backend de esas piezas.

**Doctrina:** lo que mueve datos sensibles, decide permisos o debe ser atómico corre **server-side**; el cliente solo envía y refleja. Por eso ninguna de estas operaciones se hace en el cliente.

---

## 1 · Decisiones de producto ya tomadas (modelar en consecuencia)

1. **Borrado de cuenta = ANONIMIZAR, no hard delete**, con **período de gracia recuperable de 30 días**.
2. **Un usuario menor de edad NO puede crear una productora.** Probablemente haya **otras restricciones** para menores (por definir).
3. **Verificación de edad: PENDIENTE decidir** si aplica al titular y en qué momento. Hoy la UI es opcional (no bloquea).

---

## 2 · RPCs / endpoints faltantes (núcleo)

### a) Exportación / portabilidad — **B2**
- **RPC** que reúne los datos del titular (`user_profiles`, `user_bank_accounts`, `memberships` + rol, `data_consents`, resumen de actividad), entrega un **archivo firmado** en formato portable (JSON/CSV) y **registra la solicitud en `audit_log`**.
- El cliente solo dispara la solicitud y descarga; **no arma el export**.
- Costura cliente: `_pdExportSolicitar()`.

### b) Revocación de consentimiento — **B3**
- **RPC** (espeja `consentir_invitacion`): marca **`revoked_at` en `data_consents`** (append-only, **NO borrar** — ADR-020), pasa la **membresía a `inactivo`**, corta el acceso y registra en `audit_log`.
- Verifica que el consentimiento sea del `auth.uid()`. Recibe el id del consentimiento (o la org).
- La **lista ya funciona** (el cliente lee `data_consents`; RLS `b_consents_sel` lo permite). Solo falta el RPC de escritura (no hay política de UPDATE para el usuario, por diseño).
- Costura cliente: `_pdRevocarConfirmar()`.

### c) Borrado / supresión de cuenta — **B4** (ANONIMIZAR + 30 días)
- **RPC** que:
  - **Anonimiza** los datos personales del titular (`user_profiles`, `user_bank_accounts`, snapshots en `contacts`) → dejan de ser identificables. **No hard delete.**
  - **Conserva** `data_consents` y `audit_log` **datados y anonimizados** (evidencia Ley 21.719).
  - **Programa** la eliminación a **30 días** (cuenta recuperable) y permite **cancelar/recuperar** dentro del plazo. Probablemente requiera una tabla de "eliminación programada".
  - **Reimpone el guard de único administrador**: rechaza si el titular es único admin de alguna productora (una productora nunca sin administrador). El cliente ya advierte best-effort, pero **la regla la impone el servidor**.
- Costuras cliente: `_pdElimConfirmar()` (programar), `_pdElimCancelar()` (cancelar), guard en `_pdElimCargar()`.
- **Pendiente además:** flujo/RPC de **transferir administración** (listar miembros internos + reasignar el rol Administrador) para resolver el guard.

### d) Registro de consentimiento de cookies — **B6**
- **Tabla + RPC** para registrar el consentimiento de cookies **versionado en el servidor** (no en `localStorage`): mínimo `{ user_id, esenciales(true fijo), analitica, marketing, version, accepted_at }`.
- La condición de **"primera visita / ya decidió"** (para auto-mostrar el banner) se deriva de este registro.
- Costuras cliente: `_pdCookiesGuardar()`, `_pdCookieBannerDecidir()`.

---

## 3 · Máquina de estados de membresía

`pendiente` → `activo` (`consentir_invitacion`, ya existe) → **`inactivo`**.

Las transiciones a `inactivo` las disparan:
- **B3** (revocación de consentimiento).
- **B4** (borrado de cuenta).

Documentar/implementar esas transiciones en los RPCs anteriores.

---

## 4 · Contexto de organización activa + RLS para la regla interno/externo (Frente C)

- La regla **interno → Control Room / externo → solo el proyecto** debe imponerse en **RLS** (filtrado por `organization_id` + perfil), no solo en la UI. El cliente la refleja; la barrera real es de la base.
- **Coordinar con la deuda fail-open:** `authNivelModulo` (cliente) retorna `'E'` cuando no encuentra el mapeo del módulo → debería ser fail-closed (`'none'`). *(Nota: `authNivel` ya está fail-closed; el que falta es `authNivelModulo`.)* Mientras el servidor imponga la regla por RLS, el cliente no es autoridad, pero conviene cerrar este fail-open.

---

## 5 · Frente A — firmas ya confirmadas y cableadas (referencia)

Ya verificado contra la base y conectado en el cliente (no requiere cambios, salvo el ajuste de §1):

- `provisionar_organizacion(p_nombre text, p_slug text [, p_template_org uuid])` → `uuid`. Crea la org (plan `free`), siembra los 8 perfiles + matriz, clona catálogos del template, inserta `organization_profile` vacío y deja al creador **Administrador interno**. `seed_permisos_organizacion` va **adentro** (no se llama aparte). Colisión de slug → lanza `El slug "x" ya está en uso` (el cliente reintenta con sufijo).
- `organization_profile`: el cliente hace upsert `{ organization_id, profile (jsonb), updated_at }` para planes de pago. RLS `b_org_profile_mod` (`datos_empresa = 'E'`). OK.
- **AJUSTE (de §1):** `provisionar_organizacion` debe **rechazar a usuarios menores de edad**.

---

## 6 · Recordatorios

- **Si creas tablas nuevas** (consentimiento de cookies, eliminación programada, etc.): **GRANT al rol `authenticated` después de cada tabla** (Supabase no la expone sola; olvidarlo = 403).
- **Append-only donde aplica** (`data_consents`): nunca borrar; marcar fechas. Soft delete + auditoría en el resto.
- Sistema de **pago** (Frente A · A6): sigue pendiente (proveedor); el cliente lo muestra tras un feature flag apagado y lee el IVA de `tax_rates`.

---

*Cada función-costura citada existe en `index.html` con el comentario `SEAM · BD Expert`. El frontend ya envía/refleja; falta que la base provea estos contratos.*

*— Claude Code*
