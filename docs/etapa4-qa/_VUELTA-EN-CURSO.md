# Vuelta en curso

**Estado: ninguna vuelta en curso.**

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

Migraciones aplicadas a staging pendientes de ir a prod (en el merge final):
- 20260710120000_organization_services.sql
- 20260710130000_renombrar_servicio_rpc.sql
- 20260710140000_companies_representante_duenos.sql

Cuando se abra una vuelta de fix (Paso 6), reemplazar lo de arriba por el bloque
EN CURSO (branch, módulo, paso, bugs, fecha). Al cerrar (Paso 11), volver a
"ninguna vuelta en curso".
-->
