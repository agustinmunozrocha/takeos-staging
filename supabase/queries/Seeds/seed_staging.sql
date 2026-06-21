-- =====================================================================
-- TakeOS · SEED de STAGING (Tier A) · data de negocio
-- =====================================================================
-- Autor:  BD Expert (TakeOS) · Primate Films / La Hectárea SpA
-- Fecha:  2026-06-19
--
-- QUÉ HACE:
--   Restaura la branch de Staging a un baseline conocido de datos de
--   negocio (contactos, empresas, proyectos y todos sus sub-datos:
--   presupuesto, finanzas, cotización, cargos, asignaciones, producción,
--   perfiles de casting y las membresías de administrador de los 3 dueños).
--   Mundo de ejemplo: El Señor de los Anillos / GoT.
--
-- CÓMO USARLO:
--   Pegar y ejecutar COMPLETO en el SQL Editor de la branch de STAGING.
--   Correrlo de nuevo = volver al mismo baseline (es idempotente).
--
-- SEGURIDAD (barrera anti-producción):
--   Todo corre dentro de UN bloque atómico. Lo primero que hace es abortar
--   si detecta cualquier organización ajena a las 3 de Staging (en
--   Producción existe la org real → aborta ANTES de tocar nada). Si algo
--   fallara después, la transacción se revierte entera (incluido el
--   TRUNCATE). Es IMPOSIBLE que deje a medias o que corra en Producción.
--
-- ALCANCE (Tier A):
--   Asume que el "backbone" ya existe en la branch: las 3 organizaciones,
--   los usuarios (auth), perfiles, permisos, departamentos y funciones.
--   Del backbone SOLO recrea las membresías de los 3 dueños (que el cascade
--   del TRUNCATE arrastra); el resto del backbone no se toca. Rebuild total: Tier B.
-- =====================================================================

