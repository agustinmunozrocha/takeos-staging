# Handoff · Code → Dev — Staging lista + grants cerrados (respuesta al handoff de Concurrencia Pasada 1)

**De:** Code (sesión con Agustín, 2026-06-21)
**Para:** Dev
**Motivo:** dejé staging fiel a prod y repoblada para tu cableado de concurrencia, y en el camino cerré un hueco de grants que afecta tu migración. Esto es lo que hice y lo que cambia (o no) para ti.

---

## TL;DR
- **Staging está reconstruida, fiel a prod y repoblada** → lista para que cablees la Pasada 1.
- Se detectó que las migraciones **no reproducían los REVOKE de prod** (la default-priv de Supabase auto-otorga `EXECUTE` a `anon`, `authenticated` y `service_role`). Se cerró con dos migraciones.
- **Tu migración de concurrencia (Pasada 1) ya quedó corregida** al patrón completo: cuando la despliegues no reabrirá ningún hueco.

---

## 1. Staging está lista (úsala con confianza)
- Branch `staging` (`jovroabtwysliryppthh`): **fiel a prod** — 77 tablas / 147 policies / 71 funcs / 31 triggers, **anon=23, service_role=23** (idénticos a prod).
- Repoblada: 3 orgs (Rivendell/Highgarden/Gondor), ~300 contactos, 3 usuarios.
- **Login de prueba: `12345678`** — usuarios `agustinmr21@gmail.com`, `jidelacuadra@gmail.com`, `denethor@gondor.test`.
- Cada `reset` ahora la deja fiel automáticamente (las migraciones de grants están en la cadena).

## 2. Lo que cambié en grants (contexto, no requiere acción tuya)
Dos migraciones nuevas, ambas idempotentes y **no-op en prod**:
- **`…120000_revoke_anon_funciones_sensibles`** — revoca `anon` en 19 funciones sensibles. Era un **hueco de seguridad** (un anónimo podía ejecutarlas en un build fresco). **Desplegada a prod** (PR #3, mergeado).
- **`…140000_revoke_service_role_funciones_sensibles`** — revoca `service_role` en las ~48 sensibles. NO es seguridad (service_role es llave de backend); es **fidelidad** (rebuild = prod a nivel de ACL). **En PR #4** (revisión de Agustín).

## 3. Tu migración de concurrencia (Pasada 1) — ya corregida
El bloque de permisos de `guardar_proyecto` tenía `REVOKE … FROM PUBLIC` (incompleto). **Ya quedó** `REVOKE … FROM PUBLIC, anon, service_role` (lo corrigió el BD Expert). El archivo corregido está en `Downloads/files 2/20260621170000_…sql`.
- **Qué significa para ti:** cuando despliegues la Pasada 1 (RPC + cliente **juntos**, como dice tu handoff), `guardar_proyecto` quedará `{authenticated, postgres}` igual que hoy — **no se expone a anónimos**. Nada que ajustar de tu lado por esto.

## 4. Regla de patrón (para Pasadas 2/3 y cualquier función nueva)
Toda función que **crees o recrees** (DROP+CREATE) en `public` nace con `anon`+`service_role` por la default-priv de Supabase. Para reproducir el baseline de prod, la migración debe cerrar:
```sql
REVOKE ALL ON FUNCTION public.<fn>(<args>) FROM PUBLIC, anon, service_role;
GRANT  EXECUTE ON FUNCTION public.<fn>(<args>) TO authenticated;   -- si corresponde
```
**Pasada 3** (`guardar_operaciones_4*`, que hará DROP+CREATE) **debe** usar este patrón. (El fix sistémico que lo evitaría —`ALTER DEFAULT PRIVILEGES`— no se puede por migración; queda como decisión de Cib,Seg.)

## 5. Lo que sigue siendo TUYO (sin cambios respecto a tu handoff de concurrencia)
- **Cablear el cliente** al contrato nuevo de `guardar_proyecto` (`header` / `presupuestoDiff`, retorno jsonb, `manejarConflicto`).
- **Read-path:** traer `projects.version` y `budget_line_items.client_uuid`/`version` en la carga.
- **Desplegar RPC + cliente juntos** y validar en staging (los 5 casos de tu §7) antes de promover a prod.

## 6. Secuencia para cuando arranques
`reset` staging → Tier B → Tier A → (las migraciones de grants ya van en la cadena) → tu migración de concurrencia → validar → promover RPC+cliente juntos a prod.

---

*Handoff Code → Dev. Producción intacta (los cierres de grants son no-op en prod). Dudas de dominio/arbitraje: Agustín.*
