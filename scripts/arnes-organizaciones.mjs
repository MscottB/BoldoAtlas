// Arnés de «varias organizaciones» con el programa real: la migración desde una versión de antes de varias organizaciones y
// la actualización desde la publicada, el tiempo de cambio entre una organización grande y una chica, eliminar por la
// pantalla con el Rust de verdad, el tiempo de comparar la grande con otra, la vista dividida y otra organización al lado.
// Solo desarrollo: la app no lo importa. Solo en CI de Windows, como la prueba de humo, de la que toma cómo abrir la app y
// leer su página: abre BoldoAtlas en una ventana, siempre una portable con sus datos en una carpeta temporal.
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
  dentroDe,
  enCiDeWindows,
  erroresDeConsola,
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
// una comparación que pasa de esto se anota como fallida y no se sigue comparando
const PLAZO_COMPARAR_MS = 120_000;
// personas de la relacionada con el teléfono cambiado
const CAMBIADAS = 100;
const OTRA_PESTANA = `document.querySelector('[role="tab"][id^="pestana-"][aria-selected="false"]')`;
// la raíz de la grande, de sembrar-grande.mjs
const RAIZ_GRANDE = "Gerencia General";
const RAIZ_CHICA = "Raíz de la chica";
const ABRIR_AL_LADO = `performance.getEntriesByName("abrir-al-lado")`;
const VECES_DIVIDIR = 3;
// decisión 11: menos de 3 s hasta ver el segundo lienzo
const META_DIVIDIR_MS = 3000;
const SUBARBOL = "Subárbol del arnés";
/** Código de Windows de cada tecla que el arnés pulsa de verdad. */
const CODIGOS = { F2: 113, F6: 117, F10: 121, Escape: 27, ArrowDown: 40, ArrowRight: 39, w: 87 };
const VER_AL_LADO = `performance.getEntriesByName("ver-al-lado", "measure")`;
const VECES_LADO = 3;
// decisión 11: menos de 8 s hasta ver la otra al lado, copia incluida
const META_LADO_MS = 8000;
// una copia que pasa de esto se da por perdida
const PLAZO_LADO_MS = 120_000;
const MEMORIA_LADO = join("src", "features", "pestanas", "memoriaLado.ts");
/**
 * Las acciones de editar (sus textos en es.json) que no deben verse en el iframe de al lado, por lo que el recorrido abre:
 * el árbol con una tarjeta elegida, el panel de su unidad (Resumen y Puestos) y su menú contextual, Árboles, la ficha de
 * una persona (desde el Directorio) y el diálogo de un puesto (desde Revisión). Se buscan en botones, listas, campos y
 * entradas de menú, por su texto (el propio, sin el del atajo) o su `aria-label`.
 */
export const EDITAR = {
  arbol: [
    "arbol.nuevaUnidad",
    "arbol.nuevaSubunidad",
    "arbol.menu.renombrar",
    "arbol.menu.eliminar",
    "unidad.conectarCon",
    "unidad.duplicar",
    "unidad.eliminar",
    "unidad.quitarMarca",
    "unidad.agregarEtiqueta",
    "arboles.guardarEnArboles",
    "puesto.nuevoPuesto",
  ],
  arboles: ["arboles.nuevoArbol", "arboles.renombrar", "arboles.subir", "arboles.bajar", "arboles.quitar"],
  ficha: ["ficha.eliminar", "ficha.elegirFoto", "ficha.quitarFoto"],
  puesto: [
    "puesto.accion.titular",
    "puesto.accion.reemplazo",
    "puesto.eliminar",
    "leyenda.copiar",
    "leyenda.pegar",
    "leyenda.quitar",
  ],
};

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

/**
 * Un texto de la app en español, desde es.json por su clave con puntos: si cambia el texto, el arnés lo sigue.
 * @param {string} clave
 */
export function textoEs(clave) {
  const texto = clave
    .split(".")
    .reduce((o, k) => o?.[k], JSON.parse(readFileSync(join("src", "i18n", "es.json"), "utf8")));
  if (typeof texto !== "string") throw new Error(`es.json sin el texto ${clave}: ${JSON.stringify(texto)}`);
  return texto;
}

/**
 * Una acción de la paleta con el nombre de una organización («Comparar con «nombre»», «Ver «nombre» al lado») como la
 * muestra en español. La opción no tiene un atributo propio (el `value` de reka-ui no llega al DOM).
 * @param {string} accion la clave en `paleta.acciones` @param {string} nombre
 */
export function etiquetaPaleta(accion, nombre) {
  const plantilla = textoEs(`paleta.acciones.${accion}`);
  if (!plantilla.includes("{nombre}"))
    throw new Error(`es.json: paleta.acciones.${accion} sin {nombre}: ${plantilla}`);
  return plantilla.replace("{nombre}", nombre);
}

/** Una mediana para el registro: una comparación que pasó del plazo cuenta como infinita. @param {number[]} xs */
const textoMediana = (xs) => {
  if (!xs.length) return "sin medir";
  const m = mediana(xs);
  return Number.isFinite(m) ? `${m} ms` : `más de ${PLAZO_COMPARAR_MS} ms`;
};

/**
 * La línea de una medición que se pega en el PR (`que`: «dividir», «ver al lado»): la mediana de las aperturas y lo que
 * creció `performance.memory.usedJSHeapSize` (null si el navegador no lo da).
 * @param {string} que @param {number[]} ms @param {number | null} antes @param {number | null} despues
 */
export function lineaMedida(que, ms, antes, despues) {
  const memoria =
    antes === null || despues === null
      ? "sin medir"
      : `${despues < antes ? "-" : "+"}${(Math.abs(despues - antes) / 2 ** 20).toFixed(1)} MB`;
  return `${que}: ${Math.round(mediana(ms))} ms, memoria: ${memoria}`;
}

/** @typedef {{ BASE_LADO: number, POR_PERSONA: number, POR_UNIDAD: number }} Constantes */

/**
 * Las constantes de memoriaLado.ts, en bytes. Cada una se escribe `<n> * 2 ** <k>`; si no, lanza.
 * @param {string} [fuente] @returns {Constantes}
 */
export function constantesActuales(fuente = readFileSync(MEMORIA_LADO, "utf8")) {
  const leer = (/** @type {string} */ nombre) => {
    const m = new RegExp(`export const ${nombre} = (\\d+) \\* 2 \\*\\* (\\d+);`).exec(fuente);
    if (!m) throw new Error(`memoriaLado.ts sin ${nombre} = <n> * 2 ** <k>`);
    return Number(m[1]) * 2 ** Number(m[2]);
  };
  return { BASE_LADO: leer("BASE_LADO"), POR_PERSONA: leer("POR_PERSONA"), POR_UNIDAD: leer("POR_UNIDAD") };
}

/**
 * Las tres constantes, como se escriben en memoriaLado.ts, para que una organización de `personas` y `unidades` estime
 * el 50 % sobre lo que creció la memoria al verla al lado (`medido`). Una sola medida no separa la base de lo que suma
 * cada persona y unidad: se escalan las de ahora en la misma proporción, hacia arriba. Sin una medida útil (cero o menos),
 * null.
 * @param {number} medido @param {{ personas: number, unidades: number }} org @param {Constantes} actuales
 */
export function constantesSugeridas(medido, { personas, unidades }, actuales) {
  if (!(medido > 0)) return null;
  const estimado = actuales.BASE_LADO + personas * actuales.POR_PERSONA + unidades * actuales.POR_UNIDAD;
  const f = (1.5 * medido) / estimado;
  const en = (/** @type {number} */ bytes, /** @type {number} */ k) =>
    `${Math.ceil((bytes * f) / 2 ** k)} * 2 ** ${k}`;
  return {
    BASE_LADO: en(actuales.BASE_LADO, 20),
    POR_PERSONA: en(actuales.POR_PERSONA, 10),
    POR_UNIDAD: en(actuales.POR_UNIDAD, 10),
  };
}

/**
 * Una tecla como la pulsa una persona, para `Input.dispatchKeyEvent` de CDP: abajo y arriba (en Windows, Mayús+F10 abre el
 * menú contextual al soltarla). Llega al elemento con el foco, también dentro de un iframe, y el navegador hace lo suyo,
 * como con el teclado.
 * @param {string} key @param {boolean} [mayus] @param {boolean} [ctrl]
 */
