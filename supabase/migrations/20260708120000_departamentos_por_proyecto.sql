-- ════════════════════════════════════════════════════════════════════════════
-- Migración: departamentos custom por-proyecto + guardado por id
-- Autor: BD Expert. Todo validado en staging en transacciones revertidas
-- (esquema sobre datos reales; resolución por id con scope + fallback por nombre;
-- crear/renombrar con gate de presupuesto; RLS ampliada con un usuario Producción).
--
-- PROBLEMA (diagnóstico previo): las filas de servicios perdían su departamento.
-- Dos causas: (a) el cliente guardaba por NOMBRE y, si llegaba vacío/centinela,
-- el RPC resolvía a NULL → borrado; (b) los departamentos custom vivían solo en
-- memoria del cliente y nunca se persistían. Además, los perfiles Ejecutivo y
-- Producción (presupuesto='E', datos_empresa='none') no podían LEER departments
-- por RLS → para ellos el borrado era determinista.
--
-- MODELO: departments.project_id NULL = default (de fábrica, para todos los
-- proyectos de la org); con valor = custom, vive SOLO en ese proyecto.
--
-- DECISIONES (Agustín/Juan): custom por-proyecto · crear lo hace quien edita el
-- presupuesto (presupuesto='E') · el cliente manda el id del departamento, no el
-- nombre · sin parón (se corrige de raíz).
--
-- DESPLIEGUE: coordinado con el frontend (Code) — el RPC va primero o junto; el
-- fallback por nombre cubre el estado mixto durante el rollout. Repo → staging →
-- validar → producción. Nunca directo a producción por el conector.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. Esquema: project_id + índices únicos parciales ───────────────────────
-- project_id es text (FK a projects.id, que es text tipo 'P-…'). ON DELETE
-- CASCADE: si se borra un proyecto, sus customs se van con él.
ALTER TABLE departments
  ADD COLUMN IF NOT EXISTS project_id text REFERENCES projects(id) ON DELETE CASCADE;

-- El único viejo (organization_id, nombre) no contempla project_id. Se reemplaza
-- por dos parciales: defaults únicos por org; customs únicos por proyecto.
ALTER TABLE departments DROP CONSTRAINT IF EXISTS departments_nombre_unico;

CREATE UNIQUE INDEX IF NOT EXISTS departments_default_nombre_uk
  ON departments (organization_id, nombre) WHERE project_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS departments_custom_nombre_uk
  ON departments (project_id, nombre) WHERE project_id IS NOT NULL;

