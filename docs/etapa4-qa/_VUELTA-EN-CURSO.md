# Vuelta en curso

**Estado: ninguna vuelta en curso.**

<!--
CERRADO 2026-07-14 — branch fix/cotizacion-solo-editorial (merge → etapa4-integracion):
Carta formal y Manifiesto DESCONECTADAS del selector de la carta PDF de Cotización
(quedan en el código, solo ocultas); solo Editorial activa. COTPREV_PLANTILLAS (solo
editorial) + cotPrevSettings fuerza plantilla='editorial'. Motivo: la Carta no muestra
el domicilio de la productora (falló C20) y ambas arman el "qué incluye" crudo desde el
Presupuesto con filas vacías; no es prioridad de beta. Arreglo de fondo anotado en
cotizacion.md (Notas) para reimplementar. En el mismo cierre viajan los ✅ del QA
automatizado de Cotización (C1–C18, C22–C25, 0 bugs) + C19/C21 por Agustín + C20 🔁.
Aprobado por Agustín en local. Cotización queda 24/25 ✅ + 1 🔁 (cerrada).
-->

<!--
CERRADO 2026-07-13 — branch feat/bd-esconder-pantalla-lectores (merge → etapa4-integracion):
la pantalla de Base de Datos ahora solo la ven/abren los editores del módulo 'bd';
Coordinación y Creativo (lectores) ya no la ven. auth.js (authPuedeVer caso
'bd-personas'==='E') + bd.js (gate en openGlobalBDPersonas + redirect). No afecta
comboboxes. Aprobado por Agustín (probó editor y lector). El mismo cambio va al
monolito de main (producción).
-->

<!--
CERRADO 2026-07-13 — branch fix/contactos-persistencia-guardado (merge 7ec4011 →
etapa4-integracion): el guardado de la ficha de persona verifica que la base haya
recibido la escritura (dal.js con .select()) y bd.js espera la confirmación,
revierte y avisa si la base rechaza; se acabó el "guardado" en falso. Mismo fix
aplicado al monolito en main. Aprobado por Agustín en local. Pendiente aparte:
migraciones de validación de cuenta y anti-duplicados de RUT (rama
chore/bd-validacion-cuenta-y-antidup-rut) y alineación de permisos por perfil,
para la sesión conjunta de BD.
-->

<!--
Info Proyecto: cerrado (Grupo 1 + Grupo 2). Detalle en info-proyecto.md.
Servicios configurables (I7): cerrado — tabla organization_services + RPC renombrar_servicio.

Cola de BD:
- Persistencia de la ficha de empresa (Representante / Dueños / Observaciones):
  CERRADO 2026-07-10 (branch fix/empresa-representante-duenos-persist, merge ccc1110).
  Migración 20260710140000_companies_representante_duenos.sql aplicada a staging;
  va a prod en el merge final de la Etapa 4. Resolvió también lo que se había
  anotado como "contacto principal de empresa no persiste" (era el mismo hueco:
  el campo Representante).

Migraciones aplicadas a staging pendientes de ir a prod (en el merge final) — R4: staging y main NO divergen, estas DEBEN llegar a main:
- 20260710120000_organization_services.sql
- 20260710130000_renombrar_servicio_rpc.sql
- 20260710140000_companies_representante_duenos.sql
- 20260714120000_storage_buckets_paridad_staging.sql  (crea los 10 buckets de Storage; en prod es no-op idempotente, ya los tiene)

Cuando se abra una vuelta de fix (Paso 6), reemplazar lo de arriba por el bloque
EN CURSO (branch, módulo, paso, bugs, fecha). Al cerrar (Paso 11), volver a
"ninguna vuelta en curso".
-->
