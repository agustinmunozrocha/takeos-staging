-- ════════════════════════════════════════════════════════════════════════════
-- Migración: guardar_proyecto — concurrencia optimista POR FILA (Pasada 1)
-- Alcance: CABECERA (projects + project_commercial) + budget_line_items.
-- Autor: BD Expert. Lógica validada en transacción revertida (mecanismo
--        version-check / upsert por client_uuid / delete con versión / idempotencia).
--
-- POR QUÉ: hoy guardar_proyecto reemplaza el estado completo (DELETE masivo +
-- reinsert en las hijas; upsert total en las 1:1). Dos sesiones editando el
-- mismo proyecto se pisan: la última en guardar borra lo que la otra agregó
-- (pérdida probada de contacto_agencia en project_commercial). Esta pasada
-- migra la cabecera y el presupuesto a un modelo por fila con versión.
--
-- CONTRATO DE TRANSICIÓN (clave): las secciones que AÚN no se migran
-- (asignaciones, finanzas/comisiones/riesgos/extras, cotización/versiones)
-- quedan en el modelo viejo PERO protegidas por presencia de clave: si el
-- cliente no envía la clave de una sección, esa sección NO se toca. Esto evita
-- que un guardado parcial borre lo que no manda. (Antes el cliente siempre
-- mandaba todo, así que este guard estaba latente; ahora es necesario.)
--
-- BREAKING CHANGE: el retorno cambia de text a jsonb, y cambia la forma del
-- payload para cabecera (p.header) y presupuesto (p.presupuestoDiff). El cliente
-- debe desplegarse EN CONJUNTO con esta migración (ver handoff de cableado).
--
-- SECUENCIA: aplicar DESPUÉS del realineamiento de staging (reset → Tier B →
-- Tier A). Repo primero, luego staging, validar, y promover RPC+cliente juntos
-- a producción. Nunca aplicar directo a producción por el conector.
-- ════════════════════════════════════════════════════════════════════════════

-- ── Columnas nuevas ─────────────────────────────────────────────────────────
-- projects.version: versión de la CABECERA (projects + project_commercial como
-- unidad versionada bajo el permiso info_proyecto).
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS version int NOT NULL DEFAULT 1;

-- budget_line_items.client_uuid: identidad de fila puesta por el cliente
-- (Opción 1). El DEFAULT volátil rellena las filas existentes con un uuid
-- distinto cada una (Postgres evalúa gen_random_uuid() por fila al agregar la
-- columna). gen_random_uuid() es core (no requiere extensión).
ALTER TABLE budget_line_items
  ADD COLUMN IF NOT EXISTS client_uuid uuid NOT NULL DEFAULT gen_random_uuid();

-- budget_line_items.version: versión por fila para concurrencia optimista.
ALTER TABLE budget_line_items
  ADD COLUMN IF NOT EXISTS version int NOT NULL DEFAULT 1;

-- Unicidad global del client_uuid (habilita ON CONFLICT (client_uuid) e
-- idempotencia ante doble-envío del autosave).
CREATE UNIQUE INDEX IF NOT EXISTS budget_line_items_client_uuid_key
  ON budget_line_items (client_uuid);

-- ── Función ─────────────────────────────────────────────────────────────────
-- DROP necesario: no se puede cambiar el tipo de retorno con CREATE OR REPLACE.
DROP FUNCTION IF EXISTS public.guardar_proyecto(jsonb);

