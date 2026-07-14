-- Paridad de Storage staging ↔ producción.
--
-- Contexto: los 10 buckets de Storage existían SOLO en producción (creados a mano
-- en el dashboard, sin archivo de migración). Staging tenía las políticas RLS de
-- storage.objects y las funciones auth_* pero NINGÚN bucket, así que subir un
-- comprobante/foto en staging fallaba con "Bucket not found". Esta migración deja
-- los buckets como código, para que staging y producción queden sincronizados y
-- reproducibles.
--
-- Idempotente (ON CONFLICT DO NOTHING): en producción, que ya tiene los 10
-- buckets, es un no-op; en staging (y en cualquier entorno nuevo) los crea.
-- Config replicada 1:1 de producción (todos privados; límite 50 MB salvo
-- herramientas-personales 5 MB; mismos allowed_mime_types).
--
-- Nota: las POLÍTICAS RLS de storage.objects (hp_* y takeos_storage_*) ya existen
-- en ambos entornos y NO se tocan aquí. (Quedaron fuera de migraciones en su
-- momento, igual que los buckets; conviene capturarlas en una migración aparte
-- para reproducibilidad total, pero eso es un cambio separado y más delicado.)

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('adjuntos-gastos', 'adjuntos-gastos', false, 52428800, null),
  ('adjuntos-tareas', 'adjuntos-tareas', false, 52428800, array['image/jpeg','application/pdf']),
  ('cotizaciones', 'cotizaciones', false, 52428800, null),
  ('documentos-legales', 'documentos-legales', false, 52428800, array['application/pdf']),
  ('documentos-proyecto', 'documentos-proyecto', false, 52428800, array[
    'application/pdf','image/jpeg','image/png','image/gif','image/webp',
    'application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint','application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain','text/csv','application/zip','application/x-zip-compressed']),
  ('fotos-locaciones', 'fotos-locaciones', false, 52428800, array['image/jpeg']),
  ('fotos-plan-de-rodaje-y-guion-tecnico', 'fotos-plan-de-rodaje-y-guion-tecnico', false, 52428800, null),
  ('fotos-talentos', 'fotos-talentos', false, 52428800, null),
  ('herramientas-personales', 'herramientas-personales', false, 5242880, array['image/jpeg','image/png','image/webp','image/gif']),
  ('hojas-llamado', 'hojas-llamado', false, 52428800, null)
on conflict (id) do nothing;