-- ── 2. guardar_proyecto: resolver departamento por id (con scope) + fallback ──
-- Mismo retorno jsonb → CREATE OR REPLACE (sin DROP; preserva grants).
CREATE OR REPLACE FUNCTION public.guardar_proyecto(p jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_id     text := p->>'id';
  v_org    uuid := coalesce(
                     (select organization_id from projects where id = p->>'id'),
                     nullif(p->>'organizationId','')::uuid
                   );
  v_fin    jsonb := case when jsonb_typeof(p->'finanzas')='object' then p->'finanzas' else '{}'::jsonb end;
  v_cot    jsonb := p->'cotizacion';
  v_header jsonb := case when jsonb_typeof(p->'header')='object' then p->'header' else null end;
  v_diff   jsonb := case when jsonb_typeof(p->'presupuestoDiff')='object' then p->'presupuestoDiff' else null end;
  v_existe boolean;
  v_n_info text;
  v_n_pres text;
  v_n_cot  text;
  elem     jsonb;
  v_cid    text;
  v_pos    int;
  v_cu     uuid;
  v_row_ver int;
  v_new_ver int;
  v_dept_id  int;
  v_dept_raw int;
  v_dept_nom text;
  v_conflicts    jsonb := '[]'::jsonb;
  v_bud_versions jsonb := '{}'::jsonb;
  v_result jsonb;
begin
  if v_id is null or v_id = '' then raise exception 'guardar_proyecto: falta id'; end if;
  if v_org is null then raise exception 'guardar_proyecto: no se pudo resolver organization_id'; end if;

  v_existe := exists(select 1 from projects where id = v_id);

  if not v_existe then
    perform rpc_assert_nivel('crear_proyecto', 'E', v_org);
    perform rpc_assert_cupo_proyecto(v_org);
    if v_header is null then
      raise exception 'guardar_proyecto: falta header para crear el proyecto';
    end if;
  else
    if auth_codigo_perfil(v_org) is null then
      raise exception 'takeos_auth: sin membresía activa para esta organización.';
    end if;
  end if;

  v_n_info := coalesce(auth_nivel('info_proyecto', v_org), 'none');
  v_n_pres := coalesce(auth_nivel('presupuesto',   v_org), 'none');
  v_n_cot  := coalesce(auth_nivel('cotizacion',    v_org), 'none');

  v_result := jsonb_build_object('id', v_id);

  -- ════════════════════════════════════════════════════════════════════════
  -- CABECERA: projects + project_commercial, versionada por projects.version.
  -- ════════════════════════════════════════════════════════════════════════
  if (v_header is not null) and ((not v_existe) or v_n_info = 'E') then
    if v_existe then
      update projects set
        nombre_proyecto     = v_header->>'nombreProyecto',
        categoria           = coalesce(nullif(v_header->>'categoria',''), categoria),
        es_remunerado       = coalesce((v_header->>'esRemunerado')::boolean, es_remunerado),
        servicio            = nullif(v_header->>'servicio',''),
        productora          = nullif(v_header->>'productora',''),
        fecha_entrega_final = nullif(v_header->>'fechaEntregaFinal','')::date,
        estado              = coalesce(nullif(v_header->>'estado',''),'venta'),
        version             = version + 1,
        updated_at          = now()
      where id = v_id and version = coalesce(nullif(v_header->>'version','')::int, -1);
      if not found then
        raise exception 'TAKEOS_CONFLICT:%', jsonb_build_object('seccion','cabecera','ids', jsonb_build_array(v_id))::text;
      end if;
    else
      insert into projects (
        id, organization_id, nombre_proyecto, categoria, es_remunerado,
        servicio, productora, fecha_entrega_final, estado, version
      ) values (
        v_id, v_org, v_header->>'nombreProyecto', coalesce(nullif(v_header->>'categoria',''),'publicidad'),
        coalesce((v_header->>'esRemunerado')::boolean, true),
        nullif(v_header->>'servicio',''), nullif(v_header->>'productora',''),
        nullif(v_header->>'fechaEntregaFinal','')::date, coalesce(nullif(v_header->>'estado',''),'venta'), 1
      );
    end if;

    insert into project_commercial (
      project_id, cliente_empresa_id, cliente_contacto_id, agencia_empresa_id, cliente_texto, agencia_texto,
      derechos_tiempo, derechos_plataformas, derechos_territorio,
      contacto_cliente, mail_contacto_cliente, telefono_contacto_cliente,
      contacto_agencia, mail_contacto_agencia, telefono_contacto_agencia,
      condicion_pago, fecha_cotizacion, fecha_aprobacion, fecha_pago
    ) values (
      v_id,
      (select id from companies where id = nullif(v_header->>'clienteEmpresaId','') and organization_id = v_org),
      (select id from contacts  where id = nullif(v_header->>'clienteContactoId','') and organization_id = v_org),
      (select id from companies where id = nullif(v_header->>'agenciaEmpresaId','') and organization_id = v_org),
      nullif(v_header->>'clienteTexto',''), nullif(v_header->>'agenciaTexto',''),
      nullif(v_header->>'derechosTiempo',''), nullif(v_header->>'derechosPlataformas',''), nullif(v_header->>'derechosTerritorio',''),
      nullif(v_header->>'contactoCliente',''), nullif(v_header->>'mailContactoCliente',''), nullif(v_header->>'telefonoContactoCliente',''),
      nullif(v_header->>'contactoAgencia',''), nullif(v_header->>'mailContactoAgencia',''), nullif(v_header->>'telefonoContactoAgencia',''),
      nullif(v_header->>'condicionPago',''), nullif(v_header->>'fechaCotizacion','')::date, nullif(v_header->>'fechaAprobacion','')::date,
      nullif(v_header->>'fechaPago','')::date
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

    select version into v_new_ver from projects where id = v_id;
    v_result := v_result || jsonb_build_object('headerVersion', v_new_ver);
  end if;

  -- ════════════════════════════════════════════════════════════════════════
  -- ASIGNACIONES (modelo viejo, key-guarded).
  -- ════════════════════════════════════════════════════════════════════════
  if (p ? 'asignaciones') and ((not v_existe) or v_n_info = 'E') then
    delete from project_assignments where project_id = v_id;
    for elem in select * from jsonb_array_elements(fn_jsarr(p->'asignaciones')) loop
      v_cid := coalesce(
        (select id from contacts where id = nullif(elem->>'contactId','') and organization_id = v_org),
        (select id from contacts where organization_id = v_org and lower(nombre) = lower(elem->>'nombre') and deleted_at is null limit 1)
      );
      if v_cid is not null then
        insert into project_assignments (project_id, contact_id, function_id)
        select v_id, v_cid, f.id from project_functions f
        where f.organization_id = v_org and f.nombre = elem->>'funcion' limit 1
        on conflict (project_id, function_id) do nothing;
      end if;
    end loop;
  end if;

  -- ════════════════════════════════════════════════════════════════════════
  -- FINANZAS 1:1 + comisiones/riesgos/extras (modelo viejo, key-guarded).
  -- ════════════════════════════════════════════════════════════════════════
  if (p ? 'finanzas') and ((not v_existe) or v_n_pres = 'E') then
    insert into project_financials (project_id, presupuesto_cliente, gastos_admin_pct, frozen)
    values (v_id, coalesce(nullif(v_fin->>'presupuestoCliente','')::numeric, 0),
            coalesce(nullif(v_fin->>'gastosAdminPct','')::numeric, 0.05), v_fin->'frozen')
    on conflict (project_id) do update set
      presupuesto_cliente = excluded.presupuesto_cliente, gastos_admin_pct = excluded.gastos_admin_pct,
      frozen = excluded.frozen, updated_at = now();

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
  end if;

  -- ════════════════════════════════════════════════════════════════════════
  -- PRESUPUESTO POR FILA (diff con client_uuid + version).
  -- CAMBIO: el departamento se resuelve por `departamentoId` (validado en scope:
  -- default de la org o custom de ESTE proyecto). Fallback por nombre acotado al
  -- proyecto (custom de este proyecto → default de la org) para el estado mixto
  -- del rollout. Vacío / 'Sin departamento' / fuera de scope → NULL.
  -- ════════════════════════════════════════════════════════════════════════
  if (v_diff is not null) and ((not v_existe) or v_n_pres = 'E') then
    for elem in select * from jsonb_array_elements(coalesce(v_diff->'deletes','[]'::jsonb)) loop
      v_cu := nullif(elem->>'clientUuid','')::uuid;
      if v_cu is null then continue; end if;
      delete from budget_line_items
        where project_id = v_id and client_uuid = v_cu
          and version = coalesce(nullif(elem->>'version','')::int, -1);
      if not found then
        if exists (select 1 from budget_line_items where project_id = v_id and client_uuid = v_cu) then
          v_conflicts := v_conflicts || to_jsonb(v_cu::text);
        end if;
      end if;
    end loop;

    for elem in select * from jsonb_array_elements(coalesce(v_diff->'upserts','[]'::jsonb)) loop
      v_cu := nullif(elem->>'clientUuid','')::uuid;
      if v_cu is null then continue; end if;
      v_row_ver := nullif(elem->>'version','')::int;
      v_cid := coalesce(
        (select id from contacts where id = nullif(elem->>'contactId','') and organization_id = v_org),
        (select id from contacts where organization_id = v_org and lower(nombre) = lower(elem->>'nombre') and deleted_at is null limit 1)
      );

      -- Resolver department_id (servicios): por id con scope, o fallback por nombre.
      if elem->>'section' = 'servicios' then
        v_dept_raw := nullif(elem->>'departamentoId','')::int;
        v_dept_nom := trim(coalesce(elem->>'departamento',''));
        if v_dept_raw is not null then
          select d.id into v_dept_id from departments d
          where d.id = v_dept_raw
            and ((d.project_id is null and d.organization_id = v_org)   -- default de la org
                 or d.project_id = v_id);                                -- custom de ESTE proyecto
        elsif v_dept_nom <> '' and lower(v_dept_nom) <> 'sin departamento' then
          select coalesce(
            (select d.id from departments d where d.project_id = v_id and d.nombre = v_dept_nom limit 1),
            (select d.id from departments d where d.project_id is null and d.organization_id = v_org and d.nombre = v_dept_nom limit 1)
          ) into v_dept_id;
        else
          v_dept_id := null;
        end if;
      else
        v_dept_id := null;
      end if;

      if v_row_ver is null then
        -- Fila nueva: insert idempotente por client_uuid.
        insert into budget_line_items (
          project_id, client_uuid, version, section, department_id, contact_id, nombre, concepto, valor, cantidad, unidad,
          dte, confirmado, costo_real, es_extra, es_pp, hora_extra, he_config, dte_real, nota, nota_fecha, nota_autor, posicion
        ) values (
          v_id, v_cu, 1, elem->>'section', v_dept_id,
          v_cid, nullif(elem->>'nombre',''), nullif(elem->>'concepto',''), nullif(elem->>'valor','')::numeric,
          coalesce(nullif(elem->>'cantidad','')::numeric,0), nullif(elem->>'unidad',''),
          (select code from dte_types where code = nullif(elem->>'dte','')), coalesce((elem->>'confirmado')::boolean,false),
          nullif(elem->>'costoReal','')::numeric, coalesce((elem->>'esExtra')::boolean,false), coalesce((elem->>'esPp')::boolean,false),
          coalesce(nullif(elem->>'horaExtra','')::numeric,0),
          case when jsonb_typeof(elem->'heConfig') = 'object' then elem->'heConfig' else null end,
          (select code from dte_types where code = nullif(elem->>'dteReal','')),
          nullif(elem->>'nota',''), nullif(elem->>'notaFecha',''), nullif(elem->>'notaAutor',''),
          coalesce(nullif(elem->>'posicion','')::int,0)
        )
        on conflict (client_uuid) do nothing;
        select version into v_new_ver from budget_line_items where client_uuid = v_cu;
        v_bud_versions := v_bud_versions || jsonb_build_object(v_cu::text, v_new_ver);
      else
        -- Fila existente: update atómico con chequeo de versión.
        update budget_line_items set
          section = elem->>'section',
          department_id = v_dept_id,
          contact_id = v_cid, nombre = nullif(elem->>'nombre',''), concepto = nullif(elem->>'concepto',''),
          valor = nullif(elem->>'valor','')::numeric, cantidad = coalesce(nullif(elem->>'cantidad','')::numeric,0),
          unidad = nullif(elem->>'unidad',''), dte = (select code from dte_types where code = nullif(elem->>'dte','')),
          confirmado = coalesce((elem->>'confirmado')::boolean,false), costo_real = nullif(elem->>'costoReal','')::numeric,
          es_extra = coalesce((elem->>'esExtra')::boolean,false), es_pp = coalesce((elem->>'esPp')::boolean,false),
          hora_extra = coalesce(nullif(elem->>'horaExtra','')::numeric,0),
          he_config = case when jsonb_typeof(elem->'heConfig') = 'object' then elem->'heConfig' else null end,
          dte_real = (select code from dte_types where code = nullif(elem->>'dteReal','')),
          nota = nullif(elem->>'nota',''), nota_fecha = nullif(elem->>'notaFecha',''), nota_autor = nullif(elem->>'notaAutor',''),
          posicion = coalesce(nullif(elem->>'posicion','')::int,0),
          version = version + 1, updated_at = now()
        where project_id = v_id and client_uuid = v_cu and version = v_row_ver;
        if not found then
          v_conflicts := v_conflicts || to_jsonb(v_cu::text);
        else
          select version into v_new_ver from budget_line_items where client_uuid = v_cu;
          v_bud_versions := v_bud_versions || jsonb_build_object(v_cu::text, v_new_ver);
        end if;
      end if;
    end loop;

    if jsonb_array_length(v_conflicts) > 0 then
      raise exception 'TAKEOS_CONFLICT:%', jsonb_build_object('seccion','presupuesto','ids', v_conflicts)::text;
    end if;

    v_result := v_result || jsonb_build_object('budget', jsonb_build_object('versions', v_bud_versions));
  end if;

  -- ════════════════════════════════════════════════════════════════════════
  -- COTIZACIÓN (modelo viejo, key-guarded).
  -- ════════════════════════════════════════════════════════════════════════
  if ((p ? 'cotizacion') or (p ? 'versiones')) and ((not v_existe) or v_n_cot = 'E') then
    if (p ? 'cotizacion') then
      delete from quotation_offers  where project_id = v_id;
      delete from project_quotation where project_id = v_id;
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
    end if;
    if (p ? 'versiones') then
      delete from quotation_versions where project_id = v_id;
      if jsonb_typeof(p->'versiones') = 'array' then
        for elem in select * from jsonb_array_elements(fn_jsarr(p->'versiones')) loop
          insert into quotation_versions (project_id, numero, es_activa, snapshot, nota)
          values (v_id, coalesce(nullif(elem->>'numero','')::int,1), coalesce((elem->>'esActiva')::boolean,false),
                  coalesce(elem->'snapshot','{}'::jsonb), nullif(elem->>'nota',''));
        end loop;
      end if;
    end if;
  end if;

  return v_result;
end;
$function$;

-- ── 3. crear_departamento / renombrar_departamento (custom por-proyecto) ─────
-- Gate: presupuesto='E'. SECURITY DEFINER para poder escribir en departments sin
-- depender de datos_empresa (el control real es el gate de presupuesto).

CREATE OR REPLACE FUNCTION public.crear_departamento(p_project_id text, p_nombre text)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_org    uuid;
  v_nombre text := trim(coalesce(p_nombre,''));
  v_id     int;
  v_orden  int;
begin
  select organization_id into v_org from projects where id = p_project_id;
  if v_org is null then raise exception 'crear_departamento: proyecto inexistente.'; end if;
  if coalesce(auth_nivel('presupuesto', v_org),'none') <> 'E' then
    raise exception 'crear_departamento: sin permiso de presupuesto en esta organización.';
  end if;
  if v_nombre = '' or lower(v_nombre) = 'sin departamento' then
    raise exception 'crear_departamento: nombre inválido.';
  end if;

  -- Si el nombre ya existe como default de la org, se reusa (no se crea un custom
  -- duplicado que sombree al default).
  select id into v_id from departments where project_id is null and organization_id = v_org and nombre = v_nombre;
  if v_id is not null then return v_id; end if;
  -- Si ya existe el custom en este proyecto, se reusa (idempotente).
  select id into v_id from departments where project_id = p_project_id and nombre = v_nombre;
  if v_id is not null then return v_id; end if;

  select coalesce(max(orden),0)+1 into v_orden from departments
    where (project_id is null and organization_id = v_org) or project_id = p_project_id;

  insert into departments (organization_id, project_id, nombre, orden, activo)
  values (v_org, p_project_id, v_nombre, v_orden, true)
  on conflict (project_id, nombre) where project_id is not null do nothing;

  select id into v_id from departments where project_id = p_project_id and nombre = v_nombre;
  return v_id;
end;
$function$;

REVOKE ALL ON FUNCTION public.crear_departamento(text, text) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.crear_departamento(text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.renombrar_departamento(p_department_id int, p_nombre text)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_org    uuid;
  v_proj   text;
  v_nombre text := trim(coalesce(p_nombre,''));
begin
  select organization_id, project_id into v_org, v_proj from departments where id = p_department_id;
  if v_org is null then raise exception 'renombrar_departamento: departamento inexistente.'; end if;
  if v_proj is null then raise exception 'renombrar_departamento: no se puede renombrar un departamento por defecto.'; end if;
  if coalesce(auth_nivel('presupuesto', v_org),'none') <> 'E' then
    raise exception 'renombrar_departamento: sin permiso de presupuesto en esta organización.';
  end if;
  if v_nombre = '' or lower(v_nombre) = 'sin departamento' then
    raise exception 'renombrar_departamento: nombre inválido.';
  end if;
  if exists (select 1 from departments where project_id = v_proj and nombre = v_nombre and id <> p_department_id)
     or exists (select 1 from departments where project_id is null and organization_id = v_org and nombre = v_nombre) then
    raise exception 'renombrar_departamento: ya existe un departamento con ese nombre.';
  end if;
  update departments set nombre = v_nombre where id = p_department_id;
  return p_department_id;
end;
$function$;

REVOKE ALL ON FUNCTION public.renombrar_departamento(int, text) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.renombrar_departamento(int, text) TO authenticated;

-- ── 4. RLS: leer departments también con permiso de presupuesto ─────────────
-- Los perfiles Ejecutivo/Producción (presupuesto='E', datos_empresa='none') y
-- Asistencia/Finanzas (presupuesto='L') deben poder LEER departments (defaults de
-- su org + customs de sus proyectos, incluidos vacíos), o no verían los grupos y
-- su guardado los borraría. Sigue org-scopeada. La ESCRITURA de custom pasa por
-- los RPCs de arriba; la política de modificación (datos_empresa='E') no cambia.
ALTER POLICY b_departments_sel ON departments USING (
  auth_nivel('datos_empresa', organization_id) = ANY(ARRAY['E','L'])
  OR auth_nivel('presupuesto', organization_id) = ANY(ARRAY['E','L'])
);