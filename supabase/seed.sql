--
-- PostgreSQL database dump
--


-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.10 (Homebrew)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Data for Name: app_config; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.app_config (clave, valor, descripcion, updated_at) VALUES ('proveedor_razon_social', 'La Hectárea SpA', 'PLACEHOLDER. Identidad del Proveedor/Encargado frente a las productoras (PRD §17). Se reemplaza por la sociedad de software nueva cuando se constituya; al cambiar, se re-consiente a todos los usuarios.', '2026-06-10 12:49:12.49793+00');
INSERT INTO public.app_config (clave, valor, descripcion, updated_at) VALUES ('proveedor_rut', '', 'RUT del Proveedor. Vacío mientras se constituye la sociedad.', '2026-06-10 12:49:12.49793+00');


--
-- Data for Name: bank_institutions; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.bank_institutions (codigo_sbif, nombre, activo) VALUES ('001', 'Banco de Chile', true);
INSERT INTO public.bank_institutions (codigo_sbif, nombre, activo) VALUES ('009', 'Banco Internacional', true);
INSERT INTO public.bank_institutions (codigo_sbif, nombre, activo) VALUES ('012', 'BancoEstado', true);
INSERT INTO public.bank_institutions (codigo_sbif, nombre, activo) VALUES ('014', 'Scotiabank Chile', true);
INSERT INTO public.bank_institutions (codigo_sbif, nombre, activo) VALUES ('016', 'Banco BCI', true);
INSERT INTO public.bank_institutions (codigo_sbif, nombre, activo) VALUES ('028', 'Banco BICE', true);
INSERT INTO public.bank_institutions (codigo_sbif, nombre, activo) VALUES ('031', 'Banco HSBC', true);
INSERT INTO public.bank_institutions (codigo_sbif, nombre, activo) VALUES ('037', 'Banco Santander', true);
INSERT INTO public.bank_institutions (codigo_sbif, nombre, activo) VALUES ('039', 'Banco Itaú', true);
INSERT INTO public.bank_institutions (codigo_sbif, nombre, activo) VALUES ('049', 'Banco Security', true);
INSERT INTO public.bank_institutions (codigo_sbif, nombre, activo) VALUES ('051', 'Banco Falabella', true);
INSERT INTO public.bank_institutions (codigo_sbif, nombre, activo) VALUES ('053', 'Banco Ripley', true);
INSERT INTO public.bank_institutions (codigo_sbif, nombre, activo) VALUES ('730', 'Tenpo', true);
INSERT INTO public.bank_institutions (codigo_sbif, nombre, activo) VALUES ('875', 'Mercado Pago', true);


--
-- Data for Name: consent_terms; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.consent_terms (id, tipo, version, texto, estado, vigente, aprobado_por, aprobado_at, created_at) VALUES ('terminos-cuenta-2026-06-09-v0.1-borrador', 'terminos_cuenta', 'v0.1-borrador', 'BORRADOR — NO APTO PARA PRODUCCIÓN. Términos de la cuenta personal en TakeOS. Tus datos personales (nombre, RUT, correo, teléfono, dirección y datos bancarios) son privados: no los ve ninguna productora ni el Proveedor del software ({PROVEEDOR}) salvo que tú lo autorices expresamente al aceptar la invitación de una productora. Puedes revisar, corregir o eliminar tus datos en cualquier momento. [Texto definitivo pendiente de aprobación legal.]', 'borrador', false, NULL, NULL, '2026-06-10 12:49:30.579903+00');
INSERT INTO public.consent_terms (id, tipo, version, texto, estado, vigente, aprobado_por, aprobado_at, created_at) VALUES ('consentimiento-incorporacion-2026-06-09-v0.1-borrador', 'consentimiento_incorporacion', 'v0.1-provisional-pruebas', 'TEXTO PROVISIONAL v0.1 — SOLO PRUEBAS. Al aceptar, autorizas a {PRODUCTORA} a incorporar tus datos personales (nombre, RUT, correo, teléfono, dirección y los datos bancarios que tengas en tu perfil) a su base de contactos, con el fin de gestionar tu participación en sus proyectos: contratos, hojas de llamado, pagos y coordinación de producción. {PRODUCTORA} será la responsable del tratamiento de esos datos; {PROVEEDOR} actúa solo como proveedor del software. Puedes revocar esta autorización en cualquier momento desde tu perfil; la revocación no afecta los documentos ya emitidos. [Texto definitivo pendiente de aprobación legal.]', 'aprobado', true, 'Agustín Muñoz — activación provisional para pruebas internas (V11.3.0); el texto definitivo lo fija Legal v1.0', '2026-06-10 13:54:09.810692+00', '2026-06-10 12:49:30.579903+00');


