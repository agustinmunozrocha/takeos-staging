-- ════════════════════════════════════════════════════════════════════════════
-- Migración: catálogo de SERVICIOS por productora (organization_services)
-- Autor: Code (Agustín aprobó el plan). Validado en staging en transacción
-- revertida (esquema + RLS con Administrador y con un miembro no-admin).
--
-- CONTEXTO: hoy el "Servicio" de un proyecto (projects.servicio, texto) se elige
-- de una lista fija en el frontend (Producción / Postproducción / Otro). Agustín
-- quiere una lista PROPIA de la productora, gestionable, para que cada proyecto
-- elija de ahí y —a futuro, cuando exista el sistema de reportería— se pueda
-- reportar cuánto rentó cada tipo de servicio.
--
-- ALCANCE (hoy): SOLO se deja la tabla catálogo + su RLS + semilla. El servicio
-- del proyecto ya se guarda consultable en projects.servicio (no se toca). El
-- reporte anual es horizonte, se hará como tarea aparte.
--
-- MODELO: organization_services = catálogo de servicios de una org. Soft delete
-- (deleted_at) coherente con la doctrina. Unicidad por nombre (case-insensitive)
-- por org entre los vivos. id texto autogenerado ('svc_...'); el frontend también
-- puede mandar el suyo (upsert optimista, como companies/contacts).
--
-- PERMISOS: leer = cualquier miembro activo de la org (para poblar el desplegable
-- al crear/editar proyectos). Gestionar (alta/edición/baja) = Administrador, vía
-- el módulo datos_empresa (la pestaña "Servicios" vive en el perfil de empresa).
-- CRUD simple sobre datos del propio tenant → RLS directa (sin RPC).
--
-- DESPLIEGUE: repo → staging (por conector, project_id jovroab…) → validar con el
-- frontend → producción recién en el merge final de la Etapa 4. Nunca directo a
-- prod por el conector. Migración ADITIVA y reversible (no toca tablas/RLS/RPC
-- existentes).
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. Tabla ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.organization_services (
  id              text PRIMARY KEY DEFAULT ('svc_' || replace(gen_random_uuid()::text, '-', '')),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  nombre          text NOT NULL,
  orden           integer NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz,
  created_by      uuid,
  updated_by      uuid
);

CREATE INDEX IF NOT EXISTS organization_services_org_idx
  ON public.organization_services (organization_id) WHERE deleted_at IS NULL;

-- Un mismo nombre no puede repetirse (ignorando mayúsculas/acentos-no, solo case)
-- entre los servicios vivos de una org.
CREATE UNIQUE INDEX IF NOT EXISTS organization_services_nombre_uk
  ON public.organization_services (organization_id, lower(nombre)) WHERE deleted_at IS NULL;

-- ── 2. RLS ──────────────────────────────────────────────────────────────────
ALTER TABLE public.organization_services ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS org_services_sel ON public.organization_services;
CREATE POLICY org_services_sel ON public.organization_services
  FOR SELECT TO authenticated
  USING (public.auth_es_miembro_org_txt(organization_id::text));

DROP POLICY IF EXISTS org_services_ins ON public.organization_services;
CREATE POLICY org_services_ins ON public.organization_services
  FOR INSERT TO authenticated
  WITH CHECK (public.auth_nivel('datos_empresa', organization_id) = 'E');

DROP POLICY IF EXISTS org_services_upd ON public.organization_services;
CREATE POLICY org_services_upd ON public.organization_services
  FOR UPDATE TO authenticated
  USING (public.auth_nivel('datos_empresa', organization_id) = 'E')
  WITH CHECK (public.auth_nivel('datos_empresa', organization_id) = 'E');

DROP POLICY IF EXISTS org_services_del ON public.organization_services;
CREATE POLICY org_services_del ON public.organization_services
  FOR DELETE TO authenticated
  USING (public.auth_nivel('datos_empresa', organization_id) = 'E');

-- ── 3. GRANT (doctrina: authenticated tras cada tabla nueva) ─────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON public.organization_services TO authenticated;

-- ── 4. Semilla: servicios por defecto para las orgs existentes ──────────────
-- Producción y Postproducción. Idempotente: no duplica si ya existen.
INSERT INTO public.organization_services (organization_id, nombre, orden)
SELECT o.id, s.nombre, s.orden
FROM public.organizations o
CROSS JOIN (VALUES ('Producción', 0), ('Postproducción', 1)) AS s(nombre, orden)
WHERE NOT EXISTS (
  SELECT 1 FROM public.organization_services os
  WHERE os.organization_id = o.id
    AND lower(os.nombre) = lower(s.nombre)
    AND os.deleted_at IS NULL
);
