// Arnés de «varias organizaciones» con el programa real: la migración desde una versión de antes de varias organizaciones y
// la actualización desde la publicada, el tiempo de cambio entre una organización grande y una chica, eliminar por la
// pantalla con el Rust de verdad y el tiempo de comparar la grande con otra. Solo desarrollo: la app no lo importa. Solo en
// CI de Windows, como la prueba de humo, de la que toma cómo abrir la app y leer su página: abre BoldoAtlas en una ventana,
// siempre una portable con sus datos en una carpeta temporal.
// Uso: node scripts/arnes-organizaciones.mjs <portable .zip de antes de varias organizaciones> <portable .zip publicada>
// La nueva es la de release/*/, de `node scripts/release.mjs --solo-portable --perfil prueba`.
import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  globSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { TAR, artefactos } from "./release.mjs";
import {
  FOTO,
  OTRA_BASE,
  abrirApp,
  cargarImagen,
  comprobar,
  comprobarInstaladaIntacta,
  conPuertoAbierto,
  enCiDeWindows,
  esperar,
  exigirSinFallos,
  fallosHastaAhora,
  pausa,
  revisarBase,
} from "./probar-app.mjs";

const VECES = 10;
const META_MS = 1000;
const FOTOS = 1000;
const PLAZO_MS = 1_200_000;
const TIPO_GERENCIA = "00000000-0000-7000-8000-000000000001";
const UNIDAD = "0190a000-0000-7000-8000-00000000a001";
const PERSONA = "arnes-foto";
const ORG_MIGRADA = "Organización migrada";
const RESPALDO = "boldo-20200101-0000.db";
const CAMBIO = `performance.getEntriesByName("cambio-organizacion")`;
// el <main> de la app, con marco: ID_AREA de usePestanas.ts
const ID_AREA = "area-central";
const COMPARAR = `performance.getEntriesByName("comparar-organizaciones")`;
const VECES_COMPARAR = 3;
const META_COMPARAR_MS = 5000;
// personas de la relacionada con el teléfono cambiado
const CAMBIADAS = 100;
const OTRA_PESTANA = `document.querySelector('[role="tab"][id^="pestana-"][aria-selected="false"]')`;
// la raíz de la grande, de sembrar-grande.mjs
const RAIZ_GRANDE = "Gerencia General";
const RAIZ_CHICA = "Raíz de la chica";

/**
 * Lo que una persona dejó por PC en una versión de antes de varias organizaciones. Elegir la horizontal en el árbol completo
 * guarda la general y la de ese árbol (`vista:completo`, que manda al volver a él): las dos, o la vieja misma no la mostraría.
 */
export const PREFERENCIAS_VIEJAS = {
  "boldo:vista": JSON.stringify({ direccion: "horizontal" }),
  "boldo:vista:completo": JSON.stringify({ direccion: "horizontal" }),
  "boldo:directorio": JSON.stringify({ filtros: { texto: "arnés" } }),
  "boldo:plegado:x": "true",
};
const VISTAS_VIEJAS = ["boldo:vista", "boldo:vista:completo"];
/** La de la publicada: la general vertical y la de la organización horizontal y compacta. */
export const VISTA_GENERAL = JSON.stringify({ direccion: "vertical" });
export const VISTA_DE_LA_ORGANIZACION = { direccion: "horizontal", densidad: "compacta" };

/** @param {Record<string, string>} ahora @param {string} k */
function leerJson(ahora, k) {
  try {
    return JSON.parse(ahora[k] ?? "null");
  } catch {
    return null;
  }
}

/** El «Abierto recientemente» de antes: la nueva lo borra al arrancar. @param {Record<string, string>} ahora */
const recientesQueQuedan = (ahora) => Object.keys(ahora).filter((k) => k.startsWith("boldo:recientes:"));

/**
 * Qué no quedó como debe tras abrir la nueva sobre una de antes de varias organizaciones. `ahora` es todo el localStorage;
 * `viejas`, las claves de PREFERENCIAS_VIEJAS como las dejó la vieja al cerrarse (las vistas, ya completas); `pestanas`,
 * los ids de las que guardó.
 * @param {Record<string, string>} ahora
 * @param {{ id: string, dirDatos: string, rutaBd: string, pestanas: string[], viejas: Record<string, string> }} base
 */
export function problemasDeMigracion(ahora, { id, dirDatos, rutaBd, pestanas, viejas }) {
  /** @type {string[]} */
  const mal = [];
  for (const k of Object.keys(PREFERENCIAS_VIEJAS))
    if (ahora[k] !== viejas[k]) mal.push(`${k} cambió: ${viejas[k]} -> ${ahora[k]}`);
  for (const k of VISTAS_VIEJAS) {
    if (leerJson(viejas, k)?.direccion !== "horizontal")
      mal.push(`la vieja no dejó ${k} en horizontal: ${viejas[k]}`);
    // la app la reescribe completa al leerla: basta con que lleve lo sembrado; si la leyó antes de migrar, es la de fábrica
    const suya = `${k}:${id}`;
    if (leerJson(ahora, suya)?.direccion !== "horizontal")
      mal.push(`${suya} no es la sembrada: ${ahora[suya]}`);
  }
  const directorio = `boldo:directorio:${id}`;
  if (ahora[directorio] !== viejas["boldo:directorio"])
    mal.push(`${directorio} no se copió: ${ahora[directorio]}`);
  if (`boldo:plegado:x:${id}` in ahora) mal.push("boldo:plegado:x se copió, y es por PC");
  if (!(`boldo:pestanas:${rutaBd}` in ahora)) mal.push(`la clave vieja boldo:pestanas:${rutaBd} se borró`);
  const clave = `boldo:pestanas:${dirDatos}`;
  const lista = leerJson(ahora, clave)?.lista;
  const cuales = Array.isArray(lista) ? lista.map((p) => `${p?.id}:${p?.org}`).join() : "";
  if (pestanas.length !== 2 || cuales !== pestanas.map((p) => `${p}:${id}`).join())
    mal.push(`${clave} debía tener las dos de la vieja (${pestanas.join()}), con org: ${ahora[clave]}`);
  const recientes = recientesQueQuedan(ahora);
  if (recientes.length) mal.push(`quedan los recientes de antes: ${recientes.join()}`);
  return mal;
}

