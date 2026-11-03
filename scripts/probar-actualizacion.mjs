// Prueba de actualización: instala la última versión publicada, le deja datos, instala la nueva encima y comprueba que la
// organización de siempre sigue siendo `boldo.db`, en `organizaciones.json`. Si la versión publicada ya escribe ese archivo,
// debe conservarlo con lo que no se puede recrear (el color); si no, la nueva lo crea.
// Solo en CI: instala BoldoAtlas, abre la app (ventana) y usa los datos reales del usuario que corre.
// Es .mjs y no .ps1 como decía el encargo: la guarda `enCI` y la lectura de SQLite ya existen en Node.
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { enCI } from "./probar-app.mjs";

const NOMBRE = "Prueba CI";
const UNIDAD = "Unidad de prueba CI";
const TIPO_GERENCIA = "00000000-0000-7000-8000-000000000001";
const RESPALDO = "boldo-20200101-0000.db";
const ESPERA_MS = 60_000;
// de la paleta de la app y distinto del primero: la app no lo elige sola para esta organización
const COLOR_PRUEBA = "#b83280";
const ABIERTA_PRUEBA = "2000-01-01T00:00:00.000Z";

/**
 * Lo que no se cumple tras actualizar; vacío si todo está bien.
 * @param {{ lista: any, dbId: string | null | undefined, nombre: string | null, unidades: string[], respaldo: boolean, dbIdAntes: string | null, colorAntes?: string | null }} v
 */
export function problemas({ lista, dbId, nombre, unidades, respaldo, dbIdAntes, colorAntes = null }) {
  /** @type {string[]} */
  const mal = [];
  const orgs = Array.isArray(lista?.organizaciones) ? lista.organizaciones : [];
  if (orgs.length !== 1) mal.push(`organizaciones.json debía tener 1 entrada y tiene ${orgs.length}`);
  const [e] = orgs;
  if (e?.ruta !== "boldo.db") mal.push(`la entrada apunta a «${e?.ruta}» y debía apuntar a boldo.db`);
  if (e?.nombre !== NOMBRE) mal.push(`la entrada se llama «${e?.nombre}» y debía llamarse «${NOMBRE}»`);
  if (!dbId || e?.id !== dbId)
    mal.push(`el id de la entrada (${e?.id}) no es el db_id de boldo.db (${dbId})`);
  if (colorAntes && e?.color !== colorAntes)
    mal.push(`la entrada perdió su color: era ${colorAntes} y es ${e?.color}`);
  if (dbIdAntes && dbIdAntes !== dbId) mal.push(`el db_id cambió al actualizar: ${dbIdAntes} -> ${dbId}`);
  if (nombre !== NOMBRE) mal.push(`boldo.db perdió su nombre: «${nombre}»`);
  if (!unidades.includes(UNIDAD))
    mal.push(`boldo.db perdió su unidad (quedan: ${unidades.join(", ") || "ninguna"})`);
  if (!respaldo) mal.push(`el respaldo ${RESPALDO} ya no está`);
  return mal;
}

/**
 * Qué hacer con la lista que dejó la versión publicada, ya sembrados el nombre y la unidad.
 * - "crear": no hay lista; la nueva debe crearla.
 * - "reabrir": hay lista pero sin entradas (la app la escribió con la base vacía): se vuelve a abrir la publicada para que
 *   ella escriba la entrada con su formato real.
 * - "editar": una entrada; se le deja lo que un usuario habría cambiado.
 * @param {any} lista lo leído de organizaciones.json, o null si no existe
 * @returns {"crear" | "reabrir" | "editar"}
 */
export function accionSobreLista(lista) {
  if (lista === null) return "crear";
  const n = Array.isArray(lista?.organizaciones) ? lista.organizaciones.length : -1;
  if (n === 0) return "reabrir";
  if (n === 1) return "editar";
  throw new Error(`La lista de la versión publicada debía tener 0 o 1 entradas: ${JSON.stringify(lista)}`);
}

/** @param {string} ruta */
const leerLista = (ruta) => (existsSync(ruta) ? JSON.parse(readFileSync(ruta, "utf8")) : null);

/** @param {number} ms */
const pausa = (ms) => new Promise((ok) => setTimeout(ok, ms));

