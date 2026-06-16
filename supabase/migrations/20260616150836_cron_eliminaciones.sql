create extension if not exists pg_cron;
select cron.schedule(
  'takeos-eliminaciones-diarias',
  '0 4 * * *',
  $$select public.procesar_eliminaciones_vencidas();$$
);
