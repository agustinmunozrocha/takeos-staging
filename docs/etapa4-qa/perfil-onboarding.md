# QA · Perfil / Onboarding (`frontend/src/modules/perfil-onboarding.js`)

Referencia de comportamiento: monolito en `main` (`git show main:index.html`).
Persistencia: `user_profiles` (upsert por `user_id`, RLS fila-propia) + `user_bank_accounts`.
Acceso: "Perfil A." (arriba) → Configuración → "Mis datos personales" (`cfg.miPerfil`
→ `abrirPerfilUsuario`). También lo abre el **onboarding** al aceptar una invitación.
Cobertura: 6/8 ✅ (QA automatizado 2026-07-20, 0 bugs).

> **Resultado del cruce:** port **fiel** (mismo `_perfilGuardar`, validación de RUT,
> gate de obligatorios). Son datos **del usuario** (viajan entre productoras), no del
> proyecto. El juez final eres tú en `localhost:5173`.

---

| ID | Qué probar | Pasos | Esperado (según `main`) | Estado |
|----|-----------|-------|-------------------------|--------|
| PF1 | Abrir el perfil | "Perfil A." → Configuración → "Mis datos personales" | Abre el panel con los datos actuales (nombre/apellido/email…) | ✅ |
| PF2 | Editar y guardar | Cambia teléfono/RUT/dirección/comuna → "Guardar" | Toast "Perfil guardado"; persiste en `user_profiles` | ✅ |
| PF3 | RUT inválido | Escribe un RUT con dígito verificador malo | "Guardar" queda deshabilitado + aviso de RUT | ✅ |
| PF4 | Teléfono con +56 | Escribe "912345678" y guarda | Se guarda normalizado como **+56912345678** | ✅ |
| PF5 | Obligatorios (nombre+apellido) | Borra el apellido | "Guardar" se deshabilita hasta completar nombre y apellido | ✅ |
| PF6 | Round-trip al recargar | Guarda → hard refresh → reabre el perfil | Los datos vuelven idénticos (desde `user_profiles`) | ✅ |
| PF7 | Onboarding "solo lo que falta" | Aceptar una invitación con datos incompletos | Aparece el formulario mínimo con solo los campos faltantes; guarda con el mismo `_perfilGuardar` | 👁 (se prueba junto con Invitaciones — requiere el flujo de aceptar invitación) |
| PF8 | Cuenta bancaria / extranjera | Agregar banco+cuenta o marcar "cuenta extranjera" | Persiste en `user_bank_accounts`; extranjera guarda datos libres | 👁 (requiere revisar el bloque bancario con tu ojo) |

**Estados:** ⬜ pendiente · 🔄 probando · ✅ pasó · ❌ falló · 🔁 cambió a propósito.

## Notas
- **0 bugs.** Persistencia confirmada en `user_profiles` (nombre/apellido/RUT/teléfono/
  dirección/comuna) + hard refresh. El teléfono se **normaliza a +56** al guardar
  (la dirección pasa por el normalizador title-case: "QA" → "Qa", cosmético). El
  onboarding por invitación (PF7) usa el mismo guardado; se valida con Invitaciones.
