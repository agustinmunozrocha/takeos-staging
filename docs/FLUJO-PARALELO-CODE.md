# FLUJO-PARALELO — Instrucciones para Claude Code

> Este documento es para **ti, Claude Code**. Dos personas (Agustín y Juan) depuran
> Take-OS en paralelo desde máquinas distintas. Tu trabajo es arreglar bugs **sin pisar**
> el trabajo del otro Code. La versión humana está en
> [`FLUJO-PARALELO.md`](FLUJO-PARALELO.md). Léela como contexto pero **obedece esta**.

## 0. Detecta tu carril ANTES de tocar nada

Tu carril lo define la rama actual:

```bash
git branch --show-current
```

- Empieza con `juan/`  → carril **FINANZAS & DATOS**.
- Empieza con `agustin/` → carril **PRODUCCIÓN**.
- Es `main` u otra → **PARA** y pregúntale al humano en qué rama debe trabajar. Nunca
  arregles bugs directo en `main`.

## 1. Mapa de carriles (qué archivos PUEDES editar)

Rutas relativas a `frontend/src/`.

### Carril FINANZAS & DATOS (ramas `juan/*`)
```
modules/presupuesto-cotizacion.js
modules/gastos.js
modules/calculadoras.js
modules/dal.js
modules/bd.js
modules/bd-excel.js
modules/persistencia-local.js
```

### Carril PRODUCCIÓN (ramas `agustin/*`)
```
modules/plan-rodaje.js
modules/locaciones.js
modules/rodajes.js
modules/crew.js
modules/cargos.js
modules/documentos.js
modules/info-proyecto.js
modules/tareas.js
modules/kanban.js
```

### Zona COMPARTIDA — NO editar sin aprobación explícita del humano
```
frontend/src/lib/**          (helpers, state, ganchos, ui, delegacion, nav, auth,
                              supabase, modelo, data, calc, catalogos, rates, boot)
modules/config.js  modules/admin.js
modules/notificaciones.js  modules/invitaciones.js  modules/perfil-onboarding.js
modules/buscador.js  modules/espacio.js  modules/plan-limites.js
supabase/**                  (migraciones — flujo aparte, no lo toques desde aquí)
```

## 2. Regla dura de aislamiento

- **Solo edita archivos del carril de tu rama.** Ni los del otro carril, ni la zona
  compartida.
- **Si un fix correcto EXIGE tocar `lib/`, la zona compartida, o un archivo del otro
  carril: PARA.** No lo edites. Explícale al humano exactamente qué archivo compartido hay
  que cambiar y por qué, deja constancia en el issue de GitHub (`gh issue comment`), y
  espera su decisión. Ese cruce lo aprueba y coordina un humano — es el único punto donde
  los dos Codes se pueden pisar.
- Motivo técnico: 18 de 25 módulos se importan mutuamente, pero ese acoplamiento es solo
  al **cargar** (0 usos en tiempo de arranque). En la práctica el cuerpo de un módulo se
  arregla sin tocar otro archivo. Si crees que necesitas tocar otro, casi siempre hay una
  forma dentro de tu propio archivo — búscala antes de pedir cruzar.

## 3. Bitácora de bugs — GitHub Issues (vía `gh`)

Tienes la CLI `gh` disponible. Úsala; los issues son el tablero compartido en la nube y no
generan conflictos de git.

**Al empezar a trabajar un bug — evita duplicar:**
```bash
gh issue list --state open --label <tu-carril>   # finanzas | produccion
```
Si el bug ya tiene issue asignado al otro, NO lo trabajes.

**Al descubrir un bug nuevo (aunque no lo arregles ya) — créalo de inmediato:**
```bash
gh issue create --title "..." --label <tu-carril> --body "Repro / archivo / síntoma"
```

**Al terminar un fix:**
```bash
gh issue comment <n> --body "Resuelto en <commit-sha>"
gh issue close <n>
```

Usa el label `compartido` para bugs cuya causa está en `lib/` o zona compartida.

## 4. Ciclo de un fix (obligatorio, en orden)

1. **Sincroniza** antes de empezar (el tronco es `etapa4-integracion`, NO `main`):
   `git checkout etapa4-integracion && git pull && git checkout <tu-rama> && git merge etapa4-integracion`
2. **Toma/crea el issue** (sección 3).
3. **Arregla** solo en archivos de tu carril.
4. **Compuertas + prueba** (desde `frontend/`):
   ```bash
   cd frontend
   npm run gate     # DEBE pasar (cero handlers inline, cero identificadores libres)
   npm run dev      # levanta staging para verificar el comportamiento
   ```
   No propongas commit si `gate` falla.
5. **Commit** en tu rama con referencia al issue:
   `git commit -m "fix(<carril>): <resumen> (#<n>)"`
6. **Merge a `etapa4-integracion`** (el tronco; solo fixes probados). `main` es
   producción y NO se toca aquí — su promoción es un evento aparte:
   `git checkout etapa4-integracion && git pull && git merge --no-ff <tu-rama> && git push`
7. **Cierra el issue** (sección 3).

## 5. Conflictos de git

Como los carriles son archivos disjuntos, los conflictos deberían ser raros y casi siempre
en `lib/`. Si `git merge` reporta conflicto en un archivo de la **zona compartida**, no lo
resuelvas por tu cuenta: es territorio de Juan (CTO). Avísale al humano.

## 6. Contexto profundo (léelo cuando necesites entender el sistema)

- `docs/CLAUDE.md` — la "biblia" del proyecto (arquitectura, flujo, backend).
- `docs/arquitectura/` — 17 documentos técnicos. En especial
  `06-grafo-de-dependencias.md` (mapa de acoplamiento entre módulos) y
  `13-bugs-adjudicados.md`.
