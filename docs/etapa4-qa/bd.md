# QA · Base de Datos (`frontend/src/modules/bd.js` + `bd-excel.js`)

Referencia de comportamiento: monolito en `main` (`git show main:index.html`).
Módulos de apoyo: `dal.js` (persistencia), `lib/state.js`, `lib/delegacion.js`.
Cobertura: 0/35 ✅ (catálogo nuevo — nada probado aún).

> **Cómo leer este catálogo.** Las pruebas **⭐** son donde el cruce
> monolito↔modular levantó sospecha; **pruébalas primero**. El resto es
> regresión normal. El juez final eres tú en `localhost:5173`.
>
> **Bug encontrado y arreglado en esta tanda** (branch `fix/bd-empresa-observaciones`):
> BUG-BD-1 (ver Notas). Afecta la prueba **BD11** — verifícala primero.

---

## A. Alta / edición de Persona
| ID | Qué probar | Pasos | Esperado (según `main`) | Estado |
|----|-----------|-------|-------------------------|--------|
| BD1 | Alta persona completa | + Nueva persona → llenar todo (RUT, tel, email, roles, empresa, dirección, pago, talento) → Crear | Aparece en lista; expandible muestra RUT/DTE/banco/cuenta; persiste tras recargar | ⬜ |
| BD2 ⭐ | Guardar persona sin email | + Nueva persona → solo nombre → Crear | La modular **bloquea** ("Falta el correo"); en `main` sí permitía. Confirmar si el bloqueo es deseado (decisión de producto) | ⬜ |
| BD3 | Editar ficha (con permiso) | Expandir persona → ✎ Editar ficha (perfil con `bd`=E) | Abre editor con datos cargados; guarda y refleja en todos los proyectos | ⬜ |
| BD4 | Editar sin permiso | Con perfil sin `bd`=E → ✎ Editar | Modal "Sin permiso para editar fichas" | ⬜ |
| BD5 | Toggle secciones Crew/Talento | Marcar/desmarcar rol Crew y Talento | Muestra/oculta sección Rol habitual+DTE y Perfil de talento | ⬜ |
| BD6 | Cuenta extranjera | Marcar "Cuenta extranjera" → datos libres → guardar | Oculta bloque Chile, guarda `datosExtranjeros`; round-trip OK | ⬜ |
| BD7 | Autocompletar código banco | Elegir banco en el desplegable | `pf_codigoBanco` se llena solo (SBIF) y es readonly | ⬜ |
| BD8 | Combobox Empresa asociada | Tipear/seleccionar empresa | Al seleccionar, el input toma el nombre; al guardar, `empresaId` correcto | ⬜ |
| BD9 | Duplicado por nombre (alta) | Crear persona con nombre ya existente | "Persona ya existe", no crea duplicado | ⬜ |

## B. Empresas
| ID | Qué probar | Pasos | Esperado (según `main`) | Estado |
|----|-----------|-------|-------------------------|--------|
| BD10 | Alta rápida empresa | + Nueva empresa → nombre+RUT+tipo+giro → Crear | Aparece con badges de tipo; sincroniza a Supabase | ⬜ |
| BD11 ⭐ | **Observaciones de empresa** (BUG-BD-1) | Editar empresa → escribir en Observaciones → agregar un dueño (re-render del modal) → cerrar y reabrir | El texto escrito debe **permanecer** (antes, si la empresa arrastraba un valor legado, "revertía"). Arreglado en esta tanda | ⬜ |
| BD12 ⭐ | Persistencia Representante/Dueños | Editar empresa → Representante + 2 Dueños → Guardar cambios → recargar app | Deben volver tras recarga desde Supabase (depende de columnas en la BD — ver Notas / cola de BD) | ⬜ |
| BD13 | Dueños: combobox nombre | En un dueño, elegir persona de la BD | El nombre se fija; teléfono/mail quedan editables aparte | ⬜ |
| BD14 | Quitar/agregar dueño | + Agregar dueño / Quitar | La lista se actualiza y persiste | ⬜ |
| BD15 | Vincular/desvincular contacto | En "Contactos de la empresa" agregar (combobox) y Desvincular | Vincula por `empresaId`; desvincular no borra de la BD | ⬜ |
| BD16 | Cargo/relación de contacto | Cambiar "Cargo / relación" | Se guarda en `relacionEmpresa` del contacto | ⬜ |
| BD17 | Ver ficha (Control Room) | Empresas → Ver ficha | Tiles de proyectos/pagado/margen (solo cerrados) + bloque proveedor si aplica | ⬜ |
| BD18 | Cambiar Tipo | Editar → Tipo = "Cliente, Proveedor" | Badges y `company_relationships` reflejan ambos tipos | ⬜ |

## C. Talentos
| ID | Qué probar | Pasos | Esperado (según `main`) | Estado |
|----|-----------|-------|-------------------------|--------|
| BD19 | Alta rápida talento | + Nuevo talento → nombre+email+edad+altura → Crear | Entra a contactos con rol Talento; aparece en pestaña Talentos | ⬜ |
| BD20 | Editar talento = persona | Talentos → click en tarjeta | Abre el editor de persona de ese contacto | ⬜ |
| BD21 | Links Fotos/Reel | Tarjeta con `fotosLink`/`reelLink` | Abren en pestaña nueva (URL saneada) | ⬜ |