/**
 * Qué no quedó como debe tras abrir la nueva sobre la publicada, que ya tiene preferencias por organización.
 * @param {Record<string, string>} ahora @param {{ id: string }} base
 */
export function problemasDeActualizacion(ahora, { id }) {
  /** @type {string[]} */
  const mal = [];
  const recientes = recientesQueQuedan(ahora);
  if (recientes.length) mal.push(`quedan los recientes de antes: ${recientes.join()}`);
  const vista = leerJson(ahora, `boldo:vista:${id}`);
  if (
    vista?.direccion !== VISTA_DE_LA_ORGANIZACION.direccion ||
    vista?.densidad !== VISTA_DE_LA_ORGANIZACION.densidad
  )
    mal.push(`boldo:vista:${id} cambió: ${ahora[`boldo:vista:${id}`]}`);
  if (ahora["boldo:vista"] !== VISTA_GENERAL) mal.push(`boldo:vista cambió: ${ahora["boldo:vista"]}`);
  return mal;
}

/** @param {number[]} xs */
export function mediana(xs) {
  const o = [...xs].sort((a, b) => a - b);
  const m = o.length >> 1;
  return o.length % 2 ? o[m] : (o[m - 1] + o[m]) / 2;
}

/** @param {string} bd @param {(c: import("node:sqlite").DatabaseSync) => any} f @param {boolean} [soloLectura] */
async function enBase(bd, f, soloLectura = false) {
  const { DatabaseSync } = await import("node:sqlite");
  const c = new DatabaseSync(bd, { readOnly: soloLectura });
  try {
    return f(c);
  } finally {
    c.close();
  }
}

/**
 * Una base como las de la app, con su id, su nombre y, si se pide, una raíz.
 * @param {string} bd @param {string} id @param {string} nombre @param {string} [raiz]
 */
async function crearBase(bd, id, nombre, raiz) {
  mkdirSync(dirname(bd), { recursive: true });
  const carpeta = join("src-tauri", "migrations");
  const migraciones = readdirSync(carpeta).sort();
  await enBase(bd, (c) => {
    for (const m of migraciones) c.exec(readFileSync(join(carpeta, m), "utf8"));
    c.exec(`PRAGMA user_version = ${migraciones.length}`);
    ponerMeta(c, id, nombre);
    const ahora = new Date().toISOString();
    if (raiz)
      c.prepare(
        "INSERT INTO unidades (id, tipo_id, nombre, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
      ).run(randomUUID(), TIPO_GERENCIA, raiz, ahora, ahora);
  });
}

/** @param {import("node:sqlite").DatabaseSync} c @param {string} id @param {string} [nombre] */
function ponerMeta(c, id, nombre) {
  const poner = c.prepare("INSERT OR REPLACE INTO meta (clave, valor) VALUES (?, ?)");
  poner.run("db_id", id);
  if (nombre) poner.run("org_nombre", nombre);
}

/** Nombre y sha256 de cada archivo. @param {string} carpeta */
const huellas = (carpeta) =>
  Object.fromEntries(
    readdirSync(carpeta).map((n) => [
      n,
      createHash("sha256")
        .update(readFileSync(join(carpeta, n)))
        .digest("hex"),
    ]),
  );

/** @param {string} datos */
const leerLista = (datos) => JSON.parse(readFileSync(join(datos, "organizaciones.json"), "utf8"));

/** La portable en una carpeta temporal nueva, con el puerto de depuración abierto. @param {string} zip @param {string} para */
function extraer(zip, para) {
  const carpeta = mkdtempSync(join(process.env.RUNNER_TEMP ?? "", `boldo-${para}-`));
  execFileSync(TAR, ["-x", "-f", zip, "-C", carpeta], { timeout: 120_000 });
  const exe = join(carpeta, artefactos("windows", "").programa.nombre);
  writeFileSync(exe, conPuertoAbierto(readFileSync(exe)));
  return { carpeta, exe, datos: join(carpeta, "datos") };
}

/** @typedef {Awaited<ReturnType<typeof abrirApp>>} App */
/** @typedef {{ carpeta: string, exe: string, datos: string }} Portable */

/** La URL de la foto como la arma la app. @param {App} app @param {string} baseId @param {string} persona */
const urlFoto = (app, baseId, persona) =>
  app.evaluar(
    `window.__TAURI_INTERNALS__.convertFileSrc(${JSON.stringify(baseId)}, "foto") + "/${persona}?v=arnes"`,
  );

/** @param {App} app */
async function recargar(app) {
  await app.evaluar(`window.__antes = true; void setTimeout(() => location.reload(), 0)`);
  await app.hasta(`!window.__antes && Boolean(window.__TAURI_INTERNALS__)`, "que la página recargue");
}

/** @param {App} app @param {string} que */
const verInicio = (app, que) => app.hasta(`Boolean(document.getElementById("inicio-organizacion"))`, que);

/**
 * Nombre, una raíz y una persona con foto en la base abierta, por su página, y las preferencias dadas. Recarga, para que la
 * app tenga en memoria lo mismo que quedó guardado: así no lo vuelve a escribir al cerrarse.
 * @param {App} app @param {string} baseId @param {Record<string, string>} preferencias
 */
async function sembrar(app, baseId, preferencias) {
  const ahora = new Date().toISOString();
  const lote = await app.llamar("db_lote", {
    baseId,
    versionApp: "arnes",
    sentencias: [
      { sql: "INSERT OR REPLACE INTO meta (clave, valor) VALUES ('org_nombre', ?1)", params: [ORG_MIGRADA] },
      {
        sql: "INSERT INTO unidades (id, tipo_id, nombre, created_at, updated_at) VALUES (?1, ?2, 'Raíz del arnés', ?3, ?3)",
        params: [UNIDAD, TIPO_GERENCIA, ahora],
      },
      {
        sql: "INSERT INTO trabajadores (id, nombre, foto_png, created_at, updated_at) VALUES (?1, 'Persona del arnés', ?2, ?3, ?3)",
        params: [PERSONA, FOTO, ahora],
      },
    ],
  });
  if (!lote.ok) throw new Error(`No se pudo sembrar la versión vieja: ${JSON.stringify(lote.error)}`);
  await app.evaluar(
    `for (const [k, v] of Object.entries(${JSON.stringify(preferencias)})) localStorage.setItem(k, v)`,
  );
  await recargar(app);
  // Una publicada con varias organizaciones no lista un boldo.db que abrió vacío hasta volver a abrirlo: tras cargar su
  // lista muestra Bienvenida sin él. Basta con que haya cargado; la nueva lo abre otra vez y ahí sí lo lista.
  await app.hasta(
    `Boolean(document.getElementById("inicio-organizacion") || document.getElementById("bienvenida-camino-vacia"))`,
    "Inicio (o Bienvenida) cargado con los datos sembrados",
  );
}