DO $seed$
DECLARE
  -- ===== Identificadores resueltos por NOMBRE (branch-agnóstico) =====
  v_org_names   text[] := ARRAY['Rivendell Films','Highgarden Producciones','Gondor Studios'];
  v_slugs       text[] := ARRAY['RIV','HIG','GON'];
  v_owner_mails text[] := ARRAY['agustinmr21@gmail.com','jidelacuadra@gmail.com','denethor@gondor.test'];

  -- ===== Pools de datos =====
  v_bases text[] := ARRAY['Casterly Rock','Kings Landing','Dorne','Braavos','Pentos','Volantis','Meereen','Oldtown','Riverrun','Pyke','Dragonstone','Storms End','Lothlorien','Mordor','Moria','Erebor','Mirkwood','Isengard','Rohan','Bree','Hobbiton','Minas Tirith','Helms Deep','Fangorn','Esgaroth','Dale','Numenor','Lannister','Stark','Tyrell','Martell','Greyjoy','Tully','Arryn','Baratheon'];
  v_suf   text[] := ARRAY['Producciones','Servicios','Catering','Equipos','Transportes','Estudios','Post','Rentals','Logística','Seguros','Iluminación','Sonido','Cámara','Arte','Vestuario','Casting','Locaciones','Gráfica','Drone','Grip'];
  v_giros text[] := ARRAY['Producción audiovisual','Arriendo de equipos audiovisuales','Servicios de catering','Transporte de carga','Post producción','Servicios profesionales','Arriendo de iluminación','Servicios de sonido','Diseño y arte','Vestuario y utilería'];
  v_ctipos text[] := ARRAY['cliente','proveedor','agencia','socio'];

  v_first text[] := ARRAY['Eddard','Catelyn','Robb','Sansa','Arya','Bran','Jon','Tyrion','Cersei','Jaime','Tywin','Daenerys','Viserys','Brienne','Samwell','Theon','Davos','Stannis','Melisandre','Margaery','Olenna','Petyr','Varys','Sandor','Oberyn','Ellaria','Yara','Euron','Tormund','Ygritte','Gilly','Missandei','Podrick','Bronn','Gendry','Jorah','Roose','Ramsay','Edmure','Lysa','Meera','Frodo','Samwise','Meriadoc','Peregrin','Bilbo','Gandalf','Aragorn','Legolas','Gimli','Boromir','Faramir','Theoden','Eomer','Eowyn','Galadriel','Celeborn','Elrond','Arwen','Thranduil','Tauriel','Thorin','Balin','Dwalin','Bard','Radagast','Beorn','Gloin','Nori','Dori'];
  v_last  text[] := ARRAY['Stark','Lannister','Targaryen','Baratheon','Tyrell','Martell','Greyjoy','Tully','Arryn','Bolton','Frey','Mormont','Tarly','Clegane','Baelish','Seaworth','Baggins','Gamgee','Brandybuck','Took','Greenleaf','Oakenshield','Underhill','Proudfoot','Sackville','Bracegirdle','Hornblower','Bolger','Cotton','Goodbody','Hightower','Dayne','Tarth','Reed','Umber'];
  v_comunas  text[] := ARRAY['Providencia','Las Condes','Ñuñoa','Santiago','Vitacura','La Reina','Macul','Recoleta','Independencia','Maipú','Valparaíso','Viña del Mar','Concepción'];
  v_regiones text[] := ARRAY['Metropolitana','Metropolitana','Metropolitana','Valparaíso','Biobío'];
  v_calles   text[] := ARRAY['Av. Apoquindo','Av. Providencia','Los Leones','Manuel Montt','Pedro de Valdivia','Irarrázaval','Av. Vitacura','Tobalaba','Av. Matta','Bilbao'];
  v_dte      text[] := ARRAY['boleta','factura','factura_exenta','boleta_terceros'];
  v_croles   text[] := ARRAY['crew','interno','talento','contacto_cliente','proveedor_individual'];
  v_tipocta  text[] := ARRAY['corriente','vista','ahorro','rut','chequera_electronica'];
  v_banks    text[] := ARRAY['001','009','012','014','016','028','031','037','039','049','051','053','730','875'];

  v_dt   text[] := ARRAY['6 meses','12 meses','24 meses','Indefinido'];
  v_dp   text[] := ARRAY['TV + Digital','Solo Digital','Cine + TV + Digital','Redes Sociales'];
  v_terr text[] := ARRAY['Chile','Latinoamérica','Global','Chile + Argentina'];
  v_cp   text[] := ARRAY['30 días','60 días','50% anticipo / 50% entrega','Contra entrega','Contado'];
  v_com  text[] := ARRAY['Comisión Agencia','Comisión Productor Ejecutivo','Comisión Comercial'];
  v_rsk  text[] := ARRAY['Contingencia','Imprevistos','Reserva de riesgo'];
  v_ext  text[] := ARRAY['Reembolso de gastos','Servicios adicionales','Ingreso por horas extra'];

  v_serv text[] := ARRAY['Dirección','Producción Ejecutiva','Producción General','Dirección de Arte','Servicios de Producción'];
  v_tec  text[] := ARRAY['Cámara','Lente','Iluminación','Grip','Sonido Directo','Maquinaria','Drone','Monitor','Walkie','Generador'];
  v_tal  text[] := ARRAY['Actor Principal','Actriz Principal','Actor de Reparto','Extras'];
  v_gas  text[] := ARRAY['Catering','Transporte','Locación','Seguros','Combustible','Imprevistos'];

  v_rep    text[] := ARRAY['Tyrion Lannister','Varys','Petyr Baelish','Denethor','Saruman','Galadriel','Elrond','Mace Tyrell','Doran Martell','Tywin Lannister'];
  v_offn   text[] := ARRAY['Propuesta Base','Opción Premium','Opción Económica'];
  v_inc    text[] := ARRAY['Dirección','Producción general','Equipo técnico','Post producción','Casting'];
  v_ninc   text[] := ARRAY['Derechos de música','Talento adicional','Días extra de rodaje'];
  v_descp  text[] := ARRAY['Producción audiovisual para campaña publicitaria.','Cortometraje de ficción.','Documental institucional.','Serie de contenido para redes.','Spot publicitario para TV y digital.'];
  v_notas  text[] := ARRAY['Versión inicial','Ajuste de alcance','Versión final aprobada','Revisión de presupuesto'];

  v_pub   text[] := ARRAY['Spot Dorne','Comercial Lannister','Campaña Volantis','Branded Content Erebor','Spot Pentos','Comercial Casterly','Campaña Meereen','Spot Braavos','Comercial Oldtown'];
  v_fic   text[] := ARRAY['Documental Mordor','Cortometraje Lothlorien','Serie Rohan','Largometraje Numenor','Videoclip Bree','Documental Isengard','Cortometraje Esgaroth','Serie Dragonstone','Largometraje Riverrun'];
  v_servp text[] := ARRAY['Producción','Producción Ejecutiva','Servicios de Producción','Post Producción'];

  v_roles_cargo text[] := ARRAY['Director','Productor Ejecutivo','Productor','Director de Fotografía','1er Asistente de Dirección','Jefe de Producción','Director de Arte','Sonidista','Gaffer','Continuista','Maquillaje','Vestuarista','Editor','Productor de Campo','Coordinador de Producción'];
  v_perf  text[] := ARRAY['Producción','Creativo','Coordinación','Asistencia','Ejecutivo'];
  v_descd text[] := ARRAY['Exteriores','Estudio','Locación interior','Exteriores noche','Set principal'];
  v_obl   text[] := ARRAY['Transporte','Catering','Caja chica','Combustible','Materiales de arte'];
  v_resp  text[] := ARRAY['Jefe de Producción','Coordinador','Asistente de Producción','Productor de Campo'];

  v_estados_full text[] := ARRAY['venta','venta','preproduccion','produccion','produccion','postproduccion','cierre','cerrado','rechazado'];
  v_cnt_riv int[] := ARRAY[0,0,3,12,6,4,5,8,0];
  v_cnt_hig int[] := ARRAY[0,0,2,4,3,4,2,4,0];
  v_fill_riv int[] := ARRAY[0,0,5,12,9,10,8,12,0];

  -- ===== Variables de trabajo =====
  o int; i int; j int; k int; t int; p int; d int; r int;
  v_org uuid; v_slug text; v_owner uuid; v_dept_ids bigint[]; v_fn_ids bigint[];
  v_cid text; v_fant text; v_body bigint; v_s int; v_m int; v_dv int; v_rut text; n_tipos int; n_roles int;
  v_estados text[]; v_nproj int; v_estado text; v_pid text; v_cat text; v_nombre text;
  v_aprob timestamptz; v_cerr timestamptz; v_entrega date; v_pos int;
  v_costo numeric; v_presup numeric; v_fcot date; v_fapr date; v_fpago date;
  v_noffers int; v_nversions int; v_cnt int[]; v_fill int[];
  v_n int; v_idx int; v_ctid text; v_ndays int; v_nob int; v_caja numeric;
  v_ajenas int; v_staging int;
