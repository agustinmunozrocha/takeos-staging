# QA · Documentos (`frontend/src/modules/documentos.js`)

Referencia de comportamiento: monolito en `main` (`git show main:index.html`).
Módulos de apoyo: `dal.js` (persistencia, RPC `guardar_operaciones_4e`),
`lib/supabase.js` (Storage, bucket `documentos-proyecto`), `lib/ui.js` (showModal),
`lib/delegacion.js`.
Cobertura: 13/20 ✅ (QA automatizado 2026-07-20, 0 bugs; persistencia y Storage
confirmados en project_documents + bucket firmado + hard refresh). D8 incompleto
(no se pudo crear archivo >15 MB en el entorno). D9/D10 pendientes (requieren Storage
apagado). D11/D12/D13 pendientes (drag&drop de archivos, no automatizable con el MCP).
D15 pendiente (requiere un adjunto base64 legado).

> **Resultado del cruce:** la migración de Documentos es **limpia** (0 bugs). El
> mapeo `data-accion` ↔ handlers es 7/7 correcto, incluido el drag & drop. Las
> pruebas **⭐** tocan Storage/nube y drag&drop (los caminos que dependen de
> infraestructura en runtime). El juez final eres tú en `localhost:5173`.

---

| ID | Qué probar | Pasos | Esperado (según `main`) | Estado |
|----|-----------|-------|-------------------------|--------|
| D1 | Agregar documento | Módulo Documentos → "+ Agregar documento" | Fila nueva vacía con badge "pendiente de adjunto" | ✅ |
| D2 | Categoría del documento | Agregar por botón y por drag&drop | Ambos crean categoría "general" (no hay selector de categoría en esta versión) | ✅ (por botón crea categoría "general") |
| D3 | Editar título | Escribir en el input de nombre → salir del campo | Se guarda; el chip "sin guardar" se enciende | ✅ (título guarda; persiste en la base) |
| D4 | Editar descripción/notas | Escribir en el textarea → salir | Persiste tras el autosave | ✅ |
| D5 ⭐ | Editar link externo | Abrir "Link externo" → pegar URL → salir | Aparece "Abrir ↗" que abre la URL saneada en pestaña nueva; URLs no http/https/blob se bloquean | ✅ (URL válida → "Abrir ↗"; `javascript:` se saneó a href inerte) |
| D6 ⭐ | Adjuntar PDF (Storage) | "📎 Adjuntar archivo" → PDF ≤15 MB (con Storage activo) | Sube al bucket; toast "Archivo subido"; fila muestra 📎 nombre + tamaño + "Abrir ↗"/"Quitar" | ✅ (sube al bucket documentos-proyecto, con path + tamaño; sin dataUrl) |
| D7 | Adjuntar formato inválido | Adjuntar `.exe`/otro no permitido | Toast "Formato no permitido"; no se adjunta | ✅ (el .exe no se adjuntó) |
| D8 | Adjuntar >15 MB | Adjuntar archivo >15 MB | Toast "Archivo muy grande"; no se adjunta | ⬜ (incompleto: no se pudo crear un archivo >15 MB en el entorno) |
| D9 ⭐ | Fallback local (sin Storage) | Con Storage no disponible, adjuntar ≤600 KB | Cae a base64; toast "Archivo adjuntado (local)" | ⬜ (pendiente: requiere Storage apagado) |
| D10 | Fallback local >600 KB | Sin Storage, adjuntar >600 KB (y <15 MB) | Toast "Sin nube disponible"; no se adjunta | ⬜ (pendiente: requiere Storage apagado) |
| D11 ⭐ | Drag & drop de 1 archivo | Arrastrar un PDF a la zona | El borde se resalta al entrar; al soltar crea doc con título=nombre-sin-extensión y adjunta | ⬜ (pendiente: drag&drop de archivos no automatizable con el MCP) |
| D12 ⭐ | Drag & drop múltiple | Arrastrar 3 archivos a la vez | Crea 3 documentos, uno por archivo, cada uno con su adjunto | ⬜ (pendiente: drag&drop no automatizable) |
| D13 ⭐ | Drag sobre hijos de la zona | Arrastrar pasando por encima del botón "+ Agregar"/inputs | El drop igual funciona (la delegación asciende hasta la zona) | ⬜ (pendiente: drag&drop no automatizable) |
| D14 ⭐ | Abrir archivo (Storage) | Doc con adjunto en Storage → "Abrir ↗" | Genera link firmado (1 h) y abre en pestaña nueva | ✅ (link firmado supabase con token; exp − iat = 3600 s = 1 h) |
| D15 | Abrir archivo (legado base64) | Doc con dataUrl → "Abrir ↗" | Decodifica a PDF y lo abre; revoca el link a los 60 s | ⬜ (pendiente: requiere un adjunto base64 legado) |
| D16 ⭐ | Quitar archivo | Doc con adjunto → "Quitar archivo" → confirmar | Borra el binario (si estaba en Storage); el registro (título/link/notas) se conserva | ✅ (modal "Quitar PDF"; adjunto borrado, título/link/notas conservados) |
| D17 | Eliminar documento | Fila → "Eliminar" → confirmar | Se quita la fila (modal aclara "solo la referencia") | ✅ (modal "solo la referencia en TakeOS") |
| D18 ⭐ | Persistencia metadata al recargar | Editar título/notas/link → esperar ~2 s (autosave) → recargar | Los valores vuelven idénticos | ✅ (confirmado en project_documents + hard refresh) |
| D19 ⭐ | Persistencia adjunto al recargar | Adjuntar PDF → recargar | El adjunto sigue; "Abrir ↗" funciona | ✅ (adjunto persiste + link firmado funciona) |
| D20 ⭐ | Orden al recargar | Crear varios docs → recargar | Se muestran ordenados (ver Notas sobre `posicion`) | ✅ (posicion 0/1 asignada por la RPC y estable tras recarga) |

**Estados:** ⬜ pendiente · 🔄 probando · ✅ pasó (no re-probar) · ❌ falló (bug abierto) · 🔁 cambió a propósito.

## Notas
- **0 bugs.** El diff de las 17 funciones vs monolito es idéntico salvo la
  migración esperada de handlers inline a delegación (7/7 acciones mapeadas,
  incluido el drag & drop con ascenso de eventos) y un rebrand cosmético. El
  round-trip de la metadata de cada documento (categoría/título/link/archivo/tamaño)
  es idéntico al monolito.
- **Puntos de BD a confirmar (solo señalados — NO son de esta migración, `main`
  hace igual):**
  1. `posicion` no viaja en el payload de escritura; el orden al recargar depende
     de que la RPC `guardar_operaciones_4e` la asigne por el orden del array.
     Conviene confirmar la definición de la RPC en Supabase (D20).
  2. Los adjuntos en modo local (base64) no se persisten en Supabase (viven solo
     en el respaldo local) — intencional.
  3. El borrado del binario en Storage es "best-effort" (sin await); si falla,
     puede quedar huérfano en el bucket.
