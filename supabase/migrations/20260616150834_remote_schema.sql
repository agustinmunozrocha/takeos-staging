


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE EXTENSION IF NOT EXISTS "pg_cron" WITH SCHEMA "pg_catalog";






COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE OR REPLACE FUNCTION "public"."_admitir_persona"("p_uid" "uuid", "p_token" "text", "p_email_contacto" "text" DEFAULT NULL::"text") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_inv org_invitations%ROWTYPE;
  v_mem memberships%ROWTYPE;
  v_perfil permission_profiles%ROWTYPE;
  v_contact_id text;
  v_nombre text;
BEGIN
  SELECT * INTO v_inv FROM org_invitations WHERE id = p_token;
  IF v_inv.id IS NULL THEN RAISE EXCEPTION '_admitir: invitacion inexistente.'; END IF;

  SELECT * INTO v_mem FROM memberships WHERE user_id=p_uid AND organization_id=v_inv.organization_id LIMIT 1;

  IF v_mem.id IS NOT NULL AND v_mem.estado='activo' THEN
    v_contact_id := v_mem.contact_id;
    SELECT nombre INTO v_nombre FROM contacts WHERE id = v_contact_id;
    IF coalesce(p_email_contacto,'') <> '' AND v_contact_id IS NOT NULL THEN
      UPDATE contacts SET email = p_email_contacto, updated_at = now() WHERE id = v_contact_id;
    END IF;
  ELSE
    IF v_mem.id IS NULL THEN
      SELECT * INTO v_perfil FROM permission_profiles WHERE organization_id=v_inv.organization_id AND codigo=v_inv.perfil_codigo LIMIT 1;
      IF v_perfil.id IS NULL THEN RAISE EXCEPTION '_admitir: perfil de la invitacion inexistente.'; END IF;
      INSERT INTO memberships (user_id, organization_id, tipo, profile_id, estado)
      VALUES (p_uid, v_inv.organization_id, v_inv.tipo, v_perfil.id, 'pendiente')
      RETURNING * INTO v_mem;
    END IF;
    v_contact_id := _copiar_persona_a_org(p_uid, v_inv.organization_id, v_mem.id, 'consentimiento_incorporacion', p_email_contacto);
    SELECT nombre INTO v_nombre FROM contacts WHERE id = v_contact_id;
    UPDATE memberships SET contact_id=v_contact_id, estado='activo', updated_at=now() WHERE id=v_mem.id;
  END IF;

  IF v_inv.cargo_id IS NOT NULL THEN
    UPDATE project_cargos SET estado='activo', invited_user_id=p_uid, contact_id=v_contact_id,
           persona_nombre=coalesce(v_nombre, persona_nombre), updated_at=now()
     WHERE id=v_inv.cargo_id AND estado IN ('pendiente','sin-asignar');
  END IF;
  UPDATE project_cargos pc SET estado='activo', contact_id=v_contact_id,
         persona_nombre=coalesce(v_nombre, pc.persona_nombre), updated_at=now()
   FROM projects p
   WHERE pc.project_id=p.id AND p.organization_id=v_inv.organization_id
     AND pc.invited_user_id=p_uid AND pc.estado='pendiente';

  UPDATE org_invitations SET estado='aceptada', invited_user_id=p_uid, updated_at=now() WHERE id=v_inv.id;
  RETURN v_contact_id;
END;
$$;