CREATE FUNCTION public.guardar_proyecto(p jsonb)
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
  -- Se procesa SOLO si el cliente envía p.header. Lo no enviado, no se toca.
  -- ════════════════════════════════════════════════════════════════════════
  if (v_header is not null) and ((not v_existe) or v_n_info = 'E') then
    if v_existe then
      -- UPDATE atómico con chequeo de versión: si otra sesión ya subió la
      -- versión, 0 filas afectadas → conflicto de cabecera.
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

    -- project_commercial: 1:1, parte de la cabecera (mismo gate info_proyecto).
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
  -- ASIGNACIONES (modelo viejo: DELETE masivo + reinsert). Key-guarded.
  -- Se convierte a por-fila en Pasada 2.
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
  -- FINANZAS 1:1 + comisiones/riesgos/extras (modelo viejo). Key-guarded.
  -- Se convierten en Pasada 2.
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
  -- PRESUPUESTO POR FILA (modelo nuevo: diff con client_uuid + version).
  -- p.presupuestoDiff = { upserts:[{clientUuid,version,...campos}], deletes:[{clientUuid,version}] }
  --   version null  → fila nueva (insert version 1, idempotente por client_uuid)
  --   version int   → fila existente (update atómico WHERE client_uuid AND version)
  -- Conflictos se acumulan y se lanza UN raise al final (todo o nada).
  -- ════════════════════════════════════════════════════════════════════════
  if (v_diff is not null) and ((not v_existe) or v_n_pres = 'E') then
    -- DELETES con chequeo de versión (idempotente si la fila ya no existe).
    for elem in select * from jsonb_array_elements(coalesce(v_diff->'deletes','[]'::jsonb)) loop
      v_cu := nullif(elem->>'clientUuid','')::uuid;
      if v_cu is null then continue; end if;
      delete from budget_line_items
        where project_id = v_id and client_uuid = v_cu
          and version = coalesce(nullif(elem->>'version','')::int, -1);
      if not found then
        -- existe con otra versión → conflicto; no existe → ya borrada (idempotente).
        if exists (select 1 from budget_line_items where project_id = v_id and client_uuid = v_cu) then
          v_conflicts := v_conflicts || to_jsonb(v_cu::text);
        end if;
      end if;
    end loop;

    -- UPSERTS
    for elem in select * from jsonb_array_elements(coalesce(v_diff->'upserts','[]'::jsonb)) loop
      v_cu := nullif(elem->>'clientUuid','')::uuid;
      if v_cu is null then continue; end if;
      v_row_ver := nullif(elem->>'version','')::int;
      v_cid := coalesce(
        (select id from contacts where id = nullif(elem->>'contactId','') and organization_id = v_org),
        (select id from contacts where organization_id = v_org and lower(nombre) = lower(elem->>'nombre') and deleted_at is null limit 1)
      );

      if v_row_ver is null then
        -- Fila nueva: insert idempotente por client_uuid (doble-envío no duplica).
        insert into budget_line_items (
          project_id, client_uuid, version, section, department_id, contact_id, nombre, concepto, valor, cantidad, unidad,
          dte, confirmado, costo_real, es_extra, es_pp, hora_extra, dte_real, nota, nota_fecha, nota_autor, posicion
        ) values (
          v_id, v_cu, 1, elem->>'section',
          case when elem->>'section' = 'servicios'
               then (select id from departments where organization_id = v_org and nombre = elem->>'departamento' limit 1) else null end,
          v_cid, nullif(elem->>'nombre',''), nullif(elem->>'concepto',''), nullif(elem->>'valor','')::numeric,
          coalesce(nullif(elem->>'cantidad','')::numeric,0), nullif(elem->>'unidad',''),
          (select code from dte_types where code = nullif(elem->>'dte','')), coalesce((elem->>'confirmado')::boolean,false),
          nullif(elem->>'costoReal','')::numeric, coalesce((elem->>'esExtra')::boolean,false), coalesce((elem->>'esPp')::boolean,false),
          coalesce(nullif(elem->>'horaExtra','')::numeric,0), (select code from dte_types where code = nullif(elem->>'dteReal','')),
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
          department_id = case when elem->>'section' = 'servicios'
                               then (select id from departments where organization_id = v_org and nombre = elem->>'departamento' limit 1) else null end,
          contact_id = v_cid, nombre = nullif(elem->>'nombre',''), concepto = nullif(elem->>'concepto',''),
          valor = nullif(elem->>'valor','')::numeric, cantidad = coalesce(nullif(elem->>'cantidad','')::numeric,0),
          unidad = nullif(elem->>'unidad',''), dte = (select code from dte_types where code = nullif(elem->>'dte','')),
          confirmado = coalesce((elem->>'confirmado')::boolean,false), costo_real = nullif(elem->>'costoReal','')::numeric,
          es_extra = coalesce((elem->>'esExtra')::boolean,false), es_pp = coalesce((elem->>'esPp')::boolean,false),
          hora_extra = coalesce(nullif(elem->>'horaExtra','')::numeric,0),
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
  -- COTIZACIÓN (modelo viejo). Key-guarded por 'cotizacion' / 'versiones'.
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

-- ── Permisos (reproduce EXACTAMENTE el baseline de prod: authenticated + postgres) ──
-- OJO (default-priv de Supabase): el rol creador (supabase_admin) otorga EXECUTE
-- EXPLÍCITO a anon, authenticated y service_role a CADA función nueva en public.
-- Verificado en vivo: función recién creada -> anon=t, authenticated=t, service_role=t
-- (y pg_default_acl lo confirma). Por eso `REVOKE ... FROM PUBLIC` NO basta: anon y
-- service_role conservan su grant explícito. El baseline de prod de esta función es
-- {authenticated, postgres}, así que revocamos PUBLIC + anon + service_role y dejamos
-- solo authenticated (+ dueño postgres). Sin el `anon`, un build fresco
-- (reset/preview/DR) deja guardar_proyecto anon-ejecutable (hueco real); sin el
-- `service_role`, queda con un grant de más respecto a prod (divergencia de fidelidad).
REVOKE ALL ON FUNCTION public.guardar_proyecto(jsonb) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.guardar_proyecto(jsonb) TO authenticated;
