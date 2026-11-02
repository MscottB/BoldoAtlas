// Prueba de actualización: instala la última versión publicada, le deja datos, instala la nueva encima y comprueba que la
// organización de siempre sigue siendo `boldo.db`, ahora en `organizaciones.json`. La versión publicada no conoce ese archivo.
// Solo en CI: instala BoldoAtlas, abre la app (ventana) y usa los datos reales del usuario que corre.
// Es .mjs y no .ps1 como decía el encargo: la guarda `enCI` y la lectura de SQLite ya existen en Node.
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { enCI } from "./probar-app.mjs";

const NOMBRE = "Prueba CI";
const UNIDAD = "Unidad de prueba CI";
const TIPO_GERENCIA = "00000000-0000-7000-8000-000000000001";
const RESPALDO = "boldo-20200101-0000.db";
const ESPERA_MS = 60_000;

/**
 * Lo que no se cumple tras actualizar; vacío si todo está bien.
 * @param {{ lista: any, dbId: string | null | undefined, nombre: string | null, unidades: string[], respaldo: boolean, dbIdAntes: string | null }} v
 */
export function problemas({ lista, dbId, nombre, unidades, respaldo, dbIdAntes }) {
  /** @type {string[]} */
  const mal = [];
  const orgs = Array.isArray(lista?.organizaciones) ? lista.organizaciones : [];
  if (orgs.length !== 1) mal.push(`organizaciones.json debía tener 1 entrada y tiene ${orgs.length}`);
  const [e] = orgs;
  if (e?.ruta !== "boldo.db") mal.push(`la entrada apunta a «${e?.ruta}» y debía apuntar a boldo.db`);
  if (e?.nombre !== NOMBRE) mal.push(`la entrada se llama «${e?.nombre}» y debía llamarse «${NOMBRE}»`);
  if (!dbId || e?.id !== dbId)
    mal.push(`el id de la entrada (${e?.id}) no es el db_id de boldo.db (${dbId})`);
  if (dbIdAntes && dbIdAntes !== dbId) mal.push(`el db_id cambió al actualizar: ${dbIdAntes} -> ${dbId}`);
  if (nombre !== NOMBRE) mal.push(`boldo.db perdió su nombre: «${nombre}»`);
  if (!unidades.includes(UNIDAD))
    mal.push(`boldo.db perdió su unidad (quedan: ${unidades.join(", ") || "ninguna"})`);
  if (!respaldo) mal.push(`el respaldo ${RESPALDO} ya no está`);
  return mal;
}

/** @param {number} ms */
const pausa = (ms) => new Promise((ok) => setTimeout(ok, ms));

/** @template T @param {() => Promise<T | false | null | undefined> | T | false | null | undefined} f @param {string} que @returns {Promise<T>} */
async function esperar(f, que) {
  const limite = Date.now() + ESPERA_MS;
  for (;;) {
    // la app puede tener la base a medio crear o la lista a medio escribir: un error es «todavía no»
    const r = await Promise.resolve()
      .then(f)
      .catch(() => null);
    if (r) return /** @type {T} */ (r);
    if (Date.now() > limite) throw new Error(`Pasaron ${ESPERA_MS / 1000} s esperando: ${que}`);
    await pausa(250);
  }
}

/** @param {string} exe, @param {string[]} args */
function instalar(exe, args) {
  const r = spawnSync(exe, args, { stdio: "inherit", timeout: 180_000 });
  if (r.status !== 0)
    throw new Error(`${exe} ${args.join(" ")} terminó con ${r.status ?? r.signal} ${r.error ?? ""}`);
  // por si el instalador dejó la app abierta: la base debe quedar libre
  cerrarTodo();
}