/**
 * Cierra la vieja, deja un respaldo, pone el exe nuevo encima y lo abre: lo que debe seguir igual. Devuelve la nueva en
 * Inicio y su localStorage, leído antes de ir a otra vista (que cambia la ruta de una pestaña).
 * @param {App} vieja @param {Portable} portable @param {{ baseId: string, rutaBd: string }} antes @param {string} exeNuevo
 * @param {string} que
 */
async function abrirLaNueva(vieja, { carpeta, exe, datos }, antes, exeNuevo, que) {
  comprobar(`${que}: la vieja cierra con código 0`, (await vieja.cerrar()) === 0);
  const respaldos = join(datos, "respaldos");
  mkdirSync(respaldos, { recursive: true });
  copyFileSync(join(datos, "boldo.db"), join(respaldos, RESPALDO));
  const respaldosAntes = huellas(respaldos);
  copyFileSync(exeNuevo, exe);

  const app = await abrirApp(exe);
  const despues = await revisarBase(app, carpeta);
  comprobar(
    `${que}: abre el mismo boldo.db, con su db_id`,
    despues.rutaBd === antes.rutaBd && despues.baseId === antes.baseId,
    { antes, despues },
  );
  const filas = await app.llamar("db_consultar", {
    baseId: despues.baseId,
    sql: `SELECT (SELECT valor FROM meta WHERE clave = 'org_nombre') AS nombre,
      (SELECT count(*) FROM unidades WHERE id = ?1) AS unidades,
      (SELECT count(*) FROM trabajadores WHERE id = ?2 AND foto_png = ?3) AS personas`,
    params: [UNIDAD, PERSONA, FOTO],
  });
  const f = filas.valor?.[0];
  comprobar(
    `${que}: boldo.db conserva sus filas`,
    f?.nombre === ORG_MIGRADA && f.unidades === 1 && f.personas === 1,
    filas,
  );
  const respaldosDespues = huellas(respaldos);
  comprobar(
    `${que}: respaldos/ intacto`,
    Object.entries(respaldosAntes).every(([n, h]) => respaldosDespues[n] === h),
    { respaldosAntes, respaldosDespues },
  );
  const lista = leerLista(datos);
  comprobar(
    `${que}: una entrada en la lista, la de boldo.db`,
    lista.organizaciones?.length === 1 &&
      lista.organizaciones[0].ruta === "boldo.db" &&
      lista.organizaciones[0].id === despues.baseId,
    lista,
  );
  await verInicio(app, `Inicio de la nueva (${que})`);
  /** @type {Record<string, string>} */
  const almacen = await app.evaluar(`Object.fromEntries(Object.entries(localStorage))`);
  return { app, despues, almacen };
}

const EN_HORIZONTAL = `Boolean(document.querySelector(".vue-flow__node .vue-flow__handle-right")) && !document.querySelector(".vue-flow__node .vue-flow__handle-bottom")`;
// si falla, de dónde salió la vista: las claves guardadas
const VISTAS_GUARDADAS = `Object.fromEntries(Object.entries(localStorage).filter(([k]) => k.startsWith("boldo:vista")))`;

/**
 * Una rama sin guardar y el árbol se ven en horizontal (la vista sembrada), y la foto responde con su base y no con otra.
 * Cierra la app.
 * @param {App} app @param {string} baseId @param {string} que
 */
async function verArbolYFoto(app, baseId, que) {
  // Antes que el árbol completo, que cambia la general: una rama sin guardar usa la que se leyó al arrancar. Si main.ts
  // soltara los datos antes de migrar las preferencias, sería la de fábrica (vertical).
  await app.evaluar(`location.hash = "#/?raiz=${UNIDAD}"`);
  await app.hasta(`Boolean(document.querySelector(".vue-flow__node"))`, "la rama sin guardar");
  comprobar(
    `${que}: una rama sin guardar se ve con la general sembrada (horizontal)`,
    await app.evaluar(EN_HORIZONTAL),
    await app.evaluar(VISTAS_GUARDADAS),
  );
  await app.evaluar(`location.hash = "#/"`);
  await app.hasta(
    `location.hash === "#/" && Boolean(document.querySelector(".vue-flow__node"))`,
    "el árbol con la raíz del arnés",
  );
  comprobar(
    `${que}: el árbol se ve con la vista sembrada (horizontal)`,
    await app.evaluar(EN_HORIZONTAL),
    await app.evaluar(VISTAS_GUARDADAS),
  );
  const url = await urlFoto(app, baseId, PERSONA);
  const conSuBase = await app.evaluar(cargarImagen(url));
  comprobar(`${que}: la foto responde con su base`, conSuBase?.ancho > 0, { url, conSuBase });
  const conOtra = await app.evaluar(cargarImagen(url.replace(baseId, OTRA_BASE)));
  comprobar(`${que}: con otra base, la foto no responde`, conOtra === null, conOtra);
  comprobar(`${que}: la nueva cierra con código 0`, (await app.cerrar()) === 0);
}

/**
 * Desde una versión de antes de varias organizaciones: lo que dejó por PC pasa a la organización, de verdad (sin tocar el
 * localStorage más que como lo haría una persona).
 * @param {string} zip @param {string} exeNuevo ya con el puerto abierto
 */
async function desdeAntesDeOrganizaciones(zip, exeNuevo) {
  const previos = fallosHastaAhora();
  const portable = extraer(zip, "migracion");
  const vieja = await abrirApp(portable.exe);
  const antes = await revisarBase(vieja, portable.carpeta);
  await sembrar(vieja, antes.baseId, {});
  // Dos pestañas, como las deja una persona: el árbol y el directorio. La barra aparece con la segunda; Ctrl+T la abre.
  await vieja.evaluar(`location.hash = "#/"`);
  await vieja.hasta(`Boolean(document.querySelector(".vue-flow__node"))`, "el árbol de la vieja");
  await vieja.evaluar(`window.dispatchEvent(new KeyboardEvent("keydown", { key: "t", ctrlKey: true }))`);
  await vieja.hasta(
    `document.querySelectorAll('[role="tab"][id^="pestana-"]').length === 2`,
    "la segunda pestaña de la vieja",
  );
  await vieja.evaluar(`location.hash = "#/directorio"`);
  await vieja.hasta(`location.hash === "#/directorio"`, "el directorio en la segunda pestaña");
  await pausa(500);
  await vieja.evaluar(`${OTRA_PESTANA}.click()`);
  await vieja.hasta(`location.hash === "#/"`, "de vuelta al árbol en la primera");
  // Las preferencias, y se recarga para que la vieja las tenga en memoria: con la de fábrica, al volver a una pestaña
  // reescribe `vista` y `vista:completo` (VistaArbol.vue de alpha.38). Que la vieja misma muestre el árbol en horizontal
  // prueba que el estado es uno que una persona puede dejar.
  const claveRecientes = `boldo:recientes:${antes.rutaBd}`;
  await vieja.evaluar(
    `for (const [k, v] of Object.entries(${JSON.stringify({ ...PREFERENCIAS_VIEJAS, [claveRecientes]: "[]" })})) localStorage.setItem(k, v)`,
  );
  await recargar(vieja);
  await verInicio(vieja, "Inicio de la vieja tras recargar");
  await vieja.evaluar(`location.hash = "#/"`);
  await vieja.hasta(
    `Boolean(document.querySelector(".vue-flow__node .vue-flow__handle-right"))`,
    "el árbol de la vieja en horizontal",
  );
  /** @type {string[]} */
  const pestanas = await vieja.evaluar(
    `JSON.parse(localStorage.getItem(${JSON.stringify(`boldo:pestanas:${antes.rutaBd}`)}))?.lista?.map((p) => p.id) ?? []`,
  );
  /** @type {Record<string, string>} */
  const viejas = await vieja.evaluar(
    `Object.fromEntries(${JSON.stringify(Object.keys(PREFERENCIAS_VIEJAS))}.map((k) => [k, localStorage.getItem(k)]))`,
  );
  const { app, despues, almacen } = await abrirLaNueva(vieja, portable, antes, exeNuevo, "migración");
  const mal = problemasDeMigracion(almacen, {
    id: despues.baseId,
    dirDatos: despues.dirDatos,
    rutaBd: antes.rutaBd,
    pestanas,
    viejas,
  });
  comprobar(
    "migración: cada preferencia en …:<db_id>, la vieja igual, plegado sin copia, sus dos pestañas con org, sin recientes",
    !mal.length,
    mal,
  );
  await verArbolYFoto(app, despues.baseId, "migración");
  console.log(
    `migración desde antes de varias organizaciones: ${fallosHastaAhora() === previos ? "ok" : "FALLA"}`,
  );
}

/**
 * Desde la publicada, que ya tiene varias organizaciones: lo suyo no se toca y los recientes de antes se van.
 * @param {string} zip @param {string} exeNuevo ya con el puerto abierto
 */
async function desdeLaPublicada(zip, exeNuevo) {
  const previos = fallosHastaAhora();
  const portable = extraer(zip, "actualizacion");
  const vieja = await abrirApp(portable.exe);
  const antes = await revisarBase(vieja, portable.carpeta);
  const claveRecientes = `boldo:recientes:${antes.rutaBd}`;
  await sembrar(vieja, antes.baseId, {
    "boldo:vista": VISTA_GENERAL,
    [`boldo:vista:${antes.baseId}`]: JSON.stringify(VISTA_DE_LA_ORGANIZACION),
    [claveRecientes]: "[]",
  });
  // Desde la 0.1.0 la publicada ya borra los recientes al abrir: el borrado de la nueva lo prueba la migración desde
  // alpha.38, y aquí solo se comprueba que no vuelvan.
  if ((await vieja.evaluar(`localStorage.getItem(${JSON.stringify(claveRecientes)})`)) === null)
    console.log(
      "nota  actualización: la publicada ya borra los recientes; su borrado lo prueba la migración",
    );
  const { app, despues, almacen } = await abrirLaNueva(vieja, portable, antes, exeNuevo, "actualización");
  const mal = problemasDeActualizacion(almacen, { id: despues.baseId });
  comprobar(
    "actualización: sin recientes, y la vista de la organización y la general sin cambios",
    !mal.length,
    mal,
  );
  await verArbolYFoto(app, despues.baseId, "actualización");
  console.log(`actualización desde la publicada: ${fallosHastaAhora() === previos ? "ok" : "FALLA"}`);
}

/**
 * Elimina `o` por Configuración, como una persona: escribe el nombre que muestra el diálogo y confirma. Las casillas se
 * eligen por su etiqueta: la de borrar el archivo lleva el nombre del archivo.
 * @param {App} app @param {{ id: string, nombre: string, ruta?: string }} o
 * @param {{ borrarArchivo?: boolean, copia?: boolean }} [opciones]
 */
