# Handoff · Code → BD Expert · Dev · Redactor — Cierre del endurecimiento de grants (anon + service_role)

**De:** Code (sesión con Agustín, 2026-06-21) · **Para:** BD Expert · Dev · Redactor (genérico — repártelo a quien corresponda)
**Estado:** ✅ **TODO HECHO Y DESPLEGADO A PRODUCCIÓN.** No queda acción pendiente de Code ni de Agustín.

---

## Qué se cerró (en orden)
1. **Rebuild de la branch `staging`** fiel a prod + repoblada (catálogos → Tier B → Tier A).
2. **`…120000_revoke_anon_funciones_sensibles`** — revoca `anon` en 19 funciones sensibles. Era **hueco de seguridad** (un anónimo podía ejecutarlas en un build fresco). Desplegada a prod (PR #3).
3. **`…140000_revoke_service_role_funciones_sensibles`** — revoca `service_role` en las ~48 sensibles. **Esto fue lo que solicitó el BD Expert** (su nota sobre el patrón incompleto). NO es seguridad (service_role es llave de backend); es **fidelidad** (rebuild = prod a nivel de ACL). Desplegada a prod (PR #4).

## Estado verificado en producción (`zplcgetquwxybkrpmcvl`)
**9 migraciones** · **anon = 23 · service_role = 23** (== baseline de prod {authenticated, postgres}) · datos **intactos**. Staging quedó idéntica.

## Por recipiente
- **BD Expert:** tu solicitud está **cumplida** — `service_role` revocado en las sensibles; patrón completo aplicado `REVOKE … FROM PUBLIC, anon, service_role`. **Hallazgo:** el fix sistémico (`ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin … REVOKE … FROM anon, service_role`) **NO se puede por migración** — el rol `postgres` no es superuser ni miembro de `supabase_admin` (*permission denied*). Si se quiere deny-by-default, va por **dashboard/soporte de Supabase**. Por ahora se cierra por función (disciplina por migración).
- **Dev:** **staging lista** para tu cableado de concurrencia (login `12345678`); tu migración de Pasada 1 (`guardar_proyecto`) ya quedó con el patrón completo (no reabrirá el hueco al desplegarla); **Pasada 3** (`guardar_operaciones_4*`, DROP+CREATE) debe usar el mismo patrón. Tu pendiente sigue igual: cablear cliente + read-path (`projects.version`, `budget_line_items.client_uuid`/`version`) + desplegar RPC+cliente **juntos**.
- **Redactor:** a consolidar — **9 migraciones** (eran 7); **patrón canónico** `FROM PUBLIC, anon, service_role` (no solo anon); **dos migraciones de cierre** (`…120000` anon/seguridad, `…140000` service_role/fidelidad); el fix sistémico requiere soporte de Supabase. Tocar **ADR-023** (tabla de migraciones), **ADR-024** (endurecimiento completo), **Arquitectura §2.2/§7**, **Roadmap** (cifras) y **CLAUDE.md §8** ("7 migraciones" → 9). La nota original del BD Expert (`Nota_BD_a_Code_Redactor_…`) tiene su razonamiento; puedes descartarla al consolidar.

---

*Handoff Code → BD Expert · Dev · Redactor. Producción intacta (los cierres de grants son no-op sobre datos). Arbitraje: Agustín.*
