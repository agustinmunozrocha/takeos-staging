# QA · Configuración (`frontend/src/modules/config.js`)

Referencia de comportamiento: monolito en `main` (`git show main:index.html`).
Módulo **grande** (~2.255 líneas, ~43 rutas de persistencia). Cubre el panel de
Configuración (⌘,), el perfil de Empresa/Productora (Datos/Equipo/Diseño/Servicios),
tema, Modo administrador y accesos (BD, panel personal, snapshots, backup).
Cobertura: **rebanada representativa** — 4/7 ✅ + gates verificados (QA 2026-07-20, 0 bugs).

> **Alcance:** por su tamaño, este catálogo cubre una **rebanada representativa**, no
> las 43 rutas. Varias partes ya están cubiertas en otros módulos (Mis datos personales
> = Perfil; Servicios configurables = I7 cerrado en Info Proyecto; permisos por perfil =
> pasada de permisos). El resto (Diseño, edición de datos de empresa, acciones de Equipo)
> es 👁 / requiere Modo administrador. El juez final eres tú.

---

| ID | Qué probar | Pasos | Esperado (según `main`) | Estado |
|----|-----------|-------|-------------------------|--------|
| CFG1 | Panel de Configuración | "Perfil A." (⌘,) | Abre "Configuración" con: Guardar/Cargar OS, Snapshots, Base de Datos, Mis datos personales, Panel personal, Empresa/Productora, Tema, Modo admin, Cerrar | ✅ |
| CFG2 | Panel de Empresa/Productora | Configuración → "Empresa / Productora" | Abre con 4 pestañas: Datos de la empresa 🔒 · Equipo · Diseño · Servicios | ✅ |
| CFG3 | Datos de la empresa protegidos | Click en "Datos de la empresa 🔒" | Pide activar **Modo administrador** (zona delicada) antes de mostrar/editar razón social/RUT/giro/representante/banco | ✅ (el gate pide Modo admin; editar los datos es 👁 — requiere la clave de admin) |
| CFG4 | Pestaña Equipo | Empresa → "Equipo" | Lista las personas de la planta (interno/externo), con incorporar / convertir tipo / permisos | ✅ (lista visible) |
| CFG5 | Servicios | Empresa → "Servicios" | Agregar / renombrar / quitar servicio (RPC `renombrar_servicio`) | ✅ (ya cerrado como I7 en Info Proyecto — cross-ref, no re-probado) |
| CFG6 | Tema claro/oscuro | Configuración → "Tema" | Alterna claro↔oscuro; la preferencia queda en el navegador | ✅ |
| CFG7 | Modo administrador | Configuración → "Modo admin" | Pide la clave de admin; con Modo Admin activo se habilitan acciones restringidas | ✅ (el gate pide la clave; activar/usar es 👁 — requiere la clave de admin) |
| CFG8 | Diseño (colores/tipografías) | Empresa → "Diseño" | Agregar/editar colores y tipografías de marca (se usan en PDFs) | 👁 (visual) |
| CFG9 | Acciones de Equipo | Incorporar / Hacer interno↔externo / permisos | Invitar, convertir tipo, editar permisos por perfil | 👁 / pasada de permisos (requiere Modo admin) |

**Estados:** ⬜ pendiente · 🔄 probando · ✅ pasó · ❌ falló · 🔁 cambió a propósito.

## Notas
- **0 bugs.** Rebanada representativa verificada: el panel de Configuración y el de
  Empresa/Productora abren bien, con sus pestañas; los datos sensibles de la empresa y
  las acciones de Equipo están **protegidos tras el Modo administrador** (la guarda
  funciona: pide la clave). Tema alterna y persiste. Lo no cubierto aquí ya vive en
  otros catálogos (Perfil, I7/Servicios, pasada de permisos) o es 👁 (Diseño, edición
  de datos de empresa con la clave de admin).