async function eliminarPorPantalla(app, o, { borrarArchivo = false, copia = true } = {}) {
  const boton = JSON.stringify(`org-eliminar-${o.id}`);
  await app.evaluar(`location.hash = "#/configuracion"`);
  await app.hasta(
    `document.getElementById(${boton})?.disabled === false`,
    `«Eliminar» habilitado para «${o.nombre}» en Configuración`,
  );
  await app.evaluar(`document.getElementById(${boton}).click()`);
  await app.hasta(`Boolean(document.getElementById("eliminar-org-escrito"))`, "el diálogo de eliminar");
  /** @type {string} */
  const pedido = await app.evaluar(`(async () => {
    const dialogo = document.querySelector('[role="alertdialog"]');
    const archivo = ${JSON.stringify(o.ruta ? basename(o.ruta) : null)};
    const casilla = (deArchivo) => [...dialogo.querySelectorAll("label")]
      .filter((l) => l.querySelector('input[type="checkbox"]'))
      .find((l) => Boolean(archivo && l.innerText.includes(archivo)) === deArchivo)
      ?.querySelector('input[type="checkbox"]');
    const respirar = () => new Promise((r) => setTimeout(r, 100));
    if (${borrarArchivo}) casilla(true).click();
    await respirar();
    const deCopia = casilla(false);
    if (deCopia && deCopia.checked !== ${copia}) deCopia.click();
    const campo = document.getElementById("eliminar-org-escrito");
    const nombre = dialogo.querySelector('label[for="eliminar-org-escrito"] strong').innerText;
    campo.value = nombre;
    campo.dispatchEvent(new Event("input", { bubbles: true }));
    await respirar();
    const confirmar = dialogo.querySelector("button[aria-busy]");
    if (confirmar.disabled) throw new Error("«Eliminar» sigue deshabilitado tras escribir «" + nombre + "»");
    confirmar.click();
    return nombre;
  })()`);
  comprobar(`eliminar: el diálogo pide escribir «${o.nombre}»`, pedido === o.nombre, pedido);
}

/** @param {App} app */
const baseAbierta = async (app) => (await app.llamar("info_app")).valor?.baseId;

/** @param {App} app @param {string} texto */
const conNodo = (app, texto) =>
  app.hasta(
    `[...document.querySelectorAll(".vue-flow__node")].some((n) => n.innerText.includes(${JSON.stringify(texto)}))`,
    `el árbol con «${texto}»`,
  );

/**
 * Activa la otra pestaña y espera el cambio número `n` y la raíz de `destino` dibujada (dos cuadros después de verla en el
 * DOM). Devuelve lo que midió la app y lo que pasó desde el clic.
 * @param {App} app @param {number} n @param {string} raiz
 */
const cambiarA = (app, n, raiz) =>
  app.evaluar(`(async () => {
    const t0 = performance.now();
    ${OTRA_PESTANA}.click();
    const visto = () => ${CAMBIO}.length === ${n} &&
      [...document.querySelectorAll(".vue-flow__node")].some((x) => x.innerText.includes(${JSON.stringify(raiz)}));
    await new Promise((ok, mal) => {
      const paso = () => visto() ? ok() : performance.now() - t0 > 30000
        ? mal(new Error(${JSON.stringify(`no se vio «${raiz}» ni el cambio ${n} en 30 s`)})) : requestAnimationFrame(paso);
      paso();
    });
    await new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok)));
    return { app: Math.round(${CAMBIO}.at(-1).duration), pantalla: Math.round(performance.now() - t0) };
  })()`);

/** @param {string} sentido @param {{ app: number, pantalla: number }[]} ms */
function informar(sentido, ms) {
  const app = mediana(ms.map((x) => x.app));
  const pantalla = mediana(ms.map((x) => x.pantalla));
  console.log(
    `cambio ${sentido}: ${app} ms según la app, ${pantalla} ms hasta verla dibujada ` +
      `(${ms.length} cambios, app/pantalla: ${ms.map((x) => `${x.app}/${x.pantalla}`).join(", ")} ms)`,
  );
  return { app, pantalla };
}

/** @param {string} ruta @param {boolean} existe @param {string} que */
const verArchivo = (ruta, existe, que) => comprobar(que, existsSync(ruta) === existe, ruta);

/**
 * La grande de sembrar-grande.mjs (10.000 personas y 1.000 fotos) en `bd`, que no debe existir, con el id dado (y el
 * nombre, si se da). Devuelve su nombre.
 * @param {string} bd @param {string} id @param {string} [nombre]
 */
async function sembrarGrande(bd, id, nombre) {
  execFileSync(process.execPath, [join("scripts", "sembrar-grande.mjs"), bd, "--fotos", String(FOTOS)], {
    stdio: "inherit",
    timeout: 300_000,
  });
  return enBase(bd, (c) => {
    ponerMeta(c, id, nombre);
    return String(c.prepare("SELECT valor FROM meta WHERE clave = 'org_nombre'").get()?.valor);
  });
}

/** Una entrada de organizaciones.json. @param {{ id: string, nombre: string }} o @param {string} ruta @param {boolean} externa @param {string} color @param {string} abierta */
const entrada = (o, ruta, externa, color, abierta) => ({
  id: o.id,
  nombre: o.nombre,
  ruta,
  externa,
  color,
  abierta,
});

/**
 * Una grande (10.000 personas y 1.000 fotos) en `boldo.db`, una chica interna y dos externas: alterna entre la grande y la
 * chica y después las elimina todas por la pantalla, `boldo.db` al final.
 * @param {Portable} portable
 */
