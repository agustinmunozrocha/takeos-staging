# QA · Calculadoras (`frontend/src/modules/calculadoras.js`)

Referencia de comportamiento: monolito en `main` (`git show main:index.html`).
Módulos de apoyo: `lib/rates.js` (IVA / FACTOR_BOLETA desde `tax_rates`, ADR-018),
`lib/data.js` (montoNetoDesde / montoBrutoDesde / factorRetencionDte), `presupuesto`.
Cobertura: 4/6 ✅ (QA automatizado 2026-07-20, 0 bugs).

> **Resultado del cruce:** port **fiel** del monolito. Las fórmulas son idénticas
> (`calcUpdate`, `_crcCostoReal`, `_heCalc`) y las tasas se **leen** de `tax_rates`
> (no hardcodeadas). **Línea roja #1 respetada:** IVA/FACTOR_BOLETA se importan de
> `rates.js`, no se redefinen. El juez final eres tú en `localhost:5173`.

---

## A. Calculadora tributaria (standalone · "Calculadora tributaria")
Abrir desde el encabezado de Presupuesto ("Calculadora tributaria"). Tipos: Boleta de
honorarios (retención 15.25% → factor 0.8475) · Factura con IVA (19%). Modos: Líquido /
Bruto.

| ID | Qué probar | Pasos | Esperado (según `main`) | Estado |
|----|-----------|-------|-------------------------|--------|
| CALC1 | Factura IVA · bruto→neto | Tipo "Factura con IVA", modo Bruto, monto **119.000** | Líquido (neto) **100.000**, impuesto **19.000**, bruto **119.000** (119.000 / 1,19) | ✅ |
| CALC2 | Factura IVA · neto→bruto | Modo Líquido, monto **100.000** | Bruto **119.000**, impuesto **19.000** (100.000 × 1,19) | ✅ |
| CALC3 | BHE · bruto→líquido | Tipo "Boleta de honorarios", modo Bruto, monto **100.000** | Líquido **84.750**, impuesto **15.250** (100.000 × 0,8475) | ✅ |
| CALC4 | BHE · líquido→bruto | Modo Líquido, monto **100.000** | Bruto **117.994**, impuesto **17.994** (100.000 / 0,8475) | ✅ |

## B. Calculadora de costo real (por fila · crc)
| ID | Qué probar | Pasos | Esperado (según `main`) | Estado |
|----|-----------|-------|-------------------------|--------|
| CALC5 | Costo real por DTE de la fila | Doble clic en la celda "Costo real" de una fila con DTE → ingresar monto | boleta(retención): costo = líquido / 0,8475 · factura+IVA: costo = monto / 1,19 · exenta/sin DTE: costo = monto | ⬜ (verificado por código — port fiel; en vivo requiere el grid de Presupuesto con Costo Real visible, no expuesto en modo "solo cotización") |

## C. Calculadora de hora extra (por fila · hec)
| ID | Qué probar | Pasos | Esperado (según `main`) | Estado |
|----|-----------|-------|-------------------------|--------|
| CALC6 | HE = valorHora × recargo × horas | En una fila, abrir Hora extra → horas + valor hora + recargo | Fórmula: `round(valorHora × (recargo/100) × horas)`. Por defecto: valorHora = valor de la fila ÷ 10, recargo = recargo del proyecto (150%) | ⬜ (verificado por código — port fiel; en vivo requiere proyecto en preproducción — la HE no se expone en modo "solo cotización") |

**Estados:** ⬜ pendiente · 🔄 probando · ✅ pasó (no re-probar) · ❌ falló · 🔁 cambió a propósito.

## Notas
- **0 bugs.** La calculadora tributaria cuadra al peso en las 4 combinaciones, leyendo
  IVA (19%) y FACTOR_BOLETA (0,8475) desde `tax_rates`. CALC5/CALC6 son ayudantes de
  fila del Presupuesto (módulo ya cerrado 32/36 ✅); sus fórmulas son idénticas al
  monolito. Para ejercerlas en vivo hay que tener el proyecto en preproducción (el grid
  completo con Costo Real y Hora extra); en "solo cotización" no se muestran, igual que
  el toggle "no rodaje" del crew.
