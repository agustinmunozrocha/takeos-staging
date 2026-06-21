-- =====================================================================
-- TakeOS · Fidelidad — REVOKE service_role en funciones sensibles
-- (completa el patrón de …120000; cierra el gap de service_role en rebuilds)
-- ---------------------------------------------------------------------
-- POR QUÉ (nota BD Expert → Code/Redactor, 2026-06-21)
--   La default-priv de Supabase (rol creador `supabase_admin`) otorga EXECUTE
--   EXPLÍCITO a anon, authenticated Y service_role a CADA función nueva en
--   `public`. La migración …120000 cerró el `anon` (hueco de SEGURIDAD real).
--   Faltaba `service_role`: en un rebuild fresco (reset de staging / preview
--   branch / DR) las ~48 funciones sensibles quedan con `service_role` que
--   producción NO tiene → "staging = prod" deja de ser cierto a nivel de ACL.
--
--   `service_role` NO es hueco de seguridad (es la llave secreta de backend,
--   bypassa RLS y nunca llega al cliente); esto es FIDELIDAD ("BD en código").
--
--   El fix sistémico (ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin REVOKE
--   … FROM service_role) NO se puede por migración: el rol de migración
--   (`postgres`) no es superuser ni miembro de `supabase_admin` → "permission
--   denied to change default privileges". Por eso se hace por función, igual
--   que el `anon`. (El deny-by-default sistémico queda como decisión de
--   Agustín/Cib,Seg vía dashboard/soporte de Supabase.)
--
-- QUÉ HACE
--   Revoca `service_role` EXECUTE en TODA función de `public` que NO esté en la
--   keep-list (las 23 que prod SÍ expone a service_role; coinciden 1:1 con las
--   23 anon-ejecutables de prod). Deja el baseline de prod {authenticated, postgres}.
--
-- EFECTO
--   - BD fresca: service_role-exec 71 → 23 (== prod).
--   - Producción (ya en 23): NO-OP. Idempotente. No toca `authenticated` ni `anon`.
-- =====================================================================
DO $fix$
DECLARE
  -- Baseline de prod: las 23 funciones que SÍ deben conservar service_role
  -- (idénticas a las 23 anon-ejecutables: flujos de invitación, helpers auth,
  --  get_*_org, fn_norm_*, etc.). Verificado contra prod el 2026-06-21.
  keep text[] := ARRAY[
    'auth_codigo_perfil(p_org uuid)',
    'auth_es_miembro_org_txt(p_org_text text)',
    'auth_nivel(p_modulo text, p_org_id uuid)',
    'auth_nivel_org_txt(p_modulo text, p_org_text text)',
    'auth_plan_permite(p_feature text, p_org uuid)',
    'auth_ve_proyecto(p_project_id text, p_org_id uuid)',
    'cancelar_invitacion(p_token text)',
    'cerrar_invitacion(p_token text, p_resultado text)',
    'consentir_invitacion(p_org_id uuid)',
    'fn_jsarr(x jsonb)',
    'fn_norm_email(v text)',
    'fn_norm_fono(v text)',
    'fn_norm_rut(v text)',
    'fn_title(v text)',
    'get_company_org(p_company_id text)',
    'get_contact_org(p_contact_id text)',
    'get_project_org(p_project_id text)',
    'get_send_org(p_send_id uuid)',
    'get_task_project(p_task_id text)',
    'invitar_a_organizacion(p_org_id uuid, p_email text, p_tipo text, p_perfil_codigo integer, p_cargo_id text, p_project_id text)',
    'mis_invitaciones()',
    'reclamar_invitacion(p_token text)',
    'rpc_assert_nivel(p_modulo text, p_nivel_min text, p_org_id uuid)'
  ];
  r record; n int := 0;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname||'('||pg_get_function_identity_arguments(p.oid)||')' AS sig
    FROM pg_proc p JOIN pg_namespace nsp ON nsp.oid = p.pronamespace
    WHERE nsp.nspname='public' AND has_function_privilege('service_role', p.oid, 'EXECUTE')
  LOOP
    IF NOT (r.sig = ANY(keep)) THEN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM service_role', r.oid::regprocedure::text);
      n := n + 1;
    END IF;
  END LOOP;
  RAISE NOTICE 'service_role revocado en % funciones (fidelidad con prod)', n;
END $fix$;