async function medicionYEliminar({ carpeta, exe, datos }) {
  const bd = join(datos, "boldo.db");
  const grande = { id: randomUUID(), nombre: "" };
  grande.nombre = await sembrarGrande(bd, grande.id);
  const chica = { id: randomUUID(), nombre: "Chica del arnés" };
  const chicaRuta = `organizaciones/${chica.id}/organizacion.db`;
  const externas = join(carpeta, "externas");
  const queda = { id: randomUUID(), nombre: "Externa que se queda", ruta: join(externas, "queda.db") };
  const seBorra = { id: randomUUID(), nombre: "Externa que se borra", ruta: join(externas, "se-borra.db") };
  await crearBase(join(datos, chicaRuta), chica.id, chica.nombre, RAIZ_CHICA);
  for (const e of [queda, seBorra]) await crearBase(e.ruta, e.id, e.nombre, `Raíz de ${e.nombre}`);
  writeFileSync(
    join(datos, "organizaciones.json"),
    JSON.stringify({
      version: 1,
      organizaciones: [
        entrada(grande, "boldo.db", false, "#3b6fb5", "2026-01-04T00:00:00.000Z"), // la última abierta: abre esta
        entrada(chica, chicaRuta, false, "#2f855a", "2026-01-03T00:00:00.000Z"),
        entrada(queda, queda.ruta, true, "#b7791f", "2026-01-02T00:00:00.000Z"),
        entrada(seBorra, seBorra.ruta, true, "#c05621", "2026-01-01T00:00:00.000Z"),
      ],
    }),
  );
  const respaldos = join(datos, "respaldos");
  mkdirSync(respaldos, { recursive: true });
  copyFileSync(join(datos, chicaRuta), join(respaldos, RESPALDO)); // un respaldo de boldo.db, por su nombre
  writeFileSync(join(respaldos, "notas.txt"), "del usuario: eliminar boldo.db no lo borra");

  // La primera apertura respalda la grande; con «nunca» no frena el cambio (como trabajo en curso). Se fija y se reabre.
  let app = await abrirApp(exe);
  let info = await revisarBase(app, carpeta);
  comprobar("medición: abre boldo.db, la grande", info.baseId === grande.id, info);
  await app.evaluar(`localStorage.setItem("boldo:respaldos", JSON.stringify("nunca"))`);
  await app.cerrar();
  app = await abrirApp(exe);
  info = await revisarBase(app, carpeta);

  const conFoto = await app.llamar("db_consultar", {
    baseId: info.baseId,
    sql: "SELECT id FROM trabajadores WHERE foto_png IS NOT NULL LIMIT 1",
    params: [],
  });
  const foto = await app.evaluar(cargarImagen(await urlFoto(app, info.baseId, conFoto.valor?.[0]?.id)));
  comprobar("medición: las fotos sembradas son válidas para la app (256 px)", foto?.ancho === 256, foto);

  // Una pestaña de cada una: la chica desde Inicio, y de vuelta a la grande, que queda en el árbol.
  await app.evaluar(`location.hash = "#/bienvenida"`);
  const entradaChica = JSON.stringify(`inicio-org-${chica.id}`);
  await app.hasta(`Boolean(document.getElementById(${entradaChica}))`, "la chica en Inicio");
  await app.evaluar(`document.getElementById(${entradaChica}).click()`);
  await app.hasta(`${CAMBIO}.length === 1`, "el cambio a la chica");
  await conNodo(app, RAIZ_CHICA);
  await cambiarA(app, 2, RAIZ_GRANDE);
  comprobar("medición: la grande vuelve a su árbol", (await app.evaluar(`location.hash`)) === "#/");
  await app.evaluar(`performance.clearMeasures("cambio-organizacion")`);
  /** @type {{ app: number, pantalla: number }[]} */
  const aLaChica = [];
  /** @type {{ app: number, pantalla: number }[]} */
  const aLaGrande = [];
  /** @type {string[]} */
  const noLlegaron = [];
  for (let i = 1; i <= VECES; i++) {
    const destino = i % 2 ? chica : grande;
    const ms = await cambiarA(app, i, destino === chica ? RAIZ_CHICA : RAIZ_GRANDE);
    (destino === chica ? aLaChica : aLaGrande).push(ms);
    // Rust también: la medida de la app se anota aunque la carga falle
    const abierta = await baseAbierta(app);
    if (abierta !== destino.id) noLlegaron.push(`cambio ${i}: abierta ${abierta}, pedida ${destino.id}`);
    await pausa(500); // lo que sigue al cambio, como leer la lista: no es parte de él
  }
  comprobar(
    `medición: los ${VECES} cambios llegaron a su organización (info_app y su árbol dibujado)`,
    !noLlegaron.length,
    noLlegaron,
  );
  const grandeMs = informar("a la grande", aLaGrande);
  informar("a la chica", aLaChica);
  comprobar(
    `medición: ir a la grande tarda menos de ${META_MS} ms (mediana, según la app y hasta verla)`,
    grandeMs.app < META_MS && grandeMs.pantalla < META_MS,
    grandeMs,
  );

  const previos = fallosHastaAhora();
  const lista = () => leerLista(datos).organizaciones.map((/** @type {{ id: string }} */ e) => e.id);
  /** @param {{ id: string }} o */
  const fuera = (o) => esperar(async () => !lista().includes(o.id), `que ${o.id} salga de la lista`);
  const eliminadas = join(datos, "organizaciones-eliminadas");
  const copias = () => (existsSync(eliminadas) ? readdirSync(eliminadas) : []);

  await eliminarPorPantalla(app, chica);
  await fuera(chica);
  verArchivo(join(datos, "organizaciones", chica.id), false, "eliminar: la interna se va con su carpeta");
  comprobar("eliminar: de la interna queda una copia", copias().length === 1, copias());

  await eliminarPorPantalla(app, queda);
  await fuera(queda);
  verArchivo(queda.ruta, true, "eliminar: la externa sin borrar el archivo solo sale de la lista");

  // Abierta, con su .bloqueo, -wal y -shm al lado: eliminarla pasa antes a la grande y se lleva todo eso.
  await app.evaluar(`location.hash = "#/bienvenida"`);
  const entradaSeBorra = JSON.stringify(`inicio-org-${seBorra.id}`);
  await app.hasta(`Boolean(document.getElementById(${entradaSeBorra}))`, "la externa que se borra en Inicio");
  await app.evaluar(`document.getElementById(${entradaSeBorra}).click()`);
  await esperar(async () => (await baseAbierta(app)) === seBorra.id, "que abra la externa que se borra");
  await conNodo(app, `Raíz de ${seBorra.nombre}`);
  const junto = ["", ".bloqueo", "-wal", "-shm"].map((s) => basename(seBorra.ruta) + s);
  comprobar(
    "eliminar: la externa abierta tiene su .bloqueo, -wal y -shm",
    junto.every((n) => existsSync(join(externas, n))),
    readdirSync(externas),
  );
  await eliminarPorPantalla(app, seBorra, { borrarArchivo: true, copia: false });
  await fuera(seBorra);
  await esperar(async () => (await baseAbierta(app)) === grande.id, "que la app pase a la grande");
  comprobar(
    "eliminar: la externa abierta con «borrar el archivo» se lleva el archivo y lo de al lado; queda solo la otra",
    readdirSync(externas).join() === basename(queda.ruta),
    readdirSync(externas),
  );
  comprobar("eliminar: sin copia no queda otra", copias().length === 1, copias());

  // boldo.db, la abierta y la última: se borra y queda uno vacío, sin listar
  await eliminarPorPantalla(app, grande);
  await esperar(async () => (await baseAbierta(app)) !== grande.id, "que la app pase al boldo.db nuevo");
  const vacia = await revisarBase(app, carpeta);
  const personas = await app.llamar("db_consultar", {
    baseId: vacia.baseId,
    sql: "SELECT count(*) AS n FROM trabajadores",
    params: [],
  });
  comprobar("eliminar: el boldo.db nuevo no tiene personas", personas.valor?.[0]?.n === 0, personas);
  comprobar("eliminar: el boldo.db nuevo tiene otro id y no está en la lista", !lista().length, {
    vacia,
    lista: lista(),
  });
  verArchivo(join(respaldos, RESPALDO), false, "eliminar: los respaldos de boldo.db se borran");
  verArchivo(join(respaldos, "notas.txt"), true, "eliminar: lo ajeno en respaldos/ se queda");
  /** @type {string[]} */
  const ids = [];
  for (const c of copias())
    ids.push(
      await enBase(
        join(eliminadas, c),
        (b) => String(b.prepare("SELECT valor FROM meta WHERE clave = 'db_id'").get()?.valor),
        true,
      ),
    );
  comprobar(
    "eliminar: las copias son la interna y boldo.db, cada una con su db_id",
    ids.sort().join() === [chica.id, grande.id].sort().join(),
    { copias: copias(), ids },
  );
  verArchivo(queda.ruta, true, "eliminar: la externa que salió de la lista sigue intacta");
  comprobar("eliminar: la app cierra con código 0", (await app.cerrar()) === 0);
  console.log(`eliminar: ${fallosHastaAhora() === previos ? "ok" : "FALLA"}`);
}