## D. Locaciones (BD transversal)
| ID | Qué probar | Pasos | Esperado (según `main`) | Estado |
|----|-----------|-------|-------------------------|--------|
| BD22 | Alta locación BD | + Nueva locación → nombre+dirección+comuna+región → Crear | Se crea, abre detalle, persiste | ⬜ |
| BD23 | Dedup por nombre | Crear locación con nombre existente | Abre la existente, no duplica | ⬜ |
| BD24 | Búsqueda locaciones | Escribir en buscar (tab Locaciones) | Filtra por nombre/dirección | ⬜ |

## E. Excel import / export
| ID | Qué probar | Pasos | Esperado (según `main`) | Estado |
|----|-----------|-------|-------------------------|--------|
| BD25 | Export → reimport (round-trip) | Exportar BD → reimportar el mismo .xlsx | Nada se duplica ni se pierde (dedup por ID/RUT); columnas en orden `HDR_*_V73` | ⬜ |
| BD26 | Descargar plantilla | Botón "Descargar planilla" | .xlsx con CONTACTOS+EMPRESAS+Instrucciones y fila ejemplo | ⬜ |
| BD27 | Import formato 3 hojas | Importar PERSONAS/EMPRESAS/TALENTOS | Unifica a Contactos; toast con conteos | ⬜ |
| BD28 | Import formato viejo (1 hoja) | Importar .xlsx con solo hoja Personas | Modal "formato antiguo" → OK → importa y unifica | ⬜ |
| BD29 | Normalización al importar | RUT "12345678-9", tel "912345678", banco "bci" | RUT→"12.345.678-9", tel→"+56 9 …", banco→"BANCO BCI" + código 016 | ⬜ |
| BD30 | Fusión no destructiva | Importar Excel con menos personas que la BD | No borra las que no están; solo agrega/actualiza | ⬜ |
| BD31 ⭐ | Sync a Supabase tras import | Importar en fuente Supabase | Toast "Sincronizando…"; verificar que sube sin error | ⬜ |

## F. Persistencia / round-trip
| ID | Qué probar | Pasos | Esperado (según `main`) | Estado |
|----|-----------|-------|-------------------------|--------|
| BD32 | Round-trip banco/cuenta | Guardar persona con banco+tipo+N° → recargar | Banco (nombre por código SBIF), tipoCuenta, nCuenta vuelven | ⬜ |
| BD33 | Round-trip campos contacto | Guardar dirección/comuna/ciudad/región/restricción/notas → recargar | Todos vuelven (incluido `region`) | ⬜ |
| BD34 ⭐ | Round-trip empresa completa | Nombre/razón/RUT/giros/web/notas/tipo + repr/dueños → recargar | Todo vuelve desde Supabase | ⬜ |
| BD35 | Archivar/restaurar | Archivar persona/empresa/locación (admin) → Archivados → Restaurar | Desaparece de la BD y vuelve al restaurar; no afecta históricos | ⬜ |

**Estados:** ⬜ pendiente · 🔄 probando · ✅ pasó (no re-probar) · ❌ falló (bug abierto) · 🔁 cambió a propósito.

## Notas

### Bug encontrado y arreglado — BUG-BD-1 (branch `fix/bd-empresa-observaciones`)
El textarea "Observaciones" de la ficha de empresa **mostraba** el campo
`observaciones` pero **escribe/persiste** en `notas` (el commit que hizo persistir
Observaciones cambió el destino de escritura a `notas`, que sí se relee, pero no
ajustó el display). Efecto: si una empresa arrastra un `observaciones` legado (dato
de la era monolito en el respaldo local), la ficha muestra ese valor viejo y, al
re-renderizarse el modal (p. ej. tras "+ Agregar dueño"), "revierte" lo recién
escrito. Fix: el display prioriza `notas` (el campo que se escribe y persiste):
`e.notas || e.observaciones || ''`. **Verificar en BD11.** Empresas creadas en la
modular (o tras un boot desde Supabase) nunca tuvieron el problema.

### Diferencias intencionales (NO son bugs — no re-probar como regresión)
- **BD2 · Email obligatorio al guardar persona:** la modular bloquea guardar sin
  correo (label "Email *"); `main` lo permitía. Cambio de producto — confirmar que
  es lo querido.
- **Botón "Guardar cambios" + "Cerrar"** en la ficha de empresa (antes solo
  "Listo"): intencional.
- **Rebranding** en export/plantilla (`TakeOS_…` vs `Rizora_…`): cosmético.

### Pendiente de BD (solo señalado — NO aplicado en esta tanda)
- **Columnas `companies.representante` y `companies.duenos`:** la modular envía y
  relee estos dos campos (persistencia de Representante y Dueños/socios), que
  `main` no persistía. Si faltan en el proyecto Supabase activo, **todo** guardado
  de empresa falla (no solo esos campos). Ya está en la cola de BD del marcador de
  la etapa (migración `20260710140000_companies_representante_duenos.sql` aplicada
  a staging; va a prod en el merge final). BD12/BD34 dependen de esto.