/** @template T @param {() => Promise<T | false | null | undefined> | T | false | null | undefined} f @param {string} que @returns {Promise<T>} */
async function esperar(f, que) {
  const limite = Date.now() + ESPERA_MS;
  let ultimo = "";
  for (;;) {
    // la app puede tener la base a medio crear o la lista a medio escribir: un error es «todavía no»
    const r = await Promise.resolve()
      .then(f)
      .catch((/** @type {Error} */ e) => {
        ultimo = ` (último error: ${e.message})`;
        return null;
      });
    if (r) return /** @type {T} */ (r);
    if (Date.now() > limite) throw new Error(`Pasaron ${ESPERA_MS / 1000} s esperando: ${que}${ultimo}`);
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

/** @param {Buffer} contenido */
const sha256 = (contenido) => createHash("sha256").update(contenido).digest("hex");

/**
 * El exe tal como lo deja el instalador NSIS: el bundler de Tauri escribe el tipo de paquete en el exe antes de empaquetarlo
 * («Patching … with bundle type information: nsis»), cambiando UNK por NSS en una constante, y deja el de `target` sin
 * cambiar. Es lo único que se espera distinto.
 * shortcut: depende de ese marcador de tauri-utils. Si cambia, falla aquí; entonces, comparar con el exe extraído del setup.
 * @param {Buffer} exe
 */
export function comoLoInstalaNsis(exe) {
  const buscado = Buffer.from("__TAURI_BUNDLE_TYPE_VAR_UNK");
  const primero = exe.indexOf(buscado);
  if (primero < 0 || exe.indexOf(buscado, primero + 1) >= 0)
    throw new Error(
      "El exe compilado debe tener una sola vez __TAURI_BUNDLE_TYPE_VAR_UNK: ¿cambió tauri-utils?",
    );
  const parchado = Buffer.from(exe);
  parchado.write("NSS", primero + buscado.length - 3);
  return parchado;
}

/** Dónde difieren dos archivos, para el mensaje de un fallo. @param {Buffer} a @param {Buffer} b */
function diferencias(a, b) {
  /** @type {number[]} */
  const donde = [];
  for (let i = 0; i < Math.min(a.length, b.length) && donde.length < 5; i++) if (a[i] !== b[i]) donde.push(i);
  return `tamaños ${a.length} y ${b.length}; primeras diferencias en ${donde.join(", ") || "(ninguna: solo el largo)"}`;
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
    return await Promise.race([
      esperar(listo, que),
      new Promise((_, mal) =>
        p.once("error", (e) => mal(new Error(`No se pudo abrir ${exe}: ${e.message}`))),
      ),
    ]);
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

/** @param {string} anterior @param {string} nuevo @param {string} compilado el boldo-atlas.exe compilado para `nuevo` */
async function correr(anterior, nuevo, compilado) {
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
  for (const setup of [anterior, nuevo, compilado]) {
    if (!existsSync(setup)) throw new Error(`No existe ${setup}`);
  }

  console.log("1. instalar la versión publicada");
  instalar(anterior, ["/P"]);
  const compiladoBytes = readFileSync(compilado);
  const esperado = comoLoInstalaNsis(compiladoBytes);
  const exeCompilado = sha256(esperado);
  if (!existsSync(programa)) throw new Error(`El instalador publicado no dejó ${programa}`);
  const exeAntes = sha256(readFileSync(programa));
  console.log(`   exe instalado: sha256 ${exeAntes}`);
  if (exeAntes === exeCompilado)
    throw new Error("La versión publicada es idéntica a la compilada: no se probaría ninguna actualización");

  console.log("2. abrirla, dejar que cree su base");
  const { dbId: dbIdAntes, version: versionAntes } = await abrirHasta(
    programa,
    () => esquemaListo(bd),
    `${bd} con su esquema`,
  );

  console.log("3. dejarle datos y un respaldo");
  await enBase(bd, (c) => {
    try {
      c.prepare("INSERT OR REPLACE INTO meta (clave, valor) VALUES ('org_nombre', ?)").run(NOMBRE);
      const ahora = new Date().toISOString();
      c.prepare(
        "INSERT INTO unidades (id, tipo_id, nombre, created_at, updated_at) VALUES ('11111111-1111-7111-8111-111111111111', ?, ?, ?, ?)",
      ).run(TIPO_GERENCIA, UNIDAD, ahora, ahora);
    } catch (e) {
      throw new Error(
        `No se pudo sembrar la versión publicada (¿cambió el esquema de meta o unidades? ajusta este script): ${e instanceof Error ? e.message : e}`,
      );
    }
  });
  mkdirSync(join(datos, "respaldos"), { recursive: true });
  copyFileSync(bd, join(datos, "respaldos", RESPALDO));
  // Si la versión publicada ya escribe la lista, la actualización debe conservarla: se le deja lo que un usuario habría
  // cambiado (nombre y color) y se exige después. Si no la escribe, la nueva debe crearla.
  /** @type {string | null} */
  let colorAntes = null;
  let previa = leerLista(lista);
  const listaAntes = previa !== null;
  if (accionSobreLista(previa) === "reabrir") {
    console.log(
      "   la lista de la versión publicada está vacía: se abre de nuevo para que escriba la entrada",
    );
    previa = await abrirHasta(
      programa,
      () => {
        const j = leerLista(lista);
        return j?.organizaciones?.length === 1 ? j : null;
      },
      `${lista} con 1 entrada`,
    );
  }
  if (listaAntes) {
    Object.assign(previa.organizaciones[0], { nombre: NOMBRE, color: COLOR_PRUEBA, abierta: ABIERTA_PRUEBA });
    writeFileSync(lista, JSON.stringify(previa));
    colorAntes = COLOR_PRUEBA;
    console.log("   la versión publicada ya escribe organizaciones.json: debe conservarlo");
  } else {
    console.log("   la versión publicada no escribe organizaciones.json: la nueva debe crearlo");
  }

  // como el actualizador de la app (que pasa también /R); aquí la app se abre a mano en el paso siguiente
  console.log("4. instalar la nueva encima");
  instalar(nuevo, ["/P", "/UPDATE"]);
  const instalado = readFileSync(programa);
  const exeDespues = sha256(instalado);
  console.log(
    `   exe instalado: sha256 ${exeDespues}; el compilado en este trabajo, con el tipo de paquete nsis: ${exeCompilado} (sin él: ${sha256(compiladoBytes)})`,
  );
  if (exeDespues === exeAntes) throw new Error("/UPDATE terminó sin reemplazar boldo-atlas.exe");
  if (exeDespues !== exeCompilado)
    throw new Error(
      `El boldo-atlas.exe instalado no es el compilado en este trabajo (¿cambió el parche de tauri-utils, que comoLoInstalaNsis imita?): ${diferencias(instalado, esperado)}`,
    );

  console.log("5. abrirla, esperar la lista");
  // con una lista previa ya hay archivo antes de que la nueva abra: se espera a que anote la apertura
  const json = await abrirHasta(
    programa,
    () => {
      const j = JSON.parse(readFileSync(lista, "utf8"));
      return !listaAntes || j.organizaciones?.[0]?.abierta !== ABIERTA_PRUEBA ? j : null;
    },
    lista,
  );

  console.log("6. comprobar");
  const despues = await enBase(bd, (c) => ({
    dbId: meta(c, "db_id"),
    nombre: meta(c, "org_nombre"),
    version: Number(c.prepare("PRAGMA user_version").get()?.user_version),
    unidades: c
      .prepare("SELECT nombre FROM unidades WHERE deleted_at IS NULL")
      .all()
      .map((f) => String(f.nombre)),
  }));
  const { version: versionDespues, ...base } = despues;
  const mal = problemas({
    lista: json,
    ...base,
    respaldo: existsSync(join(datos, "respaldos", RESPALDO)),
    dbIdAntes,
    colorAntes,
  });
  console.log(`   user_version: ${versionAntes} -> ${versionDespues}`);
  console.log(
    `   db_id antes: ${dbIdAntes ?? "(la versión publicada no lo tenía)"}; lista: ${JSON.stringify(json)}`,
  );
  if (mal.length) throw new Error(mal.join("\n"));
}

/** La base ya migrada (con versión de esquema) y su db_id, si la app ya lo escribe. Falla o da null mientras no. @param {string} bd */
const esquemaListo = (bd) =>
  enBase(bd, (c) => {
    const version = Number(c.prepare("PRAGMA user_version").get()?.user_version);
    return version ? { dbId: meta(c, "db_id"), version } : null;
  });

/** El código de salida. @param {string[]} argv */
export async function principal(argv) {
  try {
    if (!enCI(process.env) || process.platform !== "win32") {
      throw new Error("Solo en CI de Windows: instala BoldoAtlas y lo abre en una ventana.");
    }
    const [anterior, nuevo, compilado] = argv;
    if (!anterior || !nuevo || !compilado)
      throw new Error(
        "Uso: node scripts/probar-actualizacion.mjs <setup anterior> <setup nuevo> <boldo-atlas.exe compilado>",
      );
    await correr(anterior, nuevo, compilado);
    console.log("Actualización comprobada.");
  } catch (e) {
    console.error(`\nFALLÓ la prueba de actualización: ${e instanceof Error ? e.message : String(e)}`);
    cerrarTodoSiCI();
    return 1;
  }
  return 0;
}

function cerrarTodoSiCI() {
  if (enCI(process.env)) cerrarTodo();
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  process.exit(await principal(process.argv.slice(2)));
}