/**
 * Por la paleta, como una persona: desde Acerca, Ctrl+K, escribe el nombre y elige «Comparar con «nombre»». Espera la
 * comparación número `n` y su resumen dibujado. Devuelve lo que midió la app y si la vista avisó coincidencia aproximada.
 * La paleta en español: la etiqueta se busca por su texto.
 * @param {App} app @param {{ nombre: string }} o @param {number} n
 */
async function compararPorPaleta(app, o, n) {
  // Acerca: liviana y con marco (Inicio es `sinMarco`: ahí no hay paleta ni atajos). Salir de la vista suelta la
  // comparación anterior. Sin un diálogo abierto, que se quedaría con el teclado.
  await app.evaluar(`location.hash = "#/acerca"`);
  await app.hasta(
    `location.hash === "#/acerca" && Boolean(document.querySelector('#${ID_AREA} img[alt="BoldoAtlas"]')) &&
      !document.querySelector('[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]')`,
    `Acerca, sin diálogos, antes de la comparación ${n}`,
  );
  const etiqueta = `Comparar con «${o.nombre}»`;
  await app.evaluar(`window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true }))`);
  const campo = `document.querySelector('[role="dialog"] input')`;
  await app.hasta(`Boolean(${campo})`, "la paleta abierta");
  await app.evaluar(
    `(() => { const c = ${campo}; c.value = ${JSON.stringify(o.nombre)}; c.dispatchEvent(new Event("input", { bubbles: true })); })()`,
  );
  const opcion = `[...document.querySelectorAll('[role="dialog"] [role="option"]')].find((x) => x.innerText.trim() === ${JSON.stringify(etiqueta)})`;
  await app.hasta(`Boolean(${opcion})`, `«${etiqueta}» en la paleta`);
  await app.evaluar(`${opcion}.click()`);
  /** @type {{ ms: number, aproximada: boolean } | { error: string }} */
  const r = await esperar(
    () =>
      app.evaluar(`(() => {
        if (!location.hash.startsWith("#/comparar")) return null;
        const aviso = document.querySelector('section > [role="alert"]');
        if (aviso) return { error: aviso.innerText };
        const hechas = ${COMPARAR};
        if (hechas.length < ${n}) return null;
        // el resumen se dibuja tras la medida: dos cuadros
        return new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(() => ok({
          ms: Math.round(hechas.at(-1).duration),
          aproximada: document.body.innerText.includes("Coincidencia aproximada"),
        }))));
      })()`),
    `la comparación ${n}, con «${o.nombre}»`,
    120_000,
  );
  if ("error" in r) throw new Error(`La comparación con «${o.nombre}» falló: ${r.error}`);
  return r;
}

/**
 * La grande de nuevo en `boldo.db`, con dos internas: `relacionada`, su copia con otro id que viene de ella y 100 teléfonos
 * cambiados (se compara por id), y `aparte`, otra sembrada con otros ids (se empareja por nombre y correo). Compara la grande
 * 3 veces con cada una por la paleta y lee lo que midió la app. Pasar de 5000 ms no falla: se pregunta al autor.
 * @param {Portable} portable
 */
