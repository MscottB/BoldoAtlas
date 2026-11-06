// Arnés de «varias organizaciones» con el programa real: la migración desde la versión publicada, el tiempo de cambio
// entre una organización grande y una chica, y eliminar por la pantalla con el Rust de verdad. Solo desarrollo: la app no
// lo importa. Solo en CI de Windows, como la prueba de humo, de la que toma cómo abrir la app y leer su página: abre
// BoldoAtlas en una ventana, siempre una portable con sus datos en una carpeta temporal.
// Uso: node scripts/arnes-organizaciones.mjs <BoldoAtlas_windows_x64_portable.zip publicado>
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
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
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
const PLAZO_MS = 900_000;
const TIPO_GERENCIA = "00000000-0000-7000-8000-000000000001";
const UNIDAD = "0190a000-0000-7000-8000-00000000a001";
const PERSONA = "arnes-foto";
const ORG_MIGRADA = "Organización migrada";
const RESPALDO = "boldo-20200101-0000.db";
const CAMBIO = `performance.getEntriesByName("cambio-organizacion")`;

/** Lo que tenía el localStorage antes de que hubiera varias organizaciones. @param {string} rutaBd */
export const preferenciasViejas = (rutaBd) => ({
  "boldo:vista": JSON.stringify({ direccion: "horizontal" }),
  "boldo:directorio": JSON.stringify({ filtros: { texto: "arnés" } }),
  "boldo:plegado:x": "true",
  [`boldo:pestanas:${rutaBd}`]: JSON.stringify({
    lista: [
      { id: "arnes-1", ruta: "/" },
      { id: "arnes-2", ruta: "/directorio" },
    ],
    activa: "arnes-1",
  }),
});

/**
 * Qué no quedó como debe tras abrir la nueva sobre `viejas`. `ahora` es todo el localStorage.
 * @param {Record<string, string>} viejas @param {Record<string, string>} ahora @param {{ id: string, dirDatos: string }} base
 */
export function problemasDePreferencias(viejas, ahora, { id, dirDatos }) {
  /** @type {string[]} */
  const mal = [];
  /** @param {string} k */
  const json = (k) => {
    try {
      return JSON.parse(ahora[k] ?? "null");
    } catch {
      return null;
    }
  };
  for (const [k, v] of Object.entries(viejas)) if (ahora[k] !== v) mal.push(`${k} cambió: ${ahora[k]}`);
  // la app la reescribe completa al leerla: basta con que lleve lo sembrado; si la leyó antes de migrar, es la de fábrica
  const vista = `boldo:vista:${id}`;
  if (json(vista)?.direccion !== "horizontal") mal.push(`${vista} no es la sembrada: ${ahora[vista]}`);
  const directorio = `boldo:directorio:${id}`;
  if (ahora[directorio] !== viejas["boldo:directorio"])
    mal.push(`${directorio} no se copió: ${ahora[directorio]}`);
  if (`boldo:plegado:x:${id}` in ahora) mal.push("boldo:plegado:x se copió, y es por PC");
  const pestanas = `boldo:pestanas:${dirDatos}`;
  const lista = json(pestanas)?.lista;
  const cuales = Array.isArray(lista) ? lista.map((p) => `${p?.id}:${p?.org}`).join() : "";
  if (cuales !== `arnes-1:${id},arnes-2:${id}`)
    mal.push(`${pestanas} debía tener las dos, con org: ${ahora[pestanas]}`);
  return mal;
}

/** @param {number[]} xs */
export function mediana(xs) {
  const o = [...xs].sort((a, b) => a - b);
  const m = o.length >> 1;
  return o.length % 2 ? o[m] : (o[m - 1] + o[m]) / 2;
}

/** @param {string} bd @param {(c: import("node:sqlite").DatabaseSync) => any} f */
async function enBase(bd, f) {
  const { DatabaseSync } = await import("node:sqlite");
  const c = new DatabaseSync(bd);
  try {
    return f(c);
  } finally {
    c.close();
  }
}

