-- =====================================================================
-- TakeOS · Endurecimiento — REVOKE anon en funciones sensibles
-- (cierra el hueco de captura del dump)
-- ---------------------------------------------------------------------
-- POR QUÉ
--   La migración base (…150834_remote_schema) revoca estas funciones sólo
--   FROM PUBLIC. Pero Supabase otorga EXECUTE a `anon` por DEFAULT PRIVILEGES
--   al crear cada función en `public`, así que en una BD fresca (reset de
--   staging / preview branch / recuperación ante desastre) `anon` CONSERVA el
--   grant explícito y estas 19 funciones quedan anon-ejecutables (42 vs 23 de
--   producción). La migración …144834_endurecimiento ya usó el patrón correcto
--   (REVOKE ... FROM PUBLIC, anon) pero sólo cubrió 7 funciones de escritura;
--   esta completa el resto, dejando todo rebuild fiel a producción.
--
-- EFECTO
--   - BD fresca: baja anon-ejecutables de 42 → 23 (== producción).
--   - Producción (ya en 23): NO-OP (revocar un grant inexistente es inofensivo).
--   - Idempotente y reversible. NO toca `authenticated` (conserva su grant).
--
-- VERIFICADO: branch de staging, reset limpio con esta migración → anon=23,
--   set idéntico a producción.
-- =====================================================================

REVOKE EXECUTE ON FUNCTION public.asignar_cargo_a_miembro(text, text, text)              FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.cancelar_eliminacion_cuenta()                          FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.exportar_herramienta(text)                             FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.exportar_mis_datos()                                   FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.guardar_cargos(text, jsonb)                            FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.guardar_consentimiento_cookies(boolean, boolean, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.guardar_pagos_cliente(text, jsonb)                     FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.invitaciones_de_organizacion(uuid)                     FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.marcar_notificaciones_leidas(uuid[])                   FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.mis_organizaciones_como_unico_admin()                  FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.personas_de_mis_proyectos()                            FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.procesar_eliminaciones_vencidas()                      FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.resolver_rebind(uuid, boolean, text)                   FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.revocar_consentimiento(uuid)                           FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.rpc_assert_cupo_colaborador(uuid)                      FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.rpc_assert_cupo_proyecto(uuid)                         FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.rpc_assert_plan(text, uuid)                            FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.solicitar_eliminacion_cuenta()                         FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.transferir_administracion(uuid, uuid)                  FROM PUBLIC, anon;