async function medirComparacion({ carpeta, exe, datos }) {
  const previos = fallosHastaAhora();
  const grande = { id: randomUUID(), nombre: "" };
  const bd = join(datos, "boldo.db");
  grande.nombre = await sembrarGrande(bd, grande.id);
  const relacionada = { id: randomUUID(), nombre: "Relacionada del arnés" };
  const aparte = { id: randomUUID(), nombre: "Aparte del arnés" };
  /** @param {{ id: string }} o */
  const rutaDe = (o) => `organizaciones/${o.id}/organizacion.db`;
  const rutaRelacionada = join(datos, rutaDe(relacionada));
  const carpetaRelacionada = dirname(rutaRelacionada);
  for (const o of [relacionada, aparte]) mkdirSync(dirname(join(datos, rutaDe(o))), { recursive: true });
  await enBase(bd, (c) => c.prepare("VACUUM INTO ?").run(rutaRelacionada));
  const cambiadas = await enBase(rutaRelacionada, (c) => {
    ponerMeta(c, relacionada.id, relacionada.nombre);
    c.prepare("INSERT OR REPLACE INTO meta (clave, valor) VALUES ('origen_db_id', ?)").run(grande.id);
    return c
      .prepare(
        "UPDATE trabajadores SET telefono = '+56 9 1234 5678' WHERE id IN (SELECT id FROM trabajadores ORDER BY id LIMIT ?)",
      )
      .run(CAMBIADAS).changes;
  });
  comprobar(
    `comparar: la relacionada tiene ${CAMBIADAS} teléfonos cambiados`,
    cambiadas === CAMBIADAS,
    cambiadas,
  );
  await sembrarGrande(join(datos, rutaDe(aparte)), aparte.id, aparte.nombre);
  writeFileSync(
    join(datos, "organizaciones.json"),
    JSON.stringify({
      version: 1,
      organizaciones: [
        entrada(grande, "boldo.db", false, "#3b6fb5", "2026-01-03T00:00:00.000Z"), // la última abierta: abre esta
        entrada(relacionada, rutaDe(relacionada), false, "#2f855a", "2026-01-02T00:00:00.000Z"),
        entrada(aparte, rutaDe(aparte), false, "#b7791f", "2026-01-01T00:00:00.000Z"),
      ],
    }),
  );
  const antes = { archivos: huellas(carpetaRelacionada), mtime: statSync(rutaRelacionada).mtimeMs };

  // Como en la medición: la primera apertura respalda la grande; con «nunca» no frena la comparación. Y en español, por la
  // etiqueta de la paleta. Se fija y se reabre.
  let app = await abrirApp(exe);
  let info = await revisarBase(app, carpeta);
  comprobar("comparar: abre boldo.db, la grande", info.baseId === grande.id, info);
  await app.evaluar(
    `localStorage.setItem("boldo:respaldos", JSON.stringify("nunca")); localStorage.setItem("boldo:idioma", JSON.stringify("es"))`,
  );
  await app.cerrar();
  app = await abrirApp(exe);
  info = await revisarBase(app, carpeta);
  comprobar("comparar: la app en español", (await app.evaluar(`document.documentElement.lang`)) === "es");

  /** @type {number[]} */
  const porId = [];
  /** @type {number[]} */
  const aproximado = [];
  /** @type {string[]} */
  const mal = [];
  for (let i = 1; i <= 2 * VECES_COMPARAR; i++) {
    const otra = i % 2 ? relacionada : aparte;
    const r = await compararPorPaleta(app, otra, i);
    (otra === relacionada ? porId : aproximado).push(r.ms);
    if (r.aproximada !== (otra === aparte)) mal.push(`comparación ${i}: aproximada ${r.aproximada}`);
    if (otra !== relacionada) continue;
    const difieren = await app.llamar("comparacion_pagina", {
      baseId: info.baseId,
      filtro: { tabla: "trabajadores", presencia: "difieren", desde: 0, cuantos: 1 },
    });
    if (difieren.valor?.total !== CAMBIADAS) mal.push(`comparación ${i}: ${JSON.stringify(difieren)}`);
  }
  const medidas = await app.evaluar(`${COMPARAR}.length`);
  if (medidas !== 2 * VECES_COMPARAR) mal.push(`${medidas} medidas, una por comparación`);
  comprobar(
    `comparar: con la relacionada, por id y difieren ${CAMBIADAS} personas; con la aparte, coincidencia aproximada`,
    !mal.length,
    mal,
  );
  await app.evaluar(`location.hash = "#/bienvenida"`);
  await verInicio(app, "Inicio tras comparar");
  comprobar("comparar: la app cierra con código 0", (await app.cerrar()) === 0);
  const despues = { archivos: huellas(carpetaRelacionada), mtime: statSync(rutaRelacionada).mtimeMs };
  comprobar(
    "comparar: el archivo de la relacionada no cambió (mismos bytes y fecha, nada nuevo a su lado)",
    JSON.stringify(despues) === JSON.stringify(antes),
    { antes, despues },
  );

  const medianaPorId = mediana(porId);
  const medianaAproximado = mediana(aproximado);
  console.log(`comparar por id: ${medianaPorId} ms`);
  console.log(`comparar aproximado: ${medianaAproximado} ms`);
  console.log(`comparar, cada vez: por id ${porId.join(", ")} ms; aproximado ${aproximado.join(", ")} ms`);
  // decisión 10: no falla; con los números en el PR se pregunta al autor
  if (Math.max(medianaPorId, medianaAproximado) >= META_COMPARAR_MS)
    console.log(`comparar: una mediana llega a ${META_COMPARAR_MS} ms; se pregunta al autor`);
  console.log(`comparar: ${fallosHastaAhora() === previos ? "ok" : "FALLA"}`);
}

/** Como `comprobarInstaladaIntacta`, para la carpeta local: el WebView de una instalada vive ahí. */
function comprobarLocalIntacta() {
  const { identifier } = JSON.parse(readFileSync(join("src-tauri", "tauri.conf.json"), "utf8"));
  const local = join(process.env.LOCALAPPDATA ?? "", identifier);
  comprobar(
    "los datos locales de una instalada no se tocaron",
    Boolean(process.env.LOCALAPPDATA) && !existsSync(local),
    local,
  );
}

/** @param {string} zipAntes @param {string} zipPublicada */
async function correr(zipAntes, zipPublicada) {
  const a = artefactos("windows", "");
  const [zipNueva, ...otros] = globSync(`release/*/${a.zip}`);
  if (!zipNueva || otros.length)
    throw new Error(`Se esperaba un solo ${a.zip} en release/*/: ${[zipNueva, ...otros]}`);
  for (const zip of [zipAntes, zipPublicada]) if (!existsSync(zip)) throw new Error(`No existe ${zip}`);
  const nueva = extraer(zipNueva, "medicion");
  await desdeAntesDeOrganizaciones(zipAntes, nueva.exe);
  await desdeLaPublicada(zipPublicada, nueva.exe);
  await medicionYEliminar(nueva);
  await medirComparacion(extraer(zipNueva, "comparar"));
  comprobarInstaladaIntacta();
  comprobarLocalIntacta();
  exigirSinFallos();
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const [zipAntes, zipPublicada] = process.argv.slice(2);
  const trabajo =
    zipAntes && zipPublicada
      ? enCiDeWindows(
          () => correr(zipAntes, zipPublicada),
          "Arnés comprobado.",
          "el arnés de organizaciones",
          PLAZO_MS,
        )
      : Promise.reject(
          new Error(
            "Uso: node scripts/arnes-organizaciones.mjs <portable .zip de antes de varias organizaciones> <portable .zip publicada>",
          ),
        );
  // process.exit: los hijos de WebView2 pueden seguir teniendo abiertas las tuberías un momento
  trabajo.then(
    () => process.exit(0),
    (e) => {
      if (!zipPublicada) console.error(e.message);
      process.exit(1);
    },
  );
}