/** Una base como las de la app, con su id y su nombre. @param {string} bd @param {string} id @param {string} nombre */
async function crearBase(bd, id, nombre) {
  mkdirSync(dirname(bd), { recursive: true });
  const carpeta = join("src-tauri", "migrations");
  const migraciones = readdirSync(carpeta).sort();
  await enBase(bd, (c) => {
    for (const m of migraciones) c.exec(readFileSync(join(carpeta, m), "utf8"));
    c.exec(`PRAGMA user_version = ${migraciones.length}`);
    ponerMeta(c, id, nombre);
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

/** La URL de la foto como la arma la app. @param {App} app @param {string} baseId @param {string} persona */
const urlFoto = (app, baseId, persona) =>
  app.evaluar(
    `window.__TAURI_INTERNALS__.convertFileSrc(${JSON.stringify(baseId)}, "foto") + "/${persona}?v=arnes"`,
  );

/**
 * La publicada con datos y las preferencias de antes; encima, el exe nuevo.
 * @param {string} zipPublicada @param {string} exeNuevo ya con el puerto abierto
 */
async function migracion(zipPublicada, exeNuevo) {
  const previos = fallosHastaAhora();
  const { carpeta, exe, datos } = extraer(zipPublicada, "migracion");
  let app = await abrirApp(exe);
  const antes = await revisarBase(app, carpeta);
  const ahora = new Date().toISOString();
  const lote = await app.llamar("db_lote", {
    baseId: antes.baseId,
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
  if (!lote.ok) throw new Error(`No se pudo sembrar la versión publicada: ${JSON.stringify(lote.error)}`);
  // La publicada ya migra al arrancar: se deja como antes de que hubiera varias organizaciones (las claves viejas, sin las
  // nuevas ni la marca) y se congela el localStorage, para que lo que escriba al cerrarse no lo cambie.
  const viejas = preferenciasViejas(antes.rutaBd);
  const sembrado = await app.evaluar(`(() => {
    const nuevas = (k) => k.endsWith(${JSON.stringify(`:${antes.baseId}`)}) ||
      k.startsWith("boldo:organizaciones:migrado:") || k === ${JSON.stringify(`boldo:pestanas:${antes.dirDatos}`)};
    for (const k of Object.keys(localStorage)) if (nuevas(k)) localStorage.removeItem(k);
    const viejas = ${JSON.stringify(viejas)};
    for (const [k, v] of Object.entries(viejas)) localStorage.setItem(k, v);
    for (const m of ["setItem", "removeItem", "clear"]) Storage.prototype[m] = () => undefined;
    localStorage.setItem("boldo:vista", "{}"); // congelado: no cambia
    return localStorage.getItem("boldo:vista") === viejas["boldo:vista"] && !Object.keys(localStorage).some(nuevas);
  })()`);
  if (!sembrado) throw new Error("No se pudo dejar el localStorage como antes de varias organizaciones");
  comprobar("migración: la publicada cierra con código 0", (await app.cerrar()) === 0);

  const respaldos = join(datos, "respaldos");
  mkdirSync(respaldos, { recursive: true });
  copyFileSync(join(datos, "boldo.db"), join(respaldos, RESPALDO));
  const respaldosAntes = huellas(respaldos);
  copyFileSync(exeNuevo, exe);

  app = await abrirApp(exe);
  const despues = await revisarBase(app, carpeta);
  comprobar(
    "migración: abre el mismo boldo.db, con su db_id",
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
    "migración: boldo.db conserva sus filas",
    f?.nombre === ORG_MIGRADA && f.unidades === 1 && f.personas === 1,
    filas,
  );
  const respaldosDespues = huellas(respaldos);
  comprobar(
    "migración: respaldos/ intacto",
    Object.entries(respaldosAntes).every(([n, h]) => respaldosDespues[n] === h),
    { respaldosAntes, respaldosDespues },
  );
  const lista = leerLista(datos);
  comprobar(
    "migración: una entrada en la lista, la de boldo.db",
    lista.organizaciones?.length === 1 &&
      lista.organizaciones[0].ruta === "boldo.db" &&
      lista.organizaciones[0].id === despues.baseId,
    lista,
  );

  // Antes de ir al árbol, que cambia la ruta de una pestaña.
  await app.hasta(
    `Boolean(document.getElementById("inicio-organizacion"))`,
    "Inicio con la organización migrada",
  );
  const almacen = await app.evaluar(`Object.fromEntries(Object.entries(localStorage))`);
  const mal = problemasDePreferencias(viejas, almacen, { id: despues.baseId, dirDatos: despues.dirDatos });
  comprobar(
    "migración: cada preferencia en …:<db_id>, la vieja igual, plegado sin copia, dos pestañas con org",
    !mal.length,
    mal,
  );
  // el orden de main.ts: si useVista leyera antes de migrar, el árbol se vería vertical
  await app.evaluar(`location.hash = "#/"`);
  await app.hasta(`Boolean(document.querySelector(".vue-flow__node"))`, "el árbol con la raíz del arnés");
  comprobar(
    "migración: el árbol se ve con la vista sembrada (horizontal)",
    await app.evaluar(
      `Boolean(document.querySelector(".vue-flow__node .vue-flow__handle-right")) && !document.querySelector(".vue-flow__node .vue-flow__handle-bottom")`,
    ),
  );

  const url = await urlFoto(app, despues.baseId, PERSONA);
  const conSuBase = await app.evaluar(cargarImagen(url));
  comprobar("migración: la foto responde con su base", conSuBase?.ancho > 0, { url, conSuBase });
  const conOtra = await app.evaluar(cargarImagen(url.replace(despues.baseId, OTRA_BASE)));
  comprobar("migración: con otra base, la foto no responde", conOtra === null, conOtra);
  comprobar("migración: la nueva cierra con código 0", (await app.cerrar()) === 0);
  console.log(`migración: ${fallosHastaAhora() === previos ? "ok" : "FALLA"}`);
}

/**
 * Elimina `o` por Configuración, como una persona: escribe el nombre que muestra el diálogo y confirma.
 * @param {App} app @param {{ id: string }} o @param {{ borrarArchivo?: boolean, copia?: boolean }} [opciones]
 */
async function eliminarPorPantalla(app, o, { borrarArchivo = false, copia = true } = {}) {
  const boton = JSON.stringify(`org-eliminar-${o.id}`);
  await app.evaluar(`location.hash = "#/configuracion"`);
  await app.hasta(
    `document.getElementById(${boton})?.disabled === false`,
    `«Eliminar» habilitado para ${o.id} en Configuración`,
  );
  await app.evaluar(`document.getElementById(${boton}).click()`);
  await app.hasta(`Boolean(document.getElementById("eliminar-org-escrito"))`, "el diálogo de eliminar");
  await app.evaluar(`(async () => {
    const dialogo = document.querySelector('[role="alertdialog"]');
    const casillas = () => [...dialogo.querySelectorAll('input[type="checkbox"]')];
    const respirar = () => new Promise((r) => setTimeout(r, 100));
    // en una externa la primera es «borrar el archivo»; la de la copia, si se ofrece, es la última y va marcada
    if (${borrarArchivo}) casillas()[0].click();
    await respirar();
    if (!${copia} && casillas().at(-1)?.checked) casillas().at(-1).click();
    const campo = document.getElementById("eliminar-org-escrito");
    campo.value = dialogo.querySelector('label[for="eliminar-org-escrito"] strong').innerText;
    campo.dispatchEvent(new Event("input", { bubbles: true }));
    await respirar();
    const confirmar = [...dialogo.querySelectorAll("button")].at(-1);
    if (confirmar.disabled) throw new Error("«Eliminar» sigue deshabilitado tras escribir «" + campo.value + "»");
    confirmar.click();
  })()`);
}

/** @param {string} ruta @param {boolean} existe @param {string} que */
const verArchivo = (ruta, existe, que) => comprobar(que, existsSync(ruta) === existe, ruta);

/**
 * Una grande (10.000 personas y 1.000 fotos) en `boldo.db`, una chica interna y dos externas: alterna entre la grande y la
 * chica y después las elimina todas por la pantalla, `boldo.db` al final.
 * @param {{ carpeta: string, exe: string, datos: string }} portable
 */
async function medicionYEliminar({ carpeta, exe, datos }) {
  const bd = join(datos, "boldo.db");
  execFileSync(process.execPath, [join("scripts", "sembrar-grande.mjs"), bd, "--fotos", String(FOTOS)], {
    stdio: "inherit",
    timeout: 300_000,
  });
  const grande = { id: randomUUID(), nombre: "" };
  grande.nombre = await enBase(bd, (c) => {
    ponerMeta(c, grande.id);
    return String(c.prepare("SELECT valor FROM meta WHERE clave = 'org_nombre'").get()?.valor);
  });
  const chica = { id: randomUUID(), nombre: "Chica del arnés" };
  const chicaRuta = `organizaciones/${chica.id}/organizacion.db`;
  const queda = {
    id: randomUUID(),
    nombre: "Externa que se queda",
    ruta: join(carpeta, "externas", "queda.db"),
  };
  const seBorra = {
    id: randomUUID(),
    nombre: "Externa que se borra",
    ruta: join(carpeta, "externas", "se-borra.db"),
  };
  await crearBase(join(datos, chicaRuta), chica.id, chica.nombre);
  for (const e of [queda, seBorra]) await crearBase(e.ruta, e.id, e.nombre);
  /** @param {object} o @param {string} ruta @param {boolean} externa @param {string} color @param {string} abierta */
  const entrada = (o, ruta, externa, color, abierta) => ({ ...o, ruta, externa, color, abierta });
  writeFileSync(
    join(datos, "organizaciones.json"),
    JSON.stringify({
      version: 1,
      organizaciones: [
        entrada(grande, "boldo.db", false, "#3b6fb5", "2026-01-04T00:00:00.000Z"), // la última abierta: abre esta
        entrada(chica, chicaRuta, false, "#2f855a", "2026-01-03T00:00:00.000Z"),
        entrada(
          { id: queda.id, nombre: queda.nombre },
          queda.ruta,
          true,
          "#b7791f",
          "2026-01-02T00:00:00.000Z",
        ),
        entrada(
          { id: seBorra.id, nombre: seBorra.nombre },
          seBorra.ruta,
          true,
          "#c05621",
          "2026-01-01T00:00:00.000Z",
        ),
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
  const otra = `document.querySelector('[role="tab"][id^="pestana-"][aria-selected="false"]')`;
  await app.evaluar(`${otra}.click()`);
  await app.hasta(`${CAMBIO}.length === 2`, "el cambio de vuelta a la grande");
  comprobar("medición: la grande vuelve a su árbol", (await app.evaluar(`location.hash`)) === "#/");
  await app.evaluar(`performance.clearMeasures("cambio-organizacion")`);
  for (let i = 1; i <= VECES; i++) {
    await app.evaluar(`${otra}.click()`);
    await app.hasta(`${CAMBIO}.length === ${i}`, `el cambio ${i} de ${VECES}`);
    await pausa(500); // lo que sigue al cambio, como leer la lista: no es parte de él
  }
  /** @type {number[]} */
  const ms = await app.evaluar(`${CAMBIO}.map((e) => Math.round(e.duration))`);
  const m = mediana(ms);
  console.log(`cambio: ${m} ms (mediana de ${VECES} entre la grande y la chica: ${ms.join(", ")} ms)`);
  comprobar(`medición: la mediana del cambio es menor a ${META_MS} ms`, m < META_MS, ms);

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

  await eliminarPorPantalla(app, seBorra, { borrarArchivo: true, copia: false });
  await fuera(seBorra);
  verArchivo(seBorra.ruta, false, "eliminar: la externa con «borrar el archivo» lo borra");
  comprobar("eliminar: sin copia no queda otra", copias().length === 1, copias());

  // boldo.db, la abierta y la última: se borra y queda uno vacío, sin listar
  await eliminarPorPantalla(app, grande);
  await esperar(
    async () => (await app.llamar("info_app")).valor?.baseId !== grande.id,
    "que la app pase al boldo.db nuevo",
  );
  const vacia = await revisarBase(app, carpeta);
  verArchivo(bd, true, "eliminar: tras boldo.db queda uno nuevo");
  comprobar("eliminar: el nuevo boldo.db tiene otro id y no está en la lista", !lista().length, {
    vacia,
    lista: lista(),
  });
  verArchivo(join(respaldos, RESPALDO), false, "eliminar: los respaldos de boldo.db se borran");
  verArchivo(join(respaldos, "notas.txt"), true, "eliminar: lo ajeno en respaldos/ se queda");
  comprobar("eliminar: de boldo.db queda una copia", copias().length === 2, copias());
  verArchivo(queda.ruta, true, "eliminar: la externa que salió de la lista sigue intacta");
  comprobar("eliminar: la app cierra con código 0", (await app.cerrar()) === 0);
  console.log(`eliminar: ${fallosHastaAhora() === previos ? "ok" : "FALLA"}`);
}

/** @param {string} zipPublicada */
async function correr(zipPublicada) {
  const a = artefactos("windows", "");
  const [zipNueva, ...otros] = globSync(`release/*/${a.zip}`);
  if (!zipNueva || otros.length)
    throw new Error(`Se esperaba un solo ${a.zip} en release/*/: ${[zipNueva, ...otros]}`);
  if (!existsSync(zipPublicada)) throw new Error(`No existe ${zipPublicada}`);
  const nueva = extraer(zipNueva, "medicion");
  await migracion(zipPublicada, nueva.exe);
  await medicionYEliminar(nueva);
  comprobarInstaladaIntacta();
  exigirSinFallos();
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const [zip] = process.argv.slice(2);
  const trabajo = zip
    ? enCiDeWindows(() => correr(zip), "Arnés comprobado.", "el arnés de organizaciones", PLAZO_MS)
    : Promise.reject(new Error("Uso: node scripts/arnes-organizaciones.mjs <portable publicada .zip>"));
  // process.exit: los hijos de WebView2 pueden seguir teniendo abiertas las tuberías un momento
  trabajo.then(
    () => process.exit(0),
    (e) => {
      if (!zip) console.error(e.message);
      process.exit(1);
    },
  );
}
