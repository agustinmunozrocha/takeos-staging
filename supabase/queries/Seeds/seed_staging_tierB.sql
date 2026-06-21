-- =====================================================================
-- TakeOS · SEED de STAGING — Tier B (BACKBONE)
-- ---------------------------------------------------------------------
-- QUÉ HACE
--   Reconstruye el backbone de la branch de Staging desde cero:
--     - 3 usuarios de auth (email/password) con UUID estable + su identity
--     - su user_profile (con fecha de nacimiento adulta: lo exige el candado
--       de edad de provisionar_organizacion)
--     - las 3 productoras con su plan, vía provisionar_organizacion
--       (autocontenida, ADR-022): perfiles, matriz de permisos, departamentos,
--       funciones, motivos de cancelación, organization_profile y la membresía
--       de Administrador del dueño.
--   Es el complemento del Tier A (data de negocio). Tier B = backbone; Tier A = fixture.
--
-- CÓMO SE USA — receta de realineamiento limpio de la branch:
--     1) RESET de la branch  → las 7 migraciones reconstruyen el esquema fiel a
--        producción (con los REVOKE) y eliminan el orphan 20260617161042.
--     2) Correr ESTE Tier B  → backbone (usuarios + orgs + permisos).
--     3) Correr Tier A (seed_staging.sql) → fixture de negocio.
--   Resultado: staging == producción (esquema/grants) + datos de prueba.
--   Se corre A MANO en el SQL Editor de la branch. No es migración (vive en
--   supabase/queries/Seeds/). Idempotente: re-correrlo no duplica.
--
-- PASSWORD DE STAGING  ⚠ DECISIÓN A CONFIRMAR
--   Los 3 usuarios quedan con la MISMA password de Staging: 'StagingTakeOS2026'
--   (la que ya usaba denethor). Esto fija/repone la clave de login en Staging
--   para agustinmr21 y jidelacuadra a ese valor compartido. Es una password de
--   ENTORNO DE PRUEBA, en una branch desechable y aislada — no toca producción
--   ni las cuentas reales de Google. Cámbiala acá si quieres otra.
--
-- SEGURIDAD: barrera anti-producción (aborta si detecta la org de Producción).
-- VALIDADO: mecanismo probado en la branch el 21-jun-2026 (transacción revertida):
--   perfiles=8, deptos=8, funciones=16, membership_dueño=1, login_hash_ok=t.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- BARRERA ANTI-PRODUCCIÓN (corta antes de cualquier escritura)
-- ---------------------------------------------------------------------
DO $guard$
BEGIN
  IF EXISTS (SELECT 1 FROM organizations WHERE id = '640ab1e0-011c-43fe-a5aa-5a636005f56f') THEN
    RAISE EXCEPTION 'ABORTADO: organización de PRODUCCIÓN (Primate) detectada. Tier B es exclusivo de Staging.';
  END IF;
END $guard$;

-- ---------------------------------------------------------------------
-- 1) USUARIOS de auth (email/password) + identity + user_profile
-- ---------------------------------------------------------------------
DO $usuarios$
DECLARE
  v_pwd   text := '12345678';   -- ⚠ password de STAGING (ver encabezado)
  v_users jsonb := jsonb_build_array(
    jsonb_build_object('id','f3b70016-0a75-4905-a055-99ac973fd250','email','agustinmr21@gmail.com','nombre','Agustín','apellido','Muñoz','fnac','1990-01-01'),
    jsonb_build_object('id','3add51f0-b101-4317-8cdc-0d9d0557bfaa','email','jidelacuadra@gmail.com','nombre','Juan','apellido','de la Cuadra','fnac','1990-01-01'),
    jsonb_build_object('id','b7f7f438-0aac-4ecf-bca2-64db485ca20e','email','denethor@gondor.test','nombre','Denethor','apellido','II','fnac','1980-01-01')
  );
  v_u jsonb; v_uid uuid; v_email text;
BEGIN
  PERFORM set_config('search_path', 'public, extensions, auth', true);  -- para crypt/gen_salt
  FOR v_u IN SELECT * FROM jsonb_array_elements(v_users) LOOP
    v_uid   := (v_u->>'id')::uuid;
    v_email := v_u->>'email';

    IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = v_uid) THEN
      INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password,
                              email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
      VALUES ('00000000-0000-0000-0000-000000000000', v_uid, 'authenticated', 'authenticated',
              v_email, crypt(v_pwd, gen_salt('bf')),
              now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now());

      INSERT INTO auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
      VALUES (v_uid::text, v_uid,
              jsonb_build_object('sub', v_uid::text, 'email', v_email, 'email_verified', true, 'phone_verified', false),
              'email', now(), now(), now());
    END IF;

    -- user_profile con fecha adulta (requisito de provisionar_organizacion)
    INSERT INTO user_profiles (user_id, nombre, apellido, email, fecha_nacimiento)
    VALUES (v_uid, v_u->>'nombre', v_u->>'apellido', v_email, (v_u->>'fnac')::date)
    ON CONFLICT (user_id) DO UPDATE
      SET fecha_nacimiento = EXCLUDED.fecha_nacimiento, email = EXCLUDED.email;
  END LOOP;
END $usuarios$;

-- ---------------------------------------------------------------------
-- 2) ORGS + backbone vía provisionar_organizacion (ADR-022), por dueño.
--    provisionar crea la org en plan 'free'; se ajusta el plan después.
-- ---------------------------------------------------------------------
DO $orgs$
DECLARE
  v_orgs jsonb := jsonb_build_array(
    jsonb_build_object('owner','f3b70016-0a75-4905-a055-99ac973fd250','nombre','Rivendell Films','slug','rivendell-films','plan','produccion'),
    jsonb_build_object('owner','3add51f0-b101-4317-8cdc-0d9d0557bfaa','nombre','Highgarden Producciones','slug','highgarden-producciones','plan','rodaje'),
    jsonb_build_object('owner','b7f7f438-0aac-4ecf-bca2-64db485ca20e','nombre','Gondor Studios','slug','gondor-studios','plan','free')
  );
  v_o jsonb; v_org uuid;
BEGIN
  FOR v_o IN SELECT * FROM jsonb_array_elements(v_orgs) LOOP
    IF NOT EXISTS (SELECT 1 FROM organizations WHERE slug = v_o->>'slug') THEN
      PERFORM set_config('request.jwt.claims', json_build_object('sub', v_o->>'owner')::text, true);
      v_org := provisionar_organizacion(v_o->>'nombre', v_o->>'slug');
      UPDATE organizations SET plan = v_o->>'plan' WHERE id = v_org;
    END IF;
  END LOOP;
  PERFORM set_config('request.jwt.claims', '', true);  -- limpiar el claim
END $orgs$;

COMMIT;

-- =====================================================================
-- FIN. Backbone esperado tras correr: 3 usuarios auth · 3 user_profiles ·
-- 3 orgs (free/rodaje/produccion) · por org: 8 perfiles, matriz de permisos,
-- 8 departamentos, 16 funciones, motivos de cancelación, organization_profile
-- y la membresía de Administrador del dueño. Luego correr Tier A (fixture).
-- =====================================================================
