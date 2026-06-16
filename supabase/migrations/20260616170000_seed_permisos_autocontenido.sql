-- =============================================================================
-- seed_permisos_organizacion / provisionar_organizacion AUTOCONTENIDOS
-- Objetivo: que un entorno limpio (sin Primate) pueda crear su primera productora.
-- Antes: ambas funciones clonaban los defaults desde una org plantilla (Primate).
-- Ahora: los defaults canonicos viven en catalogos globales y las funciones leen de ahi.
-- Datos extraidos 1:1 de Primate (16-jun-2026): 8 perfiles, 104 matriz, 8 dep, 16 pf, 8 cr.
-- =============================================================================

-- 1) Catalogos globales de defaults (sin organization_id)
CREATE TABLE IF NOT EXISTS public.default_permission_profiles (
  codigo      integer PRIMARY KEY,
  nombre      text NOT NULL,
  descripcion text
);
CREATE TABLE IF NOT EXISTS public.default_profile_permissions (
  codigo integer NOT NULL,
  modulo text NOT NULL,
  nivel  text NOT NULL DEFAULT 'none',
  PRIMARY KEY (codigo, modulo)
);
CREATE TABLE IF NOT EXISTS public.default_departments (
  nombre text NOT NULL,
  orden  integer NOT NULL DEFAULT 0,
  activo boolean NOT NULL DEFAULT true
);
CREATE TABLE IF NOT EXISTS public.default_project_functions (
  nombre           text NOT NULL,
  nivel_portal     text NOT NULL DEFAULT 'produccion',
  permisos_default jsonb,
  orden            integer NOT NULL DEFAULT 0,
  activo           boolean NOT NULL DEFAULT true
);
CREATE TABLE IF NOT EXISTS public.default_cancellation_reasons (
  label    text NOT NULL,
  aplica_a text NOT NULL DEFAULT 'ambos',
  orden    integer NOT NULL DEFAULT 0,
  activo   boolean NOT NULL DEFAULT true
);

-- 2) RLS: lectura para authenticated, sin escritura (defaults no sensibles, globales)
ALTER TABLE public.default_permission_profiles  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.default_profile_permissions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.default_departments          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.default_project_functions    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.default_cancellation_reasons ENABLE ROW LEVEL SECURITY;

CREATE POLICY default_pp_sel   ON public.default_permission_profiles  FOR SELECT TO authenticated USING (true);
CREATE POLICY default_perm_sel ON public.default_profile_permissions  FOR SELECT TO authenticated USING (true);
CREATE POLICY default_dep_sel  ON public.default_departments          FOR SELECT TO authenticated USING (true);
CREATE POLICY default_pf_sel   ON public.default_project_functions    FOR SELECT TO authenticated USING (true);
CREATE POLICY default_cr_sel   ON public.default_cancellation_reasons FOR SELECT TO authenticated USING (true);

GRANT SELECT ON public.default_permission_profiles  TO authenticated;
GRANT SELECT ON public.default_profile_permissions  TO authenticated;
GRANT SELECT ON public.default_departments          TO authenticated;
GRANT SELECT ON public.default_project_functions    TO authenticated;
GRANT SELECT ON public.default_cancellation_reasons TO authenticated;

-- 3) Sembrado canonico (identico a Primate al 16-jun-2026)
INSERT INTO public.default_permission_profiles (codigo, nombre, descripcion) VALUES
  (1, 'Administrador', 'Control total del negocio, incluida la salud financiera global y quién accede a qué'),
  (2, 'Ejecutivo', 'Corre el proyecto de punta a punta, incluida la cotización; sin administrar la cuenta'),
  (3, 'Producción', 'Arma y ejecuta presupuesto y operación; sin definir el setup comercial ni emitir cotización'),
  (4, 'Asistencia', 'Ejecuta operación y gastos; ve el presupuesto como referencia, sin modificarlo'),
  (5, 'Coordinación', 'Maneja contratos y gastos operativos; sin ver el margen comercial'),
  (6, 'Creativo', 'Trabaja en lo creativo y operativo; sin ver ni tocar dinero ni legal'),
  (7, 'Invitado', 'Solo consulta información operativa de su trabajo; sin modificar nada'),
  (8, 'Finanzas', 'Visibilidad total para pagar y reportar; escritura solo en Finanzas consolidada');

