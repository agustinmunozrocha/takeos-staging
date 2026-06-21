# Handoff · Code → Redactor — Corrección ADR-018 (IVA) + separación de `supabase/queries`

**De:** Code (Claude Code, sesión con Agustín)
**Para:** Redactor
**Fecha:** 20 de junio de 2026
**Documentos leídos (con versión):** PRD V3.6 · ADR de Backend v1.9 · Roadmap Operativo v1.8 · Arquitectura y Flujo de Trabajo v1.5 · Seguridad OWASP Top 10:2025 v1.3 · CLAUDE.md v0.2

> Dos asuntos para consolidar. El **(1)** es una **contradicción** entre el ADR y el estado real del build (corregir, o subir a Agustín si hay duda). El **(2)** es un **cambio de estructura del repo ya ejecutado**, para que los demás chats queden al tanto y, si corresponde, se canonice.

---

## 1. Contradicción a corregir — ADR-018 (IVA hardcodeado)

**Qué dice hoy el ADR-018 (v1.9).** En *Consecuencias* aún figura: *"Fix puntual pendiente para el dev: reemplazar `const IVA = 0.19` por la lectura de `tax_rates`"* (y el contexto menciona el hardcode en ~línea 5671 de la V9.6.15).

**Qué muestra el estado real del build.**
- El **CHANGELOG** registra en **V11.14.0** "IVA leído de `tax_rates`" (el resumen de pago calcula el IVA leyéndolo de la tabla).
- La modularización (Arquitectura §3.4 / ADR-015 v1.9) extrajo **`frontend/src/lib/rates.js`** = *"IVA y tasas + `dalBootTaxRates`"*: las tasas se cargan desde `tax_rates` al iniciar sesión.

**Conclusión.** El fix parece **ya ejecutado** y la doctrina del ADR-018 (toda tasa vive en `tax_rates`; el cliente la lee, no la hardcodea) se cumple. **El texto del ADR-018 quedó rezagado.**

**Pedido al Redactor:**
- Verificar contra el build vivo que ya **no** queda `const IVA = 0.19` (ni otros hardcodeos tributarios) en el monolito.
- Si se confirma: actualizar **ADR-018**, moviendo ese "fix pendiente" a **resuelto** (con referencia a `rates.js` / V11.14.0) y ajustando la redacción de *Consecuencias*.
- **Transparencia:** en **CLAUDE.md v0.2 §8** Code ya reflejó este ítem como **resuelto** ("lectura de IVA/tasas desde `tax_rates`, `frontend/src/lib/rates.js`"). Reconciliar para que ADR y CLAUDE.md no se contradigan.

> **Nit menor (opcional).** El pie de **Arquitectura v1.5** (nota final antes del cierre) dice "este documento volverá a moverse pronto… se registren en una **v1.4**" — quedó un número viejo dentro de un doc que ya es v1.5.

---

## 2. Estructura nueva del repo — `supabase/queries/` separada de `supabase/migrations/`

**Qué se hizo** (ya commiteado y pusheado en **ambos** repos: `Take-OS` y `takeos-staging`):

Se creó **`supabase/queries/`** como carpeta **hermana** de `supabase/migrations/` (no anidada dentro), con subcarpetas temáticas y un `README.md`:

```
supabase/
├── migrations/     # historial de esquema — lo aplica el CLI, secuencial, inmutable
└── queries/        # NUEVA — queries reutilizables; el CLI NO la toca
    ├── reportes/
    ├── analisis/
    └── mantenimiento/
```

**El porqué** (para que ningún chat meta queries dentro de `migrations/`):
- El Supabase CLI trata **todo** lo que está en `migrations/` con patrón `<timestamp>_nombre.sql` como una **migración** a aplicar en orden (`db push` / Branching). Meter ahí consultas ad-hoc es riesgoso (se aplicarían como cambios de esquema) y el CLI no ejecuta subcarpetas de forma fiable.
- **Migraciones** = historial de esquema (inmutables, secuenciales). **Queries** = consultas reutilizables y editables (reportes, análisis, mantenimiento). Naturalezas distintas → carpetas distintas.

**Convención** (en el README de la carpeta): nombres `snake_case` sin timestamp; encabezar cada `.sql` con un comentario de qué hace y cómo se usa.

**Pedido al Redactor (a tu criterio):** evaluar si conviene **canonizar** esta estructura — por ejemplo, una línea en el árbol del repo de **Arquitectura §3.4** (que hoy lista `supabase/migrations` y `supabase/functions` pero **no** `queries/`) y/o una mención en **ADR-023** (BD en código). Así queda en el bus y los chats de BD/Dev lo dan por hecho.

---

*Code no edita los documentos canónicos directamente (Roadmap §4.4): esto es una propuesta de consolidación. El arbitraje, si hace falta, es de Agustín.*
