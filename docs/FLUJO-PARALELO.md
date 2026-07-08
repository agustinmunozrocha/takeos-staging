# Cómo trabajar en paralelo sin pisarnos — Agustín y Juan

> Versión en simple. Esto es para **nosotros dos**, los humanos.
> Hay una versión gemela para nuestros Claude Code en
> [`FLUJO-PARALELO-CODE.md`](FLUJO-PARALELO-CODE.md).

## El problema que resolvemos

Estamos cazando bugs de la modularización y avanzamos lento porque los dos vamos
por el mismo lado. Cuando dos personas tocan el mismo código a la vez pasan tres cosas
malas: **(1)** git choca al juntar el trabajo, **(2)** "en mi máquina sí funciona", y
**(3)** arreglamos dos veces el mismo bug sin saberlo. Este documento hace que cada uno
avance por su cuenta, en simultáneo, sin ninguna de esas tres.

## La idea en una imagen: dos carriles de una carretera

Imagina una carretera de dos carriles. Cada uno maneja en **su carril** y nunca chocamos.
La **línea del medio** es la carpeta `lib/` (el código compartido que usan casi todos los
módulos): **cruzar esa línea sin avisar = choque**. Si de verdad necesitas cruzar,
enciendes la direccional (avisas en el bug) y el otro te da paso.

## Quién es dueño de qué

| Carril | Dueño | Rama | Archivos (dentro de `frontend/src/`) |
|---|---|---|---|
| **Finanzas y Datos** | **Juan** | `juan/finanzas` | `modules/presupuesto-cotizacion.js`, `modules/gastos.js`, `modules/calculadoras.js`, `modules/dal.js`, `modules/bd.js`, `modules/bd-excel.js`, `modules/persistencia-local.js` |
| **Producción** | **Agustín** | `agustin/produccion` | `modules/plan-rodaje.js`, `modules/locaciones.js`, `modules/rodajes.js`, `modules/crew.js`, `modules/cargos.js`, `modules/documentos.js`, `modules/info-proyecto.js`, `modules/tareas.js`, `modules/kanban.js` |
| **Compartido (la línea del medio)** | Nadie solo · **Juan arbitra** | — | **Todo `lib/`**, `modules/config.js`, `modules/admin.js`, `modules/notificaciones.js`, `modules/invitaciones.js`, `modules/perfil-onboarding.js`, `modules/buscador.js`, `modules/espacio.js`, `modules/plan-limites.js` |

> Nota: `presupuesto` y `cotización` ya son **un solo archivo**, así que por diseño los ve
> una sola persona (Juan). Las migraciones de base de datos (`supabase/`) tienen su propio
> flujo aparte y no entran aquí.

## Las 3 reglas de oro

1. **Solo toco archivos de mi carril.** Lo de la tabla que dice mi nombre, nada más.
2. **Antes de arreglar algo, miro la lista de bugs** (GitHub Issues). Si ya hay uno abierto
   y es del otro, no lo toco. Así no arreglamos dos veces lo mismo.
3. **Para cruzar a `lib/` o al carril del otro, aviso primero** (comento en el bug). El
   dueño lo hace, o lo hacemos juntos. Nunca en silencio.

## El día a día (copia y pega estos comandos)

Todo esto se corre en la carpeta del proyecto (`~/Software-staging`). Los comandos de
`npm` se corren dentro de `frontend/`.

**1. Al empezar el día — traer lo que hizo el otro:**
```bash
git checkout etapa4-integracion && git pull
git checkout TU-RAMA && git merge etapa4-integracion
```
(`TU-RAMA` es `juan/finanzas` o `agustin/produccion`.)

**2. Elegir un bug de la lista** y asignártelo (ver sección de bugs abajo).

**3. Arreglarlo** — solo en archivos de tu carril. ¿Necesitas tocar `lib/`? Avisa primero.

**4. Antes de dar por bueno el arreglo — probarlo:**
```bash
cd frontend
npm run gate          # revisión automática: tiene que salir en verde
npm run dev           # levanta el software para probarlo a mano
```

**5. Publicar el arreglo ya probado:**
```bash
git commit -m "fix(finanzas): descripción corta (#NUMERO-DEL-BUG)"
git checkout etapa4-integracion && git pull
git merge --no-ff TU-RAMA
git push
```

**6. Cerrar el bug:** comenta "resuelto en <commit>" y ciérralo.

## Los bugs viven en GitHub Issues

Es un tablero en la nube, dentro del mismo GitHub del repo. Lo bueno: **nuestros Claude
Code también lo leen y escriben solos**, y como no es un archivo, nunca choca al juntar.

- **Encontraste un bug?** Créalo **de una**, aunque no lo vayas a arreglar ahora, para que
  el otro lo vea: `New issue` → título claro → etiqueta `finanzas` / `produccion` /
  `compartido` → asígnaselo a quien lo va a arreglar.
- **Vas a arreglar algo?** Primero mira la lista de issues abiertos. Si ya existe y es del
  otro, déjalo. Si es tuyo, asígnatelo para que el otro sepa que está en tus manos.
- **Terminaste?** Comenta en qué commit quedó y cierra el issue.

## ¿Y si un bug de mi carril me obliga a tocar el del otro?

Pasa a veces (los módulos se llaman entre sí por debajo). **No lo edites tú.** Comenta en
el issue algo como "para arreglar esto hay que cambiar `bd.js`, que es de Juan" y:
- lo hace el dueño de ese archivo, o
- se sientan (o comparten pantalla) y lo hacen juntos en una sola pasada.

Esa es la única situación donde nos podemos pisar. Con avisar, se evita.

---
*Documento vivo. Si el reparto cambia, se actualiza aquí y en
[`FLUJO-PARALELO-CODE.md`](FLUJO-PARALELO-CODE.md).*