INSERT INTO public.default_profile_permissions (codigo, modulo, nivel) VALUES
  (1,'bd','E'),(1,'cotizacion','E'),(1,'crear_proyecto','E'),(1,'datos_empresa','E'),(1,'eliminar_proyecto','E'),(1,'finanzas_consolidada','E'),(1,'gastos_legal_notificaciones','E'),(1,'gestion_permisos','E'),(1,'info_proyecto','E'),(1,'operacion_creatividad','E'),(1,'presupuesto','E'),(1,'reporte_cierre','E'),(1,'tareas','E'),
  (2,'bd','E'),(2,'cotizacion','E'),(2,'crear_proyecto','E'),(2,'datos_empresa','none'),(2,'eliminar_proyecto','none'),(2,'finanzas_consolidada','none'),(2,'gastos_legal_notificaciones','E'),(2,'gestion_permisos','none'),(2,'info_proyecto','E'),(2,'operacion_creatividad','E'),(2,'presupuesto','E'),(2,'reporte_cierre','E'),(2,'tareas','E'),
  (3,'bd','E'),(3,'cotizacion','L'),(3,'crear_proyecto','none'),(3,'datos_empresa','none'),(3,'eliminar_proyecto','none'),(3,'finanzas_consolidada','none'),(3,'gastos_legal_notificaciones','E'),(3,'gestion_permisos','none'),(3,'info_proyecto','L'),(3,'operacion_creatividad','E'),(3,'presupuesto','E'),(3,'reporte_cierre','E'),(3,'tareas','E'),
  (4,'bd','E'),(4,'cotizacion','L'),(4,'crear_proyecto','none'),(4,'datos_empresa','none'),(4,'eliminar_proyecto','none'),(4,'finanzas_consolidada','none'),(4,'gastos_legal_notificaciones','E'),(4,'gestion_permisos','none'),(4,'info_proyecto','L'),(4,'operacion_creatividad','E'),(4,'presupuesto','L'),(4,'reporte_cierre','E'),(4,'tareas','E'),
  (5,'bd','E'),(5,'cotizacion','none'),(5,'crear_proyecto','none'),(5,'datos_empresa','none'),(5,'eliminar_proyecto','none'),(5,'finanzas_consolidada','none'),(5,'gastos_legal_notificaciones','E'),(5,'gestion_permisos','none'),(5,'info_proyecto','none'),(5,'operacion_creatividad','E'),(5,'presupuesto','none'),(5,'reporte_cierre','none'),(5,'tareas','E'),
  (6,'bd','L'),(6,'cotizacion','none'),(6,'crear_proyecto','none'),(6,'datos_empresa','none'),(6,'eliminar_proyecto','none'),(6,'finanzas_consolidada','none'),(6,'gastos_legal_notificaciones','none'),(6,'gestion_permisos','none'),(6,'info_proyecto','none'),(6,'operacion_creatividad','E'),(6,'presupuesto','none'),(6,'reporte_cierre','none'),(6,'tareas','E'),
  (7,'bd','none'),(7,'cotizacion','none'),(7,'crear_proyecto','none'),(7,'datos_empresa','none'),(7,'eliminar_proyecto','none'),(7,'finanzas_consolidada','none'),(7,'gastos_legal_notificaciones','none'),(7,'gestion_permisos','none'),(7,'info_proyecto','none'),(7,'operacion_creatividad','L'),(7,'presupuesto','none'),(7,'reporte_cierre','none'),(7,'tareas','L'),
  (8,'bd','L'),(8,'cotizacion','L'),(8,'crear_proyecto','none'),(8,'datos_empresa','none'),(8,'eliminar_proyecto','none'),(8,'finanzas_consolidada','E'),(8,'gastos_legal_notificaciones','L'),(8,'gestion_permisos','none'),(8,'info_proyecto','L'),(8,'operacion_creatividad','L'),(8,'presupuesto','L'),(8,'reporte_cierre','L'),(8,'tareas','E');

INSERT INTO public.default_departments (nombre, orden, activo) VALUES
  ('Dirección',1,true),('Producción',2,true),('Dirección de Fotografía',3,true),('Arte',4,true),('Foto Fija',5,true),('Locaciones',6,true),('Catering',7,true),('Postproducción',8,true);

INSERT INTO public.default_project_functions (nombre, nivel_portal, permisos_default, orden, activo) VALUES
  ('Productor Ejecutivo','produccion',NULL,1,true),('Productor General','produccion',NULL,2,true),('Jefe de Producción','produccion',NULL,3,true),('Asistente de Producción','produccion',NULL,4,true),('Director','produccion',NULL,5,true),('Asistente de Dirección','produccion',NULL,6,true),('Segundo Asistente de Dirección','produccion',NULL,7,true),('Director de Fotografía','produccion',NULL,8,true),('Directora de Arte','produccion',NULL,9,true),('Ambientadora','produccion',NULL,10,true),('Gaffer','notificaciones',NULL,11,true),('Eléctrico','notificaciones',NULL,12,true),('Primer Asistente de Cámara','notificaciones',NULL,13,true),('Segundo Asistente de Cámara','notificaciones',NULL,14,true),('Runner de Arte','notificaciones',NULL,15,true),('Runner de Producción','notificaciones',NULL,16,true);

