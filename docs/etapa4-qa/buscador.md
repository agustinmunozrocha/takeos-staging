# QA · Buscador global (`frontend/src/modules/buscador.js`)

Referencia de comportamiento: monolito en `main` (`git show main:index.html`).
Barra superior (input `globalSearch`, acción `app.buscar`; resultados `gsearchResults`).
Busca proyectos, destinos globales (Config, BD, Finanzas, Modo admin, Tema, Guardar/
Cargar OS, Snapshots, Control Room), módulos del proyecto abierto y contactos.
Cobertura: 9/9 ✅ (QA automatizado 2026-07-20, 0 bugs).

> **Resultado del cruce:** port **fiel** y compacto. Matching normalizado
> (minúsculas + sin acentos), **todos** los términos deben calzar (AND), tope 8
> resultados. El juez final eres tú en `localhost:5173`.

---

| ID | Qué probar | Pasos | Esperado (según `main`) | Estado |
|----|-----------|-------|-------------------------|--------|
| BS1 | Buscar proyecto | Escribe parte del nombre de un proyecto | Aparece el proyecto (🎬); al elegirlo, entra al proyecto | ✅ |
| BS2 | Buscar destino global | Escribe "finanzas" | Aparece "Finanzas" (📊 · Abrir) | ✅ |
| BS3 | Buscar contacto | Escribe el nombre de una persona de la BD | Aparecen los contactos que calzan (👤 · Base de Datos) | ✅ (4 "Beorn…") |
| BS4 | Tope de 8 resultados | Escribe algo muy general ("a") | Como máximo 8 resultados | ✅ |
| BS5 | Sin acentos | Escribe "cotizacion" (sin tilde) | Calza igual (normaliza acentos) → módulo Presupuesto | ✅ |
| BS6 | Multi-término (AND) | Escribe "plan rodaje" | Solo lo que contiene **ambos** términos (proyecto + módulo Plan de Rodaje) | ✅ |
| BS7 | Sin resultados | Escribe algo inexistente ("zzxqwzz") | "Sin resultados para …" | ✅ |
| BS8 | Destino con candado | Escribe "administrador" | "Modo administrador" con 🔒; al elegirlo pide la clave si no está activo | ✅ (muestra el 🔒) |
| BS9 | Navegar al elegir | Elige un resultado (o Enter) | Navega al destino (proyecto / módulo / pantalla global) | ✅ (Control Room) |

**Estados:** ⬜ pendiente · 🔄 probando · ✅ pasó · ❌ falló · 🔁 cambió a propósito.

## Notas
- **0 bugs.** Módulo chico y self-contained. Los módulos del proyecto solo aparecen
  con un proyecto abierto; los destinos con `adminRequired` muestran el candado y
  disparan `requestAdminPassword` si el Modo administrador no está activo (BS8).
