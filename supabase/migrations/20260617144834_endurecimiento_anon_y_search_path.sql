-- =====================================================================
-- Migración: endurecimiento_anon_y_search_path
-- Fecha:     2026-06-17
-- Autor:     BD Expert (TakeOS) · Primate Films / La Hectárea SpA
-- Prioridad: ADR-024 — backlog de endurecimiento, ANTES del beta externo
-- Alineada:  ADR de Backend v1.7 · Roadmap Operativo v1.6 · Arquitectura v1.3
--
-- QUÉ HACE (tres frentes del backlog de advisors):
--   1) Revoca a `anon` el EXECUTE en las RPC de ESCRITURA de proyecto/operaciones
--      (capa externa de defensa; cada función ya valida auth.uid() por dentro).
--   2) Fija `search_path` en las 11 funciones utilitarias que lo tenían mutable
--      (cierra el aviso "Function Search Path Mutable" del linter de Supabase).
--   3) Deja DOCUMENTADO el deny-all intencional de `app_config` (no cambia permisos).
--
-- DECISIONES CLAVE (verificadas contra la base viva el 2026-06-17, project
-- `zplcgetquwxybkrpmcvl`, y probadas en transacción revertida):
--
--   • NO se tocan los helpers de RLS. Tanto los `auth_*` COMO los `get_*_org`
--     (get_project_org, get_contact_org, get_company_org, get_send_org,
--     get_task_project) se usan DENTRO de decenas de políticas RLS. Revocarles
--     `anon` rompería la evaluación de RLS en cualquier ruta `anon` legítima
--     ("permission denied for function ..."). El backlog original (handoff)
--     listaba `get_*_org` para revocación; ESO ERA UN ERROR — pertenecen a la
--     misma categoría que `auth_*`: se mantienen anon-ejecutables.
--
--   • NO se revoca `invitar_a_organizacion` ni el resto del ciclo de invitaciones
--     (reclamar/consentir/cerrar/cancelar/mis_invitaciones). Todas arrancan con
--     `IF auth.uid() IS NULL THEN RAISE '...sin sesion'` (fail-closed interno):
--     un `anon` no logra nada al llamarlas. El canónico (Arquitectura §6) manda
--     mantener los FLUJOS DE INVITACIÓN anon-ejecutables para que el onboarding
--     degrade con un error de aplicación limpio y no con un "permission denied"
--     crudo. (Esto difiere del handoff, que pedía revocar `invitar_a_organizacion`;
--     gana el canónico.)
--
--   • `app_config` ya está en su estado más seguro: RLS activo, CERO políticas,
--     y sin GRANT de SELECT/INSERT/UPDATE a anon/authenticated => deny-all al
--     cliente (doble fail-closed). Solo la leen funciones SECURITY DEFINER, que
--     pasan sobre RLS como dueñas. Sus únicas claves son la identidad del
--     Proveedor (proveedor_razon_social, proveedor_rut), entregada al cliente
--     vía RPC. NO requiere policy; se agrega un COMMENT para que nadie agregue
--     una policy abierta "por las dudas" más adelante.
--
-- IDEMPOTENTE: re-ejecutable sin daño. REVOKE de un grant inexistente es no-op;
-- GRANT/ALTER SET/COMMENT son idempotentes.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) RPC de escritura: quitar anon (vía PUBLIC), conservar authenticated
--    El acceso de anon provenía del grant por defecto a PUBLIC ("=X/postgres").
--    `authenticated` tiene grant explícito propio, así que NO lo pierde; aun así
--    se re-otorga de forma explícita para que el estado quede autocontenido.
-- ---------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.guardar_proyecto(jsonb)        FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.guardar_proyecto(jsonb)        TO authenticated;

REVOKE EXECUTE ON FUNCTION public.guardar_operaciones_4a(jsonb)  FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.guardar_operaciones_4a(jsonb)  TO authenticated;

REVOKE EXECUTE ON FUNCTION public.guardar_operaciones_4b(jsonb)  FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.guardar_operaciones_4b(jsonb)  TO authenticated;

REVOKE EXECUTE ON FUNCTION public.guardar_operaciones_4c(jsonb)  FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.guardar_operaciones_4c(jsonb)  TO authenticated;

REVOKE EXECUTE ON FUNCTION public.guardar_operaciones_4e(jsonb)  FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.guardar_operaciones_4e(jsonb)  TO authenticated;

REVOKE EXECUTE ON FUNCTION public.eliminar_proyecto(text)        FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.eliminar_proyecto(text)        TO authenticated;

REVOKE EXECUTE ON FUNCTION public.restaurar_proyecto(text)       FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.restaurar_proyecto(text)       TO authenticated;

-- ---------------------------------------------------------------------
-- 2) Fijar search_path en las 11 utilitarias (SECURITY INVOKER).
--    Cuerpos verificados: solo usan funciones built-in (pg_catalog) o llaman a
--    hermanas que viven en `public` (fn_norm_rut/email/fono/title). 'public'
--    resuelve esas hermanas; pg_catalog se busca de forma implícita. Ninguna
--    usa funciones de la schema `extensions`, así que 'public' es seguro.
-- ---------------------------------------------------------------------
ALTER FUNCTION public.fn_jsarr(jsonb)                SET search_path TO 'public';
ALTER FUNCTION public.fn_norm_bank_accounts()        SET search_path TO 'public';
ALTER FUNCTION public.fn_norm_companies()            SET search_path TO 'public';
ALTER FUNCTION public.fn_norm_contacts()             SET search_path TO 'public';
ALTER FUNCTION public.fn_norm_email(text)            SET search_path TO 'public';
ALTER FUNCTION public.fn_norm_fono(text)             SET search_path TO 'public';
ALTER FUNCTION public.fn_norm_legal_documents()      SET search_path TO 'public';
ALTER FUNCTION public.fn_norm_organizations()        SET search_path TO 'public';
ALTER FUNCTION public.fn_norm_rut(text)              SET search_path TO 'public';
ALTER FUNCTION public.fn_title(text)                 SET search_path TO 'public';
ALTER FUNCTION public.set_updated_at()               SET search_path TO 'public';

-- ---------------------------------------------------------------------
-- 3) app_config: documentar el deny-all intencional (sin cambiar permisos)
-- ---------------------------------------------------------------------
COMMENT ON TABLE public.app_config IS
  'Config sensible server-side. Solo la leen funciones SECURITY DEFINER (pasan sobre RLS como duenas). RLS activo SIN policy y sin GRANT a anon/authenticated = deny-all al cliente, intencional (doble fail-closed). NO agregar policy abierta: la identidad del Proveedor (proveedor_razon_social, proveedor_rut) se entrega al cliente via RPC, nunca por lectura directa de esta tabla.';
