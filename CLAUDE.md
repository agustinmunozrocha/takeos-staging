# Take-OS (staging) — CLAUDE.md

Take-OS modularizado. Fase actual: **caza de bugs post-modularización**, con dos personas
trabajando **en paralelo desde máquinas distintas** (Agustín y Juan). Tu prioridad #1 es
arreglar bugs **sin pisar** el trabajo del otro Claude Code.

## Antes de tocar código: identifica tu carril

```bash
git branch --show-current
```
- `juan/*`    → carril **FINANZAS & DATOS**
- `agustin/*` → carril **PRODUCCIÓN**
- `main` u otra → **PARA** y pregunta al humano en qué rama trabajar. Nunca arregles en `main`.

## Reglas de oro (no negociables)

1. **Solo editas archivos de tu carril.** El resto —sobre todo `frontend/src/lib/`— es
   zona compartida: **no la toques sin aprobación explícita del humano.**
2. **Si un fix exige tocar `lib/`, la zona compartida o el otro carril: PARA**, explica qué
   archivo y por qué, déjalo en el issue (`gh issue comment`) y espera decisión humana.
3. **Antes de arreglar, revisa GitHub Issues** (`gh issue list`) para no duplicar. Bug
   nuevo → créalo de una (`gh issue create`). Bug resuelto → coméntalo y ciérralo.
4. **Prueba antes de commitear:** desde `frontend/`, `npm run gate` (debe pasar) y
   `npm run dev` para verificar a mano. Merge a `main` solo con fixes probados.

## Mapa de carriles (resumen)

- **Finanzas & Datos (Juan):** `modules/presupuesto-cotizacion.js`, `gastos.js`,
  `calculadoras.js`, `dal.js`, `bd.js`, `bd-excel.js`, `persistencia-local.js`.
- **Producción (Agustín):** `modules/plan-rodaje.js`, `locaciones.js`, `rodajes.js`,
  `crew.js`, `cargos.js`, `documentos.js`, `info-proyecto.js`, `tareas.js`, `kanban.js`.
- **Compartido (avisar / Juan arbitra):** todo `lib/`, `config.js`, `admin.js`,
  `notificaciones.js`, `invitaciones.js`, `perfil-onboarding.js`, `buscador.js`,
  `espacio.js`, `plan-limites.js`, `supabase/`.

## Documentos

- **El detalle operativo está en [`docs/FLUJO-PARALELO-CODE.md`](docs/FLUJO-PARALELO-CODE.md)** —
  léelo antes de arreglar bugs (mapa completo de archivos, ciclo de fix, protocolo `gh`).
- Versión para humanos: [`docs/FLUJO-PARALELO.md`](docs/FLUJO-PARALELO.md).
- Contexto profundo del sistema: [`docs/CLAUDE.md`](docs/CLAUDE.md) (la "biblia") y
  [`docs/arquitectura/`](docs/arquitectura/) (grafo de dependencias, etc.).
