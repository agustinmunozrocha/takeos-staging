-- =====================================================================
-- Migración: fix_cupo_colaboradores_por_proyecto
-- Fecha:     2026-06-17
-- Autor:     BD Expert (TakeOS)
--
-- PROBLEMA (confirmado en la base viva):
--   El límite de colaboradores del plan se contaba ORG-WIDE: la función
--   rpc_assert_cupo_colaborador(p_org) sumaba TODAS las membresías activas
--   + TODAS las invitaciones pendientes de la organización, sin mirar el
--   proyecto. Por eso, con N personas repartidas entre varios proyectos, al
--   intentar agregar a alguien en UN proyecto con pocas personas, igual
--   bloqueaba (la org ya había llegado al tope sumando todos los proyectos).
--
-- DEFINICIÓN CORRECTA (producto):
--   "Colaboradores de un proyecto" = todas las personas listadas en la pestaña
--   Cargos (project_cargos) de ESE proyecto. El rol en la productora
--   (Administrador, Finanzas/CFO) NO cuenta por sí solo; solo cuenta estar en
--   Cargos. El límite es POR PROYECTO: 4 en Rodaje, 12 en Producción.
--
-- FIX:
--   1) guardar_cargos (RPC que escribe la pestaña Cargos, contrato
--      estado-completo): antes de reemplazar los cargos, valida que la cantidad
--      entrante no supere max_colaboradores del plan. Si la supera, lanza
--      'TAKEOS_PLAN_LIMITE:colaboradores:N' (el mismo error tipado que el
--      frontend ya sabe mostrar como "sube de plan").
--   2) invitar_a_organizacion: se elimina la llamada a
--      rpc_assert_cupo_colaborador(p_org_id). Invitar a la organización ya no es
--      el punto donde se mide el cupo (eso ahora vive en guardar_cargos).
--   3) rpc_assert_cupo_colaborador(uuid) queda DEPRECADA y sin uso. NO se elimina
--      en esta migración para no arriesgar dependencias ocultas; solo se documenta.
--
-- NOTA DE CONTEO (a confirmar con producto):
--   El conteo usa el total de filas de la pestaña Cargos (todas las personas en
--   Cargos cuentan). Si se decidiera que un cargo con perfil 'Finanzas' o
--   'Administrador' tampoco debe sumar, agregar un filtro en el conteo.
--
-- Idempotente (CREATE OR REPLACE / COMMENT).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) guardar_cargos: límite de colaboradores POR PROYECTO
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guardar_cargos(p_project_id text, p_cargos jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_org    uuid;
  elem     jsonb;
  v_count  int := 0;
  v_pos    int := 0;
  v_cid    text;
  v_tipo   text;
  v_perfil text;
  v_max    int;
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

  -- ════ LÍMITE DE COLABORADORES POR PROYECTO (plan) ════
  -- Colaboradores = personas en la pestaña Cargos de ESTE proyecto.
  SELECT pc.max_colaboradores INTO v_max
    FROM organizations o JOIN plan_catalog pc ON pc.codigo = o.plan
   WHERE o.id = v_org;
  IF v_max IS NOT NULL
     AND jsonb_array_length(coalesce(p_cargos, '[]'::jsonb)) > v_max THEN
    RAISE EXCEPTION 'TAKEOS_PLAN_LIMITE:colaboradores:%', v_max;
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
$function$;

-- ---------------------------------------------------------------------
-- 2) invitar_a_organizacion: se elimina el chequeo de cupo org-wide
--    (idéntica a la actual, sin la línea PERFORM rpc_assert_cupo_colaborador)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.invitar_a_organizacion(p_org_id uuid, p_email text, p_tipo text, p_perfil_codigo integer, p_cargo_id text DEFAULT NULL::text, p_project_id text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  -- (eliminado) PERFORM rpc_assert_cupo_colaborador(p_org_id);
  --   El límite de colaboradores ahora es POR PROYECTO y se controla en guardar_cargos.

  v_token := 'inv_' || substr(md5(random()::text || clock_timestamp()::text || v_email), 1, 18);
  INSERT INTO org_invitations (id, organization_id, email, tipo, perfil_codigo, cargo_id, project_id, invited_user_id, invited_by)
  VALUES (v_token, p_org_id, v_email, p_tipo, p_perfil_codigo, p_cargo_id, p_project_id, v_target_uid, v_uid);

  RETURN jsonb_build_object('token', v_token, 'registrado', v_target_uid IS NOT NULL, 'email', v_email, 'reutilizada', false);
END;
$function$;

-- ---------------------------------------------------------------------
-- 3) Marca la función vieja como deprecada (no se elimina por seguridad)
-- ---------------------------------------------------------------------
COMMENT ON FUNCTION public.rpc_assert_cupo_colaborador(uuid) IS
  'DEPRECADO (jun 2026). Contaba colaboradores ORG-WIDE (membresias activas + invitaciones pendientes), lo que era incorrecto: el limite es POR PROYECTO. El control correcto vive ahora en guardar_cargos contando project_cargos del proyecto. Esta funcion ya no se invoca; se conserva sin uso para no romper dependencias ocultas.';
