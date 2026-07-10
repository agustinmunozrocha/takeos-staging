-- ════════════════════════════════════════════════════════════════════════════
-- Migración: RPC renombrar_servicio — renombra un servicio del catálogo y
-- propaga el nuevo nombre a todos los proyectos de la org que lo usan.
-- Autor: Code (Agustín aprobó el plan). Validado en staging en transacción
-- revertida (con Administrador; con no-admin debe rechazar).
--
-- POR QUÉ: projects.servicio es texto (el nombre del servicio). Si se renombra el
-- servicio en el catálogo (organization_services) sin actualizar los proyectos,
-- el reporte por tipo de servicio quedaría partido (nombre viejo vs nuevo). Este
-- RPC hace ambas cosas de forma ATÓMICA y server-side, para poder actualizar
-- proyectos en masa saltando la RLS por-proyecto (SECURITY DEFINER), con el gate
-- de Administrador (datos_empresa='E').
--
-- Devuelve la cantidad de proyectos actualizados (para el aviso al usuario).
--
-- DESPLIEGUE: repo → staging (conector) → validar → producción en el merge final
-- de la Etapa 4. Aditivo (nueva función); no toca tablas/RLS existentes.
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.renombrar_servicio(p_id text, p_nombre text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_org    uuid;
  v_old    text;
  v_nombre text := btrim(p_nombre);
  v_count  int := 0;
BEGIN
  IF v_nombre = '' THEN
    RAISE EXCEPTION 'renombrar_servicio: falta el nombre';
  END IF;

  SELECT organization_id, nombre INTO v_org, v_old
    FROM organization_services WHERE id = p_id AND deleted_at IS NULL;
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'renombrar_servicio: servicio inexistente';
  END IF;

  -- Gate: gestionar servicios = Administrador (mismo módulo que el perfil de empresa).
  PERFORM rpc_assert_nivel('datos_empresa', 'E', v_org);

  -- Unicidad case-insensitive entre los servicios vivos de la org.
  IF EXISTS (
    SELECT 1 FROM organization_services
    WHERE organization_id = v_org AND id <> p_id
      AND lower(nombre) = lower(v_nombre) AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'renombrar_servicio: ya existe un servicio con ese nombre';
  END IF;

  -- Renombrar el servicio y propagar a los proyectos que lo usan (por nombre).
  UPDATE organization_services SET nombre = v_nombre, updated_at = now() WHERE id = p_id;
  UPDATE projects SET servicio = v_nombre, updated_at = now()
    WHERE organization_id = v_org AND servicio IS NOT DISTINCT FROM v_old;
  GET DIAGNOSTICS v_count = ROW_COUNT;

  RETURN v_count;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.renombrar_servicio(text, text) TO authenticated;
