-- ════════════════════════════════════════════════════════════════════════════
-- Migración: casilleros faltantes en companies — representante y dueños/socios.
-- Autor: Code (Agustín aprobó el plan). Validado en staging en transacción
-- revertida (ALTER + write/read back sobre CO-RIV-0015).
--
-- CONTEXTO: la ficha de empresa (BD) edita Representante {nombre,cargo,telefono,
-- email}, Dueños/socios [{nombre,telefono,email}] y Observaciones. Los dos
-- primeros NO tenían columna en companies, así que al guardar la empresa se
-- perdían (se veía en la app hasta recargar). Bug preexistente: el monolito de
-- producción tiene el mismo hueco (_dalCompanyRowPayload nunca los mandó y no hay
-- columna). Observaciones se resuelve del lado del frontend reusando la columna
-- `notas` ya existente (sin cambio de esquema).
--
-- MODELO: representante = objeto JSON (una persona). duenos = arreglo JSON de
-- personas. Son datos libres de la ficha (texto tipeado o elegido de la BD y
-- guardado como texto), no entidades relacionales que se consulten — por eso van
-- como jsonb en la propia fila de la empresa, no en tablas hijas. Nullable.
--
-- PERMISOS: sin cambios de RLS. companies ya tiene sus políticas por org/nivel y
-- estas columnas viven en la misma fila; el GRANT de companies ya cubre UPDATE.
--
-- DESPLIEGUE: repo → staging (conector) → validar con el frontend → producción en
-- el merge final de la Etapa 4. Migración ADITIVA y reversible (solo agrega dos
-- columnas nullable; no toca datos, RLS ni tablas existentes).
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS representante jsonb,
  ADD COLUMN IF NOT EXISTS duenos        jsonb;

COMMENT ON COLUMN public.companies.representante IS 'Representante de la empresa: {nombre,cargo,telefono,email}. Dato libre de la ficha BD.';
COMMENT ON COLUMN public.companies.duenos        IS 'Dueños/socios: arreglo de {nombre,telefono,email}. Dato libre de la ficha BD.';