export function eventosTecla(key, mayus = false, ctrl = false) {
  const codigo = CODIGOS[/** @type {keyof typeof CODIGOS} */ (key)];
  if (!codigo) throw new Error(`Tecla sin código de Windows en el arnés: ${key}`);
  const code = key.length === 1 ? `Key${key.toUpperCase()}` : key;
  const comun = { key, code, windowsVirtualKeyCode: codigo, modifiers: (mayus ? 8 : 0) | (ctrl ? 2 : 0) };
  return [
    { type: "rawKeyDown", ...comun },
    { type: "keyUp", ...comun },
  ];
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

/**
 * Nombre y sha256 de cada archivo. Una carpeta (p. ej. `respaldos/`, que crea abrirla) no se lee: queda como «carpeta», y
 * para una organización que no debía cambiar cuenta como algo nuevo a su lado.
 * @param {string} carpeta @returns {Record<string, string>}
 */
export const huellas = (carpeta) =>
  Object.fromEntries(
    readdirSync(carpeta, { withFileTypes: true }).map((e) => [
      e.name,
      e.isDirectory()
        ? "carpeta"
        : createHash("sha256")
            .update(readFileSync(join(carpeta, e.name)))
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
/** @typedef {{ id: string, nombre: string, ruta: string }} Otra */
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
  const primera = await revisarBase(app, carpeta);
  comprobar("medición: abre boldo.db, la grande", primera.baseId === grande.id, primera);
  await app.evaluar(`localStorage.setItem("boldo:respaldos", JSON.stringify("nunca"))`);
  comprobar("medición: la primera apertura cierra con código 0", (await app.cerrar()) === 0);
  app = await abrirApp(exe);
  const info = await revisarBase(app, carpeta);
  comprobar(
    "medición: reabre boldo.db, la grande (mismo db_id y rutaBd)",
    info.baseId === grande.id && info.rutaBd === primera.rutaBd,
    { primera, info },
  );

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
 * Abre la paleta con Ctrl+K, escribe `texto` y elige la opción `etiqueta`, como una persona. Deja en `window.__elegida`
 * el momento del clic, para medir desde ahí.
 * @param {App} app @param {string} etiqueta @param {string} texto
 */
async function elegirEnPaleta(app, etiqueta, texto) {
  await app.evaluar(`window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true }))`);
  const campo = `document.querySelector('[role="dialog"] input')`;
  await app.hasta(`Boolean(${campo})`, "la paleta abierta");
  await app.evaluar(
    `(() => { const c = ${campo}; c.value = ${JSON.stringify(texto)}; c.dispatchEvent(new Event("input", { bubbles: true })); })()`,
  );
  const opcion = `[...document.querySelectorAll('[role="dialog"] [role="option"]')].find((x) => x.innerText.trim() === ${JSON.stringify(etiqueta)})`;
  await app.hasta(`Boolean(${opcion})`, `«${etiqueta}» en la paleta`);
  await app.evaluar(`window.__elegida = performance.now(); ${opcion}.click()`);
}

/**
 * Por la paleta, como una persona: desde Acerca, Ctrl+K, escribe el nombre y elige «Comparar con «nombre»». Espera la
 * comparación número `n` y su resumen dibujado. Devuelve lo que midió la app y si la vista avisó coincidencia aproximada, o
 * `{ tarde }` si pasó de PLAZO_COMPARAR_MS. La paleta en español: la etiqueta sale de es.json.
 * @param {App} app @param {{ nombre: string }} o @param {number} n
 * @returns {Promise<{ ms: number, aproximada: boolean } | { tarde: string }>}
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
  await elegirEnPaleta(app, etiquetaPaleta("comparar", o.nombre), o.nombre);
  // esperar solo lanza al vencer el plazo: es un tiempo que se anota, no un error de la página
  /** @type {{ ms: number, aproximada: boolean } | { error: string } | { tarde: string }} */
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
          aproximada: document.body.innerText.includes(${JSON.stringify(textoEs("comparar.aproximada"))}),
        }))));
      })()`),
    `la comparación ${n}, con «${o.nombre}»`,
    PLAZO_COMPARAR_MS,
  ).catch((/** @type {Error} */ e) => ({ tarde: e.message }));
  if ("error" in r) throw new Error(`La comparación con «${o.nombre}» falló: ${r.error}`);
  return r;
}

/** La ventana en PNG por CDP, en `carpeta`. @param {App} app @param {string} carpeta @param {string} nombre */
async function capturar(app, carpeta, nombre) {
  const { data } = await app.enviar("Page.captureScreenshot", { format: "png" });
  writeFileSync(join(carpeta, `${nombre}.png`), Buffer.from(data, "base64"));
}

/**
 * Para mirarlas a ojo (el trabajo las sube como `capturas-comparar`): la comparación ya dibujada y el detalle de su primera
 * fila en el panel lateral. Lo cierra después, para que la paleta tenga el teclado.
 * @param {App} app @param {string} carpeta
 */
async function capturarComparacion(app, carpeta) {
  mkdirSync(carpeta, { recursive: true });
  const fila = `document.querySelector('#${ID_AREA} li > button[aria-haspopup="dialog"]')`;
  await app.hasta(`Boolean(${fila})`, "la primera fila de la comparación");
  await capturar(app, carpeta, "1-comparacion");
  await app.evaluar(`${fila}.click()`);
  const panel = `document.querySelector('[role="dialog"][data-state="open"]')`;
  await app.hasta(
    `Boolean(${panel}?.querySelector('table, [role="alert"]'))`,
    "el detalle de la fila en el panel",
  );
  await pausa(500); // que termine de entrar deslizándose
  await capturar(app, carpeta, "2-detalle");
  const conError = await app.evaluar(`${panel}.querySelector('[role="alert"]')?.innerText ?? null`);
  comprobar("comparar: el detalle de la primera fila se abre sin error", conError === null, conError);
  await app.evaluar(`document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))`);
  await app.hasta(`!${panel}`, "el panel de detalle cerrado");
}

/**
 * Las capturas de Revisión para la ayuda (el trabajo las sube como `capturas-revision`): 888 × 440 desde la esquina de su
 * sección, en español y en inglés. El idioma se cambia recargando; deja la app en español, en Inicio.
 * @param {App} app @param {string} carpeta
 */
async function capturarRevision(app, carpeta) {
  mkdirSync(carpeta, { recursive: true });
  const seccion = `document.querySelector("details[data-tipo]")?.parentElement`;
  /** @param {string} idioma */
  const enIdioma = async (idioma) => {
    await app.evaluar(`localStorage.setItem("boldo:idioma", ${JSON.stringify(JSON.stringify(idioma))})`);
    await recargar(app);
    // al cargar, la app se va sola a Inicio: navegar antes de eso lo pisa
    await verInicio(app, `Inicio tras recargar en ${idioma}`);
    await app.hasta(`document.documentElement.lang === ${JSON.stringify(idioma)}`, `la app en ${idioma}`);
  };
  for (const idioma of ["es", "en"]) {
    await enIdioma(idioma);
    await app.evaluar(`location.hash = "#/revision"`);
    await app.hasta(
      // como la ve una persona: solo «Importante» empieza abierta; en las abiertas, sus filas ya dibujadas
      `location.hash === "#/revision" && (() => {
        const ds = [...document.querySelectorAll("details[data-tipo]")];
        return ds.length > 0 && ds.filter((d) => d.open).every((d) => d.querySelector("[data-clave]"));
      })()`,
      `Revisión con sus avisos, en ${idioma}`,
    );
    // las filas virtuales se dibujan tras medir su lista: dos cuadros
    const { x, y } =
      await app.evaluar(`new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(() => {
      scrollTo(0, 0);
      const r = ${seccion}.getBoundingClientRect();
      ok({ x: r.left + scrollX, y: r.top + scrollY });
    })))`);
    const { data } = await app.enviar("Page.captureScreenshot", {
      format: "webp",
      clip: { x, y, width: 888, height: 440, scale: 1 },
    });
    writeFileSync(join(carpeta, `revision-lista-${idioma}.webp`), Buffer.from(data, "base64"));
  }
  await enIdioma("es");
}

/**
 * La grande de nuevo en `boldo.db`, con dos internas: `relacionada`, su copia con otro id que viene de ella y 100 teléfonos
 * cambiados (se compara por id), y `aparte`, otra sembrada con otros ids (se empareja por nombre y correo). Compara la grande
 * 3 veces con cada una por la paleta y lee lo que midió la app. Pasar de 5000 ms no falla: se pregunta al autor; pasar de
 * PLAZO_COMPARAR_MS sí. Deja en RUNNER_TEMP/capturas la primera (por id) y el detalle de su primera fila, para mirarlas.
 * Devuelve las dos, con la ruta de su archivo.
 * @param {Portable} portable
 * @returns {Promise<{ relacionada: Otra, aparte: Otra }>}
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
  const primera = await revisarBase(app, carpeta);
  comprobar("comparar: abre boldo.db, la grande", primera.baseId === grande.id, primera);
  await app.evaluar(
    `localStorage.setItem("boldo:respaldos", JSON.stringify("nunca")); localStorage.setItem("boldo:idioma", JSON.stringify("es"))`,
  );
  comprobar("comparar: la primera apertura cierra con código 0", (await app.cerrar()) === 0);
  app = await abrirApp(exe);
  const info = await revisarBase(app, carpeta);
  comprobar(
    "comparar: reabre boldo.db, la grande (mismo db_id y rutaBd)",
    info.baseId === grande.id && info.rutaBd === primera.rutaBd,
    { primera, info },
  );
  comprobar("comparar: la app en español", (await app.evaluar(`document.documentElement.lang`)) === "es");
  // Al cargar, la app se va sola a Inicio: navegar antes de eso lo pisa.
  await verInicio(app, "Inicio de la grande, antes de comparar");
  // Antes de comparar (recargar borra las medidas) y antes de que el lado a lado marque un aviso.
  await capturarRevision(app, join(process.env.RUNNER_TEMP ?? "", "capturas"));

  /** @type {number[]} */
  const porId = [];
  /** @type {number[]} */
  const aproximado = [];
  /** @type {string[]} */
  const mal = [];
  let tarde = false;
  for (let i = 1; i <= 2 * VECES_COMPARAR; i++) {
    const otra = i % 2 ? relacionada : aparte;
    const r = await compararPorPaleta(app, otra, i);
    const tiempos = otra === relacionada ? porId : aproximado;
    if ("tarde" in r) {
      // Sigue en curso y descuadraría la cuenta de medidas: no se compara más. El cierre y el archivo se revisan igual.
      tiempos.push(Infinity);
      comprobar(
        `comparar: la comparación ${i}, con «${otra.nombre}», termina antes de ${PLAZO_COMPARAR_MS / 1000} s`,
        false,
        r.tarde,
      );
      tarde = true;
      break;
    }
    tiempos.push(r.ms);
    if (r.aproximada !== (otra === aparte)) mal.push(`comparación ${i}: aproximada ${r.aproximada}`);
    // la primera, por id: la aparte coincide entera y sin diferencias no hay filas; con 100 personas distintas, sí
    if (i === 1) await capturarComparacion(app, join(process.env.RUNNER_TEMP ?? "", "capturas"));
    if (otra !== relacionada) continue;
    const difieren = await app.llamar("comparacion_pagina", {
      baseId: info.baseId,
      filtro: { tabla: "trabajadores", presencia: "difieren", desde: 0, cuantos: 1 },
    });
    if (difieren.valor?.total !== CAMBIADAS) mal.push(`comparación ${i}: ${JSON.stringify(difieren)}`);
  }
  const medidas = await app.evaluar(`${COMPARAR}.length`);
  if (!tarde && medidas !== 2 * VECES_COMPARAR) mal.push(`${medidas} medidas, una por comparación`);
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

  console.log(`comparar por id: ${textoMediana(porId)}`);
  console.log(`comparar aproximado: ${textoMediana(aproximado)}`);
  /** @param {number[]} xs */
  const cadaVez = (xs) =>
    xs.map((ms) => (Number.isFinite(ms) ? ms : `más de ${PLAZO_COMPARAR_MS}`)).join(", ");
  console.log(`comparar, cada vez: por id ${cadaVez(porId)} ms; aproximado ${cadaVez(aproximado)} ms`);
  // decisión 10: no falla; con los números en el PR se pregunta al autor (pasar del plazo sí falla, arriba)
  if (!tarde && Math.max(mediana(porId), mediana(aproximado)) >= META_COMPARAR_MS)
    console.log(`comparar: una mediana llega a ${META_COMPARAR_MS} ms; se pregunta al autor`);
  console.log(`comparar: ${fallosHastaAhora() === previos ? "ok" : "FALLA"}`);
  return {
    relacionada: { ...relacionada, ruta: rutaRelacionada },
    aparte: { ...aparte, ruta: join(datos, rutaDe(aparte)) },
  };
}

/**
 * Pulsa una tecla de verdad (CDP) donde está el foco. @param {App} app @param {string} key @param {boolean} [mayus]
 * @param {boolean} [ctrl]
 */
async function pulsar(app, key, mayus = false, ctrl = false) {
  for (const e of eventosTecla(key, mayus, ctrl)) await app.enviar("Input.dispatchKeyEvent", e);
}

/**
 * Dónde cae el clic: el centro de la caja. Sin caja, o sin ancho o alto (un elemento oculto), null: el clic iría a (0,0).
 * También null si en ese centro la página tiene otra cosa (`alcanza` false): fuera de la parte visible de la barra de
 * pestañas desplazada, o tapado; el clic caería en otro lado sin decirlo.
 * @param {{ left: number, top: number, width: number, height: number, alcanza?: boolean } | null} r
 * @returns {{ x: number, y: number } | null}
 */
export function centroDelClic(r) {
  return r?.width && r.height && r.alcanza !== false
    ? { x: r.left + r.width / 2, y: r.top + r.height / 2 }
    : null;
}

/**
 * Un clic de verdad (CDP) en el centro del elemento que da `elemento` (una expresión de la página): con él llegan el
 * puntero, el foco y, con el botón derecho, el menú contextual. Antes lo trae a la vista, como una persona que desplaza la
 * barra de pestañas, y mira que el clic lo alcance.
 * @param {App} app @param {string} elemento @param {string} que @param {"left" | "right"} [boton]
 */
async function clicEn(app, elemento, que, boton = "left") {
  const c = centroDelClic(
    await app.evaluar(`(() => {
      const el = ${elemento};
      el?.scrollIntoView({ block: "nearest", inline: "nearest" });
      const r = el?.getBoundingClientRect();
      if (!r) return null;
      const alli = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return { left: r.left, top: r.top, width: r.width, height: r.height, alcanza: Boolean(alli && el.contains(alli)) };
    })()`),
  );
  if (!c) throw new Error(`No está ${que} para el clic, o está oculto o tapado`);
  const comun = { ...c, button: boton, clickCount: 1 };
  await app.enviar("Input.dispatchMouseEvent", { type: "mouseMoved", ...c });
  await app.enviar("Input.dispatchMouseEvent", {
    type: "mousePressed",
    ...comun,
    buttons: boton === "left" ? 1 : 2,
  });
  await app.enviar("Input.dispatchMouseEvent", { type: "mouseReleased", ...comun, buttons: 0 });
}

/** La memoria que usa la página, tras soltar la basura: así se compara lo que queda. @param {App} app */
async function memoria(app) {
  await app.enviar("HeapProfiler.collectGarbage");
  /** @type {number | null} */
  const usada = await app.evaluar(`performance.memory?.usedJSHeapSize ?? null`);
  return usada;
}

/** @typedef {"principal" | "lado"} Panel */
/** @param {Panel} p */
const panel = (p) => `document.querySelector('[data-panel="${p}"]')`;
/** @param {Panel} p */
const tarjetas = (p) => `(${panel(p)}?.querySelectorAll(".vue-flow__node").length ?? 0)`;
/** Los ids de las tarjetas elegidas en un panel, en orden. @param {Panel} p */
const elegidas = (p) =>
  `[...(${panel(p)}?.querySelectorAll(".vue-flow__node") ?? [])].filter((n) => n.querySelector('[aria-pressed="true"]')).map((n) => n.dataset.id).sort().join()`;
/** El encuadre del lienzo de un panel. @param {Panel} p */
const encuadre = (p) =>
  `(${panel(p)}?.querySelector(".vue-flow__transformationpane")?.style.transform ?? "")`;
/** @param {Panel} p */
const encabezado = (p) => `${panel(p)}?.querySelector("header")`;
/** El título que muestra el encabezado de un panel. @param {Panel} p */
const tituloPanel = (p) => `${encabezado(p)}?.querySelector("span")?.innerText.trim()`;
// El panel marcado (el del foco: ahí actúan el menú lateral, la paleta y los atajos) y el que tiene el foco del teclado.
const MARCADO = `(document.querySelector('[data-panel][aria-current="true"]')?.dataset.panel ?? null)`;
const FOCO_EN = `(document.activeElement?.closest("[data-panel]")?.dataset.panel ?? null)`;
// la pestaña de cada panel, por el id de su botón (idPestana: «pestana-<id>»)
const ACTIVA = `document.querySelector('[role="tab"][aria-selected="true"]')?.id.slice(8)`;
const AL_LADO = `(document.querySelector('[role="tab"][aria-controls="panel-lado"]')?.id.slice(8) ?? null)`;
/** El botón de una pestaña. @param {string} id */
const pestana = (id) => `document.getElementById(${JSON.stringify(`pestana-${id}`)})`;
/** Una entrada del menú lateral. @param {string} ruta */
const entradaLateral = (ruta) => `document.querySelector('nav a[href="#${ruta}"]')`;
const MENU = `document.querySelector('[role="menu"][data-state="open"]')`;
/** Una entrada del menú abierto, por su texto en es.json. @param {string} clave */
const entradaDelMenu = (clave) =>
  `[...(${MENU}?.querySelectorAll('[role="menuitem"]') ?? [])].find((x) => x.innerText.trim() === ${JSON.stringify(textoEs(clave))})`;
// Para el detalle de lo que falla: dónde está cada cosa.
const ESTADO = `({ marcado: ${MARCADO}, foco: ${FOCO_EN}, activa: ${ACTIVA}, alLado: ${AL_LADO}, hash: location.hash,
  tarjetas: [${tarjetas("principal")}, ${tarjetas("lado")}], elegidas: [${elegidas("principal")}, ${elegidas("lado")}],
  titulos: [${tituloPanel("principal")}, ${tituloPanel("lado")}], activo: document.activeElement?.outerHTML.slice(0, 120) })`;

/**
 * Espera `condicion` (una expresión de la página) y lo anota como comprobación: si no llega en 30 s, FALLA con dónde está
 * cada cosa. Sigue con lo demás: un paso que falla no oculta los siguientes.
 * @param {App} app @param {string} nombre @param {string} condicion
 */
async function verQue(app, nombre, condicion) {
  const ok = await app.hasta(condicion, nombre).then(
    () => true,
    () => false,
  );
  comprobar(nombre, ok, ok ? "" : await app.evaluar(ESTADO).catch((/** @type {Error} */ e) => e.message));
}

/**
 * Con la grande de `medirComparacion` (ya sembrada en `boldo.db`), divide 3 veces con el Árbol en los dos paneles y lee lo
 * que midió la app (`abrir-al-lado`, desde «Dividir» hasta ver el segundo lienzo) y la memoria antes y después. Pasar de
 * META_DIVIDIR_MS no falla: se pregunta al autor (decisión 11). Después recorre, como una persona, lo que las pruebas sin
 * DOM no alcanzan: F2, las flechas y Ubicar con el mismo árbol en los dos paneles, los dos Vue Flow y su intercambio, F6 y
 * el panel marcado, el menú lateral, el menú de las pestañas, el divisor y renombrar en Árboles.
 * @param {Portable} portable
 */
async function medirDivision({ carpeta, exe, datos }) {
  const previos = fallosHastaAhora();
  const bd = join(datos, "boldo.db");
  // Con la app cerrada, como al sembrar: un subárbol guardado para Árboles, y la unidad a la que va Ubicar, la última
  // sembrada, en una rama plegada lejos de la raíz.
  const subarbol = randomUUID();
  const ahora = new Date().toISOString();
  /** @type {{ id: string, nombre: string }} */
  const lejana = await enBase(bd, (c) => {
    c.prepare(
      `INSERT INTO subarboles_guardados (id, unidad_id, nombre, orden, created_at, updated_at)
        SELECT ?, id, ?, 0, ?, ? FROM unidades WHERE nombre = 'Gerencia 1' AND deleted_at IS NULL`,
    ).run(subarbol, SUBARBOL, ahora, ahora);
    return c
      .prepare("SELECT id, nombre FROM unidades WHERE deleted_at IS NULL ORDER BY orden DESC LIMIT 1")
      .get();
  });

  const app = await abrirApp(exe);
  const info = await revisarBase(app, carpeta);
  // Que la página se comporte como la ventana de adelante: el foco y sus eventos, aunque otra ventana lo tenga.
  await app.enviar("Emulation.setFocusEmulationEnabled", { enabled: true });
  await verInicio(app, "Inicio de la grande, antes de dividir");
  await app.evaluar(`location.hash = "#/"`);

  const dividir = `[...document.querySelectorAll("header button[aria-pressed]")].find((b) => b.innerText.trim() === ${JSON.stringify(textoEs("barra.dividir"))})`;
  await app.hasta(`${tarjetas("principal")} > 0 && Boolean(${dividir})`, "el árbol de la grande");
  await app.evaluar(`performance.clearMeasures("abrir-al-lado")`);
  const antes = await memoria(app);
  /** @type {number[]} */
  const ms = [];
  for (let i = 1; i <= VECES_DIVIDIR; i++) {
    await app.hasta(
      `!${panel("lado")} && ${tarjetas("principal")} > 0`,
      `el árbol sin dividir, antes de la división ${i}`,
    );
    await app.evaluar(`${dividir}.click()`);
    await app.hasta(
      `${ABRIR_AL_LADO}.length === ${i} && ${tarjetas("lado")} > 0`,
      `el segundo lienzo, división ${i}`,
    );
    ms.push(Math.round(await app.evaluar(`${ABRIR_AL_LADO}.at(-1).duration`)));
    // la cierra, menos la última: la de al lado queda en la barra como una más
    if (i < VECES_DIVIDIR) await app.evaluar(`${dividir}.click()`);
  }
  const despues = await memoria(app);
  console.log(lineaMedida("dividir", ms, antes, despues));
  console.log(`dividir, cada vez: ${ms.join(", ")} ms`);
  // decisión 11: no falla; con los números en el PR se pregunta al autor
  if (mediana(ms) >= META_DIVIDIR_MS)
    console.log(`dividir: la mediana llega a ${META_DIVIDIR_MS} ms; se pregunta al autor`);

  // El mismo árbol en los dos paneles, con el foco al lado (un clic en su encabezado). Sin nada elegido, la flecha elige
  // la raíz, ahí.
  await clicEn(app, encabezado("lado"), "el encabezado de al lado");
  await app.hasta(`${MARCADO} === "lado" && ${FOCO_EN} === "lado"`, "el foco en el panel de al lado");
  const principal = {
    elegidas: await app.evaluar(elegidas("principal")),
    encuadre: await app.evaluar(encuadre("principal")),
  };
  const principalIgual = `(${elegidas("principal")} === ${JSON.stringify(principal.elegidas)} && ${encuadre("principal")} === ${JSON.stringify(principal.encuadre)})`;
  const vertical = await app.evaluar(`Boolean(${panel("lado")}.querySelector(".vue-flow__handle-bottom"))`);
  const alHijo = vertical ? "ArrowDown" : "ArrowRight";
  await pulsar(app, alHijo);
  await app.hasta(`/^[^,]+$/.test(${elegidas("lado")})`, "una unidad elegida al lado");
  /** @type {string} */
  const unidad = await app.evaluar(elegidas("lado"));
  // El panel de la unidad elegida se abre y toma el foco: hasta entonces, F2 podría perder el campo.
  await app.hasta(
    `document.activeElement === ${panel("lado")}?.querySelector("[data-panel-unidad]")`,
    "el panel de la unidad de al lado, con el foco",
  );
  const campo = (/** @type {Panel} */ p) =>
    `${panel(p)}?.querySelector('.vue-flow__node[data-id="${unidad}"] input')`;
  await pulsar(app, "F2");
  await verQue(
    app,
    "vista dividida: F2 renombra en la tarjeta de al lado y no en la del principal (mismo árbol en los dos)",
    `document.activeElement === ${campo("lado")} && !${campo("principal")} && ${principalIgual}`,
  );
  await pulsar(app, "Escape");
  await app.hasta(`!${campo("lado")}`, "el renombrado cancelado con Esc");
  await pulsar(app, alHijo);
  await verQue(
    app,
    "vista dividida: las flechas mueven solo la selección de al lado",
    `/^[^,]+$/.test(${elegidas("lado")}) && ${elegidas("lado")} !== ${JSON.stringify(unidad)} && ${principalIgual}`,
  );
  const encuadreLado = await app.evaluar(encuadre("lado"));
  await app.evaluar(`window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true }))`);
  const busqueda = `document.querySelector('[role="dialog"] input')`;
  await app.hasta(`Boolean(${busqueda})`, "la paleta abierta");
  await app.evaluar(
    `(() => { const c = ${busqueda}; c.value = ${JSON.stringify(lejana.nombre)}; c.dispatchEvent(new Event("input", { bubbles: true })); })()`,
  );
  const opcion = `[...document.querySelectorAll('[role="dialog"] [role="option"]')].find((o) => o.querySelector("span.grid > span")?.innerText.trim() === ${JSON.stringify(lejana.nombre)})`;
  await app.hasta(`Boolean(${opcion})`, `«${lejana.nombre}» en la paleta`);
  await app.evaluar(`${opcion}.click()`);
  await verQue(
    app,
    `vista dividida: Ubicar «${lejana.nombre}» desde la paleta lo encuadra en el lienzo de al lado`,
    `${elegidas("lado")} === ${JSON.stringify(lejana.id)} && ${encuadre("lado")} !== ${JSON.stringify(encuadreLado)}`,
  );
  await pausa(500); // si el principal se fuera a mover, ya lo habría hecho
  comprobar(
    "vista dividida: … y el principal sigue con su encuadre y su selección",
    await app.evaluar(principalIgual),
    await app.evaluar(ESTADO),
  );

  // Dos Vue Flow montados a la vez. Al intercambiar las pestañas (con el foco en el principal, un clic en la de al lado),
  // ninguno queda en blanco.
  const ids = { principal: await app.evaluar(ACTIVA), lado: await app.evaluar(AL_LADO) };
  // cada Vue Flow, con su panel y su id (VistaArbol lo deja en data-lienzo)
  const lienzos = `[...document.querySelectorAll(".vue-flow")].map((l) => l.closest("[data-panel]")?.dataset.panel + ":" + l.dataset.lienzo).join()`;
  const esperados = `principal:arbol-principal-${ids.principal},lado:arbol-lado-${ids.lado}`;
  comprobar(
    `vista dividida: dos Vue Flow a la vez, arbol-principal-${ids.principal} y arbol-lado-${ids.lado}, cada uno con sus tarjetas`,
    (await app.evaluar(lienzos)) === esperados &&
      (await app.evaluar(`${tarjetas("principal")} > 0 && ${tarjetas("lado")} > 0`)),
    { lienzos: await app.evaluar(lienzos), estado: await app.evaluar(ESTADO) },
  );
  await clicEn(app, encabezado("principal"), "el encabezado del principal");
  await app.hasta(`${MARCADO} === "principal"`, "el foco en el principal");
  await app.evaluar(`${pestana(ids.lado)}.click()`);
  const intercambiadas = `(${ACTIVA} === ${JSON.stringify(ids.lado)} && ${AL_LADO} === ${JSON.stringify(ids.principal)} && ${tarjetas("principal")} > 0 && ${tarjetas("lado")} > 0)`;
  await verQue(
    app,
    "vista dividida: al intercambiar las pestañas de panel, ninguno de los dos lienzos queda en blanco",
    intercambiadas,
  );
  await pausa(1000); // un lienzo que se desmonta tarde dejaría en blanco al otro después de verse
  comprobar(
    "vista dividida: … y siguen dibujados un segundo después",
    await app.evaluar(intercambiadas),
    await app.evaluar(ESTADO),
  );

  // F6, y el clic o el foco que entra a un panel lo marcan.
  await clicEn(app, encabezado("principal"), "el encabezado del principal");
  await app.hasta(`${FOCO_EN} === "principal"`, "el foco del teclado en el principal");
  await pulsar(app, "F6");
  await verQue(
    app,
    "vista dividida: F6 lleva el foco al panel de al lado y marca su encabezado",
    `${MARCADO} === "lado" && ${FOCO_EN} === "lado"`,
  );
  await pulsar(app, "F6");
  await verQue(
    app,
    "vista dividida: F6 otra vez lo devuelve al principal",
    `${MARCADO} === "principal" && ${FOCO_EN} === "principal"`,
  );
  await clicEn(app, encabezado("lado"), "el encabezado de al lado");
  await verQue(app, "vista dividida: un clic en un panel lo marca", `${MARCADO} === "lado"`);
  await app.evaluar(`${panel("principal")}.focus()`);
  await verQue(app, "vista dividida: el foco que entra a un panel lo marca", `${MARCADO} === "principal"`);

  // El menú lateral con el foco al lado: Directorio va a ese panel; Configuración, al principal, y Esc la cierra.
  await clicEn(app, encabezado("lado"), "el encabezado de al lado");
  await app.hasta(`${MARCADO} === "lado"`, "el foco al lado");
  const hash = await app.evaluar(`location.hash`);
  const directorio = JSON.stringify(textoEs("nav.directorio"));
  await app.evaluar(`${entradaLateral("/directorio")}.click()`);
  await verQue(
    app,
    "vista dividida: con el foco al lado, «Directorio» del menú lateral cambia ese panel y no el principal",
    `${tituloPanel("lado")} === ${directorio} && location.hash === ${JSON.stringify(hash)} && ${tarjetas("principal")} > 0`,
  );
  // Un clic de verdad, como una persona: el foco del teclado sale del panel de al lado y va al menú.
  await clicEn(app, entradaLateral("/configuracion"), "«Configuración» en el menú lateral");
  await verQue(
    app,
    "vista dividida: «Configuración» se abre en el principal, que queda marcado, y el foco sale del panel de al lado",
    `location.hash === "#/configuracion" && ${MARCADO} === "principal" && ${FOCO_EN} !== "lado" && ${tituloPanel("lado")} === ${directorio}`,
  );
  // De vuelta en el principal (con el menú lateral contraído, Esc en él solo lo pliega)
  await clicEn(app, encabezado("principal"), "el encabezado del principal");
  await app.hasta(`${FOCO_EN} === "principal"`, "el foco en el principal, en Configuración");
  await pulsar(app, "Escape");
  await verQue(
    app,
    "vista dividida: Esc cierra Configuración y el principal vuelve a su vista",
    `location.hash === ${JSON.stringify(hash)} && ${tarjetas("principal")} > 0 && ${tituloPanel("lado")} === ${directorio}`,
  );

  // El menú de las pestañas: clic derecho en la de al lado y Mayús+F10 en otra.
  /** @type {string} */
  const deAlLado = await app.evaluar(AL_LADO);
  await clicEn(app, pestana(deAlLado), "la pestaña de al lado", "right");
  await verQue(
    app,
    "pestañas: el clic derecho en la de al lado ofrece «Quitar de al lado»",
    `Boolean(${entradaDelMenu("pestanas.quitarDeAlLado")})`,
  );
  await app.evaluar(`${entradaDelMenu("pestanas.quitarDeAlLado")}?.click()`);
  await verQue(
    app,
    "pestañas: «Quitar de al lado» cierra la vista dividida y la deja en la barra",
    `!${panel("lado")} && Boolean(${pestana(deAlLado)}) && !${MENU}`,
  );
  /** @type {string} */
  const otra = await app.evaluar(
    `document.querySelector('[role="tab"][aria-selected="false"]')?.id.slice(8)`,
  );
  await app.evaluar(`${pestana(otra)}.focus()`);
  await pulsar(app, "F10", true);
  await verQue(
    app,
    "pestañas: Mayús+F10 en otra pestaña ofrece «Abrir al lado»",
    `Boolean(${entradaDelMenu("pestanas.abrirAlLado")})`,
  );
  await app.evaluar(`${entradaDelMenu("pestanas.abrirAlLado")}?.click()`);
  await verQue(
    app,
    "pestañas: «Abrir al lado» la muestra en el panel de al lado",
    `${AL_LADO} === ${JSON.stringify(otra)} && Boolean(${panel("lado")}) && !${MENU}`,
  );

  // El divisor: arrastrarlo cambia la proporción, que se guarda una vez, al soltar (no en cada movimiento).
  await pausa(1500); // lo que las vistas guardan tras una pausa (useEstadoPestana) no se cuenta como del arrastre
  const clave = `boldo:pestanas:${info.dirDatos}`;
  await app.evaluar(`(() => {
    const original = Storage.prototype.setItem;
    window.__guardadas = 0;
    Storage.prototype.setItem = function (k, v) {
      if (k === ${JSON.stringify(clave)}) window.__guardadas++;
      return original.call(this, k, v);
    };
    window.__soltarConteo = () => (Storage.prototype.setItem = original);
  })()`);
  const proporcion = () =>
    app.evaluar(`JSON.parse(localStorage.getItem(${JSON.stringify(clave)}))?.division?.proporcion`);
  const proporcionAntes = await proporcion();
  /** @type {{ x: number, y: number, dx: number, dy: number }} */
  const divisor = await app.evaluar(`(() => {
    const d = document.querySelector('#${ID_AREA} [role="separator"]');
    const r = d.getBoundingClientRect();
    const caja = d.parentElement.getBoundingClientRect();
    const ladoALado = d.getAttribute("aria-orientation") === "vertical";
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, dx: ladoALado ? caja.width * 0.15 : 0, dy: ladoALado ? 0 : caja.height * 0.15 };
  })()`);
  /** @param {string} type @param {number} f cuánto del camino @param {number} buttons */
  const raton = (type, f, buttons) =>
    app.enviar("Input.dispatchMouseEvent", {
      type,
      x: divisor.x + divisor.dx * f,
      y: divisor.y + divisor.dy * f,
      button: "left",
      buttons,
      clickCount: 1,
    });
  await raton("mouseMoved", 0, 0);
  await raton("mousePressed", 0, 1);
  for (const f of [0.2, 0.4, 0.6, 0.8, 1]) await raton("mouseMoved", f, 1);
  await pausa(300);
  const durante = await app.evaluar(`window.__guardadas`);
  await raton("mouseReleased", 1, 0);
  await verQue(app, "vista dividida: al soltar el divisor se guarda la proporción", `window.__guardadas > 0`);
  await pausa(300); // una segunda escritura llegaría aquí
  const guardadas = await app.evaluar(`window.__guardadas`);
  await app.evaluar(`window.__soltarConteo()`);
  const proporcionDespues = await proporcion();
  comprobar(
    "vista dividida: arrastrar el divisor cambia la proporción y se guarda una vez, al soltar",
    durante === 0 && guardadas === 1 && proporcionDespues > proporcionAntes,
    { durante, guardadas, proporcionAntes, proporcionDespues },
  );

  // Árboles en los dos paneles: renombrar pone el foco en el campo del panel donde se pidió, también con el del otro
  // abierto (los dos campos llevan el mismo id).
  for (const p of /** @type {const} */ (["principal", "lado"])) {
    await clicEn(app, encabezado(p), `el encabezado del panel ${p}`);
    await app.hasta(`${MARCADO} === "${p}"`, `el foco en el panel ${p}`);
    await app.evaluar(`${entradaLateral("/arboles")}.click()`);
  }
  const renombrar = (/** @type {Panel} */ p) =>
    `${panel(p)}?.querySelector(${JSON.stringify(`button[aria-label="${textoEs("arboles.renombrar")}"]`)})`;
  await app.hasta(
    `location.hash === "#/arboles" && Boolean(${renombrar("principal")}) && Boolean(${renombrar("lado")})`,
    "Árboles en los dos paneles, con el subárbol guardado",
  );
  const enSuCampo = `document.activeElement?.id === ${JSON.stringify(`renombrar-${subarbol}`)}`;
  await app.evaluar(`${renombrar("principal")}.click()`);
  await verQue(
    app,
    "vista dividida: con Árboles en los dos paneles, renombrar en el principal pone el foco en su campo",
    `${enSuCampo} && ${FOCO_EN} === "principal"`,
  );
  await app.evaluar(`${renombrar("lado")}.click()`);
  await verQue(
    app,
    "vista dividida: … y renombrar al lado, en el campo de al lado (con el del principal aún abierto)",
    `${enSuCampo} && ${FOCO_EN} === "lado"`,
  );
  await pulsar(app, "Escape");

  await app.evaluar(`location.hash = "#/bienvenida"`);
  await verInicio(app, "Inicio tras dividir");
  comprobar("vista dividida: la app cierra con código 0", (await app.cerrar()) === 0);
  console.log(`vista dividida: ${fallosHastaAhora() === previos ? "ok" : "FALLA"}`);
}

// El iframe del panel de al lado, cuando muestra otra organización, y su documento: es del mismo origen, la ventana lo lee.
const MARCO = `${panel("lado")}?.querySelector("iframe")`;
const EN_MARCO = `${MARCO}?.contentDocument`;
const HASH_MARCO = `(${MARCO}?.contentWindow?.location.hash ?? null)`;
/** Si algún elemento de `selector` del iframe muestra `texto`. @param {string} selector @param {string} texto */
const enElMarco = (selector, texto) =>
  `[...(${EN_MARCO}?.querySelectorAll(${JSON.stringify(selector)}) ?? [])].some((x) => x.innerText.includes(${JSON.stringify(texto)}))`;
/** Lo que el arnés pone en la otra para reconocerla en cada vista. @param {{ nombre: string }} o */
const raizDe = (o) => `Raíz de ${o.nombre}`;
/** @param {{ nombre: string }} o */
const subarbolDe = (o) => `Subárbol de ${o.nombre}`;
/** @param {{ nombre: string }} o */
const personaDe = (o) => `Persona de ${o.nombre}`;

/**
 * Con la app cerrada, en la otra: su nombre en la raíz, un subárbol guardado y una persona, para reconocerla en cada vista
 * del iframe. Devuelve cuántas personas y unidades vivas tiene (lo que cuenta `lado_abrir`).
 * @param {Otra} o @returns {Promise<{ personas: number, unidades: number }>}
 */
const marcarOtra = (o) =>
  enBase(o.ruta, (c) => {
    const ahora = new Date().toISOString();
    const raiz = String(
      c.prepare("SELECT id FROM unidades WHERE parent_id IS NULL AND deleted_at IS NULL").get()?.id,
    );
    c.prepare("UPDATE unidades SET nombre = ? WHERE id = ?").run(raizDe(o), raiz);
    c.prepare(
      "INSERT INTO subarboles_guardados (id, unidad_id, nombre, orden, created_at, updated_at) VALUES (?, ?, ?, 0, ?, ?)",
    ).run(randomUUID(), raiz, subarbolDe(o), ahora, ahora);
    c.prepare(
      "UPDATE trabajadores SET nombre = ? WHERE id = (SELECT id FROM trabajadores WHERE deleted_at IS NULL ORDER BY id LIMIT 1)",
    ).run(personaDe(o));
    // Y dos puestos más en la raíz: su ficha ofrece «Ver en el organigrama» con el menú «¿Cuál puesto?».
    const persona = String(
      c.prepare("SELECT id FROM trabajadores WHERE deleted_at IS NULL ORDER BY id LIMIT 1").get()?.id,
    );
    const cargo = String(
      c.prepare("SELECT id FROM cargos WHERE deleted_at IS NULL ORDER BY id LIMIT 1").get()?.id,
    );
    for (let i = 0; i < 2; i++) {
      const puesto = randomUUID();
      c.prepare(
        "INSERT INTO puestos (id, unidad_id, cargo_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
      ).run(puesto, raiz, cargo, ahora, ahora);
      c.prepare(
        "INSERT INTO asignaciones (id, puesto_id, trabajador_id, tipo, desde, created_at, updated_at) VALUES (?, ?, ?, 'titular', '2020-01-01', ?, ?)",
      ).run(randomUUID(), puesto, persona, ahora, ahora);
    }
    const n = c
      .prepare(
        `SELECT (SELECT count(*) FROM trabajadores WHERE deleted_at IS NULL) AS personas,
          (SELECT count(*) FROM unidades WHERE deleted_at IS NULL) AS unidades`,
      )
      .get();
    return { personas: Number(n?.personas), unidades: Number(n?.unidades) };
  });

/**
 * Espera, con la otra yendo al lado, a que `condicion` (una expresión de la página) dé un valor verdadero, y lo devuelve.
 * Si antes la app pregunta por la memoria, elige «Abrir igual» y lo dice: no es un fallo. Si pasa PLAZO_LADO_MS, lanza.
 * @param {App} app @param {string} condicion @param {string} que
 * @returns {Promise<{ valor: any, conPregunta: boolean }>}
 */
async function esperarAlLado(app, condicion, que) {
  const pregunta = `[...document.querySelectorAll('[role="alertdialog"][data-state="open"]')].find((d) => d.innerText.includes(${JSON.stringify(textoEs("pestanas.sinMemoria"))}))`;
  /** @param {string} c */
  const hasta = (c) => esperar(() => app.evaluar(c), que, PLAZO_LADO_MS);
  const r = await hasta(`(${pregunta}) ? "pregunta" : (${condicion})`);
  if (r !== "pregunta") return { valor: r, conPregunta: false };
  console.log(`ver al lado: preguntó por la memoria (${que}); se eligió «Abrir igual»`);
  await app.evaluar(
    `[...(${pregunta}).querySelectorAll("button")].find((b) => b.innerText.trim() === ${JSON.stringify(textoEs("pestanas.abrirIgual"))}).click()`,
  );
  return { valor: await hasta(condicion), conPregunta: true };
}

/**
 * Por la paleta, como una persona: con el árbol en el principal, elige «Ver «nombre» al lado». Espera la medida número `n`
 * y la raíz de la otra dibujada en el iframe. Devuelve lo que midió la app, lo que tardó en verse desde el clic y si
 * preguntó por la memoria.
 * @param {App} app @param {Otra} o @param {number} n
 */
async function verAlLadoPorPaleta(app, o, n) {
  await elegirEnPaleta(app, etiquetaPaleta("verAlLado", o.nombre), o.nombre);
  const visto = `(${VER_AL_LADO}.length === ${n} && ${enElMarco(".vue-flow__node", raizDe(o))})`;
  const { valor, conPregunta } = await esperarAlLado(
    app,
    `${visto} ? Math.round(performance.now() - window.__elegida) : null`,
    `«${o.nombre}» al lado, la vez ${n}`,
  );
  return {
    app: Math.round(await app.evaluar(`${VER_AL_LADO}.at(-1).duration`)),
    pantalla: Number(valor),
    conPregunta,
  };
}

/**
 * Con la relacionada y la aparte de `medirComparacion` (dos grandes, en la misma portable): las ve al lado 3 veces cada una
 * por la paleta y lee lo que midió la app (`ver-al-lado`, desde el pedido hasta que el iframe llega a su vista, copia
 * incluida), lo que tardó en verse su raíz y lo que creció la memoria, y con eso sugiere las constantes de memoriaLado.ts.
 * Pasar de META_LADO_MS no falla: se pregunta al autor (decisión 11). Después recorre, como una persona, lo que las pruebas
 * sin DOM no alcanzan: la copia que el iframe no suelta al cargar, las escrituras que Rust rechaza, el clic y F6 entre la
 * ventana y el iframe, el menú lateral, las cuatro vistas (con el panel de una unidad, una ficha y un puesto) sin acciones
 * de editar y sin errores en la consola, «Así está bien» y «Volver a avisar» en Revisión del principal, «Quitar de al
 * lado», Ctrl+W dentro del iframe, el archivo de la otra intacto y, con la otra al lado, abrirla en el principal.
 * @param {Portable} portable @param {{ relacionada: Otra, aparte: Otra }} otras
 */
async function medirLado({ carpeta, exe, datos }, { relacionada, aparte }) {
  const previos = fallosHastaAhora();
  const tamanos = { relacionada: await marcarOtra(relacionada), aparte: await marcarOtra(aparte) };
  // El archivo de cada una y lo que hay a su lado, con su fecha. La aparte se mira después de cerrar la app; la
  // relacionada, justo antes de abrirla en el principal (desde ahí su archivo cambia con razón).
  /** @param {Otra} o */
  const huellaDe = (o) => ({ archivos: huellas(dirname(o.ruta)), mtime: statSync(o.ruta).mtimeMs });
  const antes = { relacionada: huellaDe(relacionada), aparte: huellaDe(aparte) };
  const temporales = () => readdirSync(datos).filter((n) => n.startsWith("boldo-lado-"));

  const app = await abrirApp(exe);
  let errores = erroresDeConsola().length;
  await revisarBase(app, carpeta);
  await app.enviar("Emulation.setFocusEmulationEnabled", { enabled: true });
  await verInicio(app, "Inicio de la grande, antes de ver al lado");
  await app.evaluar(`location.hash = "#/"`);
  await app.hasta(`${tarjetas("principal")} > 0`, "el árbol de la grande");
  // La vista dividida de antes vuelve con las pestañas: se cierra con la × de su encabezado.
  await app.evaluar(
    `${encabezado("lado")}?.querySelector(${JSON.stringify(`button[aria-label="${textoEs("pestanas.cerrarDivision")}"]`)})?.click()`,
  );

  await app.evaluar(`performance.clearMeasures("ver-al-lado")`);
  /** @type {{ app: number, pantalla: number, conPregunta: boolean }[]} */
  const tiempos = [];
  /** @type {{ antes: number | null, despues: number | null }[]} */
  const memorias = [];
  /** @type {{ personas: number, unidades: number }[]} */
  const medidas = [];
  const sinDialogos = `!document.querySelector('[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]')`;
  for (let i = 1; i <= 2 * VECES_LADO; i++) {
    const o = i % 2 ? relacionada : aparte;
    await app.hasta(
      `!${panel("lado")} && ${tarjetas("principal")} > 0 && ${sinDialogos}`,
      `el árbol sin dividir, antes de ver al lado ${i}`,
    );
    const antesDe = await memoria(app);
    tiempos.push(await verAlLadoPorPaleta(app, o, i));
    memorias.push({ antes: antesDe, despues: await memoria(app) });
    medidas.push(o === relacionada ? tamanos.relacionada : tamanos.aparte);
    // la cierra con la × de su pestaña, menos la última, que queda para el recorrido
    if (i < 2 * VECES_LADO)
      await app.evaluar(`document.getElementById("pestana-" + ${AL_LADO}).nextElementSibling.click()`);
  }
  const crecio = memorias.map((m) => (m.antes === null || m.despues === null ? null : m.despues - m.antes));
  const medido = crecio.some((x) => x === null) ? null : mediana(/** @type {number[]} */ (crecio));
  console.log(
    lineaMedida(
      "ver al lado",
      tiempos.map((t) => t.app),
      medido === null ? null : 0,
      medido,
    ),
  );
  console.log(
    `ver al lado, cada vez (app/pantalla): ${tiempos.map((t) => `${t.app}/${t.pantalla}`).join(", ")} ms`,
  );
  const limite = await app.evaluar(`performance.memory?.jsHeapSizeLimit ?? null`);
  console.log(
    `ver al lado, memoria en bytes (antes/después de cada vez): ${memorias.map((m) => `${m.antes}/${m.despues}`).join(", ")}; ` +
      `límite ${limite}; relacionada ${tamanos.relacionada.personas} personas y ${tamanos.relacionada.unidades} unidades, ` +
      `aparte ${tamanos.aparte.personas} y ${tamanos.aparte.unidades}`,
  );
  // el tamaño de lo que se midió: el promedio de las que se vieron al lado
  /** @param {"personas" | "unidades"} k */
  const promedio = (k) => medidas.reduce((n, m) => n + m[k], 0) / medidas.length;
  const s =
    medido === null
      ? null
      : constantesSugeridas(
          medido,
          { personas: promedio("personas"), unidades: promedio("unidades") },
          constantesActuales(),
        );
  console.log(
    s
      ? `ver al lado, constantes sugeridas (50 % sobre ${(Number(medido) / 2 ** 20).toFixed(1)} MB): ` +
          `BASE_LADO = ${s.BASE_LADO}, POR_PERSONA = ${s.POR_PERSONA}, POR_UNIDAD = ${s.POR_UNIDAD}`
      : "ver al lado, constantes sugeridas: sin medida útil",
  );
  const preguntas = tiempos.filter((t) => t.conPregunta).length;
  if (preguntas)
    console.log(
      `ver al lado: preguntó por la memoria ${preguntas} de ${2 * VECES_LADO} veces, con las constantes de ahora`,
    );
  // decisión 11: no falla; con los números en el PR se pregunta al autor
  if (Math.max(mediana(tiempos.map((t) => t.app)), mediana(tiempos.map((t) => t.pantalla))) >= META_LADO_MS)
    console.log(`ver al lado: una mediana llega a ${META_LADO_MS} ms; se pregunta al autor`);

  // El recorrido, con la aparte al lado (la última).
  const o = aparte;
  /** @type {string} */
  const idLado = await app.evaluar(AL_LADO);
  await verQue(
    app,
    `lado a lado: el encabezado de al lado dice «${o.nombre}» y Solo lectura`,
    `${encabezado("lado")}?.innerText.includes(${JSON.stringify(o.nombre)}) && ${encabezado("lado")}.innerText.includes(${JSON.stringify(textoEs("pestanas.soloLectura"))})`,
  );
  comprobar(
    "lado a lado: cargar el iframe no suelta la copia: su árbol muestra la otra y su temporal sigue en datos/",
    (await app.evaluar(enElMarco(".vue-flow__node", raizDe(o)))) && temporales().length === 1,
    { temporales: temporales(), estado: await app.evaluar(ESTADO) },
  );

  // Escribir con el id de la otra: Rust lo rechaza, desde el iframe (con el IPC que Tauri le da) y desde la ventana.
  const escritura = {
    baseId: o.id,
    versionApp: "arnes",
    sentencias: [{ sql: "INSERT INTO meta (clave, valor) VALUES ('arnes', 'lado')", params: [] }],
  };
  const desdeElMarco = await app.evaluar(
    // sin el IPC en el iframe, un error que se anota y no corta el recorrido
    `Promise.resolve().then(() => ${MARCO}.contentWindow.__TAURI_INTERNALS__.invoke("db_lote", ${JSON.stringify(escritura)}))` +
      `.then((valor) => ({ ok: true, valor }), (error) => ({ ok: false, error: error?.message ?? error }))`,
  );
  comprobar(
    "lado a lado: desde el iframe, db_lote con el id de la otra da otra_base",
    !desdeElMarco.ok && desdeElMarco.error === "otra_base",
    desdeElMarco,
  );
  const desdeLaVentana = await app.llamar("db_lote", escritura);
  comprobar(
    "lado a lado: desde la ventana, db_lote con el id de la otra da otra_base",
    !desdeLaVentana.ok && desdeLaVentana.error === "otra_base",
    desdeLaVentana,
  );

  // El foco: un clic dentro del iframe marca su panel, y F6 entra al iframe y sale de él.
  /** @param {Panel} p */
  const enfocar = async (p) => {
    await clicEn(app, encabezado(p), `el encabezado del panel ${p}`);
    await app.hasta(`${MARCADO} === "${p}" && ${FOCO_EN} === "${p}"`, `el foco en el panel ${p}`);
  };
  await enfocar("principal");
  await clicEn(app, MARCO, "el iframe de al lado");
  await verQue(
    app,
    "lado a lado: un clic dentro del iframe marca el panel de al lado",
    `${MARCADO} === "lado"`,
  );
  const enElIframe = `(${MARCADO} === "lado" && document.activeElement === ${MARCO} && ${EN_MARCO}.hasFocus())`;
  await enfocar("principal");
  await pulsar(app, "F6");
  await verQue(app, "lado a lado: F6 desde el principal lleva el foco del teclado al iframe", enElIframe);
  await pulsar(app, "F6");
  await verQue(
    app,
    "lado a lado: F6 dentro del iframe lo devuelve al principal",
    `${MARCADO} === "principal" && ${FOCO_EN} === "principal"`,
  );

  // Las cuatro vistas en el iframe, desde el menú lateral con el foco al lado: muestran la otra, sin acciones de editar.
  const hashPrincipal = await app.evaluar(`location.hash`);
  /** @param {string} ruta */
  const irAlLado = async (ruta) => {
    await enfocar("lado");
    await app.evaluar(`${entradaLateral(ruta)}.click()`);
  };
  /** @param {string} ruta */
  const enRuta = (ruta) =>
    `${HASH_MARCO} === ${JSON.stringify(`#${ruta}`)} && location.hash === ${JSON.stringify(hashPrincipal)}`;
  /** @param {string} vista @param {string[]} claves de EDITAR */
  const sinEditar = async (vista, claves) => {
    /** @type {string[]} */
    const hay = await app.evaluar(
      `[...(${EN_MARCO}?.querySelectorAll('button, select, input, [role="menuitem"]') ?? [])]
        .flatMap((b) => [
          b.getAttribute("aria-label"),
          b.innerText?.trim(),
          [...b.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join("").trim(),
        ])
        .filter((x) => ${JSON.stringify(claves.map(textoEs))}.includes(x))`,
    );
    comprobar(`lado a lado: ${vista} del iframe no muestra acciones de editar`, !hay.length, hay);
  };
  const DIALOGO = `${EN_MARCO}?.querySelector('[role="dialog"][data-state="open"]')`;
  // Un menú que se acaba de cerrar sigue siendo la capa de arriba mientras se anima y se queda con el Esc: se repite
  // mientras el diálogo siga abierto.
  /** Esc en el iframe, que cierra su diálogo. @param {string} que */
  const cerrarDialogo = (que) =>
    app.hasta(
      `!${DIALOGO} || (${EN_MARCO}.dispatchEvent(new (${MARCO}.contentWindow.KeyboardEvent)("keydown", { key: "Escape", bubbles: true })), false)`,
      que,
    );

  await irAlLado("/");
  await verQue(
    app,
    `lado a lado: el Árbol del iframe muestra «${raizDe(o)}», y el principal sigue en su vista`,
    `${enRuta("/")} && ${enElMarco(".vue-flow__node", raizDe(o))}`,
  );
  // Con una tarjeta elegida aparecen sus acciones y el panel de la unidad: la flecha, con el foco en el iframe.
  await enfocar("principal");
  await pulsar(app, "F6");
  await app.hasta(enElIframe, "el foco en el iframe");
  const vertical = await app.evaluar(`Boolean(${EN_MARCO}.querySelector(".vue-flow__handle-bottom"))`);
  await pulsar(app, vertical ? "ArrowDown" : "ArrowRight");
  await verQue(
    app,
    "lado a lado: en el Árbol del iframe, la flecha elige una tarjeta",
    `Boolean(${EN_MARCO}?.querySelector('.vue-flow__node [aria-pressed="true"]'))`,
  );
  await app.hasta(
    `Boolean(${EN_MARCO}?.querySelector("[data-panel-unidad]"))`,
    "el panel de la unidad en el iframe",
  );
  await sinEditar("el Árbol, con una tarjeta elegida y el Resumen de su unidad,", EDITAR.arbol);
  // La pestaña Puestos del panel: Reka la activa al presionar el botón.
  const pestanaPuestos = `[...(${EN_MARCO}?.querySelectorAll('[data-panel-unidad] [role="tab"]') ?? [])].find((x) => x.innerText.startsWith(${JSON.stringify(textoEs("puesto.puestos").split(" (")[0])}))`;
  await app.evaluar(
    `${pestanaPuestos}.dispatchEvent(new (${MARCO}.contentWindow.MouseEvent)("mousedown", { bubbles: true, button: 0 }))`,
  );
  await app.hasta(
    `${pestanaPuestos}?.getAttribute("aria-selected") === "true"`,
    "los Puestos de la unidad en el iframe",
  );
  await sinEditar("el panel de la unidad, en Puestos,", EDITAR.arbol);
  // El menú contextual de la tarjeta elegida, con Mayús+F10 como una persona: solo lo de leer.
  const menuMarco = `${EN_MARCO}?.querySelector('[role="menu"][data-state="open"]')`;
  await app.evaluar(`${EN_MARCO}?.querySelector('.vue-flow__node [aria-pressed="true"]')?.focus()`);
  await pulsar(app, "F10", true);
  await verQue(
    app,
    "lado a lado: Mayús+F10 en la tarjeta elegida del iframe abre su menú",
    `[...(${menuMarco}?.querySelectorAll('[role="menuitem"]') ?? [])].some((x) => x.innerText.trim() === ${JSON.stringify(textoEs("arbol.menu.abrirPanel"))})`,
  );
  await sinEditar("el menú contextual de una tarjeta", EDITAR.arbol);
  await pulsar(app, "Escape");
  await app.hasta(`!${menuMarco}`, "el menú de la tarjeta cerrado");

  await irAlLado("/arboles");
  await verQue(
    app,
    `lado a lado: Árboles del iframe muestra «${subarbolDe(o)}»`,
    `${enRuta("/arboles")} && ${EN_MARCO}.body.innerText.includes(${JSON.stringify(subarbolDe(o))})`,
  );
  await sinEditar("Árboles", EDITAR.arboles);

  await irAlLado("/directorio");
  const buscar = `${EN_MARCO}?.querySelector("[data-buscar-directorio]")`;
  await app.hasta(`${enRuta("/directorio")} && Boolean(${buscar})`, "el Directorio en el iframe");
  await app.evaluar(
    `(() => { const c = ${buscar}; c.value = ${JSON.stringify(o.nombre)}; c.dispatchEvent(new (${MARCO}.contentWindow.Event)("input", { bubbles: true })); })()`,
  );
  await verQue(
    app,
    `lado a lado: con el foco al lado, «Directorio» del menú lateral navega el iframe, que encuentra a «${personaDe(o)}»; el principal sigue en su vista`,
    `${enRuta("/directorio")} && ${EN_MARCO}.body.innerText.includes(${JSON.stringify(personaDe(o))})`,
  );
  // La ficha de esa persona, desde su fila
  const fila = `[...(${EN_MARCO}?.querySelectorAll("tbody tr") ?? [])].find((f) => f.innerText.includes(${JSON.stringify(personaDe(o))}))?.querySelector("button")`;
  await app.hasta(`Boolean(${fila})`, `la fila de «${personaDe(o)}» en el Directorio del iframe`);
  await app.evaluar(`${fila}.click()`);
  await verQue(
    app,
    `lado a lado: en el Directorio del iframe, la ficha de «${personaDe(o)}» se abre en solo lectura`,
    `Boolean(${DIALOGO}?.innerText.includes(${JSON.stringify(textoEs("ficha.descripcionSoloLectura"))}))`,
  );
  await sinEditar("la ficha de una persona, desde el Directorio,", EDITAR.ficha);
  // Con varios puestos, «Ver en el organigrama» (con su tooltip alrededor) abre «¿Cuál puesto?» junto a su botón: el menú
  // tiene lado y queda dentro de la ventana, no fuera de la pantalla. Solo se mira; Esc lo cierra.
  const ubicarConMenu = `[...(${DIALOGO}?.querySelectorAll('button[aria-haspopup="menu"]') ?? [])].find((b) => b.innerText.includes(${JSON.stringify(textoEs("ubicar.ver"))}))`;
  const menuUbicar = `[...(${EN_MARCO}?.querySelectorAll('[role="menu"][data-state="open"]') ?? [])].find((m) => m.innerText.includes(${JSON.stringify(textoEs("ubicar.cual"))}))`;
  await app.hasta(`Boolean(${ubicarConMenu})`, "«Ver en el organigrama» con menú, en la ficha del iframe");
  await app.evaluar(
    `${ubicarConMenu}.dispatchEvent(new (${MARCO}.contentWindow.KeyboardEvent)("keydown", { key: "Enter", bubbles: true }))`,
  );
  // Lo que decide es dónde queda: sin ancla, Reka no lo posiciona y lo deja corrido hacia arriba, fuera de la ventana
  // (`data-side` lo pone igual, así que no sirve para notarlo).
  await app.hasta(`Boolean(${menuUbicar})`, "el menú «¿Cuál puesto?» abierto en el iframe");
  await verQue(
    app,
    "lado a lado: en la ficha del iframe, el menú «¿Cuál puesto?» de «Ver en el organigrama» queda entero dentro de la ventana (si no, se abrió sin ancla, fuera de la pantalla)",
    `(() => { const r = ${menuUbicar}?.getBoundingClientRect(); const w = ${MARCO}.contentWindow; return Boolean(r) && r.width > 0 && r.height > 0 && r.top >= 0 && r.left >= 0 && r.bottom <= w.innerHeight && r.right <= w.innerWidth; })()`,
  );
  await app.evaluar(
    `${menuUbicar}?.dispatchEvent(new (${MARCO}.contentWindow.KeyboardEvent)("keydown", { key: "Escape", bubbles: true }))`,
  );
  await app.hasta(
    `!(${menuUbicar}) && Boolean(${DIALOGO})`,
    "el menú «¿Cuál puesto?» cerrado, con la ficha abierta",
  );
  await cerrarDialogo("la ficha cerrada");
  // El modo Árbol, sin búsqueda: parte de la raíz. Solo lee (al lado, la vista elegida ni siquiera se guarda).
  const modo = (/** @type {string} */ m) => `${EN_MARCO}?.querySelector('[data-vista-directorio="${m}"]')`;
  await app.evaluar(
    `(() => { const c = ${buscar}; c.value = ""; c.dispatchEvent(new (${MARCO}.contentWindow.Event)("input", { bubbles: true })); ${modo("arbol")}.click(); })()`,
  );
  await verQue(
    app,
    `lado a lado: el Directorio del iframe en modo Árbol muestra la raíz «${raizDe(o)}» como fila del árbol`,
    `${modo("arbol")}?.getAttribute("aria-pressed") === "true" && [...(${EN_MARCO}?.querySelectorAll('[role="treeitem"]') ?? [])].some((x) => x.innerText.includes(${JSON.stringify(raizDe(o))}))`,
  );
  await app.evaluar(`${modo("lista")}.click()`);
  await app.hasta(
    `Boolean(${EN_MARCO}?.querySelector("tbody tr"))`,
    "el Directorio del iframe de vuelta en Lista",
  );
  // Un clic de verdad, como una persona: Configuración no se ve al lado.
  await clicEn(app, entradaLateral("/configuracion"), "«Configuración» en el menú lateral");
  await verQue(
    app,
    "lado a lado: con el foco al lado, «Configuración» se abre en el principal, que queda marcado, y el iframe sigue en el Directorio",
    `location.hash === "#/configuracion" && ${MARCADO} === "principal" && ${HASH_MARCO} === "#/directorio"`,
  );
  // De vuelta en el principal (con el menú lateral contraído, Esc en él solo lo pliega)
  await clicEn(app, encabezado("principal"), "el encabezado del principal");
  await app.hasta(`${FOCO_EN} === "principal"`, "el foco en el principal, en Configuración");
  await pulsar(app, "Escape");
  await app.hasta(
    `location.hash === ${JSON.stringify(hashPrincipal)} && ${tarjetas("principal")} > 0`,
    "Configuración cerrada y el principal en su vista",
  );

  /** Sin errores en la consola desde lo último revisado. @param {string} hasta */
  const sinErrores = (hasta) => {
    const nuevos = erroresDeConsola().slice(errores);
    errores += nuevos.length;
    comprobar(
      `lado a lado: sin errores en la consola, de la ventana ni del iframe, ${hasta}`,
      !nuevos.length,
      nuevos,
    );
  };

  // «Así está bien» en Revisión del principal, que escribe en la base abierta: antes, que sea la de la portable.
  const infoApp = await app.llamar("info_app");
  if (!infoApp.ok || !dentroDe(infoApp.valor.rutaBd, datos))
    throw new Error(
      `La base abierta no está en los datos de la portable ${datos}, se aborta: ${JSON.stringify(infoApp)}`,
    );
  await enfocar("principal");
  await app.evaluar(`${entradaLateral("/revision")}.click()`);
  // Solo las secciones de «Importante» empiezan abiertas: se abre la primera de avisos, la del botón que se pulsa.
  const primeraSeccion = `${panel("principal")}?.querySelector('details[data-tipo]:not([data-tipo="reemplazos"]):not([data-tipo="marcados"])')`;
  const bien = `${primeraSeccion}?.querySelector('[data-accion="bien"]')`;
  const conAviso = await app
    .hasta(
      `location.hash === "#/revision" && (() => { const d = ${primeraSeccion}; if (d) d.open = true; return Boolean(${bien}); })()`,
      "un aviso por marcar en Revisión",
    )
    .then(
      () => true,
      () => false,
    );
  // El contador del menú: exacto en su aria-label (menú contraído) o en su texto (la insignia dice «99+» solo contraído).
  const CONTADOR = `Number(/\\d+/.exec(${entradaLateral("/revision")}?.getAttribute("aria-label") ?? ${entradaLateral("/revision")}?.textContent ?? "")?.[0] ?? 0)`;
  /** @type {number} */
  const pendientes = await app.evaluar(CONTADOR);
  comprobar(
    "lado a lado: Revisión del principal tiene un aviso pendiente para marcar «Así está bien» (la grande debe traer avisos)",
    conAviso && pendientes > 0,
    { pendientes, estado: await app.evaluar(ESTADO) },
  );
  if (conAviso) {
    const MOTIVO = "Prueba del arnés";
    await clicEn(app, bien, "«Así está bien» del primer aviso");
    const motivo = `document.getElementById("revision-motivo")`;
    await app.hasta(`Boolean(${motivo})`, "el diálogo «Así está bien»");
    await app.evaluar(
      `(() => { const c = ${motivo}; c.value = ${JSON.stringify(MOTIVO)}; c.dispatchEvent(new Event("input", { bubbles: true })); })()`,
    );
    const guardar = `${motivo}?.form.querySelector('button[type="submit"]')`;
    await app.hasta(`${guardar}?.disabled === false`, "Guardar habilitado con el motivo escrito");
    await clicEn(app, guardar, "«Guardar» del diálogo «Así está bien»");
    const marcados = `${panel("principal")}?.querySelector('[data-tipo="marcados"]')`;
    await verQue(
      app,
      `lado a lado: «Así está bien» con un motivo baja el contador del menú de ${pendientes} a ${pendientes - 1} y el aviso pasa a Marcados con «${MOTIVO}»`,
      `!${motivo} && ${CONTADOR} === ${pendientes - 1} && Boolean(${marcados}?.textContent.includes(${JSON.stringify(MOTIVO)}))`,
    );
    // Marcados empieza plegado: se abre para que su fila se vea
    await app.evaluar(`(() => { const d = ${marcados}; if (d) d.open = true; })()`);
    const volver = `[...(${marcados}?.querySelectorAll("li") ?? [])].find((f) => f.textContent.includes(${JSON.stringify(MOTIVO)}))?.querySelector('[data-accion="volver"]')`;
    await app.hasta(
      `${volver}?.getBoundingClientRect().width > 0`,
      "«Volver a avisar» a la vista en Marcados",
    );
    await clicEn(app, volver, "«Volver a avisar» del aviso marcado");
    await verQue(
      app,
      `lado a lado: «Volver a avisar» devuelve el contador del menú a ${pendientes}`,
      `${CONTADOR} === ${pendientes} && !${volver}`,
    );
    await verQue(
      app,
      "lado a lado: … y el foco no se pierde en el body (pasa a la fila siguiente, a una sección o al título)",
      `Boolean(document.activeElement) && document.activeElement !== document.body`,
    );
  }
  sinErrores("hasta recorrer sus vistas y Revisión del principal");
  await app.evaluar(`location.hash = ${JSON.stringify(hashPrincipal)}`);
  await app.hasta(
    `location.hash === ${JSON.stringify(hashPrincipal)} && ${tarjetas("principal")} > 0`,
    "el principal de vuelta en su vista",
  );

  await irAlLado("/revision");
  await verQue(
    app,
    "lado a lado: Revisión en el iframe",
    `${enRuta("/revision")} && ${enElMarco("h1", textoEs("revision.titulo"))}`,
  );
  // Un puesto vacante, desde su fila: su diálogo
  const vacante = `${EN_MARCO}?.querySelector('[data-tipo^="vacantes"] [data-accion="asignar"]')`;
  // Se abren todas sus secciones (solo «Importante» empieza abierta): la vacante puede estar en una plegada, y con sus
  // filas dibujadas, buscar acciones de editar no es en vano.
  await app.hasta(
    `(() => {
      const ds = [...(${EN_MARCO}?.querySelectorAll("details[data-tipo]") ?? [])];
      for (const d of ds) d.open = true;
      return ds.length > 0 && ds.every((d) => d.querySelector("[data-clave]")) && Boolean(${vacante});
    })()`,
    "las secciones de Revisión del iframe abiertas, con sus filas y una vacante",
  );
  const editan = await app.evaluar(
    `[...(${EN_MARCO}?.querySelectorAll('[data-accion="bien"], [data-accion="volver"], [data-accion="eliminar"], [data-accion="desactivar"]') ?? [])].map((b) => b.getAttribute("aria-label"))`,
  );
  comprobar(
    "lado a lado: Revisión del iframe no ofrece «Así está bien», «Volver a avisar», «Eliminar» ni «Desactivar»",
    !editan.length,
    editan,
  );
  await app.evaluar(`${vacante}.click()`);
  await verQue(
    app,
    "lado a lado: en Revisión del iframe, una vacante abre el diálogo de su puesto",
    `Boolean(${DIALOGO})`,
  );
  await sinEditar("el diálogo de un puesto, desde Revisión,", EDITAR.puesto);
  await cerrarDialogo("el diálogo del puesto cerrado");
  sinErrores("en Revisión del iframe y el diálogo de su puesto");

  // Quitar de al lado: la pestaña queda en la barra y la copia se suelta.
  const soltada = () =>
    esperar(async () => !temporales().length, "que se suelte la copia de al lado").then(
      () => true,
      () => false,
    );
  await clicEn(app, pestana(idLado), "la pestaña de al lado", "right");
  await app.hasta(`Boolean(${entradaDelMenu("pestanas.quitarDeAlLado")})`, "«Quitar de al lado» en su menú");
  await app.evaluar(`${entradaDelMenu("pestanas.quitarDeAlLado")}.click()`);
  await verQue(
    app,
    "lado a lado: «Quitar de al lado» cierra la vista dividida y deja la pestaña en la barra",
    `!${panel("lado")} && Boolean(${pestana(idLado)}) && !${MENU}`,
  );
  comprobar(
    "lado a lado: … y suelta la copia (no queda boldo-lado-*.db.tmp en datos/)",
    await soltada(),
    temporales(),
  );

  // De nuevo al lado, por el menú de su pestaña, y Ctrl+W dentro del iframe cierra esa pestaña, no la del principal.
  await clicEn(app, pestana(idLado), "la pestaña de la otra", "right");
  await app.hasta(`Boolean(${entradaDelMenu("pestanas.abrirAlLado")})`, "«Abrir al lado» en su menú");
  await app.evaluar(`${entradaDelMenu("pestanas.abrirAlLado")}.click()`);
  const deNuevo = await esperarAlLado(
    app,
    `${AL_LADO} === ${JSON.stringify(idLado)} && ${enElMarco("h1", textoEs("revision.titulo"))}`,
    "«Abrir al lado» por el menú de la pestaña",
  ).then(
    () => true,
    () => false,
  );
  comprobar(
    "lado a lado: «Abrir al lado» la vuelve a mostrar, en la vista donde quedó",
    deNuevo,
    deNuevo || (await app.evaluar(ESTADO)),
  );
  await enfocar("principal");
  const activa = await app.evaluar(ACTIVA);
  await pulsar(app, "F6");
  await app.hasta(enElIframe, "el foco en el iframe");
  await pulsar(app, "w", false, true);
  await verQue(
    app,
    "lado a lado: Ctrl+W dentro del iframe cierra la pestaña de al lado y no la del principal",
    `!${panel("lado")} && !${pestana(idLado)} && ${ACTIVA} === ${JSON.stringify(activa)}`,
  );
  comprobar("lado a lado: … y suelta la copia", await soltada(), temporales());

  // Lo de más riesgo: con la relacionada al lado, abrirla en el principal desde otra pestaña suya (la primera que se vio,
  // quitada de al lado). El panel de al lado pasa a ser el de la abierta, editable, y la copia se suelta. Va al final: la
  // relacionada queda abierta, y su archivo cambia desde ahí con razón.
  /** @param {string} que */
  const sinDividir = (que) =>
    app.hasta(`!${panel("lado")} && ${tarjetas("principal")} > 0 && ${sinDialogos}`, que);
  await sinDividir("el árbol sin dividir, antes de ver la relacionada al lado");
  /** @type {number} */
  const vistas = await app.evaluar(`${VER_AL_LADO}.length`);
  await verAlLadoPorPaleta(app, relacionada, vistas + 1);
  /** @type {string} */
  const primera = await app.evaluar(AL_LADO);
  await clicEn(app, pestana(primera), "la pestaña de la relacionada", "right");
  await app.hasta(
    `Boolean(${entradaDelMenu("pestanas.quitarDeAlLado")})`,
    "«Quitar de al lado» en el menú de la relacionada",
  );
  await app.evaluar(`${entradaDelMenu("pestanas.quitarDeAlLado")}.click()`);
  await sinDividir("la relacionada quitada de al lado");
  await verAlLadoPorPaleta(app, relacionada, vistas + 2);
  /** @type {string} */
  const segunda = await app.evaluar(AL_LADO);
  const relacionadaAntes = huellaDe(relacionada);
  comprobar(
    "lado a lado: mientras la relacionada estuvo al lado, su archivo no cambió (mismos bytes y fecha, nada nuevo a su lado)",
    JSON.stringify(relacionadaAntes) === JSON.stringify(antes.relacionada),
    { antes: antes.relacionada, ahora: relacionadaAntes },
  );
  // Con el foco en el principal: con el foco al lado, el clic en una pestaña la lleva al lado.
  await enfocar("principal");
  await clicEn(app, pestana(primera), "la otra pestaña de la relacionada");
  const nuevaUnidad = `[...(${panel("lado")}?.querySelectorAll("button") ?? [])].some((b) => [b.innerText.trim(), b.getAttribute("aria-label")].includes(${JSON.stringify(textoEs("arbol.nuevaUnidad"))}))`;
  await verQue(
    app,
    "lado a lado: con la relacionada al lado, abrirla en el principal deja al lado el panel editable de la abierta (sin iframe, con «Nueva unidad»)",
    `${ACTIVA} === ${JSON.stringify(primera)} && ${AL_LADO} === ${JSON.stringify(segunda)} && ` +
      `${panel("principal")}?.innerText.includes(${JSON.stringify(raizDe(relacionada))}) && !${MARCO} && ${nuevaUnidad}`,
  );
  comprobar("lado a lado: … y suelta la copia", await soltada(), temporales());

  await app.evaluar(`location.hash = "#/bienvenida"`);
  await verInicio(app, "Inicio tras ver al lado");
  sinErrores("al quitarla, volver a abrirla, cerrarla con Ctrl+W y abrir en el principal la de al lado");
  comprobar("lado a lado: la app cierra con código 0", (await app.cerrar()) === 0);
  // solo la aparte: la relacionada quedó abierta, y su carpeta cambia con razón (respaldos, bloqueo)
  const despues = huellaDe(aparte);
  comprobar(
    "lado a lado: el archivo de la aparte no cambió (mismos bytes y fecha, nada nuevo a su lado)",
    JSON.stringify(despues) === JSON.stringify(antes.aparte),
    { antes: antes.aparte, despues },
  );
  console.log(`lado a lado: ${fallosHastaAhora() === previos ? "ok" : "FALLA"}`);
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
  // la grande que siembra la comparación sirve también para dividir, y las otras dos, para verlas al lado
  const comparar = extraer(zipNueva, "comparar");
  const otras = await medirComparacion(comparar);
  await medirDivision(comparar);
  await medirLado(comparar, otras);
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