BEGIN
  -- ============ BARRERA ANTI-PRODUCCIÓN (triple guard) ============
  -- (0) Guard DURO por UUID: la org real de Producción (Primate) existe SOLO en prod.
  --     Aunque alguien creara orgs con nombres de Staging en prod, esto igual aborta.
  IF EXISTS (SELECT 1 FROM organizations WHERE id = '640ab1e0-011c-43fe-a5aa-5a636005f56f') THEN
    RAISE EXCEPTION 'ABORTADO: se detectó la organización de PRODUCCIÓN (Primate, 640ab1e0-...). Este seed NUNCA se ejecuta en Producción.';
  END IF;
  -- (1) Guard por NOMBRE: cualquier org ajena a las 3 de Staging delata que no es la branch.
  SELECT count(*) INTO v_ajenas FROM organizations WHERE nombre <> ALL(v_org_names);
  IF v_ajenas > 0 THEN
    RAISE EXCEPTION 'ABORTADO: % organizacion(es) ajena(s) a Staging. Este seed SOLO corre en la branch de Staging; NUNCA en Producción.', v_ajenas;
  END IF;
  SELECT count(*) INTO v_staging FROM organizations WHERE nombre = ANY(v_org_names);
  IF v_staging <> 3 THEN
    RAISE EXCEPTION 'ABORTADO: backbone de Staging incompleto (orgs esperadas 3, encontradas %). Tier A asume el backbone ya provisto.', v_staging;
  END IF;

  -- ============ DETERMINISMO ============
  PERFORM setseed(0.42);

  -- ============ RESET (idempotente) ============
  TRUNCATE TABLE projects CASCADE;   -- arrastra todos los project_* (presupuesto, finanzas, cotización, cargos, asignaciones, producción)
  TRUNCATE TABLE contacts CASCADE;   -- arrastra cuentas bancarias, roles, talentos, vínculos
  TRUNCATE TABLE companies CASCADE;  -- arrastra company_relationships

  -- ============ REGENERACIÓN ============
  FOR o IN 1..3 LOOP
    SELECT id INTO v_org   FROM organizations WHERE nombre = v_org_names[o];
    SELECT id INTO v_owner FROM auth.users    WHERE email  = v_owner_mails[o];
    v_slug := v_slugs[o];
    SELECT array_agg(id ORDER BY id) INTO v_dept_ids FROM departments       WHERE organization_id = v_org;
    SELECT array_agg(id ORDER BY id) INTO v_fn_ids   FROM project_functions WHERE organization_id = v_org;
    PERFORM set_config('request.jwt.claims', json_build_object('sub', COALESCE(v_owner::text,'00000000-0000-0000-0000-000000000000'))::text, true);

    -- ---------- (1) EMPRESAS + tipos ----------
    FOR i IN 1..60 LOOP
      v_cid  := 'CO-'||v_slug||'-'||lpad(i::text,4,'0');
      v_fant := v_bases[1+floor(random()*array_length(v_bases,1))::int]||' '||v_suf[1+floor(random()*array_length(v_suf,1))::int];
      v_body := 76000000 + (o-1)*1000000 + i;
      v_s:=0; v_m:=2;
      FOR d IN REVERSE length(v_body::text)..1 LOOP
        v_s := v_s + substr(v_body::text,d,1)::int * v_m; v_m := v_m+1; IF v_m>7 THEN v_m:=2; END IF;
      END LOOP;
      v_dv := 11 - (v_s % 11);
      v_rut := v_body::text||'-'||CASE WHEN v_dv=11 THEN '0' WHEN v_dv=10 THEN 'K' ELSE v_dv::text END;
      INSERT INTO companies (id, organization_id, rut, nombre_fantasia, razon_social, giro_sii, web)
      VALUES (v_cid, v_org, v_rut, v_fant,
              v_fant||CASE WHEN random()<0.5 THEN ' SpA' ELSE ' Ltda.' END,
              v_giros[1+floor(random()*array_length(v_giros,1))::int],
              'www.'||lower(regexp_replace(v_fant,'[^a-zA-Z]','','g'))||'.test');
      n_tipos := CASE WHEN random()<0.2 THEN 2 ELSE 1 END;
      FOR t IN 1..n_tipos LOOP
        INSERT INTO company_relationships (company_id, tipo)
        VALUES (v_cid, v_ctipos[1+floor(random()*array_length(v_ctipos,1))::int]) ON CONFLICT DO NOTHING;
      END LOOP;
    END LOOP;

    -- ---------- (2) CONTACTOS + roles + cuentas ----------
    FOR i IN 1..100 LOOP
      v_cid  := 'CT-'||v_slug||'-'||lpad(i::text,4,'0');
      v_body := 10000000 + (o-1)*1000000 + i;
      v_s:=0; v_m:=2;
      FOR d IN REVERSE length(v_body::text)..1 LOOP
        v_s := v_s + substr(v_body::text,d,1)::int * v_m; v_m := v_m+1; IF v_m>7 THEN v_m:=2; END IF;
      END LOOP;
      v_dv := 11 - (v_s % 11);
      v_rut := v_body::text||'-'||CASE WHEN v_dv=11 THEN '0' WHEN v_dv=10 THEN 'K' ELSE v_dv::text END;
      INSERT INTO contacts (id, organization_id, nombre, rut, email, telefono, direccion, comuna, ciudad, region, fecha_nacimiento, dte_habitual)
      VALUES (v_cid, v_org,
              v_first[1+floor(random()*array_length(v_first,1))::int]||' '||v_last[1+floor(random()*array_length(v_last,1))::int],
              v_rut,
              lower(v_slug)||'.contacto'||lpad(i::text,4,'0')||'@correo.test',
              '+569'||lpad((10000000+floor(random()*89999999)::bigint)::text,8,'0'),
              v_calles[1+floor(random()*array_length(v_calles,1))::int]||' '||(100+floor(random()*9000)::int)::text,
              v_comunas[1+floor(random()*array_length(v_comunas,1))::int], 'Santiago',
              v_regiones[1+floor(random()*array_length(v_regiones,1))::int],
              (date '1965-01-01' + floor(random()*13000)::int)::date,
              CASE WHEN random()<0.7 THEN v_dte[1+floor(random()*array_length(v_dte,1))::int] ELSE NULL END);
      n_roles := CASE WHEN random()<0.05 THEN 2 ELSE 1 END;
      FOR r IN 1..n_roles LOOP
        INSERT INTO contact_roles (contact_id, role, activo)
        VALUES (v_cid, v_croles[1+floor(random()*array_length(v_croles,1))::int], true) ON CONFLICT DO NOTHING;
      END LOOP;
      IF random() < 0.66 THEN
        INSERT INTO contact_bank_accounts (contact_id, bank_codigo_sbif, tipo_cuenta, numero_cuenta, es_principal, es_extranjera)
        VALUES (v_cid, v_banks[1+floor(random()*array_length(v_banks,1))::int],
                v_tipocta[1+floor(random()*array_length(v_tipocta,1))::int],
                (1000000+floor(random()*899999999)::bigint)::text, true, false);
      END IF;
    END LOOP;

    -- ---------- (3) VÍNCULOS persona-empresa ----------
    FOR k IN 1..6 LOOP
      INSERT INTO contact_companies (contact_id, company_id, es_socio, es_representante, cargo)
      VALUES ('CT-'||v_slug||'-'||lpad((1+floor(random()*100)::int)::text,4,'0'),
              'CO-'||v_slug||'-'||lpad((1+floor(random()*60)::int)::text,4,'0'),
              random()<0.5, random()<0.5,
              (ARRAY['Representante Legal','Socio','Gerente General','Contacto Comercial','Productor'])[1+floor(random()*5)::int])
      ON CONFLICT DO NOTHING;
    END LOOP;

    -- ---------- (4..10) PROYECTOS y sub-datos ----------
    IF o = 3 THEN
      v_estados := ARRAY['produccion']; v_cnt := ARRAY[4]; v_fill := ARRAY[8];
    ELSE
      v_estados := v_estados_full;
      v_cnt  := CASE o WHEN 1 THEN v_cnt_riv  ELSE v_cnt_hig END;
      v_fill := v_fill_riv;  -- mismas magnitudes para RIV y HIG (HIG se corta solo en cargos por el tope de plan)
    END IF;
    v_nproj := array_length(v_estados,1);

    FOR p IN 1..v_nproj LOOP
      v_estado := v_estados[p];
      v_pid := 'PR-'||v_slug||'-'||lpad(p::text,4,'0');
      IF (p % 2)=1 THEN v_cat:='publicidad'; v_nombre:=v_pub[1+((p-1)%array_length(v_pub,1))];
                   ELSE v_cat:='ficcion';    v_nombre:=v_fic[1+((p-1)%array_length(v_fic,1))]; END IF;
      v_aprob := CASE WHEN v_estado IN ('preproduccion','produccion','postproduccion','cierre','cerrado','cancelado')
                      THEN now() - make_interval(days => 30+floor(random()*180)::int) ELSE NULL END;
      v_cerr  := CASE WHEN v_estado IN ('cerrado','rechazado','cancelado')
                      THEN now() - make_interval(days => floor(random()*30)::int) ELSE NULL END;
      v_entrega := CASE WHEN v_estado='venta' THEN current_date + (30+floor(random()*120)::int)
                        ELSE current_date - 60 + floor(random()*200)::int END;

      -- (4) proyecto
      INSERT INTO projects (id, organization_id, nombre_proyecto, categoria, es_remunerado, servicio, productora,
                            fecha_entrega_final, estado, aprobado_at, cerrado_at, created_by, updated_by)
      VALUES (v_pid, v_org, v_nombre, v_cat,
              CASE WHEN random()<0.85 THEN true ELSE false END,
              v_servp[1+floor(random()*array_length(v_servp,1))::int], v_org_names[o],
              v_entrega, v_estado, v_aprob, v_cerr, v_owner, v_owner);

      -- (5) presupuesto (todos menos rechazado)
      IF v_estado <> 'rechazado' THEN
        v_pos := 0;
        FOR j IN 1..array_length(v_serv,1) LOOP v_pos:=v_pos+1;
          INSERT INTO budget_line_items (project_id,section,nombre,concepto,valor,cantidad,unidad,dte,confirmado,posicion)
          VALUES (v_pid,'servicios',v_serv[j],'Honorarios',round((300000+random()*1700000)/1000)*1000,1+floor(random()*5),'jornada',
                  CASE WHEN random()<0.6 THEN v_dte[1+floor(random()*4)::int] ELSE NULL END,random()<0.5,v_pos);
        END LOOP;
        FOR j IN 1..array_length(v_tec,1) LOOP v_pos:=v_pos+1;
          INSERT INTO budget_line_items (project_id,section,nombre,concepto,valor,cantidad,unidad,dte,confirmado,department_id,posicion)
          VALUES (v_pid,'tecnica',v_tec[j],'Arriendo',round((100000+random()*700000)/1000)*1000,1+floor(random()*8),'día',
                  CASE WHEN random()<0.6 THEN v_dte[1+floor(random()*4)::int] ELSE NULL END,random()<0.5,
                  v_dept_ids[1+floor(random()*array_length(v_dept_ids,1))::int],v_pos);
        END LOOP;
        FOR j IN 1..array_length(v_tal,1) LOOP v_pos:=v_pos+1;
          INSERT INTO budget_line_items (project_id,section,nombre,concepto,valor,cantidad,unidad,dte,confirmado,contact_id,department_id,posicion)
          VALUES (v_pid,'talentos',v_tal[j],'Cachet',round((200000+random()*2800000)/1000)*1000,1+floor(random()*3),'jornada',
                  CASE WHEN random()<0.6 THEN v_dte[1+floor(random()*4)::int] ELSE NULL END,random()<0.5,
                  'CT-'||v_slug||'-'||lpad((1+floor(random()*100)::int)::text,4,'0'),
                  v_dept_ids[1+floor(random()*array_length(v_dept_ids,1))::int],v_pos);
        END LOOP;
        FOR j IN 1..array_length(v_gas,1) LOOP v_pos:=v_pos+1;
          INSERT INTO budget_line_items (project_id,section,nombre,concepto,valor,cantidad,unidad,dte,confirmado,posicion)
          VALUES (v_pid,'gastos',v_gas[j],'Gasto',round((50000+random()*450000)/1000)*1000,1+floor(random()*4),'global',
                  CASE WHEN random()<0.6 THEN v_dte[1+floor(random()*4)::int] ELSE NULL END,random()<0.5,v_pos);
        END LOOP;
      END IF;

      -- (5b) finanzas 1:1 (todos)
      v_costo  := (SELECT coalesce(sum(valor*GREATEST(cantidad,1)),0) FROM budget_line_items WHERE project_id=v_pid);
      v_presup := CASE WHEN v_costo>0 THEN round(v_costo*(1.15+random()*0.25)) ELSE round(20000000+random()*60000000) END;
      INSERT INTO project_financials (project_id, presupuesto_cliente, gastos_admin_pct, he_recargo_default)
      VALUES (v_pid, v_presup, round((0.05+random()*0.05)::numeric,3), 150);

      -- (5c) comercial 1:1 (todos)
      v_fcot := current_date - (60+floor(random()*120)::int);
      v_fapr := CASE WHEN v_estado IN ('preproduccion','produccion','postproduccion','cierre','cerrado') THEN v_fcot+(5+floor(random()*20)::int) ELSE NULL END;
      v_fpago := CASE WHEN v_estado='cerrado' THEN v_fapr+(30+floor(random()*60)::int) ELSE NULL END;
      INSERT INTO project_commercial (project_id, cliente_empresa_id, cliente_contacto_id, agencia_empresa_id,
              derechos_tiempo, derechos_plataformas, derechos_territorio, condicion_pago, fecha_cotizacion, fecha_aprobacion, fecha_pago)
      VALUES (v_pid,
              'CO-'||v_slug||'-'||lpad((1+floor(random()*60)::int)::text,4,'0'),
              'CT-'||v_slug||'-'||lpad((1+floor(random()*100)::int)::text,4,'0'),
              CASE WHEN random()<0.5 THEN 'CO-'||v_slug||'-'||lpad((1+floor(random()*60)::int)::text,4,'0') ELSE NULL END,
              v_dt[1+floor(random()*4)::int], v_dp[1+floor(random()*4)::int], v_terr[1+floor(random()*4)::int],
              v_cp[1+floor(random()*5)::int], v_fcot, v_fapr, v_fpago);

      -- (5d) comisiones / riesgos / extras (no rechazado)
      IF v_estado <> 'rechazado' THEN
        INSERT INTO project_commissions (project_id, label, mode, value, posicion)
        VALUES (v_pid, v_com[1+floor(random()*3)::int], 'pct', 5+floor(random()*15), 1);
        IF random()<0.3 THEN
          INSERT INTO project_commissions (project_id, label, mode, value, posicion)
          VALUES (v_pid, 'Comisión adicional', 'monto', round((200000+random()*800000)/1000)*1000, 2);
        END IF;
        INSERT INTO project_risks (project_id, label, mode, value, posicion)
        VALUES (v_pid, v_rsk[1+floor(random()*3)::int], 'pct', 3+floor(random()*7), 1);
        IF random()<0.4 THEN
          INSERT INTO project_income_extras (project_id, label, monto, posicion)
          VALUES (v_pid, v_ext[1+floor(random()*3)::int], round((300000+random()*2000000)/1000)*1000, 1);
        END IF;
      END IF;

      -- (6) cotización: header + ofertas + versiones (todos)
      INSERT INTO project_quotation (project_id, fecha_emision, representante_cliente, descripcion_proyecto, jornadas_rodaje)
      VALUES (v_pid, v_fcot, v_rep[1+floor(random()*array_length(v_rep,1))::int],
              v_descp[1+floor(random()*array_length(v_descp,1))::int], (1+floor(random()*4))::text);
      v_noffers := 1+floor(random()*3)::int;
      FOR k IN 1..v_noffers LOOP
        INSERT INTO quotation_offers (project_id, nombre, valor_cliente, descripcion, incluye, no_incluye, posicion, es_base)
        VALUES (v_pid, v_offn[k],
                round(v_presup * CASE k WHEN 1 THEN 1.0 WHEN 2 THEN 1.3 ELSE 0.8 END),
                'Alcance '||v_offn[k],
                CASE k WHEN 1 THEN v_inc[1:3] WHEN 2 THEN v_inc[1:5] ELSE v_inc[1:2] END,
                CASE k WHEN 1 THEN v_ninc[1:2] WHEN 2 THEN v_ninc[1:1] ELSE v_ninc[1:3] END,
                k, (k=1));
      END LOOP;
      v_nversions := 1+floor(random()*3)::int;
      FOR k IN 1..v_nversions LOOP
        INSERT INTO quotation_versions (project_id, numero, es_activa, nota)
        VALUES (v_pid, k, (k=v_nversions), v_notas[1+floor(random()*array_length(v_notas,1))::int]);
      END LOOP;

      -- (7) cargos (cantidad por posición; aquí se ejercen los topes de plan)
      v_n := v_cnt[p];
      IF v_n > 0 THEN
        FOR i IN 1..v_n LOOP
          v_idx  := 1 + (((p-1)*13 + (i-1)) % 100);
          v_ctid := 'CT-'||v_slug||'-'||lpad(v_idx::text,4,'0');
          INSERT INTO project_cargos (id, project_id, cargo, custom, persona_nombre, contact_id, tipo, perfil, estado, posicion)
          VALUES ('CG-'||v_slug||'-'||lpad(p::text,2,'0')||'-'||lpad(i::text,4,'0'),
                  v_pid, v_roles_cargo[1+((i-1)%array_length(v_roles_cargo,1))], false,
                  (SELECT nombre FROM contacts WHERE id=v_ctid), v_ctid,
                  CASE WHEN random()<0.75 THEN 'interno' ELSE 'externo' END,
                  v_perf[1+floor(random()*array_length(v_perf,1))::int],
                  CASE WHEN random()<0.8 THEN 'activo' ELSE 'pendiente' END, i);
        END LOOP;
      END IF;

      -- (8) asignaciones de función (1 persona por función)
      v_n := v_fill[p];
      IF v_n > 0 THEN
        FOR j IN 1..v_n LOOP
          v_idx  := 1 + (((p-1)*17 + (j-1)) % 100);
          v_ctid := 'CT-'||v_slug||'-'||lpad(v_idx::text,4,'0');
          INSERT INTO project_assignments (project_id, contact_id, function_id)
          VALUES (v_pid, v_ctid, v_fn_ids[j]);
        END LOOP;
      END IF;

      -- (9..10) producción: días de rodaje + operaciones + hoja de llamado + op budgets (rodaje+)
      IF v_estado IN ('produccion','postproduccion','cierre','cerrado') THEN
        v_ndays := 1+floor(random()*4)::int;
        FOR k IN 1..v_ndays LOOP
          INSERT INTO project_shoot_days (project_id, dia_id, fecha, activo, descripcion, posicion)
          VALUES (v_pid, 'D'||k, current_date - 10 + (k*2), (v_estado='produccion' AND k=1),
                  'Día '||k||' - '||v_descd[1+floor(random()*array_length(v_descd,1))::int], k);
        END LOOP;
        v_caja := round((500000+random()*2500000)/10000)*10000;
        INSERT INTO project_operations (project_id, caja_prod, op_movimientos, op_lineas_extra, asistentes_cliente, asistentes_agencia, asistentes_externo)
        VALUES (v_pid, v_caja, '[]'::jsonb, '[]'::jsonb, floor(random()*4)::int, floor(random()*3)::int, floor(random()*5)::int);
        INSERT INTO project_call_sheet (project_id, data)
        VALUES (v_pid, jsonb_build_object('dias','{}'::jsonb,'version',1,'locaciones','[]'::jsonb));
        v_nob := 2+floor(random()*3)::int;
        FOR k IN 1..v_nob LOOP
          INSERT INTO project_op_budgets (id, project_id, nombre, linea, resp, asignado, posicion)
          VALUES ('OB-'||v_slug||'-'||lpad(p::text,2,'0')||'-'||lpad(k::text,2,'0'), v_pid,
                  'Partida '||k, v_obl[1+floor(random()*array_length(v_obl,1))::int],
                  v_resp[1+floor(random()*array_length(v_resp,1))::int],
                  round((100000+random()*900000)/10000)*10000, k);
        END LOOP;
      END IF;

    END LOOP;  -- proyectos
  END LOOP;    -- orgs

  -- ---------- (11) PERFILES DE CASTING (todos los contactos con rol 'talento') ----------
  INSERT INTO contact_talent_profiles (contact_id, genero, altura_cm, apariencia_etnica, areas_interes, talla_polera, talla_pantalon, talla_calzado, fotos_link, reel_link)
  SELECT DISTINCT ON (cr.contact_id) cr.contact_id,
    (ARRAY['Masculino','Femenino','No binario'])[1+floor(random()*3)::int],
    (150+floor(random()*50))::smallint,
    (ARRAY['Latina','Caucásica','Afrodescendiente','Asiática','Mestiza'])[1+floor(random()*5)::int],
    (ARRAY['Cine','Publicidad','Teatro','TV','Modelaje','Doblaje'])[1:(2+floor(random()*3)::int)],
    (ARRAY['XS','S','M','L','XL'])[1+floor(random()*5)::int],
    (ARRAY['38','40','42','44','46'])[1+floor(random()*5)::int],
    (ARRAY['37','38','39','40','41','42','43','44'])[1+floor(random()*8)::int],
    'https://book.talento.test/'||cr.contact_id,
    'https://reel.talento.test/'||cr.contact_id
  FROM contact_roles cr
  WHERE cr.role='talento'
  ORDER BY cr.contact_id
  ON CONFLICT (contact_id) DO NOTHING;

  -- ---------- (12) MEMBRESÍAS DE ADMINISTRADOR (dueños de cada productora) ----------
  -- Necesario: el TRUNCATE contacts CASCADE de arriba arrastra memberships
  -- (memberships.contact_id → contacts), así que se recrean acá en cada corrida.
  -- Resuelto por nombre/email/perfil (branch-agnóstico). tipo válido = interno/externo;
  -- la condición de admin vive en el perfil 'Administrador', NO en tipo.
  FOR o IN 1..3 LOOP
    SELECT id INTO v_org   FROM organizations WHERE nombre = v_org_names[o];
    SELECT id INTO v_owner FROM auth.users    WHERE email  = v_owner_mails[o];
    IF v_org IS NOT NULL AND v_owner IS NOT NULL THEN
      INSERT INTO memberships (organization_id, user_id, tipo, profile_id, estado)
      VALUES (v_org, v_owner, 'interno',
              (SELECT id FROM permission_profiles WHERE organization_id=v_org AND nombre='Administrador'),
              'activo')
      ON CONFLICT (user_id, organization_id) DO UPDATE
        SET tipo='interno', profile_id=EXCLUDED.profile_id, estado='activo', updated_at=now();
    END IF;
  END LOOP;

  RAISE NOTICE 'SEED Staging Tier A: OK.';
END $seed$;