function cerrarTodo() {
  // solo en un runner de GitHub (enCI): no hay otra BoldoAtlas que cuidar
  spawnSync("taskkill", ["/IM", "boldo-atlas.exe", "/T", "/F"], { stdio: "ignore", timeout: 30_000 });
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

/** @param {import("node:sqlite").DatabaseSync} c @param {string} clave */
const meta = (c, clave) =>
  /** @type {string | null} */ (
    c.prepare("SELECT valor FROM meta WHERE clave = ?").get(clave)?.valor ?? null
  );

/** Abre la app instalada, espera lo que `listo` devuelva y la cierra con sus hijos. @template T @param {string} exe @param {() => T} listo @param {string} que */
async function abrirHasta(exe, listo, que) {
  const p = spawn(exe, [], { stdio: "ignore" });
  try {
    return await esperar(listo, que);
  } finally {
    if (p.pid) {
      try {
        execFileSync("taskkill", ["/PID", String(p.pid), "/T", "/F"], { stdio: "ignore", timeout: 15_000 });
      } catch {
        /* ya había salido */
      }
    }
    cerrarTodo();
  }
}

/** @param {string} anterior @param {string} nuevo */
async function correr(anterior, nuevo) {
  const { identifier } = JSON.parse(readFileSync(join("src-tauri", "tauri.conf.json"), "utf8"));
  const datos = join(process.env.APPDATA ?? "", identifier);
  const programa = join(process.env.LOCALAPPDATA ?? "", "BoldoAtlas", "boldo-atlas.exe");
  const bd = join(datos, "boldo.db");
  const lista = join(datos, "organizaciones.json");
  if (!process.env.APPDATA || !process.env.LOCALAPPDATA) throw new Error("Faltan APPDATA o LOCALAPPDATA");
  // un runner limpio: si ya hay datos, la prueba no sabría qué es suyo
  for (const previo of [datos, programa]) {
    if (existsSync(previo)) throw new Error(`${previo} ya existe: el runner no está limpio`);
  }
  for (const setup of [anterior, nuevo]) {
    if (!existsSync(setup)) throw new Error(`No existe el instalador ${setup}`);
  }

  console.log("1. instalar la versión publicada");
  instalar(anterior, ["/P"]);

  console.log("2. abrirla, dejar que cree su base");
  const { dbId: dbIdAntes } = await abrirHasta(programa, () => esquemaListo(bd), `${bd} con su esquema`);

  console.log("3. dejarle datos y un respaldo");
  await enBase(bd, (c) => {
    c.prepare("INSERT OR REPLACE INTO meta (clave, valor) VALUES ('org_nombre', ?)").run(NOMBRE);
    const ahora = new Date().toISOString();
    c.prepare(
      "INSERT INTO unidades (id, tipo_id, nombre, created_at, updated_at) VALUES ('11111111-1111-7111-8111-111111111111', ?, ?, ?, ?)",
    ).run(TIPO_GERENCIA, UNIDAD, ahora, ahora);
  });
  mkdirSync(join(datos, "respaldos"), { recursive: true });
  copyFileSync(bd, join(datos, "respaldos", RESPALDO));
  // la versión publicada no escribe la lista; si algún día lo hace, se borra para que la nueva deba crearla
  if (existsSync(lista)) {
    console.log("   (la versión anterior ya escribe organizaciones.json: se borra para probar la creación)");
    rmSync(lista);
  }

  console.log("4. instalar la nueva encima, como lo hace la app");
  instalar(nuevo, ["/P", "/UPDATE"]);

  console.log("5. abrirla, esperar la lista");
  const json = await abrirHasta(programa, () => JSON.parse(readFileSync(lista, "utf8")), lista);

  console.log("6. comprobar");
  const despues = await enBase(bd, (c) => ({
    dbId: meta(c, "db_id"),
    nombre: meta(c, "org_nombre"),
    unidades: c
      .prepare("SELECT nombre FROM unidades WHERE deleted_at IS NULL")
      .all()
      .map((f) => String(f.nombre)),
  }));
  const mal = problemas({
    lista: json,
    ...despues,
    respaldo: existsSync(join(datos, "respaldos", RESPALDO)),
    dbIdAntes,
  });
  console.log(
    `   db_id antes: ${dbIdAntes ?? "(la versión publicada no lo tenía)"}; lista: ${JSON.stringify(json)}`,
  );
  if (mal.length) throw new Error(mal.join("\n"));
}

/** La base ya migrada (con versión de esquema) y su db_id, si la app ya lo escribe. Falla o da null mientras no. @param {string} bd */
const esquemaListo = (bd) =>
  enBase(bd, (c) =>
    Number(c.prepare("PRAGMA user_version").get()?.user_version) ? { dbId: meta(c, "db_id") } : null,
  );

/** @param {string[]} argv */
export async function principal(argv) {
  try {
    if (!enCI(process.env) || process.platform !== "win32") {
      throw new Error("Solo en CI de Windows: instala BoldoAtlas y lo abre en una ventana.");
    }
    const [anterior, nuevo] = argv;
    if (!anterior || !nuevo)
      throw new Error("Uso: node scripts/probar-actualizacion.mjs <setup anterior> <setup nuevo>");
    await correr(anterior, nuevo);
    console.log("Actualización comprobada.");
  } catch (e) {
    console.error(`\nFALLÓ la prueba de actualización: ${e instanceof Error ? e.message : String(e)}`);
    cerrarTodoSiCI();
    process.exitCode = 1;
  }
}

function cerrarTodoSiCI() {
  if (enCI(process.env)) cerrarTodo();
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await principal(process.argv.slice(2));
  process.exit(process.exitCode ?? 0);
}