--
-- Data for Name: dte_types; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.dte_types (code, label, aplica_retencion) VALUES ('boleta', 'Boleta de honorarios', true);
INSERT INTO public.dte_types (code, label, aplica_retencion) VALUES ('factura', 'Factura', false);
INSERT INTO public.dte_types (code, label, aplica_retencion) VALUES ('factura_exenta', 'Factura exenta', false);
INSERT INTO public.dte_types (code, label, aplica_retencion) VALUES ('boleta_terceros', 'Boleta a terceros', true);


--
-- Data for Name: plan_catalog; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.plan_catalog (codigo, nombre, max_proyectos_activos, max_colaboradores, orden, notas) VALUES ('free', 'Gratis', 1, 4, 0, 'Nucleo completo. Sin notificaciones/cobranza, sin Finanzas/CFO, sin reporte de cierre.');
INSERT INTO public.plan_catalog (codigo, nombre, max_proyectos_activos, max_colaboradores, orden, notas) VALUES ('rodaje', 'Rodaje', NULL, 4, 1, 'Proyectos ilimitados. Mismos modulos que Gratis.');
INSERT INTO public.plan_catalog (codigo, nombre, max_proyectos_activos, max_colaboradores, orden, notas) VALUES ('produccion', 'Producción', NULL, 12, 2, 'Proyectos ilimitados. Suma notificaciones/cobranza, Finanzas/CFO y reporte de cierre.');


--
-- Data for Name: plan_features; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.plan_features (plan_codigo, feature) VALUES ('produccion', 'finanzas');
INSERT INTO public.plan_features (plan_codigo, feature) VALUES ('produccion', 'reporte_cierre');
INSERT INTO public.plan_features (plan_codigo, feature) VALUES ('produccion', 'notificaciones');


--
-- Data for Name: tax_rates; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.tax_rates (id, concepto, tasa, vigente_desde, vigente_hasta) OVERRIDING SYSTEM VALUE VALUES (1, 'honorarios', 0.1375, '2024-01-01', '2024-12-31');
INSERT INTO public.tax_rates (id, concepto, tasa, vigente_desde, vigente_hasta) OVERRIDING SYSTEM VALUE VALUES (2, 'honorarios', 0.1450, '2025-01-01', '2025-12-31');
INSERT INTO public.tax_rates (id, concepto, tasa, vigente_desde, vigente_hasta) OVERRIDING SYSTEM VALUE VALUES (3, 'honorarios', 0.1525, '2026-01-01', '2026-12-31');
INSERT INTO public.tax_rates (id, concepto, tasa, vigente_desde, vigente_hasta) OVERRIDING SYSTEM VALUE VALUES (4, 'honorarios', 0.1600, '2027-01-01', '2027-12-31');
INSERT INTO public.tax_rates (id, concepto, tasa, vigente_desde, vigente_hasta) OVERRIDING SYSTEM VALUE VALUES (5, 'honorarios', 0.1700, '2028-01-01', NULL);
INSERT INTO public.tax_rates (id, concepto, tasa, vigente_desde, vigente_hasta) OVERRIDING SYSTEM VALUE VALUES (6, 'IVA', 0.19, '1998-01-01', NULL);
INSERT INTO public.tax_rates (id, concepto, tasa, vigente_desde, vigente_hasta) OVERRIDING SYSTEM VALUE VALUES (7, 'iva_exento', 0.00, '1998-01-01', NULL);
INSERT INTO public.tax_rates (id, concepto, tasa, vigente_desde, vigente_hasta) OVERRIDING SYSTEM VALUE VALUES (8, 'retencion_bte', 0.1375, '2024-01-01', '2024-12-31');
INSERT INTO public.tax_rates (id, concepto, tasa, vigente_desde, vigente_hasta) OVERRIDING SYSTEM VALUE VALUES (9, 'retencion_bte', 0.1450, '2025-01-01', '2025-12-31');
INSERT INTO public.tax_rates (id, concepto, tasa, vigente_desde, vigente_hasta) OVERRIDING SYSTEM VALUE VALUES (10, 'retencion_bte', 0.1525, '2026-01-01', '2026-12-31');
INSERT INTO public.tax_rates (id, concepto, tasa, vigente_desde, vigente_hasta) OVERRIDING SYSTEM VALUE VALUES (11, 'retencion_bte', 0.1600, '2027-01-01', '2027-12-31');
INSERT INTO public.tax_rates (id, concepto, tasa, vigente_desde, vigente_hasta) OVERRIDING SYSTEM VALUE VALUES (12, 'retencion_bte', 0.1700, '2028-01-01', NULL);


--
-- Name: tax_rates_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.tax_rates_id_seq', 12, true);


--
-- PostgreSQL database dump complete
--