INSERT INTO public.default_cancellation_reasons (label, aplica_a, orden, activo) VALUES
  ('Muy caro','rechazo',1,true),('Nunca respondieron','rechazo',2,true),('Decidieron ir con otra productora','rechazo',3,true),('Presupuesto del cliente cambió','rechazo',4,true),('Cliente desapareció','cancelacion',5,true),('Accidente / fuerza mayor','cancelacion',6,true),('Condiciones climáticas','cancelacion',7,true),('Otro','ambos',99,true);

-- 4) Funciones autocontenidas (leen del catalogo, ya no de una plantilla)
CREATE OR REPLACE FUNCTION public.seed_permisos_organizacion(p_org_id uuid, p_template_org uuid DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF EXISTS (SELECT 1 FROM permission_profiles WHERE organization_id = p_org_id) THEN
    RAISE NOTICE 'La organización % ya tiene perfiles; se omite el sembrado.', p_org_id;
    RETURN;
  END IF;

  -- 1) Los 8 perfiles fijos desde el catalogo de defaults (autocontenido, sin plantilla)
  INSERT INTO permission_profiles (organization_id, codigo, nombre, descripcion, es_custom)
  SELECT p_org_id, codigo, nombre, descripcion, false
  FROM default_permission_profiles;

  -- 2) La matriz de permisos desde el catalogo, mapeando por 'codigo' (clave estable 1-8)
  INSERT INTO profile_permissions (profile_id, modulo, nivel)
  SELECT np.id, dpp.modulo, dpp.nivel
  FROM default_profile_permissions dpp
  JOIN permission_profiles np ON np.organization_id = p_org_id AND np.codigo = dpp.codigo;
END;
$function$;

CREATE OR REPLACE FUNCTION public.provisionar_organizacion(p_nombre text, p_slug text, p_template_org uuid DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
  IF NOT EXISTS (SELECT 1 FROM user_profiles WHERE user_id = v_uid AND fecha_nacimiento IS NOT NULL) THEN
    RAISE EXCEPTION 'TAKEOS_REQUISITOS:edad';
  END IF;
  IF EXISTS (SELECT 1 FROM user_profiles WHERE user_id = v_uid AND fecha_nacimiento IS NOT NULL AND fecha_nacimiento > (current_date - interval '18 years')) THEN
    RAISE EXCEPTION 'TAKEOS_MENOR_EDAD';
  END IF;

  -- 1) Crear la organizacion (plan 'free' por default del esquema)
  INSERT INTO organizations (nombre, slug) VALUES (btrim(p_nombre), p_slug)
  RETURNING id INTO v_org;

  -- 2) Backbone de permisos (8 perfiles + matriz), autocontenido desde catalogo
  PERFORM seed_permisos_organizacion(v_org);

  -- 3) Datos operativos default desde catalogos globales (sin clonar de otra org)
  INSERT INTO departments (organization_id, nombre, orden, activo)
  SELECT v_org, nombre, orden, activo FROM default_departments;

  INSERT INTO project_functions (organization_id, nombre, nivel_portal, permisos_default, orden, activo)
  SELECT v_org, nombre, nivel_portal, permisos_default, orden, activo FROM default_project_functions;

  INSERT INTO cancellation_reasons (organization_id, label, aplica_a, orden, activo)
  SELECT v_org, label, aplica_a, orden, activo FROM default_cancellation_reasons;

  -- 4) Perfil de empresa (profile jsonb NOT NULL -> arranca vacio)
  INSERT INTO organization_profile (organization_id, profile)
  VALUES (v_org, '{}'::jsonb);

  -- 5) Membresia fundadora: el llamante como Administrador (codigo 1), interno y activo
  INSERT INTO memberships (user_id, organization_id, profile_id, estado, tipo)
  SELECT v_uid, v_org, pp.id, 'activo', 'interno'
  FROM permission_profiles pp
  WHERE pp.organization_id = v_org AND pp.codigo = 1;

  RETURN v_org;
END;
$function$;

-- 5) Endurecimiento de permisos de ejecucion
REVOKE EXECUTE ON FUNCTION public.seed_permisos_organizacion(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.provisionar_organizacion(text, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.provisionar_organizacion(text, text, uuid) TO authenticated;