ALTER FUNCTION "public"."_admitir_persona"("p_uid" "uuid", "p_token" "text", "p_email_contacto" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."_anonimizar_titular"("p_uid" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE v_rut text; v_email text;
BEGIN
  SELECT rut, email INTO v_rut, v_email FROM user_profiles WHERE user_id = p_uid;

  -- Contactos-espejo del titular en cualquier organización (match por RUT o correo)
  UPDATE contacts SET
    nombre = 'Usuario eliminado', rut = NULL, email = NULL, telefono = NULL,
    direccion = NULL, direccion_linea2 = NULL, comuna = NULL, ciudad = NULL, region = NULL,
    fecha_nacimiento = NULL, restriccion_alimentaria = NULL, notas = NULL
  WHERE (v_rut IS NOT NULL AND rut = v_rut) OR (v_email IS NOT NULL AND lower(email) = lower(v_email));

  -- Perfil del titular
  UPDATE user_profiles SET
    nombre = 'Usuario', apellido = 'eliminado', rut = NULL, email = NULL, telefono = NULL,
    direccion = NULL, direccion_linea2 = NULL, comuna = NULL, ciudad = NULL, region = NULL,
    pais = NULL, documento_identidad = NULL, fecha_nacimiento = NULL
  WHERE user_id = p_uid;

  -- Cuentas bancarias del titular
  UPDATE user_bank_accounts SET numero_cuenta = 'ELIMINADA', datos_extra = NULL WHERE user_id = p_uid;

  -- Corta toda membresía (la red trg_proteger_ultimo_admin impide orfanar una organización)
  UPDATE memberships SET estado = 'inactivo', updated_at = now() WHERE user_id = p_uid AND estado <> 'inactivo';

  -- Correo de login anonimizado
  UPDATE auth.users SET email = 'deleted_'||substr(p_uid::text,1,8)||'@deleted.local',
    phone = NULL, raw_user_meta_data = '{}'::jsonb WHERE id = p_uid;

  -- data_consents y audit_log se CONSERVAN (evidencia Ley 21.719)
END $$;


ALTER FUNCTION "public"."_anonimizar_titular"("p_uid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."_copiar_persona_a_org"("p_user_id" "uuid", "p_org_id" "uuid", "p_membership_id" bigint, "p_tipo_terminos" "text", "p_email_contacto" "text" DEFAULT NULL::"text") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_prof       user_profiles%ROWTYPE;
  v_terms      consent_terms%ROWTYPE;
  v_org_nombre text;
  v_proveedor  text;
  v_snapshot   text;
  v_contact_id text;
  v_nombre     text;
  v_email      text;
  bank         record;
BEGIN
  SELECT * INTO v_terms FROM consent_terms WHERE tipo = p_tipo_terminos AND estado='aprobado' AND vigente=true LIMIT 1;
  IF v_terms.id IS NULL THEN
    RAISE EXCEPTION 'consentimiento: no hay terminos aprobados y vigentes del tipo % (pendiente aprobacion legal v1.0).', p_tipo_terminos;
  END IF;

  SELECT * INTO v_prof FROM user_profiles WHERE user_id = p_user_id;
  IF v_prof.user_id IS NULL THEN RAISE EXCEPTION 'consentimiento: la persona no tiene perfil personal.'; END IF;
  IF v_prof.completado_at IS NULL THEN RAISE EXCEPTION 'consentimiento: completa tu perfil personal antes de aceptar.'; END IF;

  v_nombre := trim(coalesce(v_prof.nombre,'') || ' ' || coalesce(v_prof.apellido,''));
  v_email  := coalesce(nullif(p_email_contacto,''), v_prof.email);  -- correo elegido por el aprobador, o el del perfil

  -- Reutiliza contacto existente (mismo RUT en la org) en vez de duplicar
  IF coalesce(v_prof.rut,'') <> '' THEN
    SELECT id INTO v_contact_id FROM contacts WHERE organization_id=p_org_id AND rut=v_prof.rut AND deleted_at IS NULL LIMIT 1;
  END IF;

  IF v_contact_id IS NULL THEN
    v_contact_id := 'ctk_' || substr(md5(random()::text || clock_timestamp()::text || p_user_id::text), 1, 10);
    INSERT INTO contacts (id, organization_id, nombre, rut, email, telefono, direccion, direccion_linea2, comuna, ciudad, region, created_by, updated_by)
    VALUES (v_contact_id, p_org_id, nullif(v_nombre,''), v_prof.rut, v_email, v_prof.telefono,
            v_prof.direccion, v_prof.direccion_linea2, v_prof.comuna, v_prof.ciudad, v_prof.region, p_user_id, p_user_id);
    FOR bank IN SELECT * FROM user_bank_accounts WHERE user_id = p_user_id LOOP
      INSERT INTO contact_bank_accounts (contact_id, bank_codigo_sbif, tipo_cuenta, numero_cuenta, es_principal, es_extranjera, datos_extra)
      VALUES (v_contact_id, bank.bank_codigo_sbif, bank.tipo_cuenta, bank.numero_cuenta, bank.es_principal, bank.es_extranjera, bank.datos_extra);
    END LOOP;
  ELSE
    -- Contacto ya existia: honra el correo elegido (decision explicita del aprobador) y agrega banca si no tenia
    IF coalesce(p_email_contacto,'') <> '' THEN
      UPDATE contacts SET email = p_email_contacto, updated_at = now() WHERE id = v_contact_id;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM contact_bank_accounts WHERE contact_id = v_contact_id) THEN
      FOR bank IN SELECT * FROM user_bank_accounts WHERE user_id = p_user_id LOOP
        INSERT INTO contact_bank_accounts (contact_id, bank_codigo_sbif, tipo_cuenta, numero_cuenta, es_principal, es_extranjera, datos_extra)
        VALUES (v_contact_id, bank.bank_codigo_sbif, bank.tipo_cuenta, bank.numero_cuenta, bank.es_principal, bank.es_extranjera, bank.datos_extra);
      END LOOP;
    END IF;
  END IF;

  SELECT nombre INTO v_org_nombre FROM organizations WHERE id = p_org_id;
  SELECT valor  INTO v_proveedor  FROM app_config   WHERE clave = 'proveedor_razon_social';
  v_snapshot := replace(replace(v_terms.texto, '{PRODUCTORA}', coalesce(v_org_nombre,'')), '{PROVEEDOR}', coalesce(v_proveedor,''));

  INSERT INTO data_consents (user_id, organization_id, membership_id, terms_version, terms_text_snapshot)
  VALUES (p_user_id, p_org_id, p_membership_id, v_terms.id, v_snapshot);

  RETURN v_contact_id;
END;
$$;


ALTER FUNCTION "public"."_copiar_persona_a_org"("p_user_id" "uuid", "p_org_id" "uuid", "p_membership_id" bigint, "p_tipo_terminos" "text", "p_email_contacto" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."_crear_notificacion"("p_user_id" "uuid", "p_org" "uuid", "p_project" "text", "p_tipo" "text", "p_titulo" "text", "p_cuerpo" "text", "p_data" "jsonb" DEFAULT '{}'::"jsonb") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE v_id uuid;
BEGIN
  INSERT INTO user_notifications (user_id, organization_id, project_id, actor_id, tipo, titulo, cuerpo, data)
  VALUES (p_user_id, p_org, p_project, auth.uid(), p_tipo, p_titulo, p_cuerpo, coalesce(p_data, '{}'::jsonb))
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;


ALTER FUNCTION "public"."_crear_notificacion"("p_user_id" "uuid", "p_org" "uuid", "p_project" "text", "p_tipo" "text", "p_titulo" "text", "p_cuerpo" "text", "p_data" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."_orgs_unico_admin"("p_uid" "uuid") RETURNS TABLE("organization_id" "uuid", "nombre" "text")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT o.id, o.nombre
  FROM organizations o
  WHERE EXISTS (
          SELECT 1 FROM memberships m JOIN permission_profiles p ON p.id = m.profile_id
          WHERE m.user_id = p_uid AND m.organization_id = o.id AND m.estado = 'activo' AND p.codigo = 1)
    AND (SELECT count(*) FROM memberships m2 JOIN permission_profiles p2 ON p2.id = m2.profile_id
         WHERE m2.organization_id = o.id AND m2.estado = 'activo' AND p2.codigo = 1) = 1;
$$;


ALTER FUNCTION "public"."_orgs_unico_admin"("p_uid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."_requisitos_faltantes"("p_uid" "uuid") RETURNS "text"[]
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT array_remove(ARRAY[
    CASE WHEN NOT EXISTS (SELECT 1 FROM user_profiles WHERE user_id = p_uid AND completado_at IS NOT NULL) THEN 'perfil' END,
    CASE WHEN NOT EXISTS (SELECT 1 FROM user_profiles WHERE user_id = p_uid AND fecha_nacimiento IS NOT NULL) THEN 'edad' END,
    CASE WHEN NOT EXISTS (
      SELECT 1 FROM user_bank_accounts WHERE user_id = p_uid
        AND (coalesce(numero_cuenta,'') <> '' OR (es_extranjera AND coalesce(datos_extra,'') <> ''))
    ) THEN 'banca' END
  ], NULL);
$$;


ALTER FUNCTION "public"."_requisitos_faltantes"("p_uid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."asignar_cargo_a_miembro"("p_project_id" "text", "p_cargo_id" "text", "p_email" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_org      uuid;
  v_user     uuid;
  v_contact  text;
  v_nombre   text;
  v_cargo    record;
  v_proj_nom text;
  v_prod     text;
  v_notif    uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'sin sesion.'; END IF;
  IF p_project_id IS NULL OR p_cargo_id IS NULL OR coalesce(btrim(p_email),'') = '' THEN
    RAISE EXCEPTION 'asignar_cargo_a_miembro: faltan datos (proyecto, cargo o correo).';
  END IF;

  SELECT organization_id INTO v_org FROM projects WHERE id = p_project_id;
  IF v_org IS NULL THEN RAISE EXCEPTION 'asignar_cargo_a_miembro: proyecto inexistente.'; END IF;

  PERFORM rpc_assert_nivel('info_proyecto', 'E', v_org);
  IF NOT auth_ve_proyecto(p_project_id, v_org) THEN
    RAISE EXCEPTION 'takeos_auth: sin visibilidad de este proyecto.';
  END IF;

  SELECT * INTO v_cargo FROM project_cargos WHERE id = p_cargo_id AND project_id = p_project_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'asignar_cargo_a_miembro: el cargo no existe en este proyecto.'; END IF;

  SELECT id INTO v_user FROM auth.users WHERE lower(email) = lower(btrim(p_email));
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'asignar_cargo_a_miembro: no existe cuenta con ese correo. Usa una invitacion normal.';
  END IF;

  SELECT contact_id INTO v_contact
  FROM memberships
  WHERE user_id = v_user AND organization_id = v_org AND estado = 'activo'
  LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'asignar_cargo_a_miembro: esa persona no es miembro activo de la organizacion. Usa una invitacion normal.';
  END IF;

  IF v_cargo.tipo = 'externo' AND v_cargo.perfil IN ('Administrador','Finanzas') THEN
    RAISE EXCEPTION 'asignar_cargo_a_miembro: un cargo externo no puede tener perfil %.', v_cargo.perfil;
  END IF;

  SELECT nombre INTO v_nombre FROM contacts WHERE id = v_contact;

  UPDATE project_cargos
     SET estado = 'activo',
         invited_user_id = v_user,
         contact_id = coalesce(v_contact, contact_id),
         persona_nombre = coalesce(v_nombre, persona_nombre),
         updated_at = now()
   WHERE id = p_cargo_id;

  SELECT nombre_proyecto, productora INTO v_proj_nom, v_prod FROM projects WHERE id = p_project_id;
  v_notif := _crear_notificacion(
    v_user, v_org, p_project_id, 'cargo_asignado',
    'Te asignaron a un proyecto',
    format('Fuiste asignado como %s en el proyecto %s%s.',
           coalesce(nullif(v_cargo.cargo,''), 'colaborador'),
           coalesce(nullif(v_proj_nom,''), '(sin nombre)'),
           case when coalesce(v_prod,'') <> '' then ' de ' || v_prod else '' end),
    jsonb_build_object('cargo_id', p_cargo_id, 'cargo', v_cargo.cargo, 'proyecto', v_proj_nom)
  );

  RETURN jsonb_build_object('ok', true, 'cargo_id', p_cargo_id, 'user_id', v_user, 'notification_id', v_notif);
END;
$$;


ALTER FUNCTION "public"."asignar_cargo_a_miembro"("p_project_id" "text", "p_cargo_id" "text", "p_email" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."audit_trigger"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_new jsonb;
  v_old jsonb;
  v_org uuid;
  v_id  text;
begin
  v_new := case when tg_op <> 'DELETE' then to_jsonb(new) else null end;
  v_old := case when tg_op <> 'INSERT' then to_jsonb(old) else null end;
  v_org := coalesce(v_new->>'organization_id', v_old->>'organization_id')::uuid;
  v_id  := coalesce(
             v_new->>'id',         v_old->>'id',
             v_new->>'doc_id',     v_old->>'doc_id',
             v_new->>'project_id', v_old->>'project_id'
           );
  insert into audit_log(organization_id, actor_uid, accion, tabla, registro_id, cambios)
  values (
    v_org, auth.uid(), tg_op, tg_table_name, v_id,
    case tg_op
      when 'DELETE' then v_old
      when 'INSERT' then v_new
      else jsonb_build_object('old', v_old, 'new', v_new)
    end
  );
  return coalesce(new, old);
end;
$$;


ALTER FUNCTION "public"."audit_trigger"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."auth_codigo_perfil"("p_org" "uuid") RETURNS integer
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT prof.codigo
  FROM memberships m
  JOIN permission_profiles prof ON prof.id = m.profile_id
  WHERE m.user_id = auth.uid() AND m.organization_id = p_org AND m.estado = 'activo'
  LIMIT 1;
$$;


ALTER FUNCTION "public"."auth_codigo_perfil"("p_org" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."auth_es_miembro_org_txt"("p_org_text" "text") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM memberships m
    WHERE m.user_id = auth.uid()
      AND m.estado = 'activo'
      AND m.organization_id::text = p_org_text
  );
$$;


ALTER FUNCTION "public"."auth_es_miembro_org_txt"("p_org_text" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."auth_nivel"("p_modulo" "text", "p_org_id" "uuid") RETURNS "text"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT COALESCE(
    (SELECT pp.nivel
     FROM memberships m
     JOIN profile_permissions pp ON pp.profile_id = m.profile_id
     WHERE m.user_id = auth.uid()
       AND m.organization_id = p_org_id
       AND m.estado = 'activo'
       AND pp.modulo = p_modulo
     LIMIT 1),
    'none');
$$;


ALTER FUNCTION "public"."auth_nivel"("p_modulo" "text", "p_org_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."auth_nivel_org_txt"("p_modulo" "text", "p_org_text" "text") RETURNS "text"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT pp.nivel
  FROM memberships m
  JOIN profile_permissions pp ON pp.profile_id = m.profile_id
  WHERE m.user_id = auth.uid()
    AND m.estado = 'activo'
    AND m.organization_id::text = p_org_text
    AND pp.modulo = p_modulo
  LIMIT 1;
$$;


ALTER FUNCTION "public"."auth_nivel_org_txt"("p_modulo" "text", "p_org_text" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."auth_plan_permite"("p_feature" "text", "p_org" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$ SELECT EXISTS (SELECT 1 FROM plan_features f
        WHERE f.plan_codigo = (SELECT plan FROM organizations WHERE id = p_org)
          AND f.feature = p_feature) $$;


ALTER FUNCTION "public"."auth_plan_permite"("p_feature" "text", "p_org" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."auth_ve_proyecto"("p_project_id" "text", "p_org_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM memberships m
    WHERE m.user_id = auth.uid()
      AND m.organization_id = p_org_id
      AND m.estado = 'activo'
      AND (m.tipo = 'interno'
           OR EXISTS (SELECT 1 FROM project_cargos pc
                      WHERE pc.project_id = p_project_id
                        AND pc.invited_user_id = m.user_id
                        AND pc.estado = 'activo'))
  );
$$;


ALTER FUNCTION "public"."auth_ve_proyecto"("p_project_id" "text", "p_org_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cancelar_eliminacion_cuenta"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE v_uid uuid := auth.uid(); v_row scheduled_account_deletions%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'cancelar: sin sesion.'; END IF;
  SELECT * INTO v_row FROM scheduled_account_deletions WHERE user_id = v_uid;
  IF v_row.user_id IS NULL OR v_row.estado <> 'pendiente' THEN
    RAISE EXCEPTION 'cancelar: no hay eliminacion pendiente.';
  END IF;
  IF now() > v_row.execute_after THEN
    RAISE EXCEPTION 'cancelar: el plazo de recuperacion ya vencio.';
  END IF;
  UPDATE scheduled_account_deletions SET estado = 'cancelada', cancelled_at = now() WHERE user_id = v_uid;
  INSERT INTO audit_log (organization_id, actor_uid, accion, tabla, registro_id, cambios)
  VALUES (NULL, v_uid, 'cancelar_eliminacion_cuenta', 'scheduled_account_deletions', v_uid::text, '{}'::jsonb);
  RETURN jsonb_build_object('estado','cancelada');
END $$;


ALTER FUNCTION "public"."cancelar_eliminacion_cuenta"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cancelar_invitacion"("p_token" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_inv org_invitations%ROWTYPE;
  v_caller memberships%ROWTYPE;
  v_cod int;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'invitacion: sin sesion.'; END IF;
  SELECT * INTO v_inv FROM org_invitations WHERE id = p_token;
  IF v_inv.id IS NULL THEN RAISE EXCEPTION 'invitacion: no existe.'; END IF;
  SELECT * INTO v_caller FROM memberships WHERE user_id = v_uid AND organization_id = v_inv.organization_id AND estado = 'activo' LIMIT 1;
  IF v_caller.id IS NULL THEN RAISE EXCEPTION 'invitacion: no perteneces a esta organizacion.'; END IF;
  SELECT codigo INTO v_cod FROM permission_profiles WHERE id = v_caller.profile_id;
  IF v_cod NOT IN (1,2) THEN RAISE EXCEPTION 'invitacion: cancelar es facultad de Administrador o Ejecutivo.'; END IF;
  IF v_inv.estado <> 'pendiente' THEN RAISE EXCEPTION 'invitacion: ya no esta pendiente (%).', v_inv.estado; END IF;
  UPDATE org_invitations SET estado = 'cancelada', updated_at = now() WHERE id = v_inv.id;
  IF v_inv.invited_user_id IS NOT NULL THEN
    DELETE FROM memberships WHERE user_id = v_inv.invited_user_id AND organization_id = v_inv.organization_id AND estado = 'pendiente';
  END IF;
END;
$$;


ALTER FUNCTION "public"."cancelar_invitacion"("p_token" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cerrar_invitacion"("p_token" "text", "p_resultado" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_email text;
  v_inv org_invitations%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'invitacion: sin sesion.'; END IF;
  IF p_resultado NOT IN ('aceptada','rechazada') THEN RAISE EXCEPTION 'invitacion: resultado invalido.'; END IF;
  SELECT lower(email) INTO v_email FROM auth.users WHERE id = v_uid;
  SELECT * INTO v_inv FROM org_invitations WHERE id = p_token;
  IF v_inv.id IS NULL THEN RAISE EXCEPTION 'invitacion: no existe.'; END IF;
  IF v_inv.invited_user_id IS DISTINCT FROM v_uid AND lower(coalesce(v_inv.email,'')) <> v_email THEN
    RAISE EXCEPTION 'invitacion: no es tuya.';
  END IF;

  -- Idempotencia
  IF v_inv.estado = p_resultado THEN RETURN; END IF;
  IF v_inv.estado IN ('aceptada','rechazada','cancelada','expirada') THEN
    RAISE EXCEPTION 'invitacion: ya estaba cerrada (%).', v_inv.estado;
  END IF;

  UPDATE org_invitations SET estado = p_resultado, invited_user_id = v_uid, updated_at = now() WHERE id = v_inv.id;
  IF p_resultado = 'rechazada' THEN
    DELETE FROM memberships WHERE user_id = v_uid AND organization_id = v_inv.organization_id AND estado = 'pendiente';
    IF v_inv.cargo_id IS NOT NULL THEN
      UPDATE project_cargos SET estado = 'rechazo', updated_at = now() WHERE id = v_inv.cargo_id AND estado = 'pendiente';
    END IF;
  END IF;
END;
$$;


ALTER FUNCTION "public"."cerrar_invitacion"("p_token" "text", "p_resultado" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."consentir_invitacion"("p_org_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_email text;
  v_inv org_invitations%ROWTYPE;
  v_mem memberships%ROWTYPE;
  v_falta text[];
  v_req_id uuid;
  v_proy text;
  v_contact_id text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'consentir_invitacion: sin sesion.'; END IF;
  SELECT lower(email) INTO v_email FROM auth.users WHERE id = v_uid;

  SELECT * INTO v_inv FROM org_invitations
   WHERE organization_id=p_org_id AND estado='pendiente' AND expires_at>now()
     AND (invited_user_id=v_uid OR lower(coalesce(email,''))=v_email)
   ORDER BY created_at DESC LIMIT 1;

  SELECT * INTO v_mem FROM memberships WHERE user_id=v_uid AND organization_id=p_org_id LIMIT 1;

  -- Idempotencia: ya activo y sin invitacion pendiente
  IF v_mem.id IS NOT NULL AND v_mem.estado='activo' AND v_inv.id IS NULL THEN
    RETURN jsonb_build_object('estado','activo','contact_id', coalesce(v_mem.contact_id,''));
  END IF;

  IF v_inv.id IS NULL AND (v_mem.id IS NULL OR v_mem.estado <> 'activo') THEN
    RAISE EXCEPTION 'consentir_invitacion: no tienes una invitacion vigente a esta organizacion.';
  END IF;

  -- Gate de requisitos CANONICO (error tipado)
  v_falta := _requisitos_faltantes(v_uid);
  IF array_length(v_falta,1) IS NOT NULL THEN
    RAISE EXCEPTION 'TAKEOS_REQUISITOS:%', array_to_string(v_falta, ',');
  END IF;

  -- REBIND: el correo de la invitacion difiere del correo de sesion -> requiere aprobacion de quien asigno
  IF v_inv.id IS NOT NULL AND lower(coalesce(v_inv.email,'')) <> v_email THEN
    SELECT id INTO v_req_id FROM invitation_rebind_requests
     WHERE invitation_id=v_inv.id AND claiming_user_id=v_uid AND estado='pendiente';

    IF v_req_id IS NULL THEN
      INSERT INTO invitation_rebind_requests (invitation_id, organization_id, claiming_user_id, invited_email, claiming_email, cargo_id, project_id)
      VALUES (v_inv.id, p_org_id, v_uid, v_inv.email, v_email, v_inv.cargo_id, v_inv.project_id)
      RETURNING id INTO v_req_id;

      SELECT nombre_proyecto INTO v_proy FROM projects WHERE id = v_inv.project_id;

      IF EXISTS (SELECT 1 FROM memberships WHERE user_id=v_inv.invited_by AND organization_id=p_org_id AND estado='activo') THEN
        PERFORM _crear_notificacion(v_inv.invited_by, p_org_id, v_inv.project_id, 'rebind_solicitado',
          'Aprobacion de correo pendiente',
          format('La invitacion enviada a %s fue reclamada por %s%s. Aprueba el cambio de correo para darle acceso.',
                 v_inv.email, v_email, coalesce(' ('||v_proy||')','')),
          jsonb_build_object('request_id', v_req_id, 'invitation_id', v_inv.id,
            'invited_email', v_inv.email, 'claiming_email', v_email, 'cargo_id', v_inv.cargo_id));
      ELSE
        PERFORM _crear_notificacion(m.user_id, p_org_id, v_inv.project_id, 'rebind_solicitado',
          'Aprobacion de correo pendiente',
          format('La invitacion enviada a %s fue reclamada por %s. Aprueba el cambio de correo para darle acceso.', v_inv.email, v_email),
          jsonb_build_object('request_id', v_req_id, 'invitation_id', v_inv.id,
            'invited_email', v_inv.email, 'claiming_email', v_email, 'cargo_id', v_inv.cargo_id))
        FROM memberships m JOIN permission_profiles pp ON pp.id=m.profile_id
        WHERE m.organization_id=p_org_id AND m.estado='activo' AND pp.codigo=1;
      END IF;
    END IF;

    RETURN jsonb_build_object('estado','pendiente_aprobacion','request_id', v_req_id, 'motivo','rebind_correo',
      'invited_email', v_inv.email, 'claiming_email', v_email);
  END IF;

  -- Sin rebind: admite directo
  v_contact_id := _admitir_persona(v_uid, v_inv.id, NULL);
  RETURN jsonb_build_object('estado','activo','contact_id', v_contact_id);
END;
$$;


ALTER FUNCTION "public"."consentir_invitacion"("p_org_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."eliminar_proyecto"("p_id" "text") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_org uuid;
BEGIN
  IF p_id IS NULL OR p_id = '' THEN RAISE EXCEPTION 'eliminar_proyecto: falta id'; END IF;
  SELECT organization_id INTO v_org FROM projects WHERE id = p_id;
  IF v_org IS NULL THEN RAISE EXCEPTION 'eliminar_proyecto: proyecto % no existe', p_id; END IF;

  PERFORM rpc_assert_nivel('eliminar_proyecto', 'E', v_org);  -- solo Administrador

  UPDATE projects SET deleted_at = now(), updated_at = now() WHERE id = p_id;
  RETURN p_id;
END;
$$;


ALTER FUNCTION "public"."eliminar_proyecto"("p_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."exportar_herramienta"("p_document_id" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_uid   uuid := auth.uid();
  v_doc   user_tool_documents%ROWTYPE;
  v_hash  text;
  v_last  user_tool_versions%ROWTYPE;
  v_num   int;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'exportar: sin sesion.'; END IF;

  SELECT * INTO v_doc FROM user_tool_documents WHERE id = p_document_id AND user_id = v_uid;
  IF v_doc.id IS NULL THEN RAISE EXCEPTION 'exportar: el documento no existe o no es tuyo.'; END IF;

  v_hash := md5(coalesce(v_doc.data::text, ''));

  SELECT * INTO v_last FROM user_tool_versions
   WHERE document_id = p_document_id ORDER BY numero DESC LIMIT 1;

  -- Export SIN cambios: no genera version ni toca el archivo (mismo modelo que proyectos)
  IF v_last.id IS NOT NULL AND v_last.data_hash = v_hash THEN
    RETURN jsonb_build_object('version_creada', false, 'numero', v_last.numero);
  END IF;

  v_num := coalesce(v_last.numero, 0) + 1;
  INSERT INTO user_tool_versions (document_id, user_id, numero, data, data_hash)
  VALUES (p_document_id, v_uid, v_num, v_doc.data, v_hash);

  -- Archivo permanente: siempre refleja la ULTIMA version exportada (upsert por documento)
  INSERT INTO user_tool_archive (user_id, document_id, herramienta, nombre, fecha_rodaje, data, exported_at)
  VALUES (v_uid, p_document_id, v_doc.herramienta, v_doc.nombre, v_doc.fecha_rodaje, v_doc.data, now())
  ON CONFLICT (document_id) WHERE document_id IS NOT NULL
  DO UPDATE SET data = EXCLUDED.data, nombre = EXCLUDED.nombre,
                fecha_rodaje = EXCLUDED.fecha_rodaje, exported_at = now();

  RETURN jsonb_build_object('version_creada', true, 'numero', v_num);
END $$;


ALTER FUNCTION "public"."exportar_herramienta"("p_document_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."exportar_mis_datos"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE v_uid uuid := auth.uid(); v_payload jsonb; v_doc jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'export: sin sesion.'; END IF;
  v_payload := jsonb_build_object(
    'perfil',            (SELECT to_jsonb(up) FROM user_profiles up WHERE up.user_id = v_uid),
    'cuentas_bancarias', (SELECT coalesce(jsonb_agg(to_jsonb(ba)),'[]'::jsonb) FROM user_bank_accounts ba WHERE ba.user_id = v_uid),
    'membresias',        (SELECT coalesce(jsonb_agg(jsonb_build_object('organizacion',o.nombre,'tipo',m.tipo,'perfil',pp.nombre,'estado',m.estado)),'[]'::jsonb)
                          FROM memberships m JOIN organizations o ON o.id = m.organization_id JOIN permission_profiles pp ON pp.id = m.profile_id WHERE m.user_id = v_uid),
    'consentimientos',   (SELECT coalesce(jsonb_agg(jsonb_build_object('organizacion',o.nombre,'version',dc.terms_version,'aceptado',dc.accepted_at,'revocado',dc.revoked_at)),'[]'::jsonb)
                          FROM data_consents dc JOIN organizations o ON o.id = dc.organization_id WHERE dc.user_id = v_uid),
    'actividad_resumen', (SELECT jsonb_build_object('eventos_registrados', count(*)) FROM audit_log WHERE actor_uid = v_uid)
  );
  v_doc := jsonb_build_object(
    'titular', v_uid, 'generado_at', now(), 'formato', 'TakeOS export v1',
    'datos', v_payload,
    'integridad_md5', md5(v_payload::text)
  );
  INSERT INTO audit_log (organization_id, actor_uid, accion, tabla, registro_id, cambios)
  VALUES (NULL, v_uid, 'exportar_mis_datos', 'user_profiles', v_uid::text, jsonb_build_object('integridad_md5', v_doc->>'integridad_md5'));
  RETURN v_doc;
END $$;


ALTER FUNCTION "public"."exportar_mis_datos"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fn_jsarr"("x" "jsonb") RETURNS "jsonb"
    LANGUAGE "sql" IMMUTABLE
    AS $$ SELECT CASE WHEN jsonb_typeof(x) = 'array' THEN x ELSE '[]'::jsonb END; $$;


ALTER FUNCTION "public"."fn_jsarr"("x" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fn_norm_bank_accounts"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  IF NEW.es_extranjera THEN
    NEW.numero_cuenta := nullif(btrim(NEW.numero_cuenta), '');
  ELSE
    NEW.numero_cuenta := nullif(regexp_replace(coalesce(NEW.numero_cuenta,''), '[^0-9]', '', 'g'), '');
  END IF;
  NEW.bank_codigo_sbif := nullif(btrim(NEW.bank_codigo_sbif), '');
  RETURN NEW;
END; $$;


ALTER FUNCTION "public"."fn_norm_bank_accounts"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fn_norm_companies"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.rut             := fn_norm_rut(NEW.rut);
  NEW.nombre_fantasia := btrim(NEW.nombre_fantasia);
  NEW.razon_social    := nullif(btrim(NEW.razon_social), '');
  RETURN NEW;
END; $$;


ALTER FUNCTION "public"."fn_norm_companies"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fn_norm_contacts"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.nombre           := btrim(NEW.nombre);
  NEW.rut              := fn_norm_rut(NEW.rut);
  NEW.email            := fn_norm_email(NEW.email);
  NEW.telefono         := fn_norm_fono(NEW.telefono);
  NEW.direccion        := fn_title(NEW.direccion);
  NEW.direccion_linea2 := fn_title(NEW.direccion_linea2);
  NEW.comuna           := fn_title(NEW.comuna);
  NEW.ciudad           := fn_title(NEW.ciudad);
  NEW.region           := fn_title(NEW.region);
  NEW.dte_habitual     := nullif(btrim(NEW.dte_habitual), '');
  RETURN NEW;
END; $$;


ALTER FUNCTION "public"."fn_norm_contacts"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fn_norm_email"("v" "text") RETURNS "text"
    LANGUAGE "sql" IMMUTABLE
    AS $$ SELECT nullif(lower(btrim(v)), ''); $$;


ALTER FUNCTION "public"."fn_norm_email"("v" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fn_norm_fono"("v" "text") RETURNS "text"
    LANGUAGE "plpgsql" IMMUTABLE
    AS $_$
DECLARE x text; d text;
BEGIN
  IF v IS NULL OR btrim(v) = '' THEN RETURN NULL; END IF;
  x := btrim(v);
  IF left(x,1) = '+' THEN
    d := regexp_replace(x, '[^0-9]', '', 'g');
    RETURN nullif('+' || d, '+');
  END IF;
  d := regexp_replace(x, '[^0-9]', '', 'g');
  IF d = '' THEN RETURN NULL; END IF;
  IF d ~ '^56[0-9]{9}$' THEN        -- 56 + 9 dígitos nacionales  -> +56...
    RETURN '+' || d;
  ELSIF d ~ '^9[0-9]{8}$' THEN      -- móvil chileno 9XXXXXXXX    -> +56 9...
    RETURN '+56' || d;
  ELSE
    RETURN d;                       -- ambiguo / incompleto: se deja, no se inventa
  END IF;
END;
$_$;


ALTER FUNCTION "public"."fn_norm_fono"("v" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fn_norm_legal_documents"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.rut := fn_norm_rut(NEW.rut);
  RETURN NEW;
END; $$;


ALTER FUNCTION "public"."fn_norm_legal_documents"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fn_norm_organizations"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.rut := fn_norm_rut(NEW.rut);
  RETURN NEW;
END; $$;


ALTER FUNCTION "public"."fn_norm_organizations"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fn_norm_rut"("v" "text") RETURNS "text"
    LANGUAGE "plpgsql" IMMUTABLE
    AS $$
DECLARE x text;
BEGIN
  IF v IS NULL OR btrim(v) = '' THEN RETURN NULL; END IF;
  x := regexp_replace(upper(btrim(v)), '[^0-9K]', '', 'g');
  IF length(x) < 2 THEN RETURN nullif(x,''); END IF;
  RETURN left(x, length(x)-1) || '-' || right(x, 1);
END;
$$;


ALTER FUNCTION "public"."fn_norm_rut"("v" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fn_title"("v" "text") RETURNS "text"
    LANGUAGE "sql" IMMUTABLE
    AS $$
  SELECT nullif(
    regexp_replace(
      regexp_replace(
        regexp_replace(
          -- initcap por segmento separado por apostrofo => capitaliza tambien tras ' (O'Higgins, D'Angelo)
          (SELECT string_agg(initcap(p), chr(39)) FROM unnest(string_to_array(btrim(v), chr(39))) p),
          '(\S\s+)Del\y', '\1del', 'g'),
        '(\S\s+)De\y',  '\1de',  'g'),
      '(\S\s+)Y\y',     '\1y',   'g'),
  '');
$$;


ALTER FUNCTION "public"."fn_title"("v" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_company_org"("p_company_id" "text") RETURNS "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT organization_id FROM companies WHERE id = p_company_id LIMIT 1;
$$;


ALTER FUNCTION "public"."get_company_org"("p_company_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_contact_org"("p_contact_id" "text") RETURNS "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT organization_id FROM contacts WHERE id = p_contact_id LIMIT 1;
$$;


ALTER FUNCTION "public"."get_contact_org"("p_contact_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_project_org"("p_project_id" "text") RETURNS "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT organization_id FROM projects WHERE id = p_project_id LIMIT 1;
$$;


ALTER FUNCTION "public"."get_project_org"("p_project_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_send_org"("p_send_id" "uuid") RETURNS "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT organization_id FROM notification_sends WHERE id = p_send_id;
$$;


ALTER FUNCTION "public"."get_send_org"("p_send_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_task_project"("p_task_id" "text") RETURNS "text"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT project_id FROM project_tasks WHERE id = p_task_id LIMIT 1;
$$;


ALTER FUNCTION "public"."get_task_project"("p_task_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."guardar_cargos"("p_project_id" "text", "p_cargos" "jsonb") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_org    uuid;
  elem     jsonb;
  v_count  int := 0;
  v_pos    int := 0;
  v_cid    text;
  v_tipo   text;
  v_perfil text;
BEGIN
  IF p_project_id IS NULL OR p_project_id = '' THEN
    RAISE EXCEPTION 'guardar_cargos: falta project_id';
  END IF;
  SELECT organization_id INTO v_org FROM projects WHERE id = p_project_id;
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'guardar_cargos: proyecto inexistente';
  END IF;

  -- Gate: editar cargos = info_proyecto 'E' (exactamente Administrador/Ejecutivo) + visibilidad del proyecto
  PERFORM rpc_assert_nivel('info_proyecto', 'E', v_org);
  IF NOT auth_ve_proyecto(p_project_id, v_org) THEN
    RAISE EXCEPTION 'takeos_auth: sin visibilidad de este proyecto.';
  END IF;

  -- Contrato estado-completo: el cliente manda todo; el RPC reemplaza todo
  DELETE FROM project_cargos WHERE project_id = p_project_id;

  FOR elem IN SELECT * FROM jsonb_array_elements(coalesce(p_cargos, '[]'::jsonb)) LOOP
    v_tipo   := coalesce(nullif(elem->>'tipo',''), 'interno');
    v_perfil := nullif(elem->>'perfil','');

    -- Regla del mockup, ahora server-side: un externo no puede recibir Administrador ni Finanzas
    IF v_tipo = 'externo' AND v_perfil IN ('Administrador','Finanzas') THEN
      RAISE EXCEPTION 'guardar_cargos: un externo no puede recibir el perfil %', v_perfil;
    END IF;

    v_cid := (SELECT id FROM contacts
              WHERE id = nullif(elem->>'contactId','') AND organization_id = v_org AND deleted_at IS NULL);

    INSERT INTO project_cargos (id, project_id, cargo, custom, persona_nombre, contact_id, tipo, perfil, estado, invited_user_id, posicion)
    VALUES (
      coalesce(nullif(elem->>'id',''), 'CG-' || substr(md5(random()::text || clock_timestamp()::text), 1, 8)),
      p_project_id,
      coalesce(nullif(elem->>'cargo',''), '(sin cargo)'),
      coalesce((elem->>'custom')::boolean, false),
      nullif(elem->>'personaNombre',''),
      v_cid,
      v_tipo,
      v_perfil,
      coalesce(nullif(elem->>'estado',''), 'sin-asignar'),
      nullif(elem->>'invitedUserId','')::uuid,
      v_pos
    );
    v_pos   := v_pos + 1;
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;


ALTER FUNCTION "public"."guardar_cargos"("p_project_id" "text", "p_cargos" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."guardar_consentimiento_cookies"("p_analitica" boolean, "p_marketing" boolean, "p_version" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE v_uid uuid := auth.uid(); v_id uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'cookies: sin sesion.'; END IF;
  IF coalesce(btrim(p_version),'') = '' THEN RAISE EXCEPTION 'cookies: falta version.'; END IF;
  INSERT INTO cookie_consents (user_id, esenciales, analitica, marketing, version)
  VALUES (v_uid, true, coalesce(p_analitica,false), coalesce(p_marketing,false), p_version)
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;


ALTER FUNCTION "public"."guardar_consentimiento_cookies"("p_analitica" boolean, "p_marketing" boolean, "p_version" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."guardar_operaciones_4a"("p" "jsonb") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_id text := p->>'id';
  v_org uuid;
  elem jsonb;
  v_pos int;
begin
  if v_id is null or v_id = '' then
    raise exception 'guardar_operaciones_4a: falta id';
  end if;

  -- Gate C: derivar organización y verificar permiso (fail-CLOSED)
  select organization_id into v_org from projects where id = v_id;
  if v_org is null then raise exception 'guardar_operaciones_4a: proyecto % sin organization_id', v_id; end if;
  perform rpc_assert_nivel('operacion_creatividad', 'E', v_org);

  delete from project_shoot_days where project_id = v_id;
  v_pos := 0;
  for elem in select * from jsonb_array_elements(coalesce(p->'rodajes', '[]'::jsonb)) loop
    insert into project_shoot_days (project_id, dia_id, fecha, activo, descripcion, posicion)
    values (v_id, elem->>'diaId', nullif(elem->>'fecha','')::date,
            coalesce((elem->>'activo')::boolean, false), nullif(elem->>'descripcion',''), v_pos);
    v_pos := v_pos + 1;
  end loop;

  if jsonb_typeof(p->'planRodaje') = 'object' then
    insert into project_shooting_plan (project_id, plan, updated_at)
    values (v_id, p->'planRodaje', now())
    on conflict (project_id) do update set plan = excluded.plan, updated_at = now();
  else
    delete from project_shooting_plan where project_id = v_id;
  end if;

  if jsonb_typeof(p->'hojaLlamado') = 'object' then
    insert into project_call_sheet (project_id, data, updated_at)
    values (v_id, p->'hojaLlamado', now())
    on conflict (project_id) do update set data = excluded.data, updated_at = now();
  else
    delete from project_call_sheet where project_id = v_id;
  end if;

  return v_id;
end;
$$;


ALTER FUNCTION "public"."guardar_operaciones_4a"("p" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."guardar_operaciones_4b"("p" "jsonb") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_id  text := p->>'id';
  v_org uuid := (select organization_id from projects where id = p->>'id');
  v_g   jsonb := coalesce(p->'gastosOp', '{}'::jsonb);
  v_a   jsonb := coalesce(p->'asistentes', '{}'::jsonb);
  elem  jsonb;
  v_pos int;
begin
  if v_id is null or v_id = '' then raise exception 'guardar_operaciones_4b: falta id'; end if;
  if v_org is null then raise exception 'guardar_operaciones_4b: proyecto inexistente (%)', v_id; end if;
  perform rpc_assert_nivel('operacion_creatividad', 'E', v_org);  -- Gate C

  -- Responsables se maneja aparte (Punto 2): no va en este borrado masivo.
  delete from project_locations     where project_id = v_id;
  delete from project_crew_extra    where project_id = v_id;
  delete from project_external_crew where project_id = v_id;
  delete from project_op_budgets    where project_id = v_id;

  v_pos := 0;
  for elem in select * from jsonb_array_elements(coalesce(p->'locaciones', '[]'::jsonb)) loop
    insert into project_locations (project_id, loc_id, estado, costo, contratacion, notas_proy, posicion)
    values (v_id, elem->>'locId', nullif(elem->>'estado',''), nullif(elem->>'costo','')::numeric,
            nullif(elem->>'contratacion',''), nullif(elem->>'notasProy',''), v_pos);
    v_pos := v_pos + 1;
  end loop;

  for elem in select * from jsonb_array_elements(coalesce(p->'crewExtra', '[]'::jsonb)) loop
    insert into project_crew_extra (project_id, nombre, contact_id, medio_transporte)
    values (v_id, elem->>'nombre',
            (select id from contacts where organization_id = v_org and lower(nombre) = lower(elem->>'nombre') and deleted_at is null limit 1),
            nullif(elem->>'medioTransporte',''));
  end loop;

  v_pos := 0;
  for elem in select * from jsonb_array_elements(coalesce(p->'crewExternos', '[]'::jsonb)) loop
    insert into project_external_crew (project_id, tipo, nombre, rol, telefono, restriccion, direccion, comuna, posicion)
    values (v_id, nullif(elem->>'tipo',''), nullif(elem->>'nombre',''), nullif(elem->>'rol',''),
            nullif(elem->>'telefono',''), nullif(elem->>'restriccion',''), nullif(elem->>'direccion',''),
            nullif(elem->>'comuna',''), v_pos);
    v_pos := v_pos + 1;
  end loop;

  -- PUNTO 2: responsables de sección — solo Administrador(1)/Ejecutivo(2) reescriben;
  -- los demás perfiles PRESERVAN lo existente (no se toca).
  if auth_codigo_perfil(v_org) in (1,2) then
    delete from project_section_responsibles where project_id = v_id;
    for elem in select * from jsonb_array_elements(coalesce(p->'responsables', '[]'::jsonb)) loop
      insert into project_section_responsibles (project_id, seccion, nombre, contact_id)
      values (v_id, elem->>'seccion', nullif(elem->>'nombre',''),
              (select id from contacts where organization_id = v_org and lower(nombre) = lower(elem->>'nombre') and deleted_at is null limit 1));
    end loop;
  end if;

  insert into project_operations (project_id, asistentes_cliente, asistentes_agencia, asistentes_externo,
                                  caja_prod, op_movimientos, op_lineas_extra, updated_at)
  values (v_id,
          coalesce(nullif(v_a->>'cliente','')::int, 0),
          coalesce(nullif(v_a->>'agencia','')::int, 0),
          coalesce(nullif(v_a->>'externo','')::int, 0),
          coalesce(nullif(v_g->>'cajaProd','')::numeric, 0),
          coalesce(v_g->'movimientos', '[]'::jsonb),
          coalesce(v_g->'lineasExtra', '[]'::jsonb),
          now())
  on conflict (project_id) do update set
    asistentes_cliente = excluded.asistentes_cliente,
    asistentes_agencia = excluded.asistentes_agencia,
    asistentes_externo = excluded.asistentes_externo,
    caja_prod          = excluded.caja_prod,
    op_movimientos     = excluded.op_movimientos,
    op_lineas_extra    = excluded.op_lineas_extra,
    updated_at         = now();

  v_pos := 0;
  for elem in select * from jsonb_array_elements(coalesce(v_g->'presupuestos', '[]'::jsonb)) loop
    insert into project_op_budgets (id, project_id, nombre, linea, resp, asignado, posicion)
    values (coalesce(nullif(elem->>'id',''), 'opb_' || replace(gen_random_uuid()::text, '-', '')),
            v_id, nullif(elem->>'nombre',''), nullif(elem->>'linea',''), nullif(elem->>'resp',''),
            nullif(elem->>'asignado','')::numeric, v_pos);
    v_pos := v_pos + 1;
  end loop;

  return v_id;
end;
$$;


ALTER FUNCTION "public"."guardar_operaciones_4b"("p" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."guardar_operaciones_4c"("p" "jsonb") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_id  text := p->>'id';
  v_org uuid;
  t     jsonb;
  c     jsonb;
  a     jsonb;
  sg    jsonb;
  v_tid text;
  v_tpos int; v_cpos int; v_apos int; v_spos int;
begin
  if v_id is null or v_id = '' then raise exception 'guardar_operaciones_4c: falta id'; end if;

  select organization_id into v_org from projects where id = v_id;
  if v_org is null then raise exception 'guardar_operaciones_4c: proyecto % sin organization_id', v_id; end if;

  if auth_codigo_perfil(v_org) is null then
    raise exception 'takeos_auth: sin membresía activa para esta organización.';
  end if;

  -- TAREAS (módulo 'tareas' → habilita a Finanzas/CFO)
  if auth_nivel('tareas', v_org) = 'E' then
    delete from project_tasks where project_id = v_id;   -- cascada a comentarios/adjuntos
    v_tpos := 0;
    for t in select * from jsonb_array_elements(coalesce(p->'tareas', '[]'::jsonb)) loop
      v_tid := coalesce(nullif(t->>'id',''), 'tk_' || replace(gen_random_uuid()::text, '-', ''));
      insert into project_tasks (id, project_id, seccion, texto, asignado_a, creado_por, estado, creada_ts, posicion)
      values (v_tid, v_id, nullif(t->>'seccion',''), nullif(t->>'texto',''), nullif(t->>'asignadoA',''),
              nullif(t->>'creadoPor',''), nullif(t->>'estado',''), nullif(t->>'creadaTs','')::bigint, v_tpos);

      v_cpos := 0;
      for c in select * from jsonb_array_elements(coalesce(t->'comentarios', '[]'::jsonb)) loop
        insert into task_comments (id, task_id, autor, texto, ts, posicion)
        values (coalesce(nullif(c->>'id',''), 'cm_' || replace(gen_random_uuid()::text, '-', '')),
                v_tid, nullif(c->>'autor',''), nullif(c->>'texto',''), nullif(c->>'ts',''), v_cpos);
        v_cpos := v_cpos + 1;
      end loop;

      v_apos := 0;
      for a in select * from jsonb_array_elements(coalesce(t->'adjuntos', '[]'::jsonb)) loop
        insert into task_attachments (task_id, nombre_original, storage_path, posicion)
        values (v_tid, nullif(a->>'name',''), nullif(a->>'path',''), v_apos);
        v_apos := v_apos + 1;
      end loop;

      v_tpos := v_tpos + 1;
    end loop;
  end if;

  -- SEÑALES (módulo 'operacion_creatividad')
  if auth_nivel('operacion_creatividad', v_org) = 'E' then
    delete from project_signals where project_id = v_id;
    v_spos := 0;
    for sg in select * from jsonb_array_elements(coalesce(p->'senales', '[]'::jsonb)) loop
      insert into project_signals (id, project_id, tipo, seccion, descripcion, creada_ts, visto_por, meta, posicion)
      values (coalesce(nullif(sg->>'id',''), 'sg_' || replace(gen_random_uuid()::text, '-', '')),
              v_id, nullif(sg->>'tipo',''), nullif(sg->>'seccion',''), nullif(sg->>'descripcion',''),
              nullif(sg->>'ts','')::bigint,
              coalesce((select array_agg(x) from jsonb_array_elements_text(coalesce(sg->'vistoPor', '[]'::jsonb)) x), '{}'::text[]),
              case when coalesce(sg->>'rolObjetivo','') <> '' then jsonb_build_object('rolObjetivo', sg->>'rolObjetivo') else null end,
              v_spos);
      v_spos := v_spos + 1;
    end loop;
  end if;

  return v_id;
end;
$$;


ALTER FUNCTION "public"."guardar_operaciones_4c"("p" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."guardar_operaciones_4e"("p" "jsonb") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_id    text := p->>'id';
  v_org   uuid;
  d       jsonb;
  v_pos   int;
begin
  if v_id is null or v_id = '' then raise exception 'guardar_operaciones_4e: falta id'; end if;

  select organization_id into v_org from projects where id = v_id;
  if v_org is null then raise exception 'guardar_operaciones_4e: proyecto % sin organization_id', v_id; end if;
  perform rpc_assert_nivel('operacion_creatividad', 'E', v_org);  -- Gate C

  delete from project_documents where project_id = v_id;

  v_pos := 0;
  for d in select * from jsonb_array_elements(coalesce(p->'documentos', '[]'::jsonb)) loop
    insert into project_documents
      (id, project_id, organization_id, categoria, titulo, url, notas, archivo_nombre, archivo_path, archivo_size, ts, posicion)
    values
      (coalesce(nullif(d->>'id',''), 'doc-' || replace(gen_random_uuid()::text, '-', '')),
       v_id, v_org,
       nullif(d->>'categoria',''), nullif(d->>'titulo',''), nullif(d->>'url',''), nullif(d->>'notas',''),
       nullif(d->>'archivoNombre',''), nullif(d->>'archivoPath',''),
       nullif(d->>'archivoSize','')::bigint,
       nullif(d->>'ts',''), v_pos);
    v_pos := v_pos + 1;
  end loop;

  return v_id;
end;
$$;


ALTER FUNCTION "public"."guardar_operaciones_4e"("p" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."guardar_pagos_cliente"("p_project_id" "text", "p_pagos" "jsonb") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_org   uuid;
  elem    jsonb;
  v_count int := 0;
  v_pos   int := 0;
BEGIN
  IF p_project_id IS NULL OR p_project_id = '' THEN
    RAISE EXCEPTION 'guardar_pagos_cliente: falta project_id';
  END IF;
  SELECT organization_id INTO v_org FROM projects WHERE id = p_project_id;
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'guardar_pagos_cliente: proyecto inexistente';
  END IF;

  -- Gate: registrar pagos = finanzas_consolidada 'E' (Administrador / Finanzas-CFO) + ver el proyecto
  PERFORM rpc_assert_nivel('finanzas_consolidada', 'E', v_org);
  PERFORM rpc_assert_plan('finanzas', v_org);
  IF NOT auth_ve_proyecto(p_project_id, v_org) THEN
    RAISE EXCEPTION 'takeos_auth: sin visibilidad de este proyecto.';
  END IF;

  -- Contrato estado-completo: el cliente manda todos los pagos; el RPC reemplaza todo
  DELETE FROM project_client_payments WHERE project_id = p_project_id;

  FOR elem IN SELECT * FROM jsonb_array_elements(coalesce(p_pagos, '[]'::jsonb)) LOOP
    INSERT INTO project_client_payments (project_id, monto, nota, fecha, posicion)
    VALUES (
      p_project_id,
      coalesce((elem->>'monto')::numeric, 0),
      nullif(elem->>'nota', ''),
      coalesce((elem->>'fecha')::date, current_date),
      v_pos
    );
    v_pos   := v_pos + 1;
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;


ALTER FUNCTION "public"."guardar_pagos_cliente"("p_project_id" "text", "p_pagos" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."guardar_proyecto"("p" "jsonb") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_id    text := p->>'id';
  v_org   uuid := coalesce(
                    (select organization_id from projects where id = p->>'id'),
                    nullif(p->>'organizationId','')::uuid,
                    (select organization_id from projects where id = p->>'id')
                  );
  v_fin   jsonb := case when jsonb_typeof(p->'finanzas')='object' then p->'finanzas' else '{}'::jsonb end;
  v_cot   jsonb := p->'cotizacion';
  v_existe boolean;
  v_n_info text;
  v_n_pres text;
  v_n_cot  text;
  elem    jsonb;
  v_cid   text;
  v_pos   int;
begin
  if v_id is null or v_id = '' then raise exception 'guardar_proyecto: falta id'; end if;
  if v_org is null then raise exception 'guardar_proyecto: no se pudo resolver organization_id'; end if;

  v_existe := exists(select 1 from projects where id = v_id);

  if not v_existe then
    perform rpc_assert_nivel('crear_proyecto', 'E', v_org);
    perform rpc_assert_cupo_proyecto(v_org);
  else
    if auth_codigo_perfil(v_org) is null then
      raise exception 'takeos_auth: sin membresía activa para esta organización.';
    end if;
  end if;

  v_n_info := coalesce(auth_nivel('info_proyecto', v_org), 'none');
  v_n_pres := coalesce(auth_nivel('presupuesto',   v_org), 'none');
  v_n_cot  := coalesce(auth_nivel('cotizacion',    v_org), 'none');

  -- ════ SECCIÓN INFO_PROYECTO: cabecera (basica + comercial) + asignaciones ════
  if (not v_existe) or v_n_info = 'E' then
    -- Basico: visible para cualquier colaborador con auth_ve_proyecto
    insert into projects (
      id, organization_id, nombre_proyecto, categoria, es_remunerado,
      servicio, productora, fecha_entrega_final, estado
    ) values (
      v_id, v_org, p->>'nombreProyecto', coalesce(nullif(p->>'categoria',''),'publicidad'),
      coalesce((p->>'esRemunerado')::boolean, true),
      nullif(p->>'servicio',''), nullif(p->>'productora',''),
      nullif(p->>'fechaEntregaFinal','')::date,
      coalesce(nullif(p->>'estado',''),'venta')
    )
    on conflict (id) do update set
      nombre_proyecto = excluded.nombre_proyecto,
      servicio = excluded.servicio, productora = excluded.productora,
      fecha_entrega_final = excluded.fecha_entrega_final, estado = excluded.estado,
      updated_at = now();

    -- Comercial / PII: tabla aparte, gateada por info_proyecto en lectura
    insert into project_commercial (
      project_id, cliente_empresa_id, cliente_contacto_id, agencia_empresa_id, cliente_texto, agencia_texto,
      derechos_tiempo, derechos_plataformas, derechos_territorio,
      contacto_cliente, mail_contacto_cliente, telefono_contacto_cliente,
      contacto_agencia, mail_contacto_agencia, telefono_contacto_agencia,
      condicion_pago, fecha_cotizacion, fecha_aprobacion, fecha_pago
    ) values (
      v_id,
      (select id from companies where id = nullif(p->>'clienteEmpresaId','') and organization_id = v_org),
      (select id from contacts  where id = nullif(p->>'clienteContactoId','') and organization_id = v_org),
      (select id from companies where id = nullif(p->>'agenciaEmpresaId','') and organization_id = v_org),
      nullif(p->>'clienteTexto',''), nullif(p->>'agenciaTexto',''),
      nullif(p->>'derechosTiempo',''), nullif(p->>'derechosPlataformas',''), nullif(p->>'derechosTerritorio',''),
      nullif(p->>'contactoCliente',''), nullif(p->>'mailContactoCliente',''), nullif(p->>'telefonoContactoCliente',''),
      nullif(p->>'contactoAgencia',''), nullif(p->>'mailContactoAgencia',''), nullif(p->>'telefonoContactoAgencia',''),
      nullif(p->>'condicionPago',''), nullif(p->>'fechaCotizacion','')::date, nullif(p->>'fechaAprobacion','')::date,
      nullif(p->>'fechaPago','')::date
    )
    on conflict (project_id) do update set
      cliente_empresa_id = excluded.cliente_empresa_id, cliente_contacto_id = excluded.cliente_contacto_id,
      agencia_empresa_id = excluded.agencia_empresa_id, cliente_texto = excluded.cliente_texto, agencia_texto = excluded.agencia_texto,
      derechos_tiempo = excluded.derechos_tiempo, derechos_plataformas = excluded.derechos_plataformas, derechos_territorio = excluded.derechos_territorio,
      contacto_cliente = excluded.contacto_cliente, mail_contacto_cliente = excluded.mail_contacto_cliente, telefono_contacto_cliente = excluded.telefono_contacto_cliente,
      contacto_agencia = excluded.contacto_agencia, mail_contacto_agencia = excluded.mail_contacto_agencia, telefono_contacto_agencia = excluded.telefono_contacto_agencia,
      condicion_pago = excluded.condicion_pago, fecha_cotizacion = excluded.fecha_cotizacion, fecha_aprobacion = excluded.fecha_aprobacion,
      fecha_pago = excluded.fecha_pago,
      updated_at = now();

    delete from project_assignments where project_id = v_id;
    for elem in select * from jsonb_array_elements(fn_jsarr(p->'asignaciones')) loop
      v_cid := coalesce(
        (select id from contacts where id = nullif(elem->>'contactId','') and organization_id = v_org),
        (select id from contacts where organization_id = v_org and lower(nombre) = lower(elem->>'nombre') and deleted_at is null limit 1)
      );
      if v_cid is not null then
        insert into project_assignments (project_id, contact_id, function_id)
        select v_id, v_cid, f.id
        from project_functions f
        where f.organization_id = v_org and f.nombre = elem->>'funcion'
        limit 1
        on conflict (project_id, function_id) do nothing;
      end if;
    end loop;
  end if;

  -- ════ SECCIÓN PRESUPUESTO ════
  if (not v_existe) or v_n_pres = 'E' then
    insert into project_financials (project_id, presupuesto_cliente, gastos_admin_pct, frozen)
    values (v_id,
            coalesce(nullif(v_fin->>'presupuestoCliente','')::numeric, 0),
            coalesce(nullif(v_fin->>'gastosAdminPct','')::numeric, 0.05),
            v_fin->'frozen')
    on conflict (project_id) do update set
      presupuesto_cliente = excluded.presupuesto_cliente,
      gastos_admin_pct = excluded.gastos_admin_pct,
      frozen = excluded.frozen,
      updated_at = now();

    delete from project_commissions where project_id = v_id;
    v_pos := 0;
    for elem in select * from jsonb_array_elements(fn_jsarr(v_fin->'comisiones')) loop
      insert into project_commissions (project_id, label, mode, value, posicion)
      values (v_id, coalesce(nullif(elem->>'label',''),'Comisión'), coalesce(nullif(elem->>'mode',''),'pct'),
              coalesce(nullif(elem->>'value','')::numeric,0), v_pos);
      v_pos := v_pos + 1;
    end loop;

    delete from project_risks where project_id = v_id;
    v_pos := 0;
    for elem in select * from jsonb_array_elements(fn_jsarr(v_fin->'riesgos')) loop
      insert into project_risks (project_id, label, mode, value, posicion)
      values (v_id, coalesce(elem->>'label',''), coalesce(nullif(elem->>'mode',''),'pct'),
              coalesce(nullif(elem->>'value','')::numeric,0), v_pos);
      v_pos := v_pos + 1;
    end loop;

    delete from project_income_extras where project_id = v_id;
    v_pos := 0;
    for elem in select * from jsonb_array_elements(fn_jsarr(v_fin->'extras')) loop
      insert into project_income_extras (project_id, label, monto, posicion)
      values (v_id, coalesce(elem->>'label',''), coalesce(nullif(elem->>'monto','')::numeric,0), v_pos);
      v_pos := v_pos + 1;
    end loop;

    delete from budget_line_items where project_id = v_id;
    for elem in select * from jsonb_array_elements(fn_jsarr(p->'presupuesto')) loop
      v_cid := coalesce(
        (select id from contacts where id = nullif(elem->>'contactId','') and organization_id = v_org),
        (select id from contacts where organization_id = v_org and lower(nombre) = lower(elem->>'nombre') and deleted_at is null limit 1)
      );
      insert into budget_line_items (
        project_id, section, department_id, contact_id, nombre, concepto, valor, cantidad, unidad,
        dte, confirmado, costo_real, es_extra, es_pp, hora_extra, dte_real, nota, nota_fecha, nota_autor, posicion
      ) values (
        v_id, elem->>'section',
        case when elem->>'section' = 'servicios'
             then (select id from departments where organization_id = v_org and nombre = elem->>'departamento' limit 1)
             else null end,
        v_cid, nullif(elem->>'nombre',''), nullif(elem->>'concepto',''),
        nullif(elem->>'valor','')::numeric, coalesce(nullif(elem->>'cantidad','')::numeric,0), nullif(elem->>'unidad',''),
        (select code from dte_types where code = nullif(elem->>'dte','')),
        coalesce((elem->>'confirmado')::boolean,false), nullif(elem->>'costoReal','')::numeric,
        coalesce((elem->>'esExtra')::boolean,false), coalesce((elem->>'esPp')::boolean,false),
        coalesce(nullif(elem->>'horaExtra','')::numeric,0),
        (select code from dte_types where code = nullif(elem->>'dteReal','')),
        nullif(elem->>'nota',''), nullif(elem->>'notaFecha',''), nullif(elem->>'notaAutor',''),
        coalesce(nullif(elem->>'posicion','')::int,0)
      );
    end loop;
  end if;

  -- ════ SECCIÓN COTIZACIÓN ════
  if (not v_existe) or v_n_cot = 'E' then
    delete from quotation_offers   where project_id = v_id;
    delete from quotation_versions where project_id = v_id;
    delete from project_quotation  where project_id = v_id;

    if jsonb_typeof(v_cot) = 'object' then
      insert into project_quotation (project_id, fecha_emision, representante_cliente, condiciones, descripcion_proyecto, jornadas_rodaje, meta)
      values (v_id, nullif(v_cot->>'fechaEmision','')::date, nullif(v_cot->>'representanteCliente',''),
              coalesce(v_cot->'condiciones','{}'::jsonb), nullif(v_cot->>'descripcionProyecto',''),
              nullif(v_cot->>'jornadasRodaje',''), v_cot->'meta');
      v_pos := 0;
      for elem in select * from jsonb_array_elements(fn_jsarr(v_cot->'ofertas')) loop
        insert into quotation_offers (project_id, id_externo, es_base, nombre, valor_cliente, descripcion, incluye, no_incluye, entregables, presupuesto_alt, posicion)
        values (v_id, nullif(elem->>'idExterno',''), coalesce((elem->>'esBase')::boolean,false), nullif(elem->>'nombre',''),
                nullif(elem->>'valorCliente','')::numeric, nullif(elem->>'descripcion',''),
                (select coalesce(array(select jsonb_array_elements_text(fn_jsarr(elem->'incluye'))),'{}'::text[])),
                (select coalesce(array(select jsonb_array_elements_text(fn_jsarr(elem->'noIncluye'))),'{}'::text[])),
                coalesce(elem->'entregables','{}'::jsonb), elem->'presupuestoAlt',
                coalesce(nullif(elem->>'posicion','')::int, v_pos));
        v_pos := v_pos + 1;
      end loop;
    end if;

    if jsonb_typeof(p->'versiones') = 'array' then
      for elem in select * from jsonb_array_elements(fn_jsarr(p->'versiones')) loop
        insert into quotation_versions (project_id, numero, es_activa, snapshot, nota)
        values (v_id, coalesce(nullif(elem->>'numero','')::int,1), coalesce((elem->>'esActiva')::boolean,false),
                coalesce(elem->'snapshot','{}'::jsonb), nullif(elem->>'nota',''));
      end loop;
    end if;
  end if;

  return v_id;
end;
$$;


ALTER FUNCTION "public"."guardar_proyecto"("p" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."invitaciones_de_organizacion"("p_org_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE v jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'invitaciones: sin sesion.'; END IF;
  -- Mismo gate que cancelar: Administrador o Ejecutivo (info_proyecto nivel E)
  PERFORM rpc_assert_nivel('info_proyecto', 'E', p_org_id);

  SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.created_at DESC), '[]'::jsonb) INTO v
  FROM (
    SELECT oi.id            AS token,
           oi.email,
           oi.tipo,
           oi.perfil_codigo,
           pp.nombre        AS perfil_nombre,
           oi.cargo_id,
           pc.cargo         AS cargo_nombre,
           pc.persona_nombre AS persona_nombre,
           oi.project_id,
           pj.nombre_proyecto AS proyecto_nombre,
           oi.estado,
           (oi.invited_user_id IS NOT NULL) AS tiene_cuenta,
           oi.expires_at,
           oi.created_at
    FROM org_invitations oi
    LEFT JOIN permission_profiles pp ON pp.organization_id = oi.organization_id AND pp.codigo = oi.perfil_codigo
    LEFT JOIN project_cargos      pc ON pc.id = oi.cargo_id
    LEFT JOIN projects            pj ON pj.id = oi.project_id
    WHERE oi.organization_id = p_org_id
      AND oi.estado = 'pendiente'
  ) t;

  RETURN v;
END;
$$;


ALTER FUNCTION "public"."invitaciones_de_organizacion"("p_org_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."invitar_a_organizacion"("p_org_id" "uuid", "p_email" "text", "p_tipo" "text", "p_perfil_codigo" integer, "p_cargo_id" "text" DEFAULT NULL::"text", "p_project_id" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
DECLARE
  v_uid uuid := auth.uid();
  v_caller memberships%ROWTYPE;
  v_caller_cod int;
  v_email text := lower(trim(p_email));
  v_perfil permission_profiles%ROWTYPE;
  v_target_uid uuid;
  v_mem memberships%ROWTYPE;
  v_inv org_invitations%ROWTYPE;
  v_token text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'invitar: sin sesion.'; END IF;
  IF v_email IS NULL OR v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
    RAISE EXCEPTION 'invitar: correo invalido.';
  END IF;
  IF p_tipo NOT IN ('interno','externo') THEN RAISE EXCEPTION 'invitar: tipo invalido.'; END IF;

  -- Quien invita: membresia ACTIVA en la org
  SELECT * INTO v_caller FROM memberships WHERE user_id = v_uid AND organization_id = p_org_id AND estado = 'activo' LIMIT 1;
  IF v_caller.id IS NULL THEN RAISE EXCEPTION 'invitar: no perteneces a esta organizacion.'; END IF;
  SELECT codigo INTO v_caller_cod FROM permission_profiles WHERE id = v_caller.profile_id;

  -- Permiso: interno = solo Administrador; externo = info_proyecto nivel E (Admin/Ejecutivo)
  IF p_tipo = 'interno' THEN
    IF v_caller_cod IS DISTINCT FROM 1 THEN
      RAISE EXCEPTION 'invitar: incorporar internos es facultad del Administrador.';
    END IF;
  ELSE
    PERFORM rpc_assert_nivel('info_proyecto', 'E', p_org_id);
  END IF;

  -- Perfil destino valido en esta org; un externo no puede recibir Administrador ni Finanzas
  SELECT * INTO v_perfil FROM permission_profiles WHERE organization_id = p_org_id AND codigo = p_perfil_codigo LIMIT 1;
  IF v_perfil.id IS NULL THEN RAISE EXCEPTION 'invitar: perfil de acceso inexistente en esta organizacion.'; END IF;
  IF p_tipo = 'externo' AND p_perfil_codigo IN (1, 8) THEN
    RAISE EXCEPTION 'invitar: un externo no puede recibir el perfil %.', v_perfil.nombre;
  END IF;

  -- Cargo vinculado (opcional): debe ser de un proyecto de esta org
  IF p_cargo_id IS NOT NULL THEN
    PERFORM 1 FROM project_cargos pc JOIN projects pj ON pj.id = pc.project_id
     WHERE pc.id = p_cargo_id AND pj.organization_id = p_org_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'invitar: el cargo indicado no es de esta organizacion.'; END IF;
  END IF;

  -- Cuenta existente con ese correo (si hay)
  SELECT id INTO v_target_uid FROM auth.users WHERE lower(email) = v_email LIMIT 1;

  IF v_target_uid IS NOT NULL THEN
    SELECT * INTO v_mem FROM memberships WHERE user_id = v_target_uid AND organization_id = p_org_id LIMIT 1;
    IF v_mem.id IS NOT NULL AND v_mem.estado = 'activo' THEN
      RAISE EXCEPTION 'invitar: esa persona ya pertenece a la organizacion.';
    END IF;
    IF v_mem.id IS NULL THEN
      INSERT INTO memberships (user_id, organization_id, tipo, profile_id, estado)
      VALUES (v_target_uid, p_org_id, p_tipo, v_perfil.id, 'pendiente');
    END IF;
    IF p_cargo_id IS NOT NULL THEN
      UPDATE project_cargos SET invited_user_id = v_target_uid, updated_at = now() WHERE id = p_cargo_id;
    END IF;
  END IF;

  -- Reutiliza una invitacion pendiente vigente si ya existe para ese correo+org
  SELECT * INTO v_inv FROM org_invitations
   WHERE organization_id = p_org_id AND email = v_email AND estado = 'pendiente' AND expires_at > now()
   LIMIT 1;
  IF v_inv.id IS NOT NULL THEN
    UPDATE org_invitations SET tipo = p_tipo, perfil_codigo = p_perfil_codigo,
      cargo_id = coalesce(p_cargo_id, cargo_id), project_id = coalesce(p_project_id, project_id),
      invited_user_id = coalesce(v_target_uid, invited_user_id), updated_at = now()
    WHERE id = v_inv.id;
    RETURN jsonb_build_object('token', v_inv.id, 'registrado', v_target_uid IS NOT NULL, 'email', v_email, 'reutilizada', true);
  END IF;

  PERFORM rpc_assert_cupo_colaborador(p_org_id);

  v_token := 'inv_' || substr(md5(random()::text || clock_timestamp()::text || v_email), 1, 18);
  INSERT INTO org_invitations (id, organization_id, email, tipo, perfil_codigo, cargo_id, project_id, invited_user_id, invited_by)
  VALUES (v_token, p_org_id, v_email, p_tipo, p_perfil_codigo, p_cargo_id, p_project_id, v_target_uid, v_uid);

  RETURN jsonb_build_object('token', v_token, 'registrado', v_target_uid IS NOT NULL, 'email', v_email, 'reutilizada', false);
END;
$_$;


ALTER FUNCTION "public"."invitar_a_organizacion"("p_org_id" "uuid", "p_email" "text", "p_tipo" "text", "p_perfil_codigo" integer, "p_cargo_id" "text", "p_project_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."marcar_notificaciones_leidas"("p_ids" "uuid"[] DEFAULT NULL::"uuid"[]) RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE v_n int;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'sin sesion.'; END IF;
  UPDATE user_notifications
     SET read_at = now()
   WHERE user_id = auth.uid()
     AND read_at IS NULL
     AND (p_ids IS NULL OR id = ANY(p_ids));
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$$;


ALTER FUNCTION "public"."marcar_notificaciones_leidas"("p_ids" "uuid"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."mis_invitaciones"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_email text;
  v_out jsonb;
BEGIN
  IF v_uid IS NULL THEN RETURN '[]'::jsonb; END IF;
  SELECT lower(email) INTO v_email FROM auth.users WHERE id = v_uid;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
      'token', i.id,
      'org_nombre', coalesce(o.nombre,''),
      'tipo', i.tipo,
      'perfil', coalesce(pp.nombre,''),
      'cargo', coalesce(pc.cargo,''),
      'proyecto', coalesce(pj.nombre_proyecto,''),
      'expires_at', i.expires_at
    ) ORDER BY i.created_at DESC), '[]'::jsonb) INTO v_out
  FROM org_invitations i
  JOIN organizations o ON o.id = i.organization_id
  LEFT JOIN permission_profiles pp ON pp.organization_id = i.organization_id AND pp.codigo = i.perfil_codigo
  LEFT JOIN project_cargos pc ON pc.id = i.cargo_id
  LEFT JOIN projects pj ON pj.id = i.project_id
  WHERE i.estado = 'pendiente' AND i.expires_at > now()
    AND (i.invited_user_id = v_uid OR i.email = v_email);
  RETURN v_out;
END;
$$;


ALTER FUNCTION "public"."mis_invitaciones"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."mis_organizaciones_como_unico_admin"() RETURNS TABLE("organization_id" "uuid", "nombre" "text")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$ SELECT organization_id, nombre FROM _orgs_unico_admin(auth.uid()); $$;


ALTER FUNCTION "public"."mis_organizaciones_como_unico_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."personas_de_mis_proyectos"() RETURNS TABLE("project_id" "text", "proyecto" "text", "nombre" "text", "cargo" "text", "email" "text", "telefono" "text")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT pc.project_id,
         pr.nombre_proyecto,
         coalesce(c.nombre, pc.persona_nombre) AS nombre,
         pc.cargo,
         c.email,
         c.telefono
  FROM project_cargos pc
  JOIN projects pr ON pr.id = pc.project_id
  LEFT JOIN contacts c ON c.id = pc.contact_id
  WHERE pc.estado = 'activo'
    AND auth_ve_proyecto(pc.project_id, pr.organization_id);
$$;


ALTER FUNCTION "public"."personas_de_mis_proyectos"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."procesar_eliminaciones_vencidas"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE r record; v_n int := 0;
BEGIN
  FOR r IN SELECT user_id FROM scheduled_account_deletions WHERE estado = 'pendiente' AND now() >= execute_after LOOP
    BEGIN
      PERFORM _anonimizar_titular(r.user_id);
      UPDATE scheduled_account_deletions SET estado = 'ejecutada', executed_at = now() WHERE user_id = r.user_id;
      v_n := v_n + 1;
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO audit_log (organization_id, actor_uid, accion, tabla, registro_id, cambios)
      VALUES (NULL, NULL, 'eliminacion_fallida', 'scheduled_account_deletions', r.user_id::text, jsonb_build_object('error', SQLERRM));
    END;
  END LOOP;
  RETURN v_n;
END $$;


ALTER FUNCTION "public"."procesar_eliminaciones_vencidas"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."provisionar_organizacion"("p_nombre" "text", "p_slug" "text", "p_template_org" "uuid" DEFAULT '640ab1e0-011c-43fe-a5aa-5a636005f56f'::"uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_org uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'No hay usuario autenticado';
  END IF;
  IF coalesce(btrim(p_nombre),'') = '' THEN
    RAISE EXCEPTION 'El nombre de la organización es obligatorio';
  END IF;
  IF coalesce(btrim(p_slug),'') = '' THEN
    RAISE EXCEPTION 'El slug es obligatorio';
  END IF;
  IF EXISTS (SELECT 1 FROM organizations WHERE slug = p_slug) THEN
    RAISE EXCEPTION 'El slug "%" ya está en uso', p_slug;
  END IF;

  -- Candado (Ley 21.719 / decision de producto): un menor de edad no puede crear una productora.
  -- Si no hay fecha de nacimiento registrada, no bloquea (verificacion de edad aun opcional).
  IF NOT EXISTS (SELECT 1 FROM user_profiles WHERE user_id = v_uid AND fecha_nacimiento IS NOT NULL) THEN
    RAISE EXCEPTION 'TAKEOS_REQUISITOS:edad';
  END IF;
  IF EXISTS (SELECT 1 FROM user_profiles WHERE user_id = v_uid AND fecha_nacimiento IS NOT NULL AND fecha_nacimiento > (current_date - interval '18 years')) THEN
    RAISE EXCEPTION 'TAKEOS_MENOR_EDAD';
  END IF;

  -- 1) Crear la organización (plan 'free' por default del esquema)
  INSERT INTO organizations (nombre, slug) VALUES (btrim(p_nombre), p_slug)
  RETURNING id INTO v_org;

  -- 2) Sembrar el backbone de permisos (8 perfiles + matriz de 104)
  PERFORM seed_permisos_organizacion(v_org, p_template_org);

  -- 3) Clonar los datos operativos del template (decisión: set de Primate)
  INSERT INTO departments (organization_id, nombre, orden, activo)
  SELECT v_org, nombre, orden, activo
  FROM departments WHERE organization_id = p_template_org;

  INSERT INTO project_functions (organization_id, nombre, nivel_portal, permisos_default, orden, activo)
  SELECT v_org, nombre, nivel_portal, permisos_default, orden, activo
  FROM project_functions WHERE organization_id = p_template_org;

  INSERT INTO cancellation_reasons (organization_id, label, aplica_a, orden, activo)
  SELECT v_org, label, aplica_a, orden, activo
  FROM cancellation_reasons WHERE organization_id = p_template_org;

  -- 4) Perfil de empresa (profile jsonb es NOT NULL → arranca vacío)
  INSERT INTO organization_profile (organization_id, profile)
  VALUES (v_org, '{}'::jsonb);

  -- 5) Membresía fundadora: el llamante como Administrador (codigo 1), interno y activo
  INSERT INTO memberships (user_id, organization_id, profile_id, estado, tipo)
  SELECT v_uid, v_org, pp.id, 'activo', 'interno'
  FROM permission_profiles pp
  WHERE pp.organization_id = v_org AND pp.codigo = 1;

  RETURN v_org;
END $$;


ALTER FUNCTION "public"."provisionar_organizacion"("p_nombre" "text", "p_slug" "text", "p_template_org" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."reclamar_invitacion"("p_token" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_email text;
  v_inv org_invitations%ROWTYPE;
  v_perfil permission_profiles%ROWTYPE;
  v_mem memberships%ROWTYPE;
  v_org_nombre text;
  v_proveedor text;
  v_terms consent_terms%ROWTYPE;
  v_texto text;
  v_cargo text;
  v_proy text;
  v_ya_miembro boolean := false;
  v_requiere_aprob boolean;
  v_falta text[];
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'invitacion: sin sesion.'; END IF;
  SELECT lower(email) INTO v_email FROM auth.users WHERE id = v_uid;

  SELECT * INTO v_inv FROM org_invitations WHERE id = p_token;
  IF v_inv.id IS NULL THEN RAISE EXCEPTION 'invitacion: no existe o fue eliminada.'; END IF;
  IF v_inv.estado = 'cancelada' THEN RAISE EXCEPTION 'invitacion: fue cancelada por la productora.'; END IF;
  IF v_inv.estado IN ('aceptada','rechazada') THEN RAISE EXCEPTION 'invitacion: ya fue respondida (%).', v_inv.estado; END IF;
  IF v_inv.expires_at <= now() THEN
    UPDATE org_invitations SET estado='expirada', updated_at=now() WHERE id=v_inv.id;
    RAISE EXCEPTION 'invitacion: expiro. Pide que te la reenvien.';
  END IF;

  v_requiere_aprob := (lower(coalesce(v_inv.email,'')) <> v_email);

  -- Rebind por TOKEN: audita si el correo difiere. No destructivo: solo fija invited_user_id.
  IF v_requiere_aprob THEN
    INSERT INTO audit_log (organization_id, actor_uid, accion, tabla, registro_id, cambios)
    VALUES (v_inv.organization_id, v_uid, 'invitacion_rebind', 'org_invitations', v_inv.id,
            jsonb_build_object('email_invitado', v_inv.email, 'email_reclama', v_email));
  END IF;
  UPDATE org_invitations SET invited_user_id=v_uid, updated_at=now() WHERE id=v_inv.id;

  SELECT * INTO v_perfil FROM permission_profiles WHERE organization_id=v_inv.organization_id AND codigo=v_inv.perfil_codigo LIMIT 1;
  SELECT * INTO v_mem FROM memberships WHERE user_id=v_uid AND organization_id=v_inv.organization_id LIMIT 1;
  IF v_mem.id IS NOT NULL AND v_mem.estado='activo' THEN v_ya_miembro := true; END IF;

  IF v_inv.cargo_id IS NOT NULL THEN
    SELECT cargo INTO v_cargo FROM project_cargos WHERE id=v_inv.cargo_id;
    SELECT nombre_proyecto INTO v_proy FROM projects WHERE id=v_inv.project_id;
  END IF;
  SELECT nombre INTO v_org_nombre FROM organizations WHERE id=v_inv.organization_id;
  SELECT valor INTO v_proveedor FROM app_config WHERE clave='proveedor_razon_social';
  SELECT * INTO v_terms FROM consent_terms WHERE tipo='consentimiento_incorporacion' AND estado='aprobado' AND vigente=true LIMIT 1;
  IF v_terms.id IS NULL THEN RAISE EXCEPTION 'invitacion: no hay terminos vigentes (pendiente aprobacion legal).'; END IF;
  v_texto := replace(replace(v_terms.texto, '{PRODUCTORA}', coalesce(v_org_nombre,'')), '{PROVEEDOR}', coalesce(v_proveedor,''));

  v_falta := _requisitos_faltantes(v_uid);

  RETURN jsonb_build_object(
    'ya_miembro', v_ya_miembro,
    'org_id', v_inv.organization_id,
    'org_nombre', coalesce(v_org_nombre,''),
    'tipo', v_inv.tipo,
    'perfil_nombre', coalesce(v_perfil.nombre,''),
    'cargo', coalesce(v_cargo,''),
    'proyecto', coalesce(v_proy,''),
    'persona_nombre', coalesce((SELECT persona_nombre FROM project_cargos WHERE id=v_inv.cargo_id),''),
    'email_invitado', v_inv.email,
    'requiere_aprobacion_correo', v_requiere_aprob,
    'terms_version', v_terms.id,
    'terms_texto', v_texto,
    'perfil_completo', (array_length(v_falta,1) IS NULL),
    'requisitos_faltantes', to_jsonb(coalesce(v_falta, ARRAY[]::text[]))
  );
END;
$$;


ALTER FUNCTION "public"."reclamar_invitacion"("p_token" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."resolver_rebind"("p_request_id" "uuid", "p_aprobar" boolean, "p_correo_elegido" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_req invitation_rebind_requests%ROWTYPE;
  v_contact_id text;
  v_correo text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'resolver_rebind: sin sesion.'; END IF;
  SELECT * INTO v_req FROM invitation_rebind_requests WHERE id = p_request_id;
  IF v_req.id IS NULL THEN RAISE EXCEPTION 'resolver_rebind: solicitud inexistente.'; END IF;

  -- Solo quien gestiona invitaciones en la org (info_proyecto E = Admin/Ejecutivo)
  PERFORM rpc_assert_nivel('info_proyecto','E', v_req.organization_id);

  IF v_req.estado <> 'pendiente' THEN
    RAISE EXCEPTION 'resolver_rebind: la solicitud ya fue resuelta (%).', v_req.estado;
  END IF;

  IF p_aprobar THEN
    v_correo := lower(trim(coalesce(p_correo_elegido,'')));
    IF v_correo NOT IN (lower(v_req.invited_email), lower(v_req.claiming_email)) THEN
      RAISE EXCEPTION 'resolver_rebind: el correo elegido debe ser el invitado (%) o el que reclamo (%).', v_req.invited_email, v_req.claiming_email;
    END IF;

    v_contact_id := _admitir_persona(v_req.claiming_user_id, v_req.invitation_id, v_correo);

    UPDATE invitation_rebind_requests
       SET estado='aprobada', chosen_email=v_correo, decided_at=now(), decided_by=v_uid
     WHERE id=v_req.id;

    PERFORM _crear_notificacion(v_req.claiming_user_id, v_req.organization_id, v_req.project_id, 'rebind_aprobado',
      'Acceso aprobado',
      'Tu acceso fue aprobado. Ya puedes ingresar.',
      jsonb_build_object('invitation_id', v_req.invitation_id, 'cargo_id', v_req.cargo_id));

    RETURN jsonb_build_object('estado','aprobada','contact_id', v_contact_id, 'correo_elegido', v_correo);
  ELSE
    UPDATE invitation_rebind_requests SET estado='rechazada', decided_at=now(), decided_by=v_uid WHERE id=v_req.id;

    -- Rechazo = la invitacion se cancela (el link visto por otra persona no sigue vigente) y el cargo queda libre
    IF v_req.cargo_id IS NOT NULL THEN
      UPDATE project_cargos SET estado='sin-asignar', invited_user_id=NULL, updated_at=now()
       WHERE id=v_req.cargo_id AND estado IN ('pendiente','sin-asignar');
    END IF;
    UPDATE org_invitations SET estado='rechazada', updated_at=now() WHERE id=v_req.invitation_id AND estado='pendiente';

    PERFORM _crear_notificacion(v_req.claiming_user_id, v_req.organization_id, v_req.project_id, 'rebind_rechazado',
      'Acceso no aprobado',
      'El responsable no aprobo el cambio de correo, por lo que no se te dio acceso.',
      jsonb_build_object('invitation_id', v_req.invitation_id));

    RETURN jsonb_build_object('estado','rechazada');
  END IF;
END;
$$;


ALTER FUNCTION "public"."resolver_rebind"("p_request_id" "uuid", "p_aprobar" boolean, "p_correo_elegido" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."restaurar_proyecto"("p_id" "text") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_org uuid;
BEGIN
  IF p_id IS NULL OR p_id = '' THEN RAISE EXCEPTION 'restaurar_proyecto: falta id'; END IF;
  SELECT organization_id INTO v_org FROM projects WHERE id = p_id;
  IF v_org IS NULL THEN RAISE EXCEPTION 'restaurar_proyecto: proyecto % no existe', p_id; END IF;

  PERFORM rpc_assert_nivel('eliminar_proyecto', 'E', v_org);

  UPDATE projects SET deleted_at = NULL, updated_at = now() WHERE id = p_id;
  RETURN p_id;
END;
$$;


ALTER FUNCTION "public"."restaurar_proyecto"("p_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."revocar_consentimiento"("p_consent_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE v_uid uuid := auth.uid(); v_c data_consents%ROWTYPE; v_org uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'revocar: sin sesion.'; END IF;
  SELECT * INTO v_c FROM data_consents WHERE id = p_consent_id;
  IF v_c.id IS NULL THEN RAISE EXCEPTION 'revocar: consentimiento inexistente.'; END IF;
  IF v_c.user_id <> v_uid THEN RAISE EXCEPTION 'revocar: ese consentimiento no es tuyo.'; END IF;
  IF v_c.revoked_at IS NOT NULL THEN RETURN jsonb_build_object('estado','ya_revocado'); END IF;
  v_org := v_c.organization_id;

  IF EXISTS (SELECT 1 FROM _orgs_unico_admin(v_uid) WHERE organization_id = v_org) THEN
    RAISE EXCEPTION 'TAKEOS_UNICO_ADMIN:%', v_org;
  END IF;

  UPDATE data_consents SET revoked_at = now() WHERE id = p_consent_id;
  UPDATE memberships SET estado = 'inactivo', updated_at = now()
    WHERE id = v_c.membership_id AND user_id = v_uid AND organization_id = v_org;

  INSERT INTO audit_log (organization_id, actor_uid, accion, tabla, registro_id, cambios)
  VALUES (v_org, v_uid, 'revocar_consentimiento', 'data_consents', p_consent_id::text,
          jsonb_build_object('membership_id', v_c.membership_id));
  RETURN jsonb_build_object('estado','revocado','organization_id',v_org);
END $$;


ALTER FUNCTION "public"."revocar_consentimiento"("p_consent_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rpc_assert_cupo_colaborador"("p_org" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$ DECLARE v_max int; v_actual int; BEGIN
  SELECT pc.max_colaboradores INTO v_max
    FROM organizations o JOIN plan_catalog pc ON pc.codigo = o.plan WHERE o.id = p_org;
  IF v_max IS NULL THEN RETURN; END IF;
  SELECT (SELECT count(*) FROM memberships WHERE organization_id = p_org AND estado = 'activo')
       + (SELECT count(*) FROM org_invitations WHERE organization_id = p_org AND estado = 'pendiente' AND expires_at > now())
    INTO v_actual;
  IF v_actual >= v_max THEN RAISE EXCEPTION 'TAKEOS_PLAN_LIMITE:colaboradores:%', v_max; END IF;
END $$;


ALTER FUNCTION "public"."rpc_assert_cupo_colaborador"("p_org" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rpc_assert_cupo_proyecto"("p_org" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$ DECLARE v_max int; v_actual int; BEGIN
  SELECT pc.max_proyectos_activos INTO v_max
    FROM organizations o JOIN plan_catalog pc ON pc.codigo = o.plan WHERE o.id = p_org;
  IF v_max IS NULL THEN RETURN; END IF;
  SELECT count(*) INTO v_actual FROM projects
    WHERE organization_id = p_org AND deleted_at IS NULL AND cerrado_at IS NULL;
  IF v_actual >= v_max THEN RAISE EXCEPTION 'TAKEOS_PLAN_LIMITE:proyectos:%', v_max; END IF;
END $$;


ALTER FUNCTION "public"."rpc_assert_cupo_proyecto"("p_org" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rpc_assert_nivel"("p_modulo" "text", "p_nivel_min" "text", "p_org_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_nivel text;
BEGIN
  SELECT pp.nivel INTO v_nivel
  FROM memberships m
  JOIN profile_permissions pp ON pp.profile_id = m.profile_id
  WHERE m.user_id = auth.uid()
    AND m.organization_id = p_org_id
    AND m.estado = 'activo'
    AND pp.modulo = p_modulo
  LIMIT 1;

  IF v_nivel IS NULL THEN
    RAISE EXCEPTION 'takeos_auth: sin membresía activa para esta organización.';
  END IF;

  IF p_nivel_min = 'E' AND v_nivel <> 'E' THEN
    RAISE EXCEPTION 'takeos_auth: perfil sin permiso de escritura en módulo %.', p_modulo;
  END IF;

  IF p_nivel_min = 'L' AND v_nivel = 'none' THEN
    RAISE EXCEPTION 'takeos_auth: perfil sin acceso al módulo %.', p_modulo;
  END IF;
END;
$$;


ALTER FUNCTION "public"."rpc_assert_nivel"("p_modulo" "text", "p_nivel_min" "text", "p_org_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rpc_assert_plan"("p_feature" "text", "p_org" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$ BEGIN
  IF NOT auth_plan_permite(p_feature, p_org) THEN
    RAISE EXCEPTION 'TAKEOS_PLAN:%', p_feature;
  END IF;
END $$;


ALTER FUNCTION "public"."rpc_assert_plan"("p_feature" "text", "p_org" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."seed_permisos_organizacion"("p_org_id" "uuid", "p_template_org" "uuid" DEFAULT '640ab1e0-011c-43fe-a5aa-5a636005f56f'::"uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM permission_profiles WHERE organization_id = p_org_id) THEN
    RAISE NOTICE 'La organización % ya tiene perfiles; se omite el sembrado.', p_org_id;
    RETURN;
  END IF;

  -- 1) Los 8 perfiles fijos, con nuevos ids para la org destino
  INSERT INTO permission_profiles (organization_id, codigo, nombre, descripcion, es_custom)
  SELECT p_org_id, codigo, nombre, descripcion, es_custom
  FROM permission_profiles
  WHERE organization_id = p_template_org;

  -- 2) La matriz de permisos, mapeando template→destino por 'codigo' (clave estable 1-8)
  INSERT INTO profile_permissions (profile_id, modulo, nivel)
  SELECT np.id, pp.modulo, pp.nivel
  FROM profile_permissions pp
  JOIN permission_profiles tp ON tp.id = pp.profile_id AND tp.organization_id = p_template_org
  JOIN permission_profiles np ON np.organization_id = p_org_id AND np.codigo = tp.codigo;
END $$;


ALTER FUNCTION "public"."seed_permisos_organizacion"("p_org_id" "uuid", "p_template_org" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."set_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."solicitar_eliminacion_cuenta"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE v_uid uuid := auth.uid(); v_orgs jsonb; v_after timestamptz := now() + interval '30 days';
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'eliminar: sin sesion.'; END IF;
  SELECT jsonb_agg(jsonb_build_object('organization_id', organization_id, 'nombre', nombre))
    INTO v_orgs FROM _orgs_unico_admin(v_uid);
  IF v_orgs IS NOT NULL THEN
    RAISE EXCEPTION 'TAKEOS_UNICO_ADMIN:%', v_orgs::text;
  END IF;

  INSERT INTO scheduled_account_deletions (user_id, execute_after, estado)
  VALUES (v_uid, v_after, 'pendiente')
  ON CONFLICT (user_id) DO UPDATE SET requested_at = now(), execute_after = v_after, estado = 'pendiente', cancelled_at = NULL, executed_at = NULL;

  INSERT INTO audit_log (organization_id, actor_uid, accion, tabla, registro_id, cambios)
  VALUES (NULL, v_uid, 'solicitar_eliminacion_cuenta', 'scheduled_account_deletions', v_uid::text,
          jsonb_build_object('execute_after', v_after));
  RETURN jsonb_build_object('estado','programada','ejecuta_despues_de', v_after);
END $$;


ALTER FUNCTION "public"."solicitar_eliminacion_cuenta"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."transferir_administracion"("p_org_id" "uuid", "p_target_user_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE v_uid uuid := auth.uid(); v_admin_profile bigint; v_target memberships%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'transferir: sin sesion.'; END IF;
  IF NOT EXISTS (SELECT 1 FROM memberships m JOIN permission_profiles p ON p.id = m.profile_id
                 WHERE m.user_id = v_uid AND m.organization_id = p_org_id AND m.estado = 'activo' AND p.codigo = 1) THEN
    RAISE EXCEPTION 'transferir: solo un Administrador puede transferir la administracion.';
  END IF;
  SELECT * INTO v_target FROM memberships
    WHERE user_id = p_target_user_id AND organization_id = p_org_id AND estado = 'activo';
  IF v_target.id IS NULL THEN RAISE EXCEPTION 'transferir: la persona no es miembro activo de la organizacion.'; END IF;
  IF v_target.tipo <> 'interno' THEN RAISE EXCEPTION 'transferir: el Administrador debe ser un miembro interno.'; END IF;

  SELECT id INTO v_admin_profile FROM permission_profiles WHERE organization_id = p_org_id AND codigo = 1;
  UPDATE memberships SET profile_id = v_admin_profile, updated_at = now() WHERE id = v_target.id;

  INSERT INTO audit_log (organization_id, actor_uid, accion, tabla, registro_id, cambios)
  VALUES (p_org_id, v_uid, 'transferir_administracion', 'memberships', v_target.id::text,
          jsonb_build_object('nuevo_admin', p_target_user_id));
  RETURN jsonb_build_object('estado','ok','nuevo_admin',p_target_user_id);
END $$;


ALTER FUNCTION "public"."transferir_administracion"("p_org_id" "uuid", "p_target_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trg_limite_user_tool_documents"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE v_count int;
BEGIN
  SELECT count(*) INTO v_count FROM user_tool_documents WHERE user_id = NEW.user_id;
  IF v_count >= 15 THEN
    RAISE EXCEPTION 'herramientas: alcanzaste el maximo de 15 documentos activos. Elimina alguno para crear otro.';
  END IF;
  RETURN NEW;
END $$;


ALTER FUNCTION "public"."trg_limite_user_tool_documents"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trg_norm_user_bank"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF btrim(coalesce(NEW.bank_codigo_sbif,'')) = '' THEN NEW.bank_codigo_sbif := NULL; END IF;
  IF btrim(coalesce(NEW.tipo_cuenta,'')) = ''      THEN NEW.tipo_cuenta := NULL;      END IF;
  IF NEW.es_extranjera IS NOT TRUE AND NEW.numero_cuenta IS NOT NULL THEN
    NEW.numero_cuenta := regexp_replace(NEW.numero_cuenta, '\D', '', 'g');
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;


ALTER FUNCTION "public"."trg_norm_user_bank"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trg_norm_user_profiles"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  NEW.rut                 := fn_norm_rut(NEW.rut);
  NEW.telefono            := fn_norm_fono(NEW.telefono);
  NEW.email               := fn_norm_email(NEW.email);
  NEW.direccion           := fn_title(NEW.direccion);
  NEW.direccion_linea2    := fn_title(NEW.direccion_linea2);
  NEW.comuna              := fn_title(NEW.comuna);
  NEW.ciudad              := fn_title(NEW.ciudad);
  NEW.region              := nullif(btrim(NEW.region), '');   -- lista cerrada: se respeta la forma canonica del dropdown
  NEW.pais                := fn_title(NEW.pais);
  NEW.documento_identidad := nullif(upper(trim(NEW.documento_identidad)), '');
  NEW.rol_publico         := nullif(trim(NEW.rol_publico), '');
  NEW.updated_at          := now();
  RETURN NEW;
END $$;


ALTER FUNCTION "public"."trg_norm_user_profiles"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trg_proteger_ultimo_admin"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_era_admin boolean;
  v_sigue_admin boolean;
  v_otros int;
BEGIN
  /* V11.3.1 · una organización nunca puede quedar sin Administrador activo.
     Bloquea el UPDATE que degrada al último admin (cambio de perfil o de
     estado) y el DELETE de su membresía. El service_role NO está exento a
     propósito: una reparación legítima se hace deshabilitando el trigger. */
  IF TG_OP = 'DELETE' THEN
    SELECT (pp.codigo = 1 AND OLD.estado = 'activo') INTO v_era_admin
      FROM permission_profiles pp WHERE pp.id = OLD.profile_id;
    IF coalesce(v_era_admin, false) THEN
      SELECT count(*) INTO v_otros FROM memberships m
        JOIN permission_profiles pp ON pp.id = m.profile_id
       WHERE m.organization_id = OLD.organization_id AND m.id <> OLD.id
         AND m.estado = 'activo' AND pp.codigo = 1;
      IF v_otros = 0 THEN
        RAISE EXCEPTION 'memberships: no se puede eliminar al único Administrador activo de la organización.';
      END IF;
    END IF;
    RETURN OLD;
  END IF;

  SELECT (pp.codigo = 1 AND OLD.estado = 'activo') INTO v_era_admin
    FROM permission_profiles pp WHERE pp.id = OLD.profile_id;
  SELECT (pp.codigo = 1 AND NEW.estado = 'activo') INTO v_sigue_admin
    FROM permission_profiles pp WHERE pp.id = NEW.profile_id;
  IF coalesce(v_era_admin, false) AND NOT coalesce(v_sigue_admin, false) THEN
    SELECT count(*) INTO v_otros FROM memberships m
      JOIN permission_profiles pp ON pp.id = m.profile_id
     WHERE m.organization_id = OLD.organization_id AND m.id <> OLD.id
       AND m.estado = 'activo' AND pp.codigo = 1;
    IF v_otros = 0 THEN
      RAISE EXCEPTION 'memberships: la organización quedaría sin Administrador. Asigna otro Administrador antes de cambiar este perfil.';
    END IF;
  END IF;
  RETURN NEW;
END $$;


ALTER FUNCTION "public"."trg_proteger_ultimo_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trg_sync_org_branding"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  INSERT INTO organization_branding (organization_id, logo_data_url, logos, nombre_ficticio, web, updated_at)
  VALUES (
    NEW.organization_id,
    NEW.profile->>'logoDataUrl',
    CASE WHEN jsonb_typeof(NEW.profile->'logos')='array' THEN NEW.profile->'logos' ELSE NULL END,
    NEW.profile->>'nombreFicticio',
    NEW.profile->>'web',
    now()
  )
  ON CONFLICT (organization_id) DO UPDATE SET
    logo_data_url   = excluded.logo_data_url,
    logos           = excluded.logos,
    nombre_ficticio = excluded.nombre_ficticio,
    web             = excluded.web,
    updated_at      = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."trg_sync_org_branding"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trg_touch_user_tool_documents"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$ BEGIN NEW.updated_at := now(); RETURN NEW; END $$;


ALTER FUNCTION "public"."trg_touch_user_tool_documents"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trg_user_tool_documents_meta"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    NEW.updated_at := now();
  END IF;
  NEW.expires_at := CASE
    WHEN NEW.fecha_rodaje IS NOT NULL THEN (NEW.fecha_rodaje::timestamptz + interval '30 days')
    ELSE (NEW.updated_at + interval '30 days')
  END;
  RETURN NEW;
END $$;


ALTER FUNCTION "public"."trg_user_tool_documents_meta"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."analytics_events" (
    "id" bigint NOT NULL,
    "user_id" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "event_name" "text" NOT NULL,
    "props" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."analytics_events" OWNER TO "postgres";


COMMENT ON TABLE "public"."analytics_events" IS 'Sumidero generico de eventos de producto (impresiones, clicks, etc.). Cliente solo INSERTA lo suyo (user_id=auth.uid()); no lee. Sink minimo in-house: migrar a una herramienta de analitica dedicada cuando exista. Para el CTA: event_name in (cta_productora_impression, cta_productora_click).';



ALTER TABLE "public"."analytics_events" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."analytics_events_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."app_config" (
    "clave" "text" NOT NULL,
    "valor" "text",
    "descripcion" "text",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."app_config" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."audit_log" (
    "id" bigint NOT NULL,
    "organization_id" "uuid",
    "actor_uid" "uuid",
    "accion" "text" NOT NULL,
    "tabla" "text" NOT NULL,
    "registro_id" "text",
    "cambios" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."audit_log" OWNER TO "postgres";


COMMENT ON TABLE "public"."audit_log" IS 'Registro de auditoría. Poblado por triggers en tablas sensibles. actor_uid = auth.uid().';



ALTER TABLE "public"."audit_log" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."audit_log_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."bank_institutions" (
    "codigo_sbif" "text" NOT NULL,
    "nombre" "text" NOT NULL,
    "activo" boolean DEFAULT true NOT NULL
);


ALTER TABLE "public"."bank_institutions" OWNER TO "postgres";


COMMENT ON TABLE "public"."bank_institutions" IS 'Catálogo de instituciones financieras chilenas. Clave = código SBIF/CMF.';



CREATE TABLE IF NOT EXISTS "public"."budget_line_items" (
    "id" bigint NOT NULL,
    "project_id" "text" NOT NULL,
    "section" "text" NOT NULL,
    "department_id" bigint,
    "contact_id" "text",
    "nombre" "text",
    "concepto" "text",
    "valor" numeric,
    "cantidad" numeric DEFAULT 0,
    "unidad" "text",
    "dte" "text",
    "confirmado" boolean DEFAULT false NOT NULL,
    "costo_real" numeric,
    "es_extra" boolean DEFAULT false NOT NULL,
    "es_pp" boolean DEFAULT false NOT NULL,
    "hora_extra" numeric DEFAULT 0 NOT NULL,
    "posicion" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "dte_real" "text",
    "nota" "text",
    "nota_fecha" "text",
    "nota_autor" "text",
    "he_config" "jsonb",
    CONSTRAINT "budget_line_items_section_check" CHECK (("section" = ANY (ARRAY['servicios'::"text", 'gastos'::"text", 'tecnica'::"text", 'talentos'::"text"])))
);


ALTER TABLE "public"."budget_line_items" OWNER TO "postgres";


COMMENT ON TABLE "public"."budget_line_items" IS 'Todas las líneas de costo (servicios/gastos/tecnica/talentos) en una tabla. valor=cotizado inmutable; costo_real=vivo.';



ALTER TABLE "public"."budget_line_items" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."budget_line_items_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."cancellation_reasons" (
    "id" bigint NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "label" "text" NOT NULL,
    "aplica_a" "text" DEFAULT 'ambos'::"text" NOT NULL,
    "orden" integer DEFAULT 0 NOT NULL,
    "activo" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "cancellation_reasons_aplica_a_check" CHECK (("aplica_a" = ANY (ARRAY['rechazo'::"text", 'cancelacion'::"text", 'ambos'::"text"])))
);


ALTER TABLE "public"."cancellation_reasons" OWNER TO "postgres";


COMMENT ON TABLE "public"."cancellation_reasons" IS 'Motivos de rechazo/cancelación por organización. Multi-selección al usar. Alimenta el reporte anual.';



ALTER TABLE "public"."cancellation_reasons" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."cancellation_reasons_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."companies" (
    "id" "text" NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "rut" "text",
    "nombre_fantasia" "text" NOT NULL,
    "razon_social" "text",
    "giro_sii" "text",
    "giro_informal" "text",
    "web" "text",
    "notas" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_at" timestamp with time zone,
    "created_by" "uuid",
    "updated_by" "uuid"
);


ALTER TABLE "public"."companies" OWNER TO "postgres";


COMMENT ON TABLE "public"."companies" IS 'Empresas con las que trabaja la productora. El tipo (cliente/proveedor) vive en company_relationships.';



CREATE TABLE IF NOT EXISTS "public"."company_relationships" (
    "id" bigint NOT NULL,
    "company_id" "text" NOT NULL,
    "tipo" "text" NOT NULL,
    CONSTRAINT "company_relationships_tipo_check" CHECK (("tipo" = ANY (ARRAY['cliente'::"text", 'proveedor'::"text", 'agencia'::"text", 'socio'::"text"])))
);


ALTER TABLE "public"."company_relationships" OWNER TO "postgres";


COMMENT ON TABLE "public"."company_relationships" IS 'Relación org↔empresa: cliente / proveedor / socio. Reemplaza el campo CSV "tipo".';



ALTER TABLE "public"."company_relationships" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."company_relationships_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."consent_terms" (
    "id" "text" NOT NULL,
    "tipo" "text" NOT NULL,
    "version" "text" NOT NULL,
    "texto" "text" NOT NULL,
    "estado" "text" DEFAULT 'borrador'::"text" NOT NULL,
    "vigente" boolean DEFAULT false NOT NULL,
    "aprobado_por" "text",
    "aprobado_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "consent_terms_estado_check" CHECK (("estado" = ANY (ARRAY['borrador'::"text", 'aprobado'::"text"])))
);


ALTER TABLE "public"."consent_terms" OWNER TO "postgres";


COMMENT ON TABLE "public"."consent_terms" IS 'Versionado de textos de términos/consentimiento. consentir_invitacion exige una fila estado=aprobado AND vigente del tipo correspondiente; mientras no exista, falla cerrado. Aprobar v1.0 = insertar/activar la fila (apretar el boton).';



CREATE TABLE IF NOT EXISTS "public"."contact_bank_accounts" (
    "id" bigint NOT NULL,
    "contact_id" "text" NOT NULL,
    "bank_codigo_sbif" "text",
    "tipo_cuenta" "text",
    "numero_cuenta" "text",
    "es_principal" boolean DEFAULT true NOT NULL,
    "es_extranjera" boolean DEFAULT false NOT NULL,
    "datos_extra" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "contact_bank_accounts_tipo_cuenta_check" CHECK (("tipo_cuenta" = ANY (ARRAY['corriente'::"text", 'vista'::"text", 'ahorro'::"text", 'rut'::"text", 'chequera_electronica'::"text"])))
);


ALTER TABLE "public"."contact_bank_accounts" OWNER TO "postgres";


COMMENT ON TABLE "public"."contact_bank_accounts" IS 'Cuentas bancarias de cada contacto. Tabla separada por sensibilidad y multiplicidad.';



ALTER TABLE "public"."contact_bank_accounts" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."contact_bank_accounts_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."contact_companies" (
    "id" bigint NOT NULL,
    "contact_id" "text" NOT NULL,
    "company_id" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "es_socio" boolean DEFAULT false NOT NULL,
    "es_representante" boolean DEFAULT false NOT NULL,
    "cargo" "text"
);


ALTER TABLE "public"."contact_companies" OWNER TO "postgres";


COMMENT ON TABLE "public"."contact_companies" IS 'Puente persona↔empresa. Facetas que coexisten (es_socio, es_representante) + cargo libre. Un solo representante por empresa.';



ALTER TABLE "public"."contact_companies" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."contact_companies_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."contact_roles" (
    "id" bigint NOT NULL,
    "contact_id" "text" NOT NULL,
    "role" "text" NOT NULL,
    "rol_habitual" "text",
    "activo" boolean DEFAULT true NOT NULL,
    CONSTRAINT "contact_roles_role_check" CHECK (("role" = ANY (ARRAY['crew'::"text", 'interno'::"text", 'talento'::"text", 'contacto_cliente'::"text", 'proveedor_individual'::"text"])))
);


ALTER TABLE "public"."contact_roles" OWNER TO "postgres";


COMMENT ON TABLE "public"."contact_roles" IS 'Roles de cada contacto. Reemplaza el campo CSV "Roles". Una fila por rol.';



ALTER TABLE "public"."contact_roles" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."contact_roles_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."contact_talent_profiles" (
    "contact_id" "text" NOT NULL,
    "genero" "text",
    "altura_cm" smallint,
    "apariencia_etnica" "text",
    "areas_interes" "text"[],
    "talla_polera" "text",
    "talla_pantalon" "text",
    "talla_calzado" "text",
    "fotos_link" "text",
    "reel_link" "text",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "contact_talent_profiles_altura_cm_check" CHECK ((("altura_cm" IS NULL) OR (("altura_cm" >= 30) AND ("altura_cm" <= 260))))
);


ALTER TABLE "public"."contact_talent_profiles" OWNER TO "postgres";


COMMENT ON TABLE "public"."contact_talent_profiles" IS 'Perfil de casting. 1:1 con contacts. Solo existe para contactos con rol Talento.';



CREATE TABLE IF NOT EXISTS "public"."contacts" (
    "id" "text" NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "nombre" "text" NOT NULL,
    "rut" "text",
    "email" "text",
    "telefono" "text",
    "direccion" "text",
    "direccion_linea2" "text",
    "comuna" "text",
    "ciudad" "text",
    "region" "text",
    "fecha_nacimiento" "date",
    "restriccion_alimentaria" "text",
    "notas" "text",
    "dte_habitual" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_at" timestamp with time zone,
    "created_by" "uuid",
    "updated_by" "uuid",
    CONSTRAINT "chk_contacts_email_formato" CHECK ((("email" IS NULL) OR ("email" ~~ '%@%.%'::"text"))),
    CONSTRAINT "contacts_dte_habitual_check" CHECK ((("dte_habitual" IS NULL) OR ("dte_habitual" = ANY (ARRAY['boleta'::"text", 'factura'::"text", 'factura_exenta'::"text", 'boleta_terceros'::"text"]))))
);


ALTER TABLE "public"."contacts" OWNER TO "postgres";


COMMENT ON TABLE "public"."contacts" IS 'Personas físicas. Datos comunes a toda persona. Lo específico va en tablas satélite.';



COMMENT ON COLUMN "public"."contacts"."email" IS 'NO es único a propósito: varias personas pueden compartir un correo de empresa.';



COMMENT ON COLUMN "public"."contacts"."fecha_nacimiento" IS 'Fecha de nacimiento completa o NULL. El saludo de cumpleaños se deriva del día/mes. Sin centinelas.';



CREATE TABLE IF NOT EXISTS "public"."cookie_consents" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "esenciales" boolean DEFAULT true NOT NULL,
    "analitica" boolean DEFAULT false NOT NULL,
    "marketing" boolean DEFAULT false NOT NULL,
    "version" "text" NOT NULL,
    "accepted_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."cookie_consents" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."data_consents" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "membership_id" bigint,
    "terms_version" "text" NOT NULL,
    "terms_text_snapshot" "text",
    "accepted_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "revoked_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."data_consents" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."departments" (
    "id" bigint NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "nombre" "text" NOT NULL,
    "orden" integer DEFAULT 0 NOT NULL,
    "activo" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."departments" OWNER TO "postgres";


COMMENT ON TABLE "public"."departments" IS 'Departamentos del presupuesto por organización. El usuario tipea libre; si no existe, se crea aquí. Renombrar (no borrar+recrear) conserva identidad.';



ALTER TABLE "public"."departments" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."departments_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."dte_types" (
    "code" "text" NOT NULL,
    "label" "text" NOT NULL,
    "aplica_retencion" boolean DEFAULT false NOT NULL
);


ALTER TABLE "public"."dte_types" OWNER TO "postgres";


COMMENT ON TABLE "public"."dte_types" IS 'Tipos de DTE y si retienen. La REGLA tributaria (boleta retiene, factura no). Estable.';



CREATE TABLE IF NOT EXISTS "public"."invitation_rebind_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "invitation_id" "text" NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "claiming_user_id" "uuid" NOT NULL,
    "invited_email" "text" NOT NULL,
    "claiming_email" "text" NOT NULL,
    "cargo_id" "text",
    "project_id" "text",
    "estado" "text" DEFAULT 'pendiente'::"text" NOT NULL,
    "chosen_email" "text",
    "requested_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "decided_at" timestamp with time zone,
    "decided_by" "uuid",
    CONSTRAINT "rebind_estado_chk" CHECK (("estado" = ANY (ARRAY['pendiente'::"text", 'aprobada'::"text", 'rechazada'::"text"])))
);


ALTER TABLE "public"."invitation_rebind_requests" OWNER TO "postgres";


COMMENT ON TABLE "public"."invitation_rebind_requests" IS 'Solicitudes de aprobacion cuando una invitacion se reclama con un correo distinto al invitado. La persona NO entra al proyecto hasta que invited_by/Admin la aprueba via resolver_rebind y elige el correo canonico. Escritura solo via RPC.';



CREATE TABLE IF NOT EXISTS "public"."legal_documents" (
    "doc_id" "text" NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "tipo" "text",
    "plantilla_id" "text",
    "project_id" "text",
    "proyecto_nombre" "text",
    "cliente" "text",
    "estado" "text",
    "version" integer,
    "fecha_generacion" "date",
    "fecha_firma" "date",
    "monto" numeric,
    "vigencia" "text",
    "responsable" "text",
    "pdf_path" "text",
    "contraparte_id" "text",
    "contraparte_nombre" "text",
    "rut" "text",
    "rol_calidad" "text",
    "vars" "jsonb",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "exported" boolean DEFAULT false NOT NULL,
    "locacion_id" "text"
);


ALTER TABLE "public"."legal_documents" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."legal_templates" (
    "id" "text" NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "nombre" "text",
    "descripcion" "text",
    "target" "text",
    "completar" "text",
    "cuerpo" "text",
    "custom" boolean DEFAULT false NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."legal_templates" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."locations" (
    "loc_id" "text" NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "nombre" "text",
    "direccion" "text",
    "direccion2" "text",
    "comuna" "text",
    "ciudad" "text",
    "region" "text",
    "maps" "text",
    "orientacion" "text",
    "notas" "text",
    "dueno" "jsonb",
    "contactos" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "fotos" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."locations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."memberships" (
    "id" bigint NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "contact_id" "text",
    "tipo" "text" NOT NULL,
    "profile_id" bigint NOT NULL,
    "estado" "text" DEFAULT 'activo'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "memberships_estado_check" CHECK (("estado" = ANY (ARRAY['activo'::"text", 'inactivo'::"text", 'pendiente'::"text"]))),
    CONSTRAINT "memberships_tipo_check" CHECK (("tipo" = ANY (ARRAY['interno'::"text", 'externo'::"text"])))
);


ALTER TABLE "public"."memberships" OWNER TO "postgres";


ALTER TABLE "public"."memberships" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."memberships_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."notification_send_recipients" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "send_id" "uuid" NOT NULL,
    "channel" "text" DEFAULT 'email'::"text" NOT NULL,
    "email" "text",
    "telefono" "text",
    "nombre" "text",
    "asunto" "text" NOT NULL,
    "cuerpo" "text" NOT NULL,
    "estado" "text" DEFAULT 'pending'::"text" NOT NULL,
    "resend_message_id" "text",
    "error_detalle" "text",
    "sent_at" timestamp with time zone
);


ALTER TABLE "public"."notification_send_recipients" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."notification_sends" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "project_id" "text",
    "sent_by" "uuid" NOT NULL,
    "template_id" "uuid",
    "sender_name" "text" NOT NULL,
    "sender_reply_to" "text" NOT NULL,
    "channel" "text" DEFAULT 'email'::"text" NOT NULL,
    "asunto_base" "text" NOT NULL,
    "cuerpo_base" "text" NOT NULL,
    "adjuntos" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "sched_at" timestamp with time zone,
    "total_destinatarios" integer DEFAULT 0 NOT NULL,
    "enviados" integer DEFAULT 0 NOT NULL,
    "fallidos" integer DEFAULT 0 NOT NULL,
    "estado" "text" DEFAULT 'pending'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "sent_at" timestamp with time zone
);


ALTER TABLE "public"."notification_sends" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."notification_templates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "key" "text" NOT NULL,
    "nombre" "text" NOT NULL,
    "categoria" "text",
    "asunto" "text" NOT NULL,
    "cuerpo" "text" NOT NULL,
    "subver_by" "text",
    "subvers" "jsonb",
    "cuerpos" "jsonb",
    "es_default" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."notification_templates" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."org_invitations" (
    "id" "text" NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "email" "text" NOT NULL,
    "tipo" "text" NOT NULL,
    "perfil_codigo" integer NOT NULL,
    "cargo_id" "text",
    "project_id" "text",
    "invited_user_id" "uuid",
    "estado" "text" DEFAULT 'pendiente'::"text" NOT NULL,
    "invited_by" "uuid" NOT NULL,
    "expires_at" timestamp with time zone DEFAULT ("now"() + '14 days'::interval) NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "org_invitations_estado_check" CHECK (("estado" = ANY (ARRAY['pendiente'::"text", 'aceptada'::"text", 'rechazada'::"text", 'cancelada'::"text", 'expirada'::"text"]))),
    CONSTRAINT "org_invitations_tipo_check" CHECK (("tipo" = ANY (ARRAY['interno'::"text", 'externo'::"text"])))
);


ALTER TABLE "public"."org_invitations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."organization_branding" (
    "organization_id" "uuid" NOT NULL,
    "logo_data_url" "text",
    "logos" "jsonb",
    "nombre_ficticio" "text",
    "web" "text",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."organization_branding" OWNER TO "postgres";


COMMENT ON TABLE "public"."organization_branding" IS 'Branding publico (logo + nombre de fantasia) derivado de organization_profile. Legible por cualquier miembro activo (auth_codigo_perfil IS NOT NULL), para pintar el header. Lo sensible se queda en organization_profile (datos_empresa). Se sincroniza por trigger; no se escribe directo.';



CREATE TABLE IF NOT EXISTS "public"."organization_profile" (
    "organization_id" "uuid" NOT NULL,
    "profile" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "link_formulario_pago" "text",
    "remitente_nombre" "text",
    "remitente_numero" "text",
    "remitente_rol" "text"
);


ALTER TABLE "public"."organization_profile" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."organizations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "slug" "text" NOT NULL,
    "nombre" "text" NOT NULL,
    "rut" "text",
    "plan" "text" DEFAULT 'free'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_at" timestamp with time zone,
    CONSTRAINT "organizations_nombre_no_vacio" CHECK (("length"("btrim"("nombre")) > 0))
);


ALTER TABLE "public"."organizations" OWNER TO "postgres";


COMMENT ON TABLE "public"."organizations" IS 'Cada fila es una productora (tenant). Todo dato de negocio cuelga de aquí.';



CREATE TABLE IF NOT EXISTS "public"."permission_profiles" (
    "id" bigint NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "codigo" integer NOT NULL,
    "nombre" "text" NOT NULL,
    "descripcion" "text",
    "es_custom" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."permission_profiles" OWNER TO "postgres";


ALTER TABLE "public"."permission_profiles" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."permission_profiles_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."plan_catalog" (
    "codigo" "text" NOT NULL,
    "nombre" "text" NOT NULL,
    "max_proyectos_activos" integer,
    "max_colaboradores" integer,
    "orden" integer DEFAULT 0 NOT NULL,
    "notas" "text"
);


ALTER TABLE "public"."plan_catalog" OWNER TO "postgres";


COMMENT ON TABLE "public"."plan_catalog" IS 'GROUNDWORK (sin enforcement aun). Topes por plan, segun mockup v4. El mapeo modulo-por-plan NO esta aqui: el taxonomia de 13 modulos no calza con las fronteras de los planes (decision Marketing+producto pendiente). No esta cableado a auth_nivel.';



CREATE TABLE IF NOT EXISTS "public"."plan_features" (
    "plan_codigo" "text" NOT NULL,
    "feature" "text" NOT NULL
);


ALTER TABLE "public"."plan_features" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profile_permissions" (
    "id" bigint NOT NULL,
    "profile_id" bigint NOT NULL,
    "modulo" "text" NOT NULL,
    "nivel" "text" DEFAULT 'none'::"text" NOT NULL,
    CONSTRAINT "profile_permissions_nivel_check" CHECK (("nivel" = ANY (ARRAY['E'::"text", 'L'::"text", 'none'::"text"])))
);


ALTER TABLE "public"."profile_permissions" OWNER TO "postgres";


ALTER TABLE "public"."profile_permissions" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."profile_permissions_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."project_assignments" (
    "id" bigint NOT NULL,
    "project_id" "text" NOT NULL,
    "contact_id" "text" NOT NULL,
    "function_id" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."project_assignments" OWNER TO "postgres";


COMMENT ON TABLE "public"."project_assignments" IS 'Quién cumple qué función en cada proyecto. Una función = una persona por proyecto; una persona puede tener varias funciones.';



ALTER TABLE "public"."project_assignments" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."project_assignments_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."project_call_sheet" (
    "project_id" "text" NOT NULL,
    "data" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."project_call_sheet" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."project_cancellation_reasons" (
    "id" bigint NOT NULL,
    "project_id" "text" NOT NULL,
    "reason_id" bigint NOT NULL
);


ALTER TABLE "public"."project_cancellation_reasons" OWNER TO "postgres";


ALTER TABLE "public"."project_cancellation_reasons" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."project_cancellation_reasons_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."project_cancellations" (
    "project_id" "text" NOT NULL,
    "tipo" "text" NOT NULL,
    "fecha" "date" DEFAULT CURRENT_DATE NOT NULL,
    "etapa_al_cancelar" "text",
    "motivo_otro" "text",
    "notas" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "project_cancellations_tipo_check" CHECK (("tipo" = ANY (ARRAY['rechazado'::"text", 'cancelado'::"text"])))
);


ALTER TABLE "public"."project_cancellations" OWNER TO "postgres";


COMMENT ON TABLE "public"."project_cancellations" IS 'Desenlace anormal del proyecto. rechazado (pre-aprobación) vs cancelado (post, con costos).';



CREATE TABLE IF NOT EXISTS "public"."project_cargos" (
    "id" "text" NOT NULL,
    "project_id" "text" NOT NULL,
    "cargo" "text" NOT NULL,
    "custom" boolean DEFAULT false NOT NULL,
    "persona_nombre" "text",
    "contact_id" "text",
    "tipo" "text" DEFAULT 'interno'::"text" NOT NULL,
    "perfil" "text",
    "estado" "text" DEFAULT 'sin-asignar'::"text" NOT NULL,
    "invited_user_id" "uuid",
    "posicion" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "project_cargos_estado_check" CHECK (("estado" = ANY (ARRAY['sin-asignar'::"text", 'activo'::"text", 'pendiente'::"text", 'rechazo'::"text"]))),
    CONSTRAINT "project_cargos_tipo_check" CHECK (("tipo" = ANY (ARRAY['interno'::"text", 'externo'::"text"])))
);


ALTER TABLE "public"."project_cargos" OWNER TO "postgres";


COMMENT ON TABLE "public"."project_cargos" IS 'Capa de asignacion de cargos sobre el crew (mockup v4). Lectura directa con RLS; escritura solo via guardar_cargos(). estado del cargo externo transita pendiente->activo desde consentir_invitacion (momento E).';



CREATE TABLE IF NOT EXISTS "public"."project_client_payments" (
    "id" "text" DEFAULT ('pcp_'::"text" || "substr"("md5"((("random"())::"text" || ("clock_timestamp"())::"text")), 1, 12)) NOT NULL,
    "project_id" "text" NOT NULL,
    "monto" numeric NOT NULL,
    "nota" "text",
    "fecha" "date" DEFAULT CURRENT_DATE NOT NULL,
    "posicion" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."project_client_payments" OWNER TO "postgres";


COMMENT ON TABLE "public"."project_client_payments" IS 'Pagos/abonos de cliente por proyecto (Bird View financiero del CFO). Lectura directa gateada por finanzas_consolidada (Admin + Finanzas); escritura solo via guardar_pagos_cliente (estado completo). Tabla, no jsonb, para sumar/filtrar cobranza server-side.';



CREATE TABLE IF NOT EXISTS "public"."project_commercial" (
    "project_id" "text" NOT NULL,
    "cliente_empresa_id" "text",
    "cliente_contacto_id" "text",
    "agencia_empresa_id" "text",
    "cliente_texto" "text",
    "agencia_texto" "text",
    "derechos_tiempo" "text",
    "derechos_plataformas" "text",
    "derechos_territorio" "text",
    "contacto_cliente" "text",
    "mail_contacto_cliente" "text",
    "telefono_contacto_cliente" "text",
    "contacto_agencia" "text",
    "mail_contacto_agencia" "text",
    "telefono_contacto_agencia" "text",
    "condicion_pago" "text",
    "fecha_cotizacion" "date",
    "fecha_aprobacion" "date",
    "fecha_pago" "date",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."project_commercial" OWNER TO "postgres";


COMMENT ON TABLE "public"."project_commercial" IS 'Detalle comercial/PII del proyecto (cliente, agencia, contactos, derechos, condiciones y fechas de pago). Separado de projects para que un colaborador (Creativo/Coordinacion/Invitado) vea la fila del proyecto sin este detalle. Lectura gateada por info_proyecto E|L; escritura solo via guardar_proyecto.';



CREATE TABLE IF NOT EXISTS "public"."project_commissions" (
    "id" bigint NOT NULL,
    "project_id" "text" NOT NULL,
    "label" "text" DEFAULT 'Comisión'::"text" NOT NULL,
    "mode" "text" DEFAULT 'pct'::"text" NOT NULL,
    "value" numeric DEFAULT 0 NOT NULL,
    "posicion" integer DEFAULT 0 NOT NULL,
    CONSTRAINT "project_commissions_mode_check" CHECK (("mode" = ANY (ARRAY['pct'::"text", 'monto'::"text"])))
);


ALTER TABLE "public"."project_commissions" OWNER TO "postgres";


ALTER TABLE "public"."project_commissions" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."project_commissions_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."project_crew_extra" (
    "id" bigint NOT NULL,
    "project_id" "text" NOT NULL,
    "nombre" "text" NOT NULL,
    "contact_id" "text",
    "medio_transporte" "text"
);


ALTER TABLE "public"."project_crew_extra" OWNER TO "postgres";


ALTER TABLE "public"."project_crew_extra" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."project_crew_extra_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."project_documents" (
    "id" "text" NOT NULL,
    "project_id" "text" NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "categoria" "text",
    "titulo" "text",
    "url" "text",
    "notas" "text",
    "archivo_nombre" "text",
    "archivo_path" "text",
    "archivo_size" bigint,
    "ts" "text",
    "posicion" integer,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."project_documents" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."project_external_crew" (
    "id" bigint NOT NULL,
    "project_id" "text" NOT NULL,
    "tipo" "text",
    "nombre" "text",
    "rol" "text",
    "telefono" "text",
    "restriccion" "text",
    "direccion" "text",
    "comuna" "text",
    "posicion" integer DEFAULT 0 NOT NULL
);


ALTER TABLE "public"."project_external_crew" OWNER TO "postgres";


ALTER TABLE "public"."project_external_crew" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."project_external_crew_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."project_financials" (
    "project_id" "text" NOT NULL,
    "presupuesto_cliente" numeric DEFAULT 0 NOT NULL,
    "gastos_admin_pct" numeric DEFAULT 0.05 NOT NULL,
    "frozen" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "he_recargo_default" numeric DEFAULT 150 NOT NULL
);


ALTER TABLE "public"."project_financials" OWNER TO "postgres";


COMMENT ON TABLE "public"."project_financials" IS 'Resumen financiero 1:1 con el proyecto. frozen = snapshot de admin/riesgos al aprobar.';



CREATE TABLE IF NOT EXISTS "public"."project_functions" (
    "id" bigint NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "nombre" "text" NOT NULL,
    "nivel_portal" "text" DEFAULT 'produccion'::"text" NOT NULL,
    "permisos_default" "jsonb",
    "orden" integer DEFAULT 0 NOT NULL,
    "activo" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "project_functions_nivel_portal_check" CHECK (("nivel_portal" = ANY (ARRAY['produccion'::"text", 'notificaciones'::"text"])))
);


ALTER TABLE "public"."project_functions" OWNER TO "postgres";


COMMENT ON TABLE "public"."project_functions" IS 'Catálogo por organización de funciones de proyecto. Nombres y permisos editables por el cliente (SaaS). nivel_portal: quién entra al portal completo vs solo notificaciones.';



ALTER TABLE "public"."project_functions" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."project_functions_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."project_income_extras" (
    "id" bigint NOT NULL,
    "project_id" "text" NOT NULL,
    "label" "text" NOT NULL,
    "monto" numeric DEFAULT 0 NOT NULL,
    "posicion" integer DEFAULT 0 NOT NULL
);


ALTER TABLE "public"."project_income_extras" OWNER TO "postgres";


COMMENT ON TABLE "public"."project_income_extras" IS 'Ingresos extra post-aprobación. Distinto de las filas EXTRA de costo del presupuesto.';



ALTER TABLE "public"."project_income_extras" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."project_income_extras_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."project_locations" (
    "id" bigint NOT NULL,
    "project_id" "text" NOT NULL,
    "loc_id" "text" NOT NULL,
    "estado" "text",
    "costo" numeric,
    "contratacion" "text",
    "notas_proy" "text",
    "posicion" integer DEFAULT 0 NOT NULL
);


ALTER TABLE "public"."project_locations" OWNER TO "postgres";


ALTER TABLE "public"."project_locations" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."project_locations_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."project_members" (
    "id" bigint NOT NULL,
    "project_id" "text" NOT NULL,
    "contact_id" "text" NOT NULL,
    "rol" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."project_members" OWNER TO "postgres";


ALTER TABLE "public"."project_members" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."project_members_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."project_op_budgets" (
    "id" "text" NOT NULL,
    "project_id" "text" NOT NULL,
    "nombre" "text",
    "linea" "text",
    "resp" "text",
    "asignado" numeric,
    "posicion" integer DEFAULT 0 NOT NULL
);


ALTER TABLE "public"."project_op_budgets" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."project_operations" (
    "project_id" "text" NOT NULL,
    "asistentes_cliente" integer DEFAULT 0 NOT NULL,
    "asistentes_agencia" integer DEFAULT 0 NOT NULL,
    "asistentes_externo" integer DEFAULT 0 NOT NULL,
    "caja_prod" numeric DEFAULT 0 NOT NULL,
    "op_movimientos" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "op_lineas_extra" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."project_operations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."project_quotation" (
    "project_id" "text" NOT NULL,
    "fecha_emision" "date",
    "representante_cliente" "text",
    "condiciones" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "descripcion_proyecto" "text",
    "jornadas_rodaje" "text",
    "meta" "jsonb"
);


ALTER TABLE "public"."project_quotation" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."project_risks" (
    "id" bigint NOT NULL,
    "project_id" "text" NOT NULL,
    "label" "text" NOT NULL,
    "mode" "text" DEFAULT 'pct'::"text" NOT NULL,
    "value" numeric DEFAULT 0 NOT NULL,
    "posicion" integer DEFAULT 0 NOT NULL,
    CONSTRAINT "project_risks_mode_check" CHECK (("mode" = ANY (ARRAY['pct'::"text", 'monto'::"text"])))
);


ALTER TABLE "public"."project_risks" OWNER TO "postgres";


ALTER TABLE "public"."project_risks" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."project_risks_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."project_section_responsibles" (
    "id" bigint NOT NULL,
    "project_id" "text" NOT NULL,
    "seccion" "text" NOT NULL,
    "nombre" "text",
    "contact_id" "text"
);


ALTER TABLE "public"."project_section_responsibles" OWNER TO "postgres";


ALTER TABLE "public"."project_section_responsibles" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."project_section_responsibles_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."project_shoot_days" (
    "id" bigint NOT NULL,
    "project_id" "text" NOT NULL,
    "dia_id" "text" NOT NULL,
    "fecha" "date",
    "activo" boolean DEFAULT false NOT NULL,
    "descripcion" "text",
    "posicion" integer DEFAULT 0 NOT NULL
);


ALTER TABLE "public"."project_shoot_days" OWNER TO "postgres";


ALTER TABLE "public"."project_shoot_days" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."project_shoot_days_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."project_shooting_plan" (
    "project_id" "text" NOT NULL,
    "plan" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."project_shooting_plan" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."project_signals" (
    "id" "text" NOT NULL,
    "project_id" "text" NOT NULL,
    "tipo" "text",
    "seccion" "text",
    "descripcion" "text",
    "creada_ts" bigint,
    "visto_por" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "meta" "jsonb",
    "posicion" integer DEFAULT 0 NOT NULL
);


ALTER TABLE "public"."project_signals" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."project_tasks" (
    "id" "text" NOT NULL,
    "project_id" "text" NOT NULL,
    "seccion" "text",
    "texto" "text",
    "asignado_a" "text",
    "creado_por" "text",
    "estado" "text",
    "creada_ts" bigint,
    "posicion" integer DEFAULT 0 NOT NULL
);


ALTER TABLE "public"."project_tasks" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."projects" (
    "id" "text" NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "nombre_proyecto" "text" NOT NULL,
    "categoria" "text" DEFAULT 'publicidad'::"text" NOT NULL,
    "es_remunerado" boolean DEFAULT true NOT NULL,
    "servicio" "text" DEFAULT 'Producción'::"text",
    "productora" "text" DEFAULT 'Primate Films'::"text",
    "fecha_entrega_final" "date",
    "estado" "text" DEFAULT 'venta'::"text" NOT NULL,
    "aprobado_at" timestamp with time zone,
    "cerrado_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_at" timestamp with time zone,
    "created_by" "uuid",
    "updated_by" "uuid",
    "notificaciones_reglas" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    CONSTRAINT "projects_categoria_check" CHECK (("categoria" = ANY (ARRAY['publicidad'::"text", 'ficcion'::"text"]))),
    CONSTRAINT "projects_estado_check" CHECK (("estado" = ANY (ARRAY['venta'::"text", 'preproduccion'::"text", 'produccion'::"text", 'postproduccion'::"text", 'cierre'::"text", 'cerrado'::"text", 'rechazado'::"text", 'cancelado'::"text"])))
);


ALTER TABLE "public"."projects" OWNER TO "postgres";


COMMENT ON TABLE "public"."projects" IS 'Cabecera de proyecto. Cliente empresa-o-persona, categoría publicidad/ficción, remunerado/trucho. estado incluye pipeline + terminales.';



CREATE TABLE IF NOT EXISTS "public"."quotation_offers" (
    "id" bigint NOT NULL,
    "project_id" "text" NOT NULL,
    "nombre" "text" NOT NULL,
    "valor_cliente" numeric,
    "descripcion" "text",
    "incluye" "text"[],
    "no_incluye" "text"[],
    "entregables" "jsonb",
    "presupuesto_alt" "jsonb",
    "posicion" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "es_base" boolean DEFAULT false NOT NULL,
    "id_externo" "text"
);


ALTER TABLE "public"."quotation_offers" OWNER TO "postgres";


ALTER TABLE "public"."quotation_offers" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."quotation_offers_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."quotation_versions" (
    "id" bigint NOT NULL,
    "project_id" "text" NOT NULL,
    "numero" integer NOT NULL,
    "es_activa" boolean DEFAULT false NOT NULL,
    "snapshot" "jsonb",
    "nota" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."quotation_versions" OWNER TO "postgres";


COMMENT ON TABLE "public"."quotation_versions" IS 'Versiones históricas de cotización. snapshot JSONB = presupuesto+ofertas+condiciones congelados.';



ALTER TABLE "public"."quotation_versions" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."quotation_versions_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."scheduled_account_deletions" (
    "user_id" "uuid" NOT NULL,
    "requested_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "execute_after" timestamp with time zone NOT NULL,
    "estado" "text" DEFAULT 'pendiente'::"text" NOT NULL,
    "cancelled_at" timestamp with time zone,
    "executed_at" timestamp with time zone,
    CONSTRAINT "scheduled_account_deletions_estado_check" CHECK (("estado" = ANY (ARRAY['pendiente'::"text", 'cancelada'::"text", 'ejecutada'::"text"])))
);


ALTER TABLE "public"."scheduled_account_deletions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."task_attachments" (
    "id" bigint NOT NULL,
    "task_id" "text" NOT NULL,
    "nombre_original" "text",
    "storage_path" "text",
    "posicion" integer DEFAULT 0 NOT NULL
);


ALTER TABLE "public"."task_attachments" OWNER TO "postgres";


ALTER TABLE "public"."task_attachments" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."task_attachments_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."task_comments" (
    "id" "text" NOT NULL,
    "task_id" "text" NOT NULL,
    "autor" "text",
    "texto" "text",
    "ts" "text",
    "posicion" integer DEFAULT 0 NOT NULL
);


ALTER TABLE "public"."task_comments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tax_rates" (
    "id" bigint NOT NULL,
    "concepto" "text" NOT NULL,
    "tasa" numeric NOT NULL,
    "vigente_desde" "date" NOT NULL,
    "vigente_hasta" "date"
);


ALTER TABLE "public"."tax_rates" OWNER TO "postgres";


COMMENT ON TABLE "public"."tax_rates" IS 'Tasas de retención por concepto y fecha de vigencia. Sembrada hasta 2028 (calendario legislado Ley 21.133).';



ALTER TABLE "public"."tax_rates" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."tax_rates_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."user_bank_accounts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "bank_codigo_sbif" "text",
    "tipo_cuenta" "text",
    "numero_cuenta" "text",
    "es_principal" boolean DEFAULT false NOT NULL,
    "es_extranjera" boolean DEFAULT false NOT NULL,
    "datos_extra" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "user_bank_tipo_cuenta_chk" CHECK ((("tipo_cuenta" IS NULL) OR ("tipo_cuenta" = ANY (ARRAY['corriente'::"text", 'vista'::"text", 'ahorro'::"text", 'rut'::"text", 'chequera_electronica'::"text"]))))
);


ALTER TABLE "public"."user_bank_accounts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_notifications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "project_id" "text",
    "actor_id" "uuid",
    "tipo" "text" NOT NULL,
    "titulo" "text" NOT NULL,
    "cuerpo" "text",
    "data" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "read_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."user_notifications" OWNER TO "postgres";


COMMENT ON TABLE "public"."user_notifications" IS 'Buzon de avisos in-app por usuario (campanita). Lectura propia via RLS; escritura solo via RPC SECURITY DEFINER (_crear_notificacion). Independiente de notification_sends (cola de emails). Marcar leido via marcar_notificaciones_leidas.';



CREATE TABLE IF NOT EXISTS "public"."user_profiles" (
    "user_id" "uuid" NOT NULL,
    "nombre" "text",
    "apellido" "text",
    "rut" "text",
    "email" "text",
    "telefono" "text",
    "direccion" "text",
    "direccion_linea2" "text",
    "comuna" "text",
    "ciudad" "text",
    "region" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "completado_at" timestamp with time zone,
    "rol_publico" "text",
    "es_extranjero" boolean DEFAULT false NOT NULL,
    "pais" "text",
    "documento_identidad" "text",
    "fecha_nacimiento" "date"
);


ALTER TABLE "public"."user_profiles" OWNER TO "postgres";


COMMENT ON COLUMN "public"."user_profiles"."completado_at" IS 'NULL = perfil personal aun incompleto. Lo setea el onboarding cuando la persona termina el cuestionario largo. Es el semaforo para el muro post-pago: una empresa pagada no se puede operar hasta que su fundador tenga completado_at no nulo.';



COMMENT ON COLUMN "public"."user_profiles"."rol_publico" IS 'Rol que la persona normalmente desempeña (lo define el usuario, no la productora). Horizonte: visible en un directorio publico — esa exposicion es una feature aparte con su propia RLS/consentimiento; HOY sigue privado bajo RLS fila-propia.';



COMMENT ON COLUMN "public"."user_profiles"."pais" IS 'Pais del extranjero. El provisional guardaba el pais en region; migracion no requerida hoy (tabla vacia).';



COMMENT ON COLUMN "public"."user_profiles"."documento_identidad" IS 'Pasaporte u otro documento para no chilenos. NO pasa por fn_norm_rut (por eso es columna aparte); solo trim/upper.';



CREATE TABLE IF NOT EXISTS "public"."user_tool_archive" (
    "id" "text" DEFAULT ('uta_'::"text" || "substr"("md5"((("random"())::"text" || ("clock_timestamp"())::"text")), 1, 12)) NOT NULL,
    "user_id" "uuid" NOT NULL,
    "document_id" "text",
    "herramienta" "text" NOT NULL,
    "nombre" "text",
    "fecha_rodaje" "date",
    "data" "jsonb" NOT NULL,
    "exported_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."user_tool_archive" OWNER TO "postgres";


COMMENT ON TABLE "public"."user_tool_archive" IS 'Snapshot permanente (solo JSON, sin imagenes) de la ULTIMA version exportada de cada documento de herramienta personal. Sobrevive al vencimiento del documento (FK SET NULL); duracion ilimitada salvo que el usuario lo elimine. Si el usuario nunca exporto, no hay archivo (decision de Agustin, opcion B: documentos nunca exportados expiran sin dejar rastro, para evitar ruido).';



CREATE TABLE IF NOT EXISTS "public"."user_tool_documents" (
    "id" "text" DEFAULT ('utd_'::"text" || "substr"("md5"((("random"())::"text" || ("clock_timestamp"())::"text")), 1, 12)) NOT NULL,
    "user_id" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "herramienta" "text" NOT NULL,
    "nombre" "text",
    "data" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "fecha_rodaje" "date",
    "expires_at" timestamp with time zone,
    CONSTRAINT "user_tool_documents_herramienta_check" CHECK (("herramienta" = ANY (ARRAY['plan_rodaje'::"text", 'guion_tecnico'::"text", 'hoja_llamado'::"text"])))
);


ALTER TABLE "public"."user_tool_documents" OWNER TO "postgres";


COMMENT ON TABLE "public"."user_tool_documents" IS 'Herramientas personales de Tu espacio (plan_rodaje/guion_tecnico/hoja_llamado), usables sin productora. RLS fila-propia. data jsonb reusa el shape canonico de los modulos de proyecto. Gating por plan (gratis en Early Bird tras pago) = D-2, se aplica aparte.';



COMMENT ON COLUMN "public"."user_tool_documents"."fecha_rodaje" IS 'Fecha de rodaje declarada manualmente por el usuario (a diferencia de proyectos, donde se toma de RODAJES). Nullable.';



COMMENT ON COLUMN "public"."user_tool_documents"."expires_at" IS 'Vencimiento del documento: fecha_rodaje + 30 dias si hay fecha; si no, ultima modificacion + 30 dias (se recalcula en cada UPDATE). La eliminacion efectiva (filas + imagenes del bucket) la ejecuta una Edge Function programada, NO la base sola. Frontend: pastilla de cuenta regresiva en los ultimos 7 dias.';



CREATE TABLE IF NOT EXISTS "public"."user_tool_versions" (
    "id" "text" DEFAULT ('utv_'::"text" || "substr"("md5"((("random"())::"text" || ("clock_timestamp"())::"text")), 1, 12)) NOT NULL,
    "document_id" "text" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "numero" integer NOT NULL,
    "data" "jsonb" NOT NULL,
    "data_hash" "text" NOT NULL,
    "exported_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."user_tool_versions" OWNER TO "postgres";


COMMENT ON TABLE "public"."user_tool_versions" IS 'Versiones de herramientas personales. Una version = export manual CON cambios (mismo modelo que proyectos: cambio+export genera version; export sin cambios no). Inmutables desde cliente. Expiran junto al documento (CASCADE).';



ALTER TABLE ONLY "public"."analytics_events"
    ADD CONSTRAINT "analytics_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."app_config"
    ADD CONSTRAINT "app_config_pkey" PRIMARY KEY ("clave");



ALTER TABLE ONLY "public"."audit_log"
    ADD CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."bank_institutions"
    ADD CONSTRAINT "bank_institutions_pkey" PRIMARY KEY ("codigo_sbif");



ALTER TABLE ONLY "public"."budget_line_items"
    ADD CONSTRAINT "budget_line_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cancellation_reasons"
    ADD CONSTRAINT "cancellation_reasons_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cancellation_reasons"
    ADD CONSTRAINT "cancellation_reasons_unico" UNIQUE ("organization_id", "label");



ALTER TABLE ONLY "public"."companies"
    ADD CONSTRAINT "companies_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."companies"
    ADD CONSTRAINT "companies_rut_unico_por_org" UNIQUE ("organization_id", "rut");



ALTER TABLE ONLY "public"."company_relationships"
    ADD CONSTRAINT "company_rel_unico" UNIQUE ("company_id", "tipo");



ALTER TABLE ONLY "public"."company_relationships"
    ADD CONSTRAINT "company_relationships_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."consent_terms"
    ADD CONSTRAINT "consent_terms_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."contact_bank_accounts"
    ADD CONSTRAINT "contact_bank_accounts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."contact_companies"
    ADD CONSTRAINT "contact_companies_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."contact_companies"
    ADD CONSTRAINT "contact_companies_unico" UNIQUE ("contact_id", "company_id");



ALTER TABLE ONLY "public"."contact_roles"
    ADD CONSTRAINT "contact_roles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."contact_roles"
    ADD CONSTRAINT "contact_roles_unico" UNIQUE ("contact_id", "role");



ALTER TABLE ONLY "public"."contact_talent_profiles"
    ADD CONSTRAINT "contact_talent_profiles_pkey" PRIMARY KEY ("contact_id");



ALTER TABLE ONLY "public"."contacts"
    ADD CONSTRAINT "contacts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."contacts"
    ADD CONSTRAINT "contacts_rut_unico_por_org" UNIQUE ("organization_id", "rut");



ALTER TABLE ONLY "public"."cookie_consents"
    ADD CONSTRAINT "cookie_consents_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."data_consents"
    ADD CONSTRAINT "data_consents_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."departments"
    ADD CONSTRAINT "departments_nombre_unico" UNIQUE ("organization_id", "nombre");



ALTER TABLE ONLY "public"."departments"
    ADD CONSTRAINT "departments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."dte_types"
    ADD CONSTRAINT "dte_types_pkey" PRIMARY KEY ("code");



ALTER TABLE ONLY "public"."invitation_rebind_requests"
    ADD CONSTRAINT "invitation_rebind_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."legal_documents"
    ADD CONSTRAINT "legal_documents_pkey" PRIMARY KEY ("doc_id");



ALTER TABLE ONLY "public"."legal_templates"
    ADD CONSTRAINT "legal_templates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."locations"
    ADD CONSTRAINT "locations_pkey" PRIMARY KEY ("loc_id");



ALTER TABLE ONLY "public"."memberships"
    ADD CONSTRAINT "memberships_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."memberships"
    ADD CONSTRAINT "memberships_user_org_unique" UNIQUE ("user_id", "organization_id");



ALTER TABLE ONLY "public"."notification_send_recipients"
    ADD CONSTRAINT "notification_send_recipients_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notification_sends"
    ADD CONSTRAINT "notification_sends_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notification_templates"
    ADD CONSTRAINT "notification_templates_organization_id_key_key" UNIQUE ("organization_id", "key");



ALTER TABLE ONLY "public"."notification_templates"
    ADD CONSTRAINT "notification_templates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."org_invitations"
    ADD CONSTRAINT "org_invitations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."organization_branding"
    ADD CONSTRAINT "organization_branding_pkey" PRIMARY KEY ("organization_id");



ALTER TABLE ONLY "public"."organization_profile"
    ADD CONSTRAINT "organization_profile_pkey" PRIMARY KEY ("organization_id");



ALTER TABLE ONLY "public"."organizations"
    ADD CONSTRAINT "organizations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."organizations"
    ADD CONSTRAINT "organizations_rut_key" UNIQUE ("rut");



ALTER TABLE ONLY "public"."organizations"
    ADD CONSTRAINT "organizations_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."permission_profiles"
    ADD CONSTRAINT "permission_profiles_org_codigo_unique" UNIQUE ("organization_id", "codigo");



ALTER TABLE ONLY "public"."permission_profiles"
    ADD CONSTRAINT "permission_profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."plan_catalog"
    ADD CONSTRAINT "plan_catalog_pkey" PRIMARY KEY ("codigo");



ALTER TABLE ONLY "public"."plan_features"
    ADD CONSTRAINT "plan_features_pkey" PRIMARY KEY ("plan_codigo", "feature");



ALTER TABLE ONLY "public"."profile_permissions"
    ADD CONSTRAINT "profile_permissions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profile_permissions"
    ADD CONSTRAINT "profile_permissions_profile_modulo_unique" UNIQUE ("profile_id", "modulo");



ALTER TABLE ONLY "public"."project_assignments"
    ADD CONSTRAINT "project_assignments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."project_assignments"
    ADD CONSTRAINT "project_assignments_unico" UNIQUE ("project_id", "function_id");



ALTER TABLE ONLY "public"."project_call_sheet"
    ADD CONSTRAINT "project_call_sheet_pkey" PRIMARY KEY ("project_id");



ALTER TABLE ONLY "public"."project_cancellation_reasons"
    ADD CONSTRAINT "project_cancellation_reason_unico" UNIQUE ("project_id", "reason_id");



ALTER TABLE ONLY "public"."project_cancellation_reasons"
    ADD CONSTRAINT "project_cancellation_reasons_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."project_cancellations"
    ADD CONSTRAINT "project_cancellations_pkey" PRIMARY KEY ("project_id");



ALTER TABLE ONLY "public"."project_cargos"
    ADD CONSTRAINT "project_cargos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."project_client_payments"
    ADD CONSTRAINT "project_client_payments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."project_commercial"
    ADD CONSTRAINT "project_commercial_pkey" PRIMARY KEY ("project_id");



ALTER TABLE ONLY "public"."project_commissions"
    ADD CONSTRAINT "project_commissions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."project_crew_extra"
    ADD CONSTRAINT "project_crew_extra_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."project_crew_extra"
    ADD CONSTRAINT "project_crew_extra_project_id_nombre_key" UNIQUE ("project_id", "nombre");



ALTER TABLE ONLY "public"."project_documents"
    ADD CONSTRAINT "project_documents_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."project_external_crew"
    ADD CONSTRAINT "project_external_crew_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."project_financials"
    ADD CONSTRAINT "project_financials_pkey" PRIMARY KEY ("project_id");



ALTER TABLE ONLY "public"."project_functions"
    ADD CONSTRAINT "project_functions_nombre_unico" UNIQUE ("organization_id", "nombre");



ALTER TABLE ONLY "public"."project_functions"
    ADD CONSTRAINT "project_functions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."project_income_extras"
    ADD CONSTRAINT "project_income_extras_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."project_locations"
    ADD CONSTRAINT "project_locations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."project_locations"
    ADD CONSTRAINT "project_locations_project_id_loc_id_key" UNIQUE ("project_id", "loc_id");



ALTER TABLE ONLY "public"."project_members"
    ADD CONSTRAINT "project_members_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."project_members"
    ADD CONSTRAINT "project_members_project_contact_unique" UNIQUE ("project_id", "contact_id");



ALTER TABLE ONLY "public"."project_op_budgets"
    ADD CONSTRAINT "project_op_budgets_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."project_operations"
    ADD CONSTRAINT "project_operations_pkey" PRIMARY KEY ("project_id");



ALTER TABLE ONLY "public"."project_quotation"
    ADD CONSTRAINT "project_quotation_pkey" PRIMARY KEY ("project_id");



ALTER TABLE ONLY "public"."project_risks"
    ADD CONSTRAINT "project_risks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."project_section_responsibles"
    ADD CONSTRAINT "project_section_responsibles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."project_section_responsibles"
    ADD CONSTRAINT "project_section_responsibles_project_id_seccion_key" UNIQUE ("project_id", "seccion");



ALTER TABLE ONLY "public"."project_shoot_days"
    ADD CONSTRAINT "project_shoot_days_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."project_shoot_days"
    ADD CONSTRAINT "project_shoot_days_project_id_dia_id_key" UNIQUE ("project_id", "dia_id");



ALTER TABLE ONLY "public"."project_shooting_plan"
    ADD CONSTRAINT "project_shooting_plan_pkey" PRIMARY KEY ("project_id");



ALTER TABLE ONLY "public"."project_signals"
    ADD CONSTRAINT "project_signals_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."project_tasks"
    ADD CONSTRAINT "project_tasks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."projects"
    ADD CONSTRAINT "projects_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."quotation_offers"
    ADD CONSTRAINT "quotation_offers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."quotation_versions"
    ADD CONSTRAINT "quotation_versions_numero_unico" UNIQUE ("project_id", "numero");



ALTER TABLE ONLY "public"."quotation_versions"
    ADD CONSTRAINT "quotation_versions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."scheduled_account_deletions"
    ADD CONSTRAINT "scheduled_account_deletions_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."task_attachments"
    ADD CONSTRAINT "task_attachments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."task_comments"
    ADD CONSTRAINT "task_comments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tax_rates"
    ADD CONSTRAINT "tax_rates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tax_rates"
    ADD CONSTRAINT "tax_rates_unico" UNIQUE ("concepto", "vigente_desde");



ALTER TABLE ONLY "public"."user_bank_accounts"
    ADD CONSTRAINT "user_bank_accounts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_notifications"
    ADD CONSTRAINT "user_notifications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_profiles"
    ADD CONSTRAINT "user_profiles_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."user_tool_archive"
    ADD CONSTRAINT "user_tool_archive_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_tool_documents"
    ADD CONSTRAINT "user_tool_documents_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_tool_versions"
    ADD CONSTRAINT "user_tool_versions_document_id_numero_key" UNIQUE ("document_id", "numero");



ALTER TABLE ONLY "public"."user_tool_versions"
    ADD CONSTRAINT "user_tool_versions_pkey" PRIMARY KEY ("id");



CREATE INDEX "analytics_events_name_idx" ON "public"."analytics_events" USING "btree" ("event_name", "created_at");



CREATE INDEX "analytics_events_user_idx" ON "public"."analytics_events" USING "btree" ("user_id");



CREATE UNIQUE INDEX "consent_terms_vigente_uq" ON "public"."consent_terms" USING "btree" ("tipo") WHERE "vigente";



CREATE INDEX "idx_assignments_contact" ON "public"."project_assignments" USING "btree" ("contact_id");



CREATE INDEX "idx_assignments_function" ON "public"."project_assignments" USING "btree" ("function_id");



CREATE INDEX "idx_assignments_project" ON "public"."project_assignments" USING "btree" ("project_id");



CREATE INDEX "idx_audit_fecha" ON "public"."audit_log" USING "btree" ("created_at");



CREATE INDEX "idx_audit_org" ON "public"."audit_log" USING "btree" ("organization_id");



CREATE INDEX "idx_audit_tabla" ON "public"."audit_log" USING "btree" ("tabla", "registro_id");



CREATE INDEX "idx_bank_accounts_contact" ON "public"."contact_bank_accounts" USING "btree" ("contact_id");



CREATE INDEX "idx_budget_contact" ON "public"."budget_line_items" USING "btree" ("contact_id");



CREATE INDEX "idx_budget_department" ON "public"."budget_line_items" USING "btree" ("department_id");



CREATE INDEX "idx_budget_project" ON "public"."budget_line_items" USING "btree" ("project_id");



CREATE INDEX "idx_budget_section" ON "public"."budget_line_items" USING "btree" ("project_id", "section");



CREATE INDEX "idx_cancellation_reasons_org" ON "public"."cancellation_reasons" USING "btree" ("organization_id");



CREATE INDEX "idx_cancellation_reasons_proj" ON "public"."project_cancellation_reasons" USING "btree" ("project_id");



CREATE INDEX "idx_commissions_project" ON "public"."project_commissions" USING "btree" ("project_id");



CREATE INDEX "idx_companies_nombre" ON "public"."companies" USING "btree" ("nombre_fantasia");



CREATE INDEX "idx_companies_org" ON "public"."companies" USING "btree" ("organization_id");



CREATE INDEX "idx_companies_rut" ON "public"."companies" USING "btree" ("rut");



CREATE INDEX "idx_company_rel_company" ON "public"."company_relationships" USING "btree" ("company_id");



CREATE INDEX "idx_consents_org" ON "public"."data_consents" USING "btree" ("organization_id");



CREATE INDEX "idx_consents_user" ON "public"."data_consents" USING "btree" ("user_id");



CREATE INDEX "idx_contact_companies_company" ON "public"."contact_companies" USING "btree" ("company_id");



CREATE INDEX "idx_contact_companies_contact" ON "public"."contact_companies" USING "btree" ("contact_id");



CREATE INDEX "idx_contact_roles_contact" ON "public"."contact_roles" USING "btree" ("contact_id");



CREATE INDEX "idx_contacts_email" ON "public"."contacts" USING "btree" ("email");



CREATE INDEX "idx_contacts_nombre" ON "public"."contacts" USING "btree" ("nombre");



CREATE INDEX "idx_contacts_org" ON "public"."contacts" USING "btree" ("organization_id");



CREATE INDEX "idx_contacts_rut" ON "public"."contacts" USING "btree" ("rut");



CREATE INDEX "idx_crew_extra_proj" ON "public"."project_crew_extra" USING "btree" ("project_id");



CREATE INDEX "idx_departments_org" ON "public"."departments" USING "btree" ("organization_id");



CREATE INDEX "idx_external_crew_proj" ON "public"."project_external_crew" USING "btree" ("project_id");



CREATE INDEX "idx_income_extras_project" ON "public"."project_income_extras" USING "btree" ("project_id");



CREATE INDEX "idx_legal_docs_org" ON "public"."legal_documents" USING "btree" ("organization_id");



CREATE INDEX "idx_legal_docs_proj" ON "public"."legal_documents" USING "btree" ("project_id");



CREATE INDEX "idx_legal_tpl_org" ON "public"."legal_templates" USING "btree" ("organization_id");



CREATE INDEX "idx_locations_org" ON "public"."locations" USING "btree" ("organization_id");



CREATE INDEX "idx_notif_recipients_estado" ON "public"."notification_send_recipients" USING "btree" ("estado");



CREATE INDEX "idx_notif_recipients_send" ON "public"."notification_send_recipients" USING "btree" ("send_id");



CREATE INDEX "idx_notif_sends_by" ON "public"."notification_sends" USING "btree" ("sent_by");



CREATE INDEX "idx_notif_sends_org" ON "public"."notification_sends" USING "btree" ("organization_id");



CREATE INDEX "idx_notif_sends_project" ON "public"."notification_sends" USING "btree" ("project_id");



CREATE INDEX "idx_notif_sends_sched" ON "public"."notification_sends" USING "btree" ("sched_at") WHERE ("sched_at" IS NOT NULL);



CREATE INDEX "idx_notif_templates_org" ON "public"."notification_templates" USING "btree" ("organization_id");



CREATE INDEX "idx_offers_project" ON "public"."quotation_offers" USING "btree" ("project_id");



CREATE INDEX "idx_op_budgets_proj" ON "public"."project_op_budgets" USING "btree" ("project_id");



CREATE INDEX "idx_org_invitations_email" ON "public"."org_invitations" USING "btree" ("email", "estado");



CREATE INDEX "idx_org_invitations_org" ON "public"."org_invitations" USING "btree" ("organization_id", "estado");



CREATE INDEX "idx_proj_locations_proj" ON "public"."project_locations" USING "btree" ("project_id");



CREATE INDEX "idx_project_commercial_agencia" ON "public"."project_commercial" USING "btree" ("agencia_empresa_id");



CREATE INDEX "idx_project_commercial_cliente_emp" ON "public"."project_commercial" USING "btree" ("cliente_empresa_id");



CREATE INDEX "idx_project_documents_org" ON "public"."project_documents" USING "btree" ("organization_id");



CREATE INDEX "idx_project_documents_project" ON "public"."project_documents" USING "btree" ("project_id");



CREATE INDEX "idx_project_functions_org" ON "public"."project_functions" USING "btree" ("organization_id");



CREATE INDEX "idx_projects_estado" ON "public"."projects" USING "btree" ("estado");



CREATE INDEX "idx_projects_org" ON "public"."projects" USING "btree" ("organization_id");



CREATE INDEX "idx_risks_project" ON "public"."project_risks" USING "btree" ("project_id");



CREATE INDEX "idx_sec_resp_proj" ON "public"."project_section_responsibles" USING "btree" ("project_id");



CREATE INDEX "idx_shoot_days_proj" ON "public"."project_shoot_days" USING "btree" ("project_id");



CREATE INDEX "idx_signals_proj" ON "public"."project_signals" USING "btree" ("project_id");



CREATE INDEX "idx_talent_areas" ON "public"."contact_talent_profiles" USING "gin" ("areas_interes");



CREATE INDEX "idx_task_attach_task" ON "public"."task_attachments" USING "btree" ("task_id");



CREATE INDEX "idx_task_comments_task" ON "public"."task_comments" USING "btree" ("task_id");



CREATE INDEX "idx_tasks_proj" ON "public"."project_tasks" USING "btree" ("project_id");



CREATE INDEX "idx_user_bank_user" ON "public"."user_bank_accounts" USING "btree" ("user_id");



CREATE INDEX "idx_versions_project" ON "public"."quotation_versions" USING "btree" ("project_id");



CREATE INDEX "ix_cookie_consents_user" ON "public"."cookie_consents" USING "btree" ("user_id", "accepted_at" DESC);



CREATE INDEX "ix_rebind_org_estado" ON "public"."invitation_rebind_requests" USING "btree" ("organization_id", "estado");



CREATE INDEX "project_cargos_invited_user_idx" ON "public"."project_cargos" USING "btree" ("invited_user_id") WHERE ("invited_user_id" IS NOT NULL);



CREATE INDEX "project_cargos_project_idx" ON "public"."project_cargos" USING "btree" ("project_id");



CREATE INDEX "project_cargos_visibilidad_idx" ON "public"."project_cargos" USING "btree" ("project_id", "invited_user_id") WHERE (("estado" = 'activo'::"text") AND ("invited_user_id" IS NOT NULL));



CREATE INDEX "project_client_payments_project_idx" ON "public"."project_client_payments" USING "btree" ("project_id");



CREATE UNIQUE INDEX "uniq_cuenta_principal_por_contacto" ON "public"."contact_bank_accounts" USING "btree" ("contact_id") WHERE ("es_principal" = true);



CREATE UNIQUE INDEX "uniq_representante_por_empresa" ON "public"."contact_companies" USING "btree" ("company_id") WHERE ("es_representante" = true);



CREATE UNIQUE INDEX "uniq_version_activa_por_proyecto" ON "public"."quotation_versions" USING "btree" ("project_id") WHERE ("es_activa" = true);



CREATE UNIQUE INDEX "uq_rebind_pendiente" ON "public"."invitation_rebind_requests" USING "btree" ("invitation_id", "claiming_user_id") WHERE ("estado" = 'pendiente'::"text");



CREATE INDEX "user_notifications_inbox_idx" ON "public"."user_notifications" USING "btree" ("user_id", "created_at" DESC);



CREATE INDEX "user_notifications_unread_idx" ON "public"."user_notifications" USING "btree" ("user_id") WHERE ("read_at" IS NULL);



CREATE UNIQUE INDEX "user_tool_archive_doc_uq" ON "public"."user_tool_archive" USING "btree" ("document_id") WHERE ("document_id" IS NOT NULL);



CREATE INDEX "user_tool_archive_user_idx" ON "public"."user_tool_archive" USING "btree" ("user_id");



CREATE INDEX "user_tool_documents_user_idx" ON "public"."user_tool_documents" USING "btree" ("user_id", "herramienta");



CREATE INDEX "user_tool_versions_doc_idx" ON "public"."user_tool_versions" USING "btree" ("document_id", "numero" DESC);



CREATE OR REPLACE TRIGGER "trg_audit_bank_accounts" AFTER INSERT OR DELETE OR UPDATE ON "public"."contact_bank_accounts" FOR EACH ROW EXECUTE FUNCTION "public"."audit_trigger"();



CREATE OR REPLACE TRIGGER "trg_audit_contacts" AFTER INSERT OR DELETE OR UPDATE ON "public"."contacts" FOR EACH ROW EXECUTE FUNCTION "public"."audit_trigger"();



CREATE OR REPLACE TRIGGER "trg_audit_legal_documents" AFTER INSERT OR DELETE OR UPDATE ON "public"."legal_documents" FOR EACH ROW EXECUTE FUNCTION "public"."audit_trigger"();



CREATE OR REPLACE TRIGGER "trg_audit_project_financials" AFTER INSERT OR DELETE OR UPDATE ON "public"."project_financials" FOR EACH ROW EXECUTE FUNCTION "public"."audit_trigger"();



CREATE OR REPLACE TRIGGER "trg_audit_projects" AFTER INSERT OR DELETE OR UPDATE ON "public"."projects" FOR EACH ROW EXECUTE FUNCTION "public"."audit_trigger"();



CREATE OR REPLACE TRIGGER "trg_bank_accounts_updated" BEFORE UPDATE ON "public"."contact_bank_accounts" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_budget_updated" BEFORE UPDATE ON "public"."budget_line_items" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_cancellation_reasons_updated" BEFORE UPDATE ON "public"."cancellation_reasons" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_cancellations_updated" BEFORE UPDATE ON "public"."project_cancellations" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_companies_updated" BEFORE UPDATE ON "public"."companies" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_contacts_updated" BEFORE UPDATE ON "public"."contacts" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_departments_updated" BEFORE UPDATE ON "public"."departments" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_limite_user_tool_documents" BEFORE INSERT ON "public"."user_tool_documents" FOR EACH ROW EXECUTE FUNCTION "public"."trg_limite_user_tool_documents"();



CREATE OR REPLACE TRIGGER "trg_norm_bank_accounts" BEFORE INSERT OR UPDATE ON "public"."contact_bank_accounts" FOR EACH ROW EXECUTE FUNCTION "public"."fn_norm_bank_accounts"();



CREATE OR REPLACE TRIGGER "trg_norm_companies" BEFORE INSERT OR UPDATE ON "public"."companies" FOR EACH ROW EXECUTE FUNCTION "public"."fn_norm_companies"();



CREATE OR REPLACE TRIGGER "trg_norm_contacts" BEFORE INSERT OR UPDATE ON "public"."contacts" FOR EACH ROW EXECUTE FUNCTION "public"."fn_norm_contacts"();



CREATE OR REPLACE TRIGGER "trg_norm_legal_documents" BEFORE INSERT OR UPDATE ON "public"."legal_documents" FOR EACH ROW EXECUTE FUNCTION "public"."fn_norm_legal_documents"();



CREATE OR REPLACE TRIGGER "trg_norm_organizations" BEFORE INSERT OR UPDATE ON "public"."organizations" FOR EACH ROW EXECUTE FUNCTION "public"."fn_norm_organizations"();



CREATE OR REPLACE TRIGGER "trg_norm_user_bank" BEFORE INSERT OR UPDATE ON "public"."user_bank_accounts" FOR EACH ROW EXECUTE FUNCTION "public"."trg_norm_user_bank"();



CREATE OR REPLACE TRIGGER "trg_norm_user_profiles" BEFORE INSERT OR UPDATE ON "public"."user_profiles" FOR EACH ROW EXECUTE FUNCTION "public"."trg_norm_user_profiles"();



CREATE OR REPLACE TRIGGER "trg_offers_updated" BEFORE UPDATE ON "public"."quotation_offers" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_org_profile_branding" AFTER INSERT OR UPDATE ON "public"."organization_profile" FOR EACH ROW EXECUTE FUNCTION "public"."trg_sync_org_branding"();



CREATE OR REPLACE TRIGGER "trg_organizations_updated" BEFORE UPDATE ON "public"."organizations" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_project_commercial_updated" BEFORE UPDATE ON "public"."project_commercial" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_project_financials_updated" BEFORE UPDATE ON "public"."project_financials" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_project_functions_updated" BEFORE UPDATE ON "public"."project_functions" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_project_quotation_updated" BEFORE UPDATE ON "public"."project_quotation" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_projects_updated" BEFORE UPDATE ON "public"."projects" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_proteger_ultimo_admin" BEFORE DELETE OR UPDATE ON "public"."memberships" FOR EACH ROW EXECUTE FUNCTION "public"."trg_proteger_ultimo_admin"();



CREATE OR REPLACE TRIGGER "trg_talent_updated" BEFORE UPDATE ON "public"."contact_talent_profiles" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_user_tool_documents_meta" BEFORE INSERT OR UPDATE ON "public"."user_tool_documents" FOR EACH ROW EXECUTE FUNCTION "public"."trg_user_tool_documents_meta"();



ALTER TABLE ONLY "public"."budget_line_items"
    ADD CONSTRAINT "budget_line_items_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."budget_line_items"
    ADD CONSTRAINT "budget_line_items_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."budget_line_items"
    ADD CONSTRAINT "budget_line_items_dte_fkey" FOREIGN KEY ("dte") REFERENCES "public"."dte_types"("code");



ALTER TABLE ONLY "public"."budget_line_items"
    ADD CONSTRAINT "budget_line_items_dte_real_fkey" FOREIGN KEY ("dte_real") REFERENCES "public"."dte_types"("code");



ALTER TABLE ONLY "public"."budget_line_items"
    ADD CONSTRAINT "budget_line_items_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."cancellation_reasons"
    ADD CONSTRAINT "cancellation_reasons_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."companies"
    ADD CONSTRAINT "companies_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."companies"
    ADD CONSTRAINT "companies_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."companies"
    ADD CONSTRAINT "companies_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."company_relationships"
    ADD CONSTRAINT "company_relationships_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."contact_bank_accounts"
    ADD CONSTRAINT "contact_bank_accounts_bank_codigo_sbif_fkey" FOREIGN KEY ("bank_codigo_sbif") REFERENCES "public"."bank_institutions"("codigo_sbif");



ALTER TABLE ONLY "public"."contact_bank_accounts"
    ADD CONSTRAINT "contact_bank_accounts_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."contact_companies"
    ADD CONSTRAINT "contact_companies_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."contact_companies"
    ADD CONSTRAINT "contact_companies_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."contact_roles"
    ADD CONSTRAINT "contact_roles_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."contact_talent_profiles"
    ADD CONSTRAINT "contact_talent_profiles_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."contacts"
    ADD CONSTRAINT "contacts_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."contacts"
    ADD CONSTRAINT "contacts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."contacts"
    ADD CONSTRAINT "contacts_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."cookie_consents"
    ADD CONSTRAINT "cookie_consents_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."data_consents"
    ADD CONSTRAINT "data_consents_membership_id_fkey" FOREIGN KEY ("membership_id") REFERENCES "public"."memberships"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."data_consents"
    ADD CONSTRAINT "data_consents_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."data_consents"
    ADD CONSTRAINT "data_consents_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."departments"
    ADD CONSTRAINT "departments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."contact_bank_accounts"
    ADD CONSTRAINT "fk_bank_accounts_institucion" FOREIGN KEY ("bank_codigo_sbif") REFERENCES "public"."bank_institutions"("codigo_sbif");



ALTER TABLE ONLY "public"."contacts"
    ADD CONSTRAINT "fk_contacts_dte_habitual" FOREIGN KEY ("dte_habitual") REFERENCES "public"."dte_types"("code");



ALTER TABLE ONLY "public"."invitation_rebind_requests"
    ADD CONSTRAINT "invitation_rebind_requests_claiming_user_id_fkey" FOREIGN KEY ("claiming_user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."invitation_rebind_requests"
    ADD CONSTRAINT "invitation_rebind_requests_invitation_id_fkey" FOREIGN KEY ("invitation_id") REFERENCES "public"."org_invitations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."invitation_rebind_requests"
    ADD CONSTRAINT "invitation_rebind_requests_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."legal_documents"
    ADD CONSTRAINT "legal_documents_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."legal_documents"
    ADD CONSTRAINT "legal_documents_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."legal_templates"
    ADD CONSTRAINT "legal_templates_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."locations"
    ADD CONSTRAINT "locations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."memberships"
    ADD CONSTRAINT "memberships_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id");



ALTER TABLE ONLY "public"."memberships"
    ADD CONSTRAINT "memberships_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."memberships"
    ADD CONSTRAINT "memberships_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "public"."permission_profiles"("id");



ALTER TABLE ONLY "public"."memberships"
    ADD CONSTRAINT "memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."notification_send_recipients"
    ADD CONSTRAINT "notification_send_recipients_send_id_fkey" FOREIGN KEY ("send_id") REFERENCES "public"."notification_sends"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notification_sends"
    ADD CONSTRAINT "notification_sends_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notification_sends"
    ADD CONSTRAINT "notification_sends_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."notification_sends"
    ADD CONSTRAINT "notification_sends_sent_by_fkey" FOREIGN KEY ("sent_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."notification_sends"
    ADD CONSTRAINT "notification_sends_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "public"."notification_templates"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."notification_templates"
    ADD CONSTRAINT "notification_templates_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."org_invitations"
    ADD CONSTRAINT "org_invitations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."organization_branding"
    ADD CONSTRAINT "organization_branding_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."organization_profile"
    ADD CONSTRAINT "organization_profile_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."organizations"
    ADD CONSTRAINT "organizations_plan_fk" FOREIGN KEY ("plan") REFERENCES "public"."plan_catalog"("codigo") ON UPDATE CASCADE;



ALTER TABLE ONLY "public"."permission_profiles"
    ADD CONSTRAINT "permission_profiles_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."plan_features"
    ADD CONSTRAINT "plan_features_plan_codigo_fkey" FOREIGN KEY ("plan_codigo") REFERENCES "public"."plan_catalog"("codigo") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profile_permissions"
    ADD CONSTRAINT "profile_permissions_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "public"."permission_profiles"("id");



ALTER TABLE ONLY "public"."project_assignments"
    ADD CONSTRAINT "project_assignments_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."project_assignments"
    ADD CONSTRAINT "project_assignments_function_id_fkey" FOREIGN KEY ("function_id") REFERENCES "public"."project_functions"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."project_assignments"
    ADD CONSTRAINT "project_assignments_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."project_call_sheet"
    ADD CONSTRAINT "project_call_sheet_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."project_cancellation_reasons"
    ADD CONSTRAINT "project_cancellation_reasons_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."project_cancellations"("project_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."project_cancellation_reasons"
    ADD CONSTRAINT "project_cancellation_reasons_reason_id_fkey" FOREIGN KEY ("reason_id") REFERENCES "public"."cancellation_reasons"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."project_cancellations"
    ADD CONSTRAINT "project_cancellations_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."project_cargos"
    ADD CONSTRAINT "project_cargos_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id");



ALTER TABLE ONLY "public"."project_cargos"
    ADD CONSTRAINT "project_cargos_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."project_client_payments"
    ADD CONSTRAINT "project_client_payments_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."project_commercial"
    ADD CONSTRAINT "project_commercial_agencia_empresa_id_fkey" FOREIGN KEY ("agencia_empresa_id") REFERENCES "public"."companies"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."project_commercial"
    ADD CONSTRAINT "project_commercial_cliente_contacto_id_fkey" FOREIGN KEY ("cliente_contacto_id") REFERENCES "public"."contacts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."project_commercial"
    ADD CONSTRAINT "project_commercial_cliente_empresa_id_fkey" FOREIGN KEY ("cliente_empresa_id") REFERENCES "public"."companies"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."project_commercial"
    ADD CONSTRAINT "project_commercial_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."project_commissions"
    ADD CONSTRAINT "project_commissions_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."project_crew_extra"
    ADD CONSTRAINT "project_crew_extra_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id");



ALTER TABLE ONLY "public"."project_crew_extra"
    ADD CONSTRAINT "project_crew_extra_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."project_documents"
    ADD CONSTRAINT "project_documents_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."project_external_crew"
    ADD CONSTRAINT "project_external_crew_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."project_financials"
    ADD CONSTRAINT "project_financials_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."project_functions"
    ADD CONSTRAINT "project_functions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."project_income_extras"
    ADD CONSTRAINT "project_income_extras_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."project_locations"
    ADD CONSTRAINT "project_locations_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."project_members"
    ADD CONSTRAINT "project_members_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id");



ALTER TABLE ONLY "public"."project_members"
    ADD CONSTRAINT "project_members_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id");



ALTER TABLE ONLY "public"."project_op_budgets"
    ADD CONSTRAINT "project_op_budgets_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."project_operations"
    ADD CONSTRAINT "project_operations_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."project_quotation"
    ADD CONSTRAINT "project_quotation_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."project_risks"
    ADD CONSTRAINT "project_risks_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."project_section_responsibles"
    ADD CONSTRAINT "project_section_responsibles_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id");



ALTER TABLE ONLY "public"."project_section_responsibles"
    ADD CONSTRAINT "project_section_responsibles_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."project_shoot_days"
    ADD CONSTRAINT "project_shoot_days_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."project_shooting_plan"
    ADD CONSTRAINT "project_shooting_plan_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."project_signals"
    ADD CONSTRAINT "project_signals_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."project_tasks"
    ADD CONSTRAINT "project_tasks_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."projects"
    ADD CONSTRAINT "projects_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."projects"
    ADD CONSTRAINT "projects_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."projects"
    ADD CONSTRAINT "projects_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."quotation_offers"
    ADD CONSTRAINT "quotation_offers_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."quotation_versions"
    ADD CONSTRAINT "quotation_versions_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."scheduled_account_deletions"
    ADD CONSTRAINT "scheduled_account_deletions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."task_attachments"
    ADD CONSTRAINT "task_attachments_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "public"."project_tasks"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."task_comments"
    ADD CONSTRAINT "task_comments_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "public"."project_tasks"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_bank_accounts"
    ADD CONSTRAINT "user_bank_accounts_bank_codigo_sbif_fkey" FOREIGN KEY ("bank_codigo_sbif") REFERENCES "public"."bank_institutions"("codigo_sbif");



ALTER TABLE ONLY "public"."user_bank_accounts"
    ADD CONSTRAINT "user_bank_accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_notifications"
    ADD CONSTRAINT "user_notifications_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."user_notifications"
    ADD CONSTRAINT "user_notifications_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_notifications"
    ADD CONSTRAINT "user_notifications_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_notifications"
    ADD CONSTRAINT "user_notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_profiles"
    ADD CONSTRAINT "user_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_tool_archive"
    ADD CONSTRAINT "user_tool_archive_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "public"."user_tool_documents"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."user_tool_archive"
    ADD CONSTRAINT "user_tool_archive_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_tool_documents"
    ADD CONSTRAINT "user_tool_documents_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_tool_versions"
    ADD CONSTRAINT "user_tool_versions_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "public"."user_tool_documents"("id") ON DELETE CASCADE;



ALTER TABLE "public"."analytics_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."app_config" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."audit_log" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "b_analytics_insert_own" ON "public"."analytics_events" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "b_assignments_mod" ON "public"."project_assignments" TO "authenticated" USING ((("public"."auth_nivel"('operacion_creatividad'::"text", "public"."get_project_org"("project_id")) = 'E'::"text") AND "public"."auth_ve_proyecto"("project_id", "public"."get_project_org"("project_id")))) WITH CHECK (("public"."auth_nivel"('operacion_creatividad'::"text", "public"."get_project_org"("project_id")) = 'E'::"text"));



CREATE POLICY "b_assignments_sel" ON "public"."project_assignments" FOR SELECT TO "authenticated" USING ((("public"."auth_nivel"('operacion_creatividad'::"text", "public"."get_project_org"("project_id")) = ANY (ARRAY['E'::"text", 'L'::"text"])) AND "public"."auth_ve_proyecto"("project_id", "public"."get_project_org"("project_id"))));



CREATE POLICY "b_audit_log_sel" ON "public"."audit_log" FOR SELECT TO "authenticated" USING (("public"."auth_nivel"('gestion_permisos'::"text", "organization_id") = 'E'::"text"));



CREATE POLICY "b_bank_accounts_del" ON "public"."contact_bank_accounts" FOR DELETE TO "authenticated" USING (("public"."auth_nivel"('bd'::"text", "public"."get_contact_org"("contact_id")) = 'E'::"text"));



CREATE POLICY "b_bank_accounts_mod" ON "public"."contact_bank_accounts" FOR INSERT TO "authenticated" WITH CHECK (("public"."auth_nivel"('bd'::"text", "public"."get_contact_org"("contact_id")) = 'E'::"text"));



CREATE POLICY "b_bank_accounts_sel" ON "public"."contact_bank_accounts" FOR SELECT TO "authenticated" USING (("public"."auth_nivel"('bd'::"text", "public"."get_contact_org"("contact_id")) = ANY (ARRAY['E'::"text", 'L'::"text"])));



CREATE POLICY "b_bank_accounts_upd" ON "public"."contact_bank_accounts" FOR UPDATE TO "authenticated" USING (("public"."auth_nivel"('bd'::"text", "public"."get_contact_org"("contact_id")) = 'E'::"text")) WITH CHECK (("public"."auth_nivel"('bd'::"text", "public"."get_contact_org"("contact_id")) = 'E'::"text"));



CREATE POLICY "b_bank_institutions_sel" ON "public"."bank_institutions" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "b_budget_mod" ON "public"."budget_line_items" TO "authenticated" USING ((("public"."auth_nivel"('presupuesto'::"text", "public"."get_project_org"("project_id")) = 'E'::"text") AND "public"."auth_ve_proyecto"("project_id", "public"."get_project_org"("project_id")))) WITH CHECK (("public"."auth_nivel"('presupuesto'::"text", "public"."get_project_org"("project_id")) = 'E'::"text"));



CREATE POLICY "b_budget_sel" ON "public"."budget_line_items" FOR SELECT TO "authenticated" USING ((("public"."auth_nivel"('presupuesto'::"text", "public"."get_project_org"("project_id")) = ANY (ARRAY['E'::"text", 'L'::"text"])) AND "public"."auth_ve_proyecto"("project_id", "public"."get_project_org"("project_id"))));



CREATE POLICY "b_call_sheet_mod" ON "public"."project_call_sheet" TO "authenticated" USING ((("public"."auth_nivel"('operacion_creatividad'::"text", "public"."get_project_org"("project_id")) = 'E'::"text") AND "public"."auth_ve_proyecto"("project_id", "public"."get_project_org"("project_id")))) WITH CHECK (("public"."auth_nivel"('operacion_creatividad'::"text", "public"."get_project_org"("project_id")) = 'E'::"text"));



CREATE POLICY "b_call_sheet_sel" ON "public"."project_call_sheet" FOR SELECT TO "authenticated" USING ((("public"."auth_nivel"('operacion_creatividad'::"text", "public"."get_project_org"("project_id")) = ANY (ARRAY['E'::"text", 'L'::"text"])) AND "public"."auth_ve_proyecto"("project_id", "public"."get_project_org"("project_id"))));



CREATE POLICY "b_cancel_reasons_link_mod" ON "public"."project_cancellation_reasons" TO "authenticated" USING ((("public"."auth_nivel"('reporte_cierre'::"text", "public"."get_project_org"("project_id")) = 'E'::"text") AND "public"."auth_ve_proyecto"("project_id", "public"."get_project_org"("project_id")))) WITH CHECK (("public"."auth_nivel"('reporte_cierre'::"text", "public"."get_project_org"("project_id")) = 'E'::"text"));



CREATE POLICY "b_cancel_reasons_link_sel" ON "public"."project_cancellation_reasons" FOR SELECT TO "authenticated" USING ((("public"."auth_nivel"('reporte_cierre'::"text", "public"."get_project_org"("project_id")) = ANY (ARRAY['E'::"text", 'L'::"text"])) AND "public"."auth_ve_proyecto"("project_id", "public"."get_project_org"("project_id"))));



CREATE POLICY "b_cancel_reasons_mod" ON "public"."cancellation_reasons" TO "authenticated" USING (("public"."auth_nivel"('datos_empresa'::"text", "organization_id") = 'E'::"text")) WITH CHECK (("public"."auth_nivel"('datos_empresa'::"text", "organization_id") = 'E'::"text"));



CREATE POLICY "b_cancel_reasons_sel" ON "public"."cancellation_reasons" FOR SELECT TO "authenticated" USING (("public"."auth_nivel"('datos_empresa'::"text", "organization_id") = ANY (ARRAY['E'::"text", 'L'::"text"])));



CREATE POLICY "b_cancellations_mod" ON "public"."project_cancellations" TO "authenticated" USING ((("public"."auth_nivel"('reporte_cierre'::"text", "public"."get_project_org"("project_id")) = 'E'::"text") AND "public"."auth_ve_proyecto"("project_id", "public"."get_project_org"("project_id")))) WITH CHECK (("public"."auth_nivel"('reporte_cierre'::"text", "public"."get_project_org"("project_id")) = 'E'::"text"));



CREATE POLICY "b_cancellations_sel" ON "public"."project_cancellations" FOR SELECT TO "authenticated" USING ((("public"."auth_nivel"('reporte_cierre'::"text", "public"."get_project_org"("project_id")) = ANY (ARRAY['E'::"text", 'L'::"text"])) AND "public"."auth_ve_proyecto"("project_id", "public"."get_project_org"("project_id"))));



CREATE POLICY "b_cargos_sel" ON "public"."project_cargos" FOR SELECT TO "authenticated" USING ((("public"."auth_nivel"('info_proyecto'::"text", "public"."get_project_org"("project_id")) = ANY (ARRAY['E'::"text", 'L'::"text"])) AND "public"."auth_ve_proyecto"("project_id", "public"."get_project_org"("project_id"))));



CREATE POLICY "b_commissions_mod" ON "public"."project_commissions" TO "authenticated" USING ((("public"."auth_nivel"('presupuesto'::"text", "public"."get_project_org"("project_id")) = 'E'::"text") AND "public"."auth_ve_proyecto"("project_id", "public"."get_project_org"("project_id")))) WITH CHECK (("public"."auth_nivel"('presupuesto'::"text", "public"."get_project_org"("project_id")) = 'E'::"text"));



CREATE POLICY "b_commissions_sel" ON "public"."project_commissions" FOR SELECT TO "authenticated" USING ((("public"."auth_nivel"('presupuesto'::"text", "public"."get_project_org"("project_id")) = ANY (ARRAY['E'::"text", 'L'::"text"])) AND "public"."auth_ve_proyecto"("project_id", "public"."get_project_org"("project_id"))));



CREATE POLICY "b_companies_del" ON "public"."companies" FOR DELETE TO "authenticated" USING (("public"."auth_codigo_perfil"("organization_id") = 1));



CREATE POLICY "b_companies_mod" ON "public"."companies" FOR INSERT TO "authenticated" WITH CHECK (("public"."auth_nivel"('bd'::"text", "organization_id") = 'E'::"text"));



CREATE POLICY "b_companies_sel" ON "public"."companies" FOR SELECT TO "authenticated" USING (("public"."auth_nivel"('bd'::"text", "organization_id") = ANY (ARRAY['E'::"text", 'L'::"text"])));



CREATE POLICY "b_companies_upd" ON "public"."companies" FOR UPDATE TO "authenticated" USING (("public"."auth_nivel"('bd'::"text", "organization_id") = 'E'::"text")) WITH CHECK (("public"."auth_nivel"('bd'::"text", "organization_id") = 'E'::"text"));



CREATE POLICY "b_company_rel_del" ON "public"."company_relationships" FOR DELETE TO "authenticated" USING (("public"."auth_nivel"('bd'::"text", "public"."get_company_org"("company_id")) = 'E'::"text"));



CREATE POLICY "b_company_rel_mod" ON "public"."company_relationships" FOR INSERT TO "authenticated" WITH CHECK (("public"."auth_nivel"('bd'::"text", "public"."get_company_org"("company_id")) = 'E'::"text"));



CREATE POLICY "b_company_rel_sel" ON "public"."company_relationships" FOR SELECT TO "authenticated" USING (("public"."auth_nivel"('bd'::"text", "public"."get_company_org"("company_id")) = ANY (ARRAY['E'::"text", 'L'::"text"])));



CREATE POLICY "b_company_rel_upd" ON "public"."company_relationships" FOR UPDATE TO "authenticated" USING (("public"."auth_nivel"('bd'::"text", "public"."get_company_org"("company_id")) = 'E'::"text")) WITH CHECK (("public"."auth_nivel"('bd'::"text", "public"."get_company_org"("company_id")) = 'E'::"text"));



CREATE POLICY "b_consent_terms_sel" ON "public"."consent_terms" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "b_consents_sel" ON "public"."data_consents" FOR SELECT TO "authenticated" USING ((("user_id" = "auth"."uid"()) OR ("public"."auth_nivel"('gestion_permisos'::"text", "organization_id") = 'E'::"text")));



CREATE POLICY "b_contact_companies_del" ON "public"."contact_companies" FOR DELETE TO "authenticated" USING (("public"."auth_nivel"('bd'::"text", "public"."get_contact_org"("contact_id")) = 'E'::"text"));



CREATE POLICY "b_contact_companies_mod" ON "public"."contact_companies" FOR INSERT TO "authenticated" WITH CHECK (("public"."auth_nivel"('bd'::"text", "public"."get_contact_org"("contact_id")) = 'E'::"text"));



CREATE POLICY "b_contact_companies_sel" ON "public"."contact_companies" FOR SELECT TO "authenticated" USING (("public"."auth_nivel"('bd'::"text", "public"."get_contact_org"("contact_id")) = ANY (ARRAY['E'::"text", 'L'::"text"])));



CREATE POLICY "b_contact_companies_upd" ON "public"."contact_companies" FOR UPDATE TO "authenticated" USING (("public"."auth_nivel"('bd'::"text", "public"."get_contact_org"("contact_id")) = 'E'::"text")) WITH CHECK (("public"."auth_nivel"('bd'::"text", "public"."get_contact_org"("contact_id")) = 'E'::"text"));



CREATE POLICY "b_contact_roles_del" ON "public"."contact_roles" FOR DELETE TO "authenticated" USING (("public"."auth_nivel"('bd'::"text", "public"."get_contact_org"("contact_id")) = 'E'::"text"));



CREATE POLICY "b_contact_roles_mod" ON "public"."contact_roles" FOR INSERT TO "authenticated" WITH CHECK (("public"."auth_nivel"('bd'::"text", "public"."get_contact_org"("contact_id")) = 'E'::"text"));



CREATE POLICY "b_contact_roles_sel" ON "public"."contact_roles" FOR SELECT TO "authenticated" USING (("public"."auth_nivel"('bd'::"text", "public"."get_contact_org"("contact_id")) = ANY (ARRAY['E'::"text", 'L'::"text"])));



CREATE POLICY "b_contact_roles_upd" ON "public"."contact_roles" FOR UPDATE TO "authenticated" USING (("public"."auth_nivel"('bd'::"text", "public"."get_contact_org"("contact_id")) = 'E'::"text")) WITH CHECK (("public"."auth_nivel"('bd'::"text", "public"."get_contact_org"("contact_id")) = 'E'::"text"));



CREATE POLICY "b_contacts_del" ON "public"."contacts" FOR DELETE TO "authenticated" USING (("public"."auth_codigo_perfil"("organization_id") = 1));



CREATE POLICY "b_contacts_mod" ON "public"."contacts" FOR INSERT TO "authenticated" WITH CHECK (("public"."auth_nivel"('bd'::"text", "organization_id") = 'E'::"text"));



CREATE POLICY "b_contacts_sel" ON "public"."contacts" FOR SELECT TO "authenticated" USING (("public"."auth_nivel"('bd'::"text", "organization_id") = ANY (ARRAY['E'::"text", 'L'::"text"])));



CREATE POLICY "b_contacts_upd" ON "public"."contacts" FOR UPDATE TO "authenticated" USING (("public"."auth_nivel"('bd'::"text", "organization_id") = 'E'::"text")) WITH CHECK (("public"."auth_nivel"('bd'::"text", "organization_id") = 'E'::"text"));



CREATE POLICY "b_crew_extra_mod" ON "public"."project_crew_extra" TO "authenticated" USING ((("public"."auth_nivel"('operacion_creatividad'::"text", "public"."get_project_org"("project_id")) = 'E'::"text") AND "public"."auth_ve_proyecto"("project_id", "public"."get_project_org"("project_id")))) WITH CHECK (("public"."auth_nivel"('operacion_creatividad'::"text", "public"."get_project_org"("project_id")) = 'E'::"text"));



CREATE POLICY "b_crew_extra_sel" ON "public"."project_crew_extra" FOR SELECT TO "authenticated" USING ((("public"."auth_nivel"('operacion_creatividad'::"text", "public"."get_project_org"("project_id")) = ANY (ARRAY['E'::"text", 'L'::"text"])) AND "public"."auth_ve_proyecto"("project_id", "public"."get_project_org"("project_id"))));



CREATE POLICY "b_departments_mod" ON "public"."departments" TO "authenticated" USING (("public"."auth_nivel"('datos_empresa'::"text", "organization_id") = 'E'::"text")) WITH CHECK (("public"."auth_nivel"('datos_empresa'::"text", "organization_id") = 'E'::"text"));



CREATE POLICY "b_departments_sel" ON "public"."departments" FOR SELECT TO "authenticated" USING (("public"."auth_nivel"('datos_empresa'::"text", "organization_id") = ANY (ARRAY['E'::"text", 'L'::"text"])));



CREATE POLICY "b_dte_types_sel" ON "public"."dte_types" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "b_ext_crew_mod" ON "public"."project_external_crew" TO "authenticated" USING ((("public"."auth_nivel"('operacion_creatividad'::"text", "public"."get_project_org"("project_id")) = 'E'::"text") AND "public"."auth_ve_proyecto"("project_id", "public"."get_project_org"("project_id")))) WITH CHECK (("public"."auth_nivel"('operacion_creatividad'::"text", "public"."get_project_org"("project_id")) = 'E'::"text"));



CREATE POLICY "b_ext_crew_sel" ON "public"."project_external_crew" FOR SELECT TO "authenticated" USING ((("public"."auth_nivel"('operacion_creatividad'::"text", "public"."get_project_org"("project_id")) = ANY (ARRAY['E'::"text", 'L'::"text"])) AND "public"."auth_ve_proyecto"("project_id", "public"."get_project_org"("project_id"))));



CREATE POLICY "b_financials_mod" ON "public"."project_financials" TO "authenticated" USING ((("public"."auth_nivel"('presupuesto'::"text", "public"."get_project_org"("project_id")) = 'E'::"text") AND "public"."auth_ve_proyecto"("project_id", "public"."get_project_org"("project_id")))) WITH CHECK (("public"."auth_nivel"('presupuesto'::"text", "public"."get_project_org"("project_id")) = 'E'::"text"));



CREATE POLICY "b_financials_sel" ON "public"."project_financials" FOR SELECT TO "authenticated" USING ((("public"."auth_nivel"('presupuesto'::"text", "public"."get_project_org"("project_id")) = ANY (ARRAY['E'::"text", 'L'::"text"])) AND "public"."auth_ve_proyecto"("project_id", "public"."get_project_org"("project_id"))));



CREATE POLICY "b_income_extras_mod" ON "public"."project_income_extras" TO "authenticated" USING ((("public"."auth_nivel"('presupuesto'::"text", "public"."get_project_org"("project_id")) = 'E'::"text") AND "public"."auth_ve_proyecto"("project_id", "public"."get_project_org"("project_id")))) WITH CHECK (("public"."auth_nivel"('presupuesto'::"text", "public"."get_project_org"("project_id")) = 'E'::"text"));



CREATE POLICY "b_income_extras_sel" ON "public"."project_income_extras" FOR SELECT TO "authenticated" USING ((("public"."auth_nivel"('presupuesto'::"text", "public"."get_project_org"("project_id")) = ANY (ARRAY['E'::"text", 'L'::"text"])) AND "public"."auth_ve_proyecto"("project_id", "public"."get_project_org"("project_id"))));



CREATE POLICY "b_legal_docs_del" ON "public"."legal_documents" FOR DELETE TO "authenticated" USING (("public"."auth_nivel"('gastos_legal_notificaciones'::"text", "organization_id") = 'E'::"text"));



CREATE POLICY "b_legal_docs_mod" ON "public"."legal_documents" FOR INSERT TO "authenticated" WITH CHECK (("public"."auth_nivel"('gastos_legal_notificaciones'::"text", "organization_id") = 'E'::"text"));



CREATE POLICY "b_legal_docs_sel" ON "public"."legal_documents" FOR SELECT TO "authenticated" USING (("public"."auth_nivel"('gastos_legal_notificaciones'::"text", "organization_id") = ANY (ARRAY['E'::"text", 'L'::"text"])));



CREATE POLICY "b_legal_docs_upd" ON "public"."legal_documents" FOR UPDATE TO "authenticated" USING (("public"."auth_nivel"('gastos_legal_notificaciones'::"text", "organization_id") = 'E'::"text")) WITH CHECK (("public"."auth_nivel"('gastos_legal_notificaciones'::"text", "organization_id") = 'E'::"text"));



CREATE POLICY "b_legal_templates_del" ON "public"."legal_templates" FOR DELETE TO "authenticated" USING (("public"."auth_nivel"('gastos_legal_notificaciones'::"text", "organization_id") = 'E'::"text"));



CREATE POLICY "b_legal_templates_mod" ON "public"."legal_templates" FOR INSERT TO "authenticated" WITH CHECK (("public"."auth_nivel"('gastos_legal_notificaciones'::"text", "organization_id") = 'E'::"text"));



CREATE POLICY "b_legal_templates_sel" ON "public"."legal_templates" FOR SELECT TO "authenticated" USING (("public"."auth_nivel"('gastos_legal_notificaciones'::"text", "organization_id") = ANY (ARRAY['E'::"text", 'L'::"text"])));



CREATE POLICY "b_legal_templates_upd" ON "public"."legal_templates" FOR UPDATE TO "authenticated" USING (("public"."auth_nivel"('gastos_legal_notificaciones'::"text", "organization_id") = 'E'::"text")) WITH CHECK (("public"."auth_nivel"('gastos_legal_notificaciones'::"text", "organization_id") = 'E'::"text"));



CREATE POLICY "b_locations_del" ON "public"."locations" FOR DELETE TO "authenticated" USING (("public"."auth_nivel"('bd'::"text", "organization_id") = 'E'::"text"));



CREATE POLICY "b_locations_mod" ON "public"."locations" FOR INSERT TO "authenticated" WITH CHECK (("public"."auth_nivel"('bd'::"text", "organization_id") = 'E'::"text"));



CREATE POLICY "b_locations_sel" ON "public"."locations" FOR SELECT TO "authenticated" USING (("public"."auth_nivel"('bd'::"text", "organization_id") = ANY (ARRAY['E'::"text", 'L'::"text"])));



CREATE POLICY "b_locations_upd" ON "public"."locations" FOR UPDATE TO "authenticated" USING (("public"."auth_nivel"('bd'::"text", "organization_id") = 'E'::"text")) WITH CHECK (("public"."auth_nivel"('bd'::"text", "organization_id") = 'E'::"text"));



CREATE POLICY "b_memberships_mod" ON "public"."memberships" TO "authenticated" USING (("public"."auth_nivel"('gestion_permisos'::"text", "organization_id") = 'E'::"text")) WITH CHECK (("public"."auth_nivel"('gestion_permisos'::"text", "organization_id") = 'E'::"text"));



CREATE POLICY "b_memberships_sel" ON "public"."memberships" FOR SELECT TO "authenticated" USING ((("user_id" = "auth"."uid"()) OR ("public"."auth_nivel"('gestion_permisos'::"text", "organization_id") = 'E'::"text")));



CREATE POLICY "b_notif_recipients_mod" ON "public"."notification_send_recipients" TO "authenticated" USING (("public"."auth_nivel"('gastos_legal_notificaciones'::"text", "public"."get_send_org"("send_id")) = 'E'::"text")) WITH CHECK (("public"."auth_nivel"('gastos_legal_notificaciones'::"text", "public"."get_send_org"("send_id")) = 'E'::"text"));



CREATE POLICY "b_notif_recipients_sel" ON "public"."notification_send_recipients" FOR SELECT TO "authenticated" USING (("public"."auth_nivel"('gastos_legal_notificaciones'::"text", "public"."get_send_org"("send_id")) = ANY (ARRAY['E'::"text", 'L'::"text"])));



CREATE POLICY "b_notif_sends_mod" ON "public"."notification_sends" TO "authenticated" USING (("public"."auth_nivel"('gastos_legal_notificaciones'::"text", "organization_id") = 'E'::"text")) WITH CHECK (("public"."auth_nivel"('gastos_legal_notificaciones'::"text", "organization_id") = 'E'::"text"));



CREATE POLICY "b_notif_sends_sel" ON "public"."notification_sends" FOR SELECT TO "authenticated" USING (("public"."auth_nivel"('gastos_legal_notificaciones'::"text", "organization_id") = ANY (ARRAY['E'::"text", 'L'::"text"])));



CREATE POLICY "b_notif_templates_mod" ON "public"."notification_templates" TO "authenticated" USING (("public"."auth_nivel"('gastos_legal_notificaciones'::"text", "organization_id") = 'E'::"text")) WITH CHECK (("public"."auth_nivel"('gastos_legal_notificaciones'::"text", "organization_id") = 'E'::"text"));



CREATE POLICY "b_notif_templates_sel" ON "public"."notification_templates" FOR SELECT TO "authenticated" USING (("public"."auth_nivel"('gastos_legal_notificaciones'::"text", "organization_id") = ANY (ARRAY['E'::"text", 'L'::"text"])));



CREATE POLICY "b_op_budgets_mod" ON "public"."project_op_budgets" TO "authenticated" USING ((("public"."auth_nivel"('operacion_creatividad'::"text", "public"."get_project_org"("project_id")) = 'E'::"text") AND "public"."auth_ve_proyecto"("project_id", "public"."get_project_org"("project_id")))) WITH CHECK (("public"."auth_nivel"('operacion_creatividad'::"text", "public"."get_project_org"("project_id")) = 'E'::"text"));



CREATE POLICY "b_op_budgets_sel" ON "public"."project_op_budgets" FOR SELECT TO "authenticated" USING ((("public"."auth_nivel"('operacion_creatividad'::"text", "public"."get_project_org"("project_id")) = ANY (ARRAY['E'::"text", 'L'::"text"])) AND "public"."auth_ve_proyecto"("project_id", "public"."get_project_org"("project_id"))));



CREATE POLICY "b_operations_mod" ON "public"."project_operations" TO "authenticated" USING ((("public"."auth_nivel"('operacion_creatividad'::"text", "public"."get_project_org"("project_id")) = 'E'::"text") AND "public"."auth_ve_proyecto"("project_id", "public"."get_project_org"("project_id")))) WITH CHECK (("public"."auth_nivel"('operacion_creatividad'::"text", "public"."get_project_org"("project_id")) = 'E'::"text"));



CREATE POLICY "b_operations_sel" ON "public"."project_operations" FOR SELECT TO "authenticated" USING ((("public"."auth_nivel"('operacion_creatividad'::"text", "public"."get_project_org"("project_id")) = ANY (ARRAY['E'::"text", 'L'::"text"])) AND "public"."auth_ve_proyecto"("project_id", "public"."get_project_org"("project_id"))));



CREATE POLICY "b_org_branding_sel" ON "public"."organization_branding" FOR SELECT TO "authenticated" USING (("public"."auth_codigo_perfil"("organization_id") IS NOT NULL));



CREATE POLICY "b_org_profile_mod" ON "public"."organization_profile" TO "authenticated" USING (("public"."auth_nivel"('datos_empresa'::"text", "organization_id") = 'E'::"text")) WITH CHECK (("public"."auth_nivel"('datos_empresa'::"text", "organization_id") = 'E'::"text"));



CREATE POLICY "b_org_profile_sel" ON "public"."organization_profile" FOR SELECT TO "authenticated" USING (("public"."auth_nivel"('datos_empresa'::"text", "organization_id") = ANY (ARRAY['E'::"text", 'L'::"text"])));



CREATE POLICY "b_organizations_mod" ON "public"."organizations" TO "authenticated" USING (("public"."auth_nivel"('datos_empresa'::"text", "id") = 'E'::"text")) WITH CHECK (("public"."auth_nivel"('datos_empresa'::"text", "id") = 'E'::"text"));



CREATE POLICY "b_organizations_sel" ON "public"."organizations" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."memberships" "m"
  WHERE (("m"."user_id" = "auth"."uid"()) AND ("m"."organization_id" = "organizations"."id") AND ("m"."estado" = 'activo'::"text")))));



CREATE POLICY "b_pcp_sel" ON "public"."project_client_payments" FOR SELECT TO "authenticated" USING ((("public"."auth_nivel"('finanzas_consolidada'::"text", "public"."get_project_org"("project_id")) = ANY (ARRAY['E'::"text", 'L'::"text"])) AND "public"."auth_ve_proyecto"("project_id", "public"."get_project_org"("project_id"))));



CREATE POLICY "b_perm_perms_mod" ON "public"."profile_permissions" TO "authenticated" USING (("public"."auth_nivel"('gestion_permisos'::"text", ( SELECT "permission_profiles"."organization_id"
   FROM "public"."permission_profiles"
  WHERE ("permission_profiles"."id" = "profile_permissions"."profile_id"))) = 'E'::"text")) WITH CHECK (("public"."auth_nivel"('gestion_permisos'::"text", ( SELECT "permission_profiles"."organization_id"
   FROM "public"."permission_profiles"
  WHERE ("permission_profiles"."id" = "profile_permissions"."profile_id"))) = 'E'::"text"));



CREATE POLICY "b_perm_perms_sel" ON "public"."profile_permissions" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."memberships" "m"
     JOIN "public"."permission_profiles" "pp" ON (("pp"."id" = "profile_permissions"."profile_id")))
  WHERE (("m"."user_id" = "auth"."uid"()) AND ("m"."organization_id" = "pp"."organization_id") AND ("m"."estado" = 'activo'::"text")))));



CREATE POLICY "b_perm_profiles_mod" ON "public"."permission_profiles" TO "authenticated" USING (("public"."auth_nivel"('gestion_permisos'::"text", "organization_id") = 'E'::"text")) WITH CHECK (("public"."auth_nivel"('gestion_permisos'::"text", "organization_id") = 'E'::"text"));



CREATE POLICY "b_perm_profiles_sel" ON "public"."permission_profiles" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."memberships"
  WHERE (("memberships"."user_id" = "auth"."uid"()) AND ("memberships"."organization_id" = "permission_profiles"."organization_id") AND ("memberships"."estado" = 'activo'::"text")))));



CREATE POLICY "b_plan_catalog_sel" ON "public"."plan_catalog" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "b_proj_docs_mod" ON "public"."project_documents" TO "authenticated" USING ((("public"."auth_nivel"('operacion_creatividad'::"text", "public"."get_project_org"("project_id")) = 'E'::"text") AND "public"."auth_ve_proyecto"("project_id", "public"."get_project_org"("project_id")))) WITH CHECK (("public"."auth_nivel"('operacion_creatividad'::"text", "public"."get_project_org"("project_id")) = 'E'::"text"));



CREATE POLICY "b_proj_docs_sel" ON "public"."project_documents" FOR SELECT TO "authenticated" USING ((("public"."auth_nivel"('operacion_creatividad'::"text", "public"."get_project_org"("project_id")) = ANY (ARRAY['E'::"text", 'L'::"text"])) AND "public"."auth_ve_proyecto"("project_id", "public"."get_project_org"("project_id"))));



CREATE POLICY "b_proj_functions_mod" ON "public"."project_functions" TO "authenticated" USING (("public"."auth_nivel"('datos_empresa'::"text", "organization_id") = 'E'::"text")) WITH CHECK (("public"."auth_nivel"('datos_empresa'::"text", "organization_id") = 'E'::"text"));



CREATE POLICY "b_proj_functions_sel" ON "public"."project_functions" FOR SELECT TO "authenticated" USING (("public"."auth_nivel"('datos_empresa'::"text", "organization_id") = ANY (ARRAY['E'::"text", 'L'::"text"])));



CREATE POLICY "b_proj_locations_mod" ON "public"."project_locations" TO "authenticated" USING ((("public"."auth_nivel"('operacion_creatividad'::"text", "public"."get_project_org"("project_id")) = 'E'::"text") AND "public"."auth_ve_proyecto"("project_id", "public"."get_project_org"("project_id")))) WITH CHECK (("public"."auth_nivel"('operacion_creatividad'::"text", "public"."get_project_org"("project_id")) = 'E'::"text"));



CREATE POLICY "b_proj_locations_sel" ON "public"."project_locations" FOR SELECT TO "authenticated" USING ((("public"."auth_nivel"('operacion_creatividad'::"text", "public"."get_project_org"("project_id")) = ANY (ARRAY['E'::"text", 'L'::"text"])) AND "public"."auth_ve_proyecto"("project_id", "public"."get_project_org"("project_id"))));



CREATE POLICY "b_proj_members_mod" ON "public"."project_members" TO "authenticated" USING ((("public"."auth_nivel"('info_proyecto'::"text", "public"."get_project_org"("project_id")) = 'E'::"text") AND "public"."auth_ve_proyecto"("project_id", "public"."get_project_org"("project_id")))) WITH CHECK (("public"."auth_nivel"('info_proyecto'::"text", "public"."get_project_org"("project_id")) = 'E'::"text"));



CREATE POLICY "b_proj_members_sel" ON "public"."project_members" FOR SELECT TO "authenticated" USING ((("public"."auth_nivel"('info_proyecto'::"text", "public"."get_project_org"("project_id")) = ANY (ARRAY['E'::"text", 'L'::"text"])) AND "public"."auth_ve_proyecto"("project_id", "public"."get_project_org"("project_id"))));



CREATE POLICY "b_proj_quotation_mod" ON "public"."project_quotation" TO "authenticated" USING ((("public"."auth_nivel"('cotizacion'::"text", "public"."get_project_org"("project_id")) = 'E'::"text") AND "public"."auth_ve_proyecto"("project_id", "public"."get_project_org"("project_id")))) WITH CHECK (("public"."auth_nivel"('cotizacion'::"text", "public"."get_project_org"("project_id")) = 'E'::"text"));



CREATE POLICY "b_proj_quotation_sel" ON "public"."project_quotation" FOR SELECT TO "authenticated" USING ((("public"."auth_nivel"('cotizacion'::"text", "public"."get_project_org"("project_id")) = ANY (ARRAY['E'::"text", 'L'::"text"])) AND "public"."auth_ve_proyecto"("project_id", "public"."get_project_org"("project_id"))));



CREATE POLICY "b_project_commercial_sel" ON "public"."project_commercial" FOR SELECT TO "authenticated" USING ((("public"."auth_nivel"('info_proyecto'::"text", "public"."get_project_org"("project_id")) = ANY (ARRAY['E'::"text", 'L'::"text"])) AND "public"."auth_ve_proyecto"("project_id", "public"."get_project_org"("project_id"))));



CREATE POLICY "b_projects_del" ON "public"."projects" FOR DELETE TO "authenticated" USING (("public"."auth_nivel"('eliminar_proyecto'::"text", "organization_id") = 'E'::"text"));



CREATE POLICY "b_projects_ins" ON "public"."projects" FOR INSERT TO "authenticated" WITH CHECK (("public"."auth_nivel"('crear_proyecto'::"text", "organization_id") = 'E'::"text"));



CREATE POLICY "b_projects_sel" ON "public"."projects" FOR SELECT TO "authenticated" USING ("public"."auth_ve_proyecto"("id", "organization_id"));



CREATE POLICY "b_projects_upd" ON "public"."projects" FOR UPDATE TO "authenticated" USING ((("public"."auth_nivel"('info_proyecto'::"text", "organization_id") = 'E'::"text") AND "public"."auth_ve_proyecto"("id", "organization_id"))) WITH CHECK (("public"."auth_nivel"('info_proyecto'::"text", "organization_id") = 'E'::"text"));



CREATE POLICY "b_quot_offers_mod" ON "public"."quotation_offers" TO "authenticated" USING ((("public"."auth_nivel"('cotizacion'::"text", "public"."get_project_org"("project_id")) = 'E'::"text") AND "public"."auth_ve_proyecto"("project_id", "public"."get_project_org"("project_id")))) WITH CHECK (("public"."auth_nivel"('cotizacion'::"text", "public"."get_project_org"("project_id")) = 'E'::"text"));



CREATE POLICY "b_quot_offers_sel" ON "public"."quotation_offers" FOR SELECT TO "authenticated" USING ((("public"."auth_nivel"('cotizacion'::"text", "public"."get_project_org"("project_id")) = ANY (ARRAY['E'::"text", 'L'::"text"])) AND "public"."auth_ve_proyecto"("project_id", "public"."get_project_org"("project_id"))));



CREATE POLICY "b_quot_versions_mod" ON "public"."quotation_versions" TO "authenticated" USING ((("public"."auth_nivel"('cotizacion'::"text", "public"."get_project_org"("project_id")) = 'E'::"text") AND "public"."auth_ve_proyecto"("project_id", "public"."get_project_org"("project_id")))) WITH CHECK (("public"."auth_nivel"('cotizacion'::"text", "public"."get_project_org"("project_id")) = 'E'::"text"));



CREATE POLICY "b_quot_versions_sel" ON "public"."quotation_versions" FOR SELECT TO "authenticated" USING ((("public"."auth_nivel"('cotizacion'::"text", "public"."get_project_org"("project_id")) = ANY (ARRAY['E'::"text", 'L'::"text"])) AND "public"."auth_ve_proyecto"("project_id", "public"."get_project_org"("project_id"))));



CREATE POLICY "b_rebind_sel" ON "public"."invitation_rebind_requests" FOR SELECT TO "authenticated" USING ((("claiming_user_id" = "auth"."uid"()) OR ("public"."auth_nivel"('info_proyecto'::"text", "organization_id") = 'E'::"text")));



CREATE POLICY "b_risks_mod" ON "public"."project_risks" TO "authenticated" USING ((("public"."auth_nivel"('presupuesto'::"text", "public"."get_project_org"("project_id")) = 'E'::"text") AND "public"."auth_ve_proyecto"("project_id", "public"."get_project_org"("project_id")))) WITH CHECK (("public"."auth_nivel"('presupuesto'::"text", "public"."get_project_org"("project_id")) = 'E'::"text"));



CREATE POLICY "b_risks_sel" ON "public"."project_risks" FOR SELECT TO "authenticated" USING ((("public"."auth_nivel"('presupuesto'::"text", "public"."get_project_org"("project_id")) = ANY (ARRAY['E'::"text", 'L'::"text"])) AND "public"."auth_ve_proyecto"("project_id", "public"."get_project_org"("project_id"))));



CREATE POLICY "b_section_resp_mod" ON "public"."project_section_responsibles" TO "authenticated" USING ((("public"."auth_codigo_perfil"("public"."get_project_org"("project_id")) = ANY (ARRAY[1, 2])) AND "public"."auth_ve_proyecto"("project_id", "public"."get_project_org"("project_id")))) WITH CHECK (("public"."auth_codigo_perfil"("public"."get_project_org"("project_id")) = ANY (ARRAY[1, 2])));



CREATE POLICY "b_section_resp_sel" ON "public"."project_section_responsibles" FOR SELECT TO "authenticated" USING ((("public"."auth_nivel"('operacion_creatividad'::"text", "public"."get_project_org"("project_id")) = ANY (ARRAY['E'::"text", 'L'::"text"])) AND "public"."auth_ve_proyecto"("project_id", "public"."get_project_org"("project_id"))));



CREATE POLICY "b_shoot_days_mod" ON "public"."project_shoot_days" TO "authenticated" USING ((("public"."auth_nivel"('operacion_creatividad'::"text", "public"."get_project_org"("project_id")) = 'E'::"text") AND "public"."auth_ve_proyecto"("project_id", "public"."get_project_org"("project_id")))) WITH CHECK (("public"."auth_nivel"('operacion_creatividad'::"text", "public"."get_project_org"("project_id")) = 'E'::"text"));



CREATE POLICY "b_shoot_days_sel" ON "public"."project_shoot_days" FOR SELECT TO "authenticated" USING ((("public"."auth_nivel"('operacion_creatividad'::"text", "public"."get_project_org"("project_id")) = ANY (ARRAY['E'::"text", 'L'::"text"])) AND "public"."auth_ve_proyecto"("project_id", "public"."get_project_org"("project_id"))));



CREATE POLICY "b_shooting_plan_mod" ON "public"."project_shooting_plan" TO "authenticated" USING ((("public"."auth_nivel"('operacion_creatividad'::"text", "public"."get_project_org"("project_id")) = 'E'::"text") AND "public"."auth_ve_proyecto"("project_id", "public"."get_project_org"("project_id")))) WITH CHECK (("public"."auth_nivel"('operacion_creatividad'::"text", "public"."get_project_org"("project_id")) = 'E'::"text"));



CREATE POLICY "b_shooting_plan_sel" ON "public"."project_shooting_plan" FOR SELECT TO "authenticated" USING ((("public"."auth_nivel"('operacion_creatividad'::"text", "public"."get_project_org"("project_id")) = ANY (ARRAY['E'::"text", 'L'::"text"])) AND "public"."auth_ve_proyecto"("project_id", "public"."get_project_org"("project_id"))));



CREATE POLICY "b_signals_mod" ON "public"."project_signals" TO "authenticated" USING ((("public"."auth_nivel"('operacion_creatividad'::"text", "public"."get_project_org"("project_id")) = 'E'::"text") AND "public"."auth_ve_proyecto"("project_id", "public"."get_project_org"("project_id")))) WITH CHECK (("public"."auth_nivel"('operacion_creatividad'::"text", "public"."get_project_org"("project_id")) = 'E'::"text"));



CREATE POLICY "b_signals_sel" ON "public"."project_signals" FOR SELECT TO "authenticated" USING ((("public"."auth_nivel"('operacion_creatividad'::"text", "public"."get_project_org"("project_id")) = ANY (ARRAY['E'::"text", 'L'::"text"])) AND "public"."auth_ve_proyecto"("project_id", "public"."get_project_org"("project_id"))));



CREATE POLICY "b_talent_profiles_del" ON "public"."contact_talent_profiles" FOR DELETE TO "authenticated" USING (("public"."auth_nivel"('bd'::"text", "public"."get_contact_org"("contact_id")) = 'E'::"text"));



CREATE POLICY "b_talent_profiles_mod" ON "public"."contact_talent_profiles" FOR INSERT TO "authenticated" WITH CHECK (("public"."auth_nivel"('bd'::"text", "public"."get_contact_org"("contact_id")) = 'E'::"text"));



CREATE POLICY "b_talent_profiles_sel" ON "public"."contact_talent_profiles" FOR SELECT TO "authenticated" USING (("public"."auth_nivel"('bd'::"text", "public"."get_contact_org"("contact_id")) = ANY (ARRAY['E'::"text", 'L'::"text"])));



CREATE POLICY "b_talent_profiles_upd" ON "public"."contact_talent_profiles" FOR UPDATE TO "authenticated" USING (("public"."auth_nivel"('bd'::"text", "public"."get_contact_org"("contact_id")) = 'E'::"text")) WITH CHECK (("public"."auth_nivel"('bd'::"text", "public"."get_contact_org"("contact_id")) = 'E'::"text"));



CREATE POLICY "b_task_attach_mod" ON "public"."task_attachments" TO "authenticated" USING ((("public"."auth_nivel"('operacion_creatividad'::"text", "public"."get_project_org"("public"."get_task_project"("task_id"))) = 'E'::"text") AND "public"."auth_ve_proyecto"("public"."get_task_project"("task_id"), "public"."get_project_org"("public"."get_task_project"("task_id"))))) WITH CHECK (("public"."auth_nivel"('operacion_creatividad'::"text", "public"."get_project_org"("public"."get_task_project"("task_id"))) = 'E'::"text"));



CREATE POLICY "b_task_attach_sel" ON "public"."task_attachments" FOR SELECT TO "authenticated" USING ((("public"."auth_nivel"('operacion_creatividad'::"text", "public"."get_project_org"("public"."get_task_project"("task_id"))) = ANY (ARRAY['E'::"text", 'L'::"text"])) AND "public"."auth_ve_proyecto"("public"."get_task_project"("task_id"), "public"."get_project_org"("public"."get_task_project"("task_id")))));



CREATE POLICY "b_task_comments_mod" ON "public"."task_comments" TO "authenticated" USING ((("public"."auth_nivel"('operacion_creatividad'::"text", "public"."get_project_org"("public"."get_task_project"("task_id"))) = 'E'::"text") AND "public"."auth_ve_proyecto"("public"."get_task_project"("task_id"), "public"."get_project_org"("public"."get_task_project"("task_id"))))) WITH CHECK (("public"."auth_nivel"('operacion_creatividad'::"text", "public"."get_project_org"("public"."get_task_project"("task_id"))) = 'E'::"text"));



CREATE POLICY "b_task_comments_sel" ON "public"."task_comments" FOR SELECT TO "authenticated" USING ((("public"."auth_nivel"('operacion_creatividad'::"text", "public"."get_project_org"("public"."get_task_project"("task_id"))) = ANY (ARRAY['E'::"text", 'L'::"text"])) AND "public"."auth_ve_proyecto"("public"."get_task_project"("task_id"), "public"."get_project_org"("public"."get_task_project"("task_id")))));



CREATE POLICY "b_tasks_mod" ON "public"."project_tasks" TO "authenticated" USING ((("public"."auth_nivel"('tareas'::"text", "public"."get_project_org"("project_id")) = 'E'::"text") AND "public"."auth_ve_proyecto"("project_id", "public"."get_project_org"("project_id")))) WITH CHECK (("public"."auth_nivel"('tareas'::"text", "public"."get_project_org"("project_id")) = 'E'::"text"));



CREATE POLICY "b_tasks_sel" ON "public"."project_tasks" FOR SELECT TO "authenticated" USING ((("public"."auth_nivel"('tareas'::"text", "public"."get_project_org"("project_id")) = ANY (ARRAY['E'::"text", 'L'::"text"])) AND "public"."auth_ve_proyecto"("project_id", "public"."get_project_org"("project_id"))));



CREATE POLICY "b_tax_rates_sel" ON "public"."tax_rates" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "b_user_bank_self" ON "public"."user_bank_accounts" TO "authenticated" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "b_user_notifications_sel" ON "public"."user_notifications" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "b_user_profiles_self" ON "public"."user_profiles" TO "authenticated" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "b_user_tool_archive_del" ON "public"."user_tool_archive" FOR DELETE TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "b_user_tool_archive_sel" ON "public"."user_tool_archive" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "b_user_tool_documents_own" ON "public"."user_tool_documents" TO "authenticated" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "b_user_tool_versions_sel" ON "public"."user_tool_versions" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."bank_institutions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."budget_line_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."cancellation_reasons" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."companies" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."company_relationships" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."consent_terms" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."contact_bank_accounts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."contact_companies" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."contact_roles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."contact_talent_profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."contacts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."cookie_consents" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "cookie_consents_sel" ON "public"."cookie_consents" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."data_consents" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."departments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."dte_types" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."invitation_rebind_requests" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."legal_documents" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."legal_templates" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."locations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."memberships" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."notification_send_recipients" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."notification_sends" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."notification_templates" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."org_invitations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "org_invitations_select_miembros" ON "public"."org_invitations" FOR SELECT TO "authenticated" USING (("public"."auth_nivel"('info_proyecto'::"text", "organization_id") = 'E'::"text"));



ALTER TABLE "public"."organization_branding" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."organization_profile" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."organizations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."permission_profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."plan_catalog" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."plan_features" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "plan_features_sel" ON "public"."plan_features" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."profile_permissions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."project_assignments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."project_call_sheet" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."project_cancellation_reasons" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."project_cancellations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."project_cargos" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."project_client_payments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."project_commercial" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."project_commissions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."project_crew_extra" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."project_documents" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."project_external_crew" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."project_financials" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."project_functions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."project_income_extras" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."project_locations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."project_members" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."project_op_budgets" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."project_operations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."project_quotation" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."project_risks" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."project_section_responsibles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."project_shoot_days" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."project_shooting_plan" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."project_signals" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."project_tasks" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."projects" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."quotation_offers" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."quotation_versions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "sched_del_sel" ON "public"."scheduled_account_deletions" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."scheduled_account_deletions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."task_attachments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."task_comments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."tax_rates" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_bank_accounts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_notifications" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_tool_archive" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_tool_documents" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_tool_versions" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";





GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";











































































































































































REVOKE ALL ON FUNCTION "public"."_admitir_persona"("p_uid" "uuid", "p_token" "text", "p_email_contacto" "text") FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."_crear_notificacion"("p_user_id" "uuid", "p_org" "uuid", "p_project" "text", "p_tipo" "text", "p_titulo" "text", "p_cuerpo" "text", "p_data" "jsonb") FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."_requisitos_faltantes"("p_uid" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."_requisitos_faltantes"("p_uid" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."asignar_cargo_a_miembro"("p_project_id" "text", "p_cargo_id" "text", "p_email" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."asignar_cargo_a_miembro"("p_project_id" "text", "p_cargo_id" "text", "p_email" "text") TO "authenticated";



GRANT ALL ON FUNCTION "public"."auth_codigo_perfil"("p_org" "uuid") TO "authenticated";



GRANT ALL ON FUNCTION "public"."auth_es_miembro_org_txt"("p_org_text" "text") TO "authenticated";



GRANT ALL ON FUNCTION "public"."auth_nivel"("p_modulo" "text", "p_org_id" "uuid") TO "authenticated";



GRANT ALL ON FUNCTION "public"."auth_nivel_org_txt"("p_modulo" "text", "p_org_text" "text") TO "authenticated";



GRANT ALL ON FUNCTION "public"."auth_plan_permite"("p_feature" "text", "p_org" "uuid") TO "authenticated";



GRANT ALL ON FUNCTION "public"."auth_ve_proyecto"("p_project_id" "text", "p_org_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."cancelar_eliminacion_cuenta"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."cancelar_eliminacion_cuenta"() TO "authenticated";



GRANT ALL ON FUNCTION "public"."eliminar_proyecto"("p_id" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."exportar_herramienta"("p_document_id" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."exportar_herramienta"("p_document_id" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."exportar_mis_datos"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."exportar_mis_datos"() TO "authenticated";



GRANT ALL ON FUNCTION "public"."get_company_org"("p_company_id" "text") TO "authenticated";



GRANT ALL ON FUNCTION "public"."get_contact_org"("p_contact_id" "text") TO "authenticated";



GRANT ALL ON FUNCTION "public"."get_project_org"("p_project_id" "text") TO "authenticated";



GRANT ALL ON FUNCTION "public"."get_task_project"("p_task_id" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."guardar_cargos"("p_project_id" "text", "p_cargos" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."guardar_cargos"("p_project_id" "text", "p_cargos" "jsonb") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."guardar_consentimiento_cookies"("p_analitica" boolean, "p_marketing" boolean, "p_version" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."guardar_consentimiento_cookies"("p_analitica" boolean, "p_marketing" boolean, "p_version" "text") TO "authenticated";



GRANT ALL ON FUNCTION "public"."guardar_operaciones_4a"("p" "jsonb") TO "authenticated";



GRANT ALL ON FUNCTION "public"."guardar_operaciones_4b"("p" "jsonb") TO "authenticated";



GRANT ALL ON FUNCTION "public"."guardar_operaciones_4c"("p" "jsonb") TO "authenticated";



GRANT ALL ON FUNCTION "public"."guardar_operaciones_4e"("p" "jsonb") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."guardar_pagos_cliente"("p_project_id" "text", "p_pagos" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."guardar_pagos_cliente"("p_project_id" "text", "p_pagos" "jsonb") TO "authenticated";



GRANT ALL ON FUNCTION "public"."guardar_proyecto"("p" "jsonb") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."invitaciones_de_organizacion"("p_org_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."invitaciones_de_organizacion"("p_org_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."marcar_notificaciones_leidas"("p_ids" "uuid"[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."marcar_notificaciones_leidas"("p_ids" "uuid"[]) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."mis_organizaciones_como_unico_admin"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."mis_organizaciones_como_unico_admin"() TO "authenticated";



REVOKE ALL ON FUNCTION "public"."personas_de_mis_proyectos"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."personas_de_mis_proyectos"() TO "authenticated";



REVOKE ALL ON FUNCTION "public"."procesar_eliminaciones_vencidas"() FROM PUBLIC;



GRANT ALL ON FUNCTION "public"."provisionar_organizacion"("p_nombre" "text", "p_slug" "text", "p_template_org" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."resolver_rebind"("p_request_id" "uuid", "p_aprobar" boolean, "p_correo_elegido" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."resolver_rebind"("p_request_id" "uuid", "p_aprobar" boolean, "p_correo_elegido" "text") TO "authenticated";



GRANT ALL ON FUNCTION "public"."restaurar_proyecto"("p_id" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."revocar_consentimiento"("p_consent_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."revocar_consentimiento"("p_consent_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."rpc_assert_cupo_colaborador"("p_org" "uuid") FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."rpc_assert_cupo_proyecto"("p_org" "uuid") FROM PUBLIC;



GRANT ALL ON FUNCTION "public"."rpc_assert_nivel"("p_modulo" "text", "p_nivel_min" "text", "p_org_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."rpc_assert_plan"("p_feature" "text", "p_org" "uuid") FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."solicitar_eliminacion_cuenta"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."solicitar_eliminacion_cuenta"() TO "authenticated";



REVOKE ALL ON FUNCTION "public"."transferir_administracion"("p_org_id" "uuid", "p_target_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."transferir_administracion"("p_org_id" "uuid", "p_target_user_id" "uuid") TO "authenticated";
























GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."analytics_events" TO "anon";
GRANT INSERT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."analytics_events" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."analytics_events" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."app_config" TO "anon";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."app_config" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."app_config" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."audit_log" TO "anon";
GRANT ALL ON TABLE "public"."audit_log" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."audit_log" TO "service_role";



GRANT SELECT,USAGE ON SEQUENCE "public"."audit_log_id_seq" TO "authenticated";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."bank_institutions" TO "anon";
GRANT ALL ON TABLE "public"."bank_institutions" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."bank_institutions" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."budget_line_items" TO "anon";
GRANT ALL ON TABLE "public"."budget_line_items" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."budget_line_items" TO "service_role";



GRANT SELECT,USAGE ON SEQUENCE "public"."budget_line_items_id_seq" TO "authenticated";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."cancellation_reasons" TO "anon";
GRANT ALL ON TABLE "public"."cancellation_reasons" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."cancellation_reasons" TO "service_role";



GRANT SELECT,USAGE ON SEQUENCE "public"."cancellation_reasons_id_seq" TO "authenticated";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."companies" TO "anon";
GRANT ALL ON TABLE "public"."companies" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."companies" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."company_relationships" TO "anon";
GRANT ALL ON TABLE "public"."company_relationships" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."company_relationships" TO "service_role";



GRANT SELECT,USAGE ON SEQUENCE "public"."company_relationships_id_seq" TO "authenticated";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."consent_terms" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."consent_terms" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."consent_terms" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."contact_bank_accounts" TO "anon";
GRANT ALL ON TABLE "public"."contact_bank_accounts" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."contact_bank_accounts" TO "service_role";



GRANT SELECT,USAGE ON SEQUENCE "public"."contact_bank_accounts_id_seq" TO "authenticated";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."contact_companies" TO "anon";
GRANT ALL ON TABLE "public"."contact_companies" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."contact_companies" TO "service_role";



GRANT SELECT,USAGE ON SEQUENCE "public"."contact_companies_id_seq" TO "authenticated";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."contact_roles" TO "anon";
GRANT ALL ON TABLE "public"."contact_roles" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."contact_roles" TO "service_role";



GRANT SELECT,USAGE ON SEQUENCE "public"."contact_roles_id_seq" TO "authenticated";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."contact_talent_profiles" TO "anon";
GRANT ALL ON TABLE "public"."contact_talent_profiles" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."contact_talent_profiles" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."contacts" TO "anon";
GRANT ALL ON TABLE "public"."contacts" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."contacts" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."cookie_consents" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."cookie_consents" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."cookie_consents" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."data_consents" TO "anon";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."data_consents" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."data_consents" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."departments" TO "anon";
GRANT ALL ON TABLE "public"."departments" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."departments" TO "service_role";



GRANT SELECT,USAGE ON SEQUENCE "public"."departments_id_seq" TO "authenticated";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."dte_types" TO "anon";
GRANT ALL ON TABLE "public"."dte_types" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."dte_types" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."invitation_rebind_requests" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."invitation_rebind_requests" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."invitation_rebind_requests" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."legal_documents" TO "anon";
GRANT ALL ON TABLE "public"."legal_documents" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."legal_documents" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."legal_templates" TO "anon";
GRANT ALL ON TABLE "public"."legal_templates" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."legal_templates" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."locations" TO "anon";
GRANT ALL ON TABLE "public"."locations" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."locations" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."memberships" TO "anon";
GRANT ALL ON TABLE "public"."memberships" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."memberships" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."notification_send_recipients" TO "anon";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."notification_send_recipients" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."notification_send_recipients" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."notification_sends" TO "anon";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."notification_sends" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."notification_sends" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."notification_templates" TO "anon";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."notification_templates" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."notification_templates" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."org_invitations" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."org_invitations" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."org_invitations" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."organization_branding" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."organization_branding" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."organization_branding" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."organization_profile" TO "anon";
GRANT ALL ON TABLE "public"."organization_profile" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."organization_profile" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."organizations" TO "anon";
GRANT ALL ON TABLE "public"."organizations" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."organizations" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."permission_profiles" TO "anon";
GRANT ALL ON TABLE "public"."permission_profiles" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."permission_profiles" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."plan_catalog" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."plan_catalog" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."plan_catalog" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."plan_features" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."plan_features" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."plan_features" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."profile_permissions" TO "anon";
GRANT ALL ON TABLE "public"."profile_permissions" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."profile_permissions" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."project_assignments" TO "anon";
GRANT ALL ON TABLE "public"."project_assignments" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."project_assignments" TO "service_role";



GRANT SELECT,USAGE ON SEQUENCE "public"."project_assignments_id_seq" TO "authenticated";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."project_call_sheet" TO "anon";
GRANT ALL ON TABLE "public"."project_call_sheet" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."project_call_sheet" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."project_cancellation_reasons" TO "anon";
GRANT ALL ON TABLE "public"."project_cancellation_reasons" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."project_cancellation_reasons" TO "service_role";



GRANT SELECT,USAGE ON SEQUENCE "public"."project_cancellation_reasons_id_seq" TO "authenticated";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."project_cancellations" TO "anon";
GRANT ALL ON TABLE "public"."project_cancellations" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."project_cancellations" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."project_cargos" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."project_cargos" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."project_cargos" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."project_client_payments" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."project_client_payments" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."project_client_payments" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."project_commercial" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."project_commercial" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."project_commercial" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."project_commissions" TO "anon";
GRANT ALL ON TABLE "public"."project_commissions" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."project_commissions" TO "service_role";



GRANT SELECT,USAGE ON SEQUENCE "public"."project_commissions_id_seq" TO "authenticated";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."project_crew_extra" TO "anon";
GRANT ALL ON TABLE "public"."project_crew_extra" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."project_crew_extra" TO "service_role";



GRANT SELECT,USAGE ON SEQUENCE "public"."project_crew_extra_id_seq" TO "authenticated";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."project_documents" TO "anon";
GRANT ALL ON TABLE "public"."project_documents" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."project_documents" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."project_external_crew" TO "anon";
GRANT ALL ON TABLE "public"."project_external_crew" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."project_external_crew" TO "service_role";



GRANT SELECT,USAGE ON SEQUENCE "public"."project_external_crew_id_seq" TO "authenticated";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."project_financials" TO "anon";
GRANT ALL ON TABLE "public"."project_financials" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."project_financials" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."project_functions" TO "anon";
GRANT ALL ON TABLE "public"."project_functions" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."project_functions" TO "service_role";



GRANT SELECT,USAGE ON SEQUENCE "public"."project_functions_id_seq" TO "authenticated";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."project_income_extras" TO "anon";
GRANT ALL ON TABLE "public"."project_income_extras" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."project_income_extras" TO "service_role";



GRANT SELECT,USAGE ON SEQUENCE "public"."project_income_extras_id_seq" TO "authenticated";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."project_locations" TO "anon";
GRANT ALL ON TABLE "public"."project_locations" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."project_locations" TO "service_role";



GRANT SELECT,USAGE ON SEQUENCE "public"."project_locations_id_seq" TO "authenticated";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."project_members" TO "anon";
GRANT ALL ON TABLE "public"."project_members" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."project_members" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."project_op_budgets" TO "anon";
GRANT ALL ON TABLE "public"."project_op_budgets" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."project_op_budgets" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."project_operations" TO "anon";
GRANT ALL ON TABLE "public"."project_operations" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."project_operations" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."project_quotation" TO "anon";
GRANT ALL ON TABLE "public"."project_quotation" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."project_quotation" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."project_risks" TO "anon";
GRANT ALL ON TABLE "public"."project_risks" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."project_risks" TO "service_role";



GRANT SELECT,USAGE ON SEQUENCE "public"."project_risks_id_seq" TO "authenticated";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."project_section_responsibles" TO "anon";
GRANT ALL ON TABLE "public"."project_section_responsibles" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."project_section_responsibles" TO "service_role";



GRANT SELECT,USAGE ON SEQUENCE "public"."project_section_responsibles_id_seq" TO "authenticated";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."project_shoot_days" TO "anon";
GRANT ALL ON TABLE "public"."project_shoot_days" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."project_shoot_days" TO "service_role";



GRANT SELECT,USAGE ON SEQUENCE "public"."project_shoot_days_id_seq" TO "authenticated";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."project_shooting_plan" TO "anon";
GRANT ALL ON TABLE "public"."project_shooting_plan" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."project_shooting_plan" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."project_signals" TO "anon";
GRANT ALL ON TABLE "public"."project_signals" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."project_signals" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."project_tasks" TO "anon";
GRANT ALL ON TABLE "public"."project_tasks" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."project_tasks" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."projects" TO "anon";
GRANT ALL ON TABLE "public"."projects" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."projects" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."quotation_offers" TO "anon";
GRANT ALL ON TABLE "public"."quotation_offers" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."quotation_offers" TO "service_role";



GRANT SELECT,USAGE ON SEQUENCE "public"."quotation_offers_id_seq" TO "authenticated";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."quotation_versions" TO "anon";
GRANT ALL ON TABLE "public"."quotation_versions" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."quotation_versions" TO "service_role";



GRANT SELECT,USAGE ON SEQUENCE "public"."quotation_versions_id_seq" TO "authenticated";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."scheduled_account_deletions" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."scheduled_account_deletions" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."scheduled_account_deletions" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."task_attachments" TO "anon";
GRANT ALL ON TABLE "public"."task_attachments" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."task_attachments" TO "service_role";



GRANT SELECT,USAGE ON SEQUENCE "public"."task_attachments_id_seq" TO "authenticated";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."task_comments" TO "anon";
GRANT ALL ON TABLE "public"."task_comments" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."task_comments" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."tax_rates" TO "anon";
GRANT ALL ON TABLE "public"."tax_rates" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."tax_rates" TO "service_role";



GRANT SELECT,USAGE ON SEQUENCE "public"."tax_rates_id_seq" TO "authenticated";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."user_bank_accounts" TO "anon";
GRANT ALL ON TABLE "public"."user_bank_accounts" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."user_bank_accounts" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."user_notifications" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."user_notifications" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."user_notifications" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."user_profiles" TO "anon";
GRANT SELECT,INSERT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."user_profiles" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."user_profiles" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."user_tool_archive" TO "anon";
GRANT SELECT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."user_tool_archive" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."user_tool_archive" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."user_tool_documents" TO "anon";
GRANT ALL ON TABLE "public"."user_tool_documents" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."user_tool_documents" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."user_tool_versions" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."user_tool_versions" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."user_tool_versions" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLES TO "service_role";































drop extension if exists "pg_net";


  create policy "hp_delete"
  on "storage"."objects"
  as permissive
  for delete
  to authenticated
using (((bucket_id = 'herramientas-personales'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));



  create policy "hp_insert"
  on "storage"."objects"
  as permissive
  for insert
  to authenticated
with check (((bucket_id = 'herramientas-personales'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));



  create policy "hp_select"
  on "storage"."objects"
  as permissive
  for select
  to authenticated
using (((bucket_id = 'herramientas-personales'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));



  create policy "hp_update"
  on "storage"."objects"
  as permissive
  for update
  to authenticated
using (((bucket_id = 'herramientas-personales'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)))
with check (((bucket_id = 'herramientas-personales'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));



  create policy "takeos_storage_delete"
  on "storage"."objects"
  as permissive
  for delete
  to authenticated
using ((((bucket_id = ANY (ARRAY['fotos-locaciones'::text, 'adjuntos-tareas'::text, 'documentos-proyecto'::text, 'adjuntos-gastos'::text, 'cotizaciones'::text, 'fotos-plan-de-rodaje-y-guion-tecnico'::text, 'fotos-talentos'::text, 'hojas-llamado'::text])) AND public.auth_es_miembro_org_txt((storage.foldername(name))[1])) OR ((bucket_id = 'documentos-legales'::text) AND (public.auth_nivel_org_txt('gastos_legal_notificaciones'::text, (storage.foldername(name))[1]) = 'E'::text))));



  create policy "takeos_storage_insert"
  on "storage"."objects"
  as permissive
  for insert
  to authenticated
with check ((((bucket_id = ANY (ARRAY['fotos-locaciones'::text, 'adjuntos-tareas'::text, 'documentos-proyecto'::text, 'adjuntos-gastos'::text, 'cotizaciones'::text, 'fotos-plan-de-rodaje-y-guion-tecnico'::text, 'fotos-talentos'::text, 'hojas-llamado'::text])) AND public.auth_es_miembro_org_txt((storage.foldername(name))[1])) OR ((bucket_id = 'documentos-legales'::text) AND (public.auth_nivel_org_txt('gastos_legal_notificaciones'::text, (storage.foldername(name))[1]) = 'E'::text))));



  create policy "takeos_storage_select"
  on "storage"."objects"
  as permissive
  for select
  to authenticated
using ((((bucket_id = ANY (ARRAY['fotos-locaciones'::text, 'adjuntos-tareas'::text, 'documentos-proyecto'::text, 'adjuntos-gastos'::text, 'cotizaciones'::text, 'fotos-plan-de-rodaje-y-guion-tecnico'::text, 'fotos-talentos'::text, 'hojas-llamado'::text])) AND public.auth_es_miembro_org_txt((storage.foldername(name))[1])) OR ((bucket_id = 'documentos-legales'::text) AND (public.auth_nivel_org_txt('gastos_legal_notificaciones'::text, (storage.foldername(name))[1]) = ANY (ARRAY['E'::text, 'L'::text])))));



  create policy "takeos_storage_update"
  on "storage"."objects"
  as permissive
  for update
  to authenticated
using ((((bucket_id = ANY (ARRAY['fotos-locaciones'::text, 'adjuntos-tareas'::text, 'documentos-proyecto'::text, 'adjuntos-gastos'::text, 'cotizaciones'::text, 'fotos-plan-de-rodaje-y-guion-tecnico'::text, 'fotos-talentos'::text, 'hojas-llamado'::text])) AND public.auth_es_miembro_org_txt((storage.foldername(name))[1])) OR ((bucket_id = 'documentos-legales'::text) AND (public.auth_nivel_org_txt('gastos_legal_notificaciones'::text, (storage.foldername(name))[1]) = 'E'::text))))
with check ((((bucket_id = ANY (ARRAY['fotos-locaciones'::text, 'adjuntos-tareas'::text, 'documentos-proyecto'::text, 'adjuntos-gastos'::text, 'cotizaciones'::text, 'fotos-plan-de-rodaje-y-guion-tecnico'::text, 'fotos-talentos'::text, 'hojas-llamado'::text])) AND public.auth_es_miembro_org_txt((storage.foldername(name))[1])) OR ((bucket_id = 'documentos-legales'::text) AND (public.auth_nivel_org_txt('gastos_legal_notificaciones'::text, (storage.foldername(name))[1]) = 'E'::text))));



