// Prueba de humo de la app real: extrae la portable de Windows ya construida, la abre y, por CDP, comprueba en su página
// el puente de Tauri (baseId, protocolo foto:, bloqueo, reabrir, segunda instancia). La app no escribe un registro propio:
// «registro» es lo que imprime el proceso más la consola de la página.
// Solo en CI: abre una ventana maximizada, y en el equipo de alguien aparecería en su pantalla.
import { execFileSync, spawn } from "node:child_process";
import { existsSync, globSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, win32 } from "node:path";
import { TAR, artefactos } from "./release.mjs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
// un id válido: el rechazo debe venir de que es otra base, no de su forma
export const OTRA_BASE = "00000000-0000-4000-8000-000000000000";
const ORGANIZACION = "Organización de humo";
const PERSONA = { id: "humo-foto", nombre: "Persona de humo" };
// PNG de 1×1
export const FOTO =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAEBgIApD5fRAAAAABJRU5ErkJggg==";
const PUERTO = 9222;
// Lo que wry pasa a WebView2 cuando la app no fija sus argumentos (wry/src/webview2/mod.rs).
const ARGUMENTOS_WRY = "--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection";
const ARGUMENTOS_HUMO = `--remote-debugging-port=${PUERTO} --remote-allow-origins=*`;
const ESPERA_ARRANQUE_MS = 8000; // ESPERA_ARRANQUE de organizaciones.rs: una segunda instancia no debe llegar a esperarla
// Antes de los 5 min del paso de CI: al vencer aquí se imprime el informe; si vence el paso, no queda nada.
const PLAZO_MS = 240_000;

/**
 * Solo un runner de GitHub: uno propio puede ser el equipo de alguien, y ahí la ventana aparecería en su pantalla.
 * @param {NodeJS.ProcessEnv} e
 */
export const enCI = (e) =>
  e.CI === "true" &&
  e.GITHUB_ACTIONS === "true" &&
  Boolean(e.RUNNER_TEMP) &&
  Boolean(e.GITHUB_RUN_ID) &&
  e.RUNNER_ENVIRONMENT === "github-hosted";

/** @param {string} ruta @param {string} carpeta */
export function dentroDe(ruta, carpeta) {
  const r = win32.relative(carpeta, ruta);
  return r !== "" && !r.startsWith("..") && !win32.isAbsolute(r);
}

/**
 * La app abre la base en `setup`, antes de que haya ventana a la que preguntarle `rutaBd`. Sin `portable.flag` abriría los
 * datos de una instalada: se comprueba antes de lanzarla.
 * @param {string} exe @param {string | undefined} temporal
 */
export function exigirPortable(exe, temporal) {
  if (!temporal || !dentroDe(exe, temporal))
    throw new Error(`${exe} no está en la carpeta temporal ${temporal}`);
  for (const falta of ["portable.flag", "datos"]) {
    if (!existsSync(join(dirname(exe), falta))) throw new Error(`Falta ${falta} junto a ${exe}: no se lanza`);
  }
}

/**
 * El exe con el puerto de depuración abierto en vez de los argumentos de wry, del mismo largo: un `&str` guarda su largo
 * aparte. WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS no sirve: wry siempre fija argumentos, y mandan sobre la variable y sobre
 * la política de WebView2 (probado en el runner: el navegador corre sin el puerto). Así se prueba el binario publicado y
 * no otro compilado aparte. Solo la copia temporal: la que se sube a Actions queda igual.
 * shortcut: depende de ese texto de wry. Si cambia, falla aquí mismo; entonces, compilar con `additionalBrowserArgs`.
 * @param {Buffer} exe @param {string} [argumentos]
 */
export function conPuertoAbierto(exe, argumentos = ARGUMENTOS_HUMO) {
  const buscado = Buffer.from(ARGUMENTOS_WRY);
  const nuevo = Buffer.from(argumentos.padEnd(buscado.length, " "));
  if (nuevo.length > buscado.length) throw new Error(`«${argumentos}» no cabe en «${ARGUMENTOS_WRY}»`);
  const primero = exe.indexOf(buscado);
  if (primero < 0 || exe.indexOf(buscado, primero + 1) >= 0) {
    throw new Error(
      `El exe debe tener una sola vez «${ARGUMENTOS_WRY}»: ¿cambió wry o se fijó additionalBrowserArgs?`,
    );
  }
  const parchado = Buffer.from(exe);
  nuevo.copy(parchado, primero);
  return parchado;
}

/** Todo proceso lanzado, para detenerlo pase lo que pase. @type {import("node:child_process").ChildProcess[]} */
const lanzados = [];
/** Lo que sirve para leer la página de la última app abierta. @type {((expresion: string) => Promise<any>) | undefined} */
let evaluarPagina;

/** @param {string} exe @param {import("node:child_process").StdioOptions} stdio */
function lanzar(exe, stdio) {
  exigirPortable(exe, process.env.RUNNER_TEMP);
  const p = spawn(exe, [], { stdio });
  lanzados.push(p);
  return p;
}

/** Solo este proceso y sus hijos; si ya salió no se hace nada: su PID puede ser ya de otro. @param {import("node:child_process").ChildProcess} p */
function detener(p) {
  if (!p.pid || p.exitCode !== null || p.signalCode !== null) return;
  try {
    execFileSync("taskkill", ["/PID", String(p.pid), "/T", "/F"], { stdio: "ignore", timeout: 15_000 });
  } catch {
    /* ya no estaba */
  }
}

/** @type {string[]} */
const registro = [];
/** @param {string} linea */
const anotar = (linea) => void registro.push(linea);
/** @type {string[]} */
const fallos = [];
/** @param {string} nombre @param {boolean} ok @param {unknown} [detalle] */
export function comprobar(nombre, ok, detalle = "") {
  console.log(`${ok ? "ok   " : "FALLA"} ${nombre}${ok ? "" : `: ${JSON.stringify(detalle)}`}`);
  if (!ok) fallos.push(nombre);
}
export const fallosHastaAhora = () => fallos.length;

/** @param {number} ms */
export const pausa = (ms) => new Promise((ok) => setTimeout(ok, ms));
/** @template T @param {() => Promise<T | false | null | undefined>} f @param {string} que @param {number} [ms] @returns {Promise<T>} */
export async function esperar(f, que, ms = 30_000) {
  const limite = Date.now() + ms;
  let ultimo = "";
  for (;;) {
    const r = await f().catch((/** @type {Error} */ e) => {
      ultimo = ` (último error: ${e.message}; causa: ${String(e.cause ?? "")})`;
      return null;
    });
    if (r) return r;
    if (Date.now() > limite) throw new Error(`Pasaron ${ms / 1000} s esperando: ${que}${ultimo}`);
    await pausa(200);
  }
}

/** Por qué no apareció la página: si hay WebView2, con qué argumentos corre y qué puertos escucha. */
function procesosDeWebview() {
  const comando = `
    $p = Get-CimInstance Win32_Process -Filter "name='msedgewebview2.exe' or name='BoldoAtlas.exe'"
    "Procesos: " + $p.Count
    $p | Where-Object { $_.CommandLine -notmatch '--type=' } | ForEach-Object { "$($_.ProcessId) $($_.CommandLine)" }
    "Puertos: " + ((Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object { $p.ProcessId -contains $_.OwningProcess } | ForEach-Object { "$($_.LocalAddress):$($_.LocalPort)/$($_.OwningProcess)" }) -join " ")
  `;
  try {
    return execFileSync("pwsh", ["-NoProfile", "-Command", comando], { encoding: "utf8", timeout: 30_000 });
  } catch (e) {
    return `(sin datos de procesos: ${String(e)})`;
  }
}

/** @param {string} url */
async function conectarCdp(url) {
  const ws = new WebSocket(url);
  await new Promise((ok, mal) => {
    ws.onopen = ok;
    ws.onerror = () => mal(new Error(`No se pudo conectar por CDP a ${url}`));
  });
  /** @type {Map<number, { ok: (v: any) => void, mal: (e: Error) => void }>} */
  const pendientes = new Map();
  let ultimo = 0;
  ws.onmessage = (m) => {
    const d = JSON.parse(String(m.data));
    if (d.id) {
      const p = pendientes.get(d.id);
      pendientes.delete(d.id);
      if (d.error) p?.mal(new Error(JSON.stringify(d.error)));
      else p?.ok(d.result);
    } else if (d.method === "Runtime.consoleAPICalled") {
      /** @type {{ value?: unknown, description?: string }[]} */
      const args = d.params.args;
      anotar(`[consola ${d.params.type}] ${args.map((a) => a.value ?? a.description).join(" ")}`);
    } else if (d.method === "Runtime.exceptionThrown") {
      const x = d.params.exceptionDetails;
      anotar(`[excepción] ${x.exception?.description ?? x.text}`);
    } else if (d.method === "Log.entryAdded") {
      const x = d.params.entry;
      anotar(`[${x.source} ${x.level}] ${x.text} ${x.url ?? ""}`);
    }
  };
  ws.onclose = () => {
    for (const p of pendientes.values()) p.mal(new Error("CDP se desconectó"));
    pendientes.clear();
  };
  /** @param {string} method @param {object} [params] @returns {Promise<any>} */
  const enviar = (method, params = {}) =>
    new Promise((ok, mal) => {
      // con el socket cerrado `send` no avisa: se esperarían los 30 s
      if (ws.readyState !== WebSocket.OPEN) return mal(new Error("CDP está desconectado"));
      const id = ++ultimo;
      pendientes.set(id, { ok, mal });
      ws.send(JSON.stringify({ id, method, params }));
      // una página colgada falla aquí, con su registro, y no por el límite del paso
      setTimeout(() => mal(new Error(`CDP no respondió a ${method} en 30 s`)), 30_000);
    });
  await enviar("Runtime.enable");
  await enviar("Log.enable");
  return { enviar };
}

/** La app abierta y lo que se le puede pedir por su página. @param {string} exe */
export async function abrirApp(exe) {
  const proceso = lanzar(exe, ["ignore", "pipe", "pipe"]);
  for (const salida of [proceso.stdout, proceso.stderr]) {
    salida?.on("data", (b) => anotar(`[proceso] ${String(b).trimEnd()}`));
  }
  let salio = false;
  /** @type {Promise<number | null>} */
  const termino = new Promise((ok, mal) => {
    proceso.once("error", mal);
    proceso.once("exit", (codigo) => {
      salio = true;
      ok(codigo);
    });
  });
  void termino.catch(() => undefined);

  /** @type {string} */
  const url = await esperar(
    async () => {
      if (salio) throw new Error(`la app salió (${proceso.exitCode}) antes de abrir la ventana`);
      /** @type {{ type: string, url: string, webSocketDebuggerUrl: string }[]} */
      const lista = await (await fetch(`http://127.0.0.1:${PUERTO}/json/list`)).json();
      const pagina = lista.find((t) => t.type === "page" && t.url.startsWith("http://tauri.localhost"));
      if (!pagina)
        throw new Error(`sin la página; hay: ${lista.map((t) => `${t.type} ${t.url}`).join(", ")}`);
      return pagina.webSocketDebuggerUrl;
    },
    `que la ventana cargue la página de la app en el puerto ${PUERTO}`,
    90_000,
  ).catch((e) => {
    anotar(
      `[diagnóstico] la app ${salio ? `salió con ${proceso.exitCode}` : "sigue viva"}\n${procesosDeWebview()}`,
    );
    throw e;
  });
  const { enviar } = await conectarCdp(url);

  /** @param {string} expression @returns {Promise<any>} */
  const evaluar = async (expression) => {
    const r = await enviar("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails)
      throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
    return r.result.value;
  };
  evaluarPagina = evaluar;
  // la página aparece en CDP antes de tener los scripts de Tauri
  await esperar(
    () => evaluar(`Boolean(window.__TAURI_INTERNALS__)`),
    "que la página tenga el puente de Tauri",
  );
  return {
    evaluar,
    vivo: () => !salio,
    /** Por el puente real, como `invoke`: `{ ok, valor }` o `{ ok: false, error }`. @param {string} comando @param {object} [args] */
    llamar: (comando, args = {}) =>
      evaluar(
        `window.__TAURI_INTERNALS__.invoke(${JSON.stringify(comando)}, ${JSON.stringify(args)})` +
          `.then((valor) => ({ ok: true, valor }), (error) => ({ ok: false, error }))`,
      ),
    /** @param {string} condicion @param {string} que */
    hasta: (condicion, que) => esperar(() => evaluar(condicion), que),
    /** Como `salir_app` en la interfaz: cierre ordenado, sin diálogos. */
    async cerrar() {
      void enviar("Runtime.evaluate", {
        expression: `void window.__TAURI_INTERNALS__.invoke("salir_app")`,
      }).catch(() => undefined);
      const codigo = await Promise.race([termino, pausa(20_000).then(() => "sigue abierta")]);
      // el perfil de WebView2 no se comparte con un proceso que se está yendo: la siguiente copia tomaría sus argumentos
      await esperar(
        () =>
          fetch(`http://127.0.0.1:${PUERTO}/json/version`).then(
            () => false,
            () => true,
          ),
        "que WebView2 termine tras cerrar la app",
      );
      return codigo;
    },
  };
}

/** @param {string} bd */
async function versionDe(bd) {
  const { DatabaseSync } = await import("node:sqlite");
  const c = new DatabaseSync(bd);
  return {
    leer: () => Number(c.prepare("PRAGMA user_version").get()?.user_version),
    /** @param {number} v */
    poner: (v) => c.exec(`PRAGMA user_version = ${v}`),
    cerrar: () => c.close(),
  };
}

/** @param {string} exe @returns {Promise<{ codigo: number | string | null, ms: number }>} */
function segundaInstancia(exe) {
  const inicio = Date.now();
  const p = lanzar(exe, "ignore");
  return new Promise((ok, mal) => {
    const plazo = setTimeout(() => {
      detener(p);
      ok({ codigo: "no salió en 30 s", ms: Date.now() - inicio });
    }, 30_000);
    p.once("error", (e) => {
      clearTimeout(plazo);
      mal(e);
    });
    p.once("exit", (codigo) => {
      clearTimeout(plazo);
      ok({ codigo, ms: Date.now() - inicio });
    });
  });
}

/** @param {{ llamar: (c: string, a?: object) => Promise<any> }} app @param {string} baseId @param {string} clave */
async function metaDe(app, baseId, clave) {
  const r = await app.llamar("db_consultar", {
    baseId,
    sql: "SELECT valor FROM meta WHERE clave = ?1",
    params: [clave],
  });
  return r.ok ? (r.valor[0]?.valor ?? null) : r;
}

/** Abre una URL en un `<img>` nuevo: `{ ancho }` si cargó, o `null` si dio error. @param {string} url */
export const cargarImagen = (url) => `new Promise((ok) => {
  const img = new Image();
  img.onload = () => ok({ ancho: img.naturalWidth });
  img.onerror = () => ok(null);
  img.src = ${JSON.stringify(url)};
})`;

/** @param {Awaited<ReturnType<typeof abrirApp>>} app @param {string} carpeta */
export async function revisarBase(app, carpeta) {
  const r = await app.llamar("info_app");
  if (!r.ok) throw new Error(`info_app falló: ${JSON.stringify(r.error)}`);
  const info = r.valor;
  if (!info.portable || !dentroDe(info.rutaBd, carpeta)) {
    throw new Error(`La base no está en la carpeta temporal ${carpeta}, se aborta: ${info.rutaBd}`);
  }
  if (info.error) throw new Error(`La app abrió con error: ${info.error}`);
  if (!UUID.test(info.baseId)) throw new Error(`baseId sin forma de UUID: ${info.baseId}`);
  return info;
}

/** @param {Awaited<ReturnType<typeof abrirApp>>} app @param {string} texto */
const verTexto = (app, texto) =>
  app.hasta(`document.body.innerText.includes(${JSON.stringify(texto)})`, `ver «${texto}» en la página`);

/** @param {string} exe @param {string} carpeta */
async function primeraApertura(exe, carpeta) {
  const bd = join(carpeta, "datos", "boldo.db");
  const app = await abrirApp(exe);
  const info = await revisarBase(app, carpeta);
  comprobar(
    "info_app: baseId UUID y rutaBd en la carpeta temporal",
    UUID.test(info.baseId) && dentroDe(info.rutaBd, carpeta),
    info,
  );

  // la organización se crea desde la interfaz: pasa por el store, cliente.ts y su baseId
  await app.hasta(`document.getElementById("bienvenida-camino-vacia")`, "la pantalla de bienvenida");
  const ventana = (comando) => app.llamar(`plugin:window|${comando}`, { label: "main" });
  await esperar(
    async () => (await ventana("is_visible")).valor && (await ventana("is_maximized")).valor,
    "la ventana a la vista y maximizada",
  );
  comprobar(
    "«Iniciando…» cargó con la CSP y se fue al montar",
    await app.evaluar(
      `!document.getElementById("arranque") && getComputedStyle(document.documentElement).backgroundColor !== "rgba(0, 0, 0, 0)"`,
    ),
  );
  await app.evaluar(`document.getElementById("bienvenida-camino-vacia").click()`);
  await app.hasta(`document.getElementById("bienvenida-org")`, "el diálogo de organización vacía");
  await app.evaluar(`(() => {
    const poner = (id, valor) => {
      const e = document.getElementById(id);
      e.value = valor;
      e.dispatchEvent(new Event("input", { bubbles: true }));
    };
    poner("bienvenida-org", ${JSON.stringify(ORGANIZACION)});
    poner("bienvenida-raiz", "Raíz de humo");
  })()`);
  await app.evaluar(`new Promise((ok) => setTimeout(ok, 100))`); // Vue habilita el botón
  await app.evaluar(`document.getElementById("bienvenida-org").form.requestSubmit()`);
  await app.hasta(`location.hash === "#/"`, "que la app entre al árbol tras crear la organización");
  await app.evaluar(`location.hash = "#/bienvenida"`);
  comprobar(
    "la organización creada desde la interfaz muestra su nombre",
    (await verTexto(app, ORGANIZACION)) === true,
  );
  const nombre = await metaDe(app, info.baseId, "org_nombre");
  comprobar("db_consultar con el baseId correcto responde", nombre === ORGANIZACION, nombre);

  const consulta = { sql: "SELECT clave FROM meta", params: [] };
  const otra = await app.llamar("db_consultar", { ...consulta, baseId: OTRA_BASE });
  comprobar("db_consultar con otro baseId da otra_base", !otra.ok && otra.error === "otra_base", otra);

  const marca = { sql: "INSERT INTO meta (clave, valor) VALUES ('humo', 'guardado')", params: [] };
  const rechazado = await app.llamar("db_lote", {
    baseId: OTRA_BASE,
    sentencias: [marca],
    versionApp: "humo",
  });
  comprobar(
    "db_lote con otro baseId da otra_base",
    !rechazado.ok && rechazado.error === "otra_base",
    rechazado,
  );
  const sinEscribir = await metaDe(app, info.baseId, "humo");
  comprobar("db_lote con otro baseId no escribe", sinEscribir === null, sinEscribir);

  const ahora = new Date().toISOString();
  const persona = {
    sql: "INSERT INTO trabajadores (id, nombre, foto_png, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?4)",
    params: [PERSONA.id, PERSONA.nombre, FOTO, ahora],
  };
  const guardado = await app.llamar("db_lote", {
    baseId: info.baseId,
    sentencias: [marca, persona],
    versionApp: "humo",
  });
  comprobar("db_lote con el baseId correcto escribe", guardado.ok, guardado);

  const bloqueo = `${bd}.bloqueo`;
  comprobar("boldo.db.bloqueo existe con la app abierta", existsSync(bloqueo));

  // Con una migración pendiente de verdad en el archivo: si la segunda instancia abriera la base, la migraría y dejaría
  // su respaldo. No depende de que la versión esté al día.
  const version = await versionDe(bd);
  const antes = version.leer();
  comprobar("la versión de la base es la que informa info_app", antes === info.versionEsquema, antes);
  await app.evaluar(`window.__humoSinRecargar = true`);
  version.poner(antes - 1);
  const segunda = await segundaInstancia(exe);
  const despues = version.leer();
  version.poner(antes);
  version.cerrar();
  comprobar(
    "la segunda instancia sale enseguida, sin esperar el bloqueo",
    segunda.codigo === 0 && segunda.ms < ESPERA_ARRANQUE_MS,
    segunda,
  );
  const respaldos = readdirSync(join(carpeta, "datos", "respaldos"));
  comprobar(
    "la segunda instancia no migra",
    despues === antes - 1 && !respaldos.some((f) => f.startsWith("antes-migracion-")),
    { despues, respaldos },
  );
  const sigue = await app.llamar("info_app");
  comprobar(
    "la primera instancia sigue igual tras la segunda",
    app.vivo() &&
      sigue.ok &&
      sigue.valor.baseId === info.baseId &&
      (await app.evaluar(`window.__humoSinRecargar === true`)) &&
      (await metaDe(app, info.baseId, "humo")) === "guardado",
    sigue,
  );

  const codigo = await app.cerrar();
  comprobar("la app cierra sola y con código 0", codigo === 0, codigo);
  comprobar("boldo.db.bloqueo sigue tras cerrar", existsSync(bloqueo));
  comprobar("el cierre es ordenado: sin boldo.db-wal", !existsSync(`${bd}-wal`));
  return info;
}

/** @param {string} exe @param {string} carpeta @param {{ baseId: string }} primera */
async function reapertura(exe, carpeta, primera) {
  const app = await abrirApp(exe);
  const info = await revisarBase(app, carpeta);
  comprobar(
    "reabrir con el bloqueo en disco funciona y conserva el baseId",
    info.baseId === primera.baseId,
    info,
  );
  comprobar("reabrir conserva la organización", (await verTexto(app, ORGANIZACION)) === true);
  const marca = await metaDe(app, info.baseId, "humo");
  comprobar("reabrir conserva lo escrito con db_lote", marca === "guardado", marca);

  // la foto tal como la pinta la app, con su `urlFoto`
  await app.evaluar(`location.hash = "#/directorio"`);
  await app.hasta(
    `[...document.querySelectorAll("tr")].some((f) => f.innerText.includes(${JSON.stringify(PERSONA.nombre)}))`,
    "la persona en el directorio",
  );
  await app.evaluar(
    `[...document.querySelectorAll("tr")].find((f) => f.innerText.includes(${JSON.stringify(PERSONA.nombre)})).click()`,
  );
  const selector = `img[src*="/${PERSONA.id}?"]`;
  /** @type {string} */
  const url = await app.hasta(
    `document.querySelector(${JSON.stringify(selector)})?.naturalWidth > 0 && document.querySelector(${JSON.stringify(selector)}).src`,
    "que la ficha muestre la foto (naturalWidth > 0)",
  );
  const ancho = await app.evaluar(`document.querySelector(${JSON.stringify(selector)}).naturalWidth`);
  comprobar("la foto de urlFoto carga en la ficha", ancho > 0, ancho);
  comprobar("urlFoto lleva el baseId", url.includes(`/${info.baseId}/${PERSONA.id}?`), url);
  const misma = await app.evaluar(cargarImagen(url));
  comprobar("la misma URL carga en un <img> nuevo", misma?.ancho > 0, misma);
  const conOtra = await app.evaluar(cargarImagen(url.replace(info.baseId, OTRA_BASE)));
  comprobar("la misma URL con otra base da fallo", conOtra === null, conOtra);

  // con un id que no está en la lista, `abrir_organizacion` no cambia nada: da `trabajo_en_curso` si la sesión está ocupada y
  // `desconocido` si no. Una recarga no corre `onUnmounted`: la suelta Rust al empezar a cargar la página.
  const nadie = "00000000-0000-7000-8000-0000000000ff";
  const preparada = await app.llamar("exportar_preparar", {
    baseId: info.baseId,
    trabajo: "humo-recarga",
    raices: null,
  });
  comprobar("exportar_preparar deja un trabajo a medias", preparada.ok, preparada);
  await app.evaluar(
    `location.hash = "#/acerca"; history.pushState(null, "", "#/ayuda"); new Promise((r) => setTimeout(r, 300))`,
  );
  const sigue = await app.llamar("abrir_organizacion", { id: nadie });
  comprobar("navegar por hash no suelta el trabajo", sigue.error?.codigo === "trabajo_en_curso", sigue);
  await app.evaluar(`window.__antes = true; void setTimeout(() => location.reload(), 0)`);
  await app.hasta(`!window.__antes && Boolean(window.__TAURI_INTERNALS__)`, "que la página recargue");
  const libre = await app.llamar("abrir_organizacion", { id: nadie });
  comprobar("recargar suelta el trabajo", libre.error?.codigo === "desconocido", libre);

  const codigo = await app.cerrar();
  comprobar("la app reabierta cierra sola y con código 0", codigo === 0, codigo);
}

async function correr() {
  const a = artefactos("windows", "");
  const [zip, ...otros] = globSync(`release/*/${a.zip}`);
  if (!zip || otros.length) throw new Error(`Se esperaba un solo ${a.zip} en release/*/: ${[zip, ...otros]}`);
  const carpeta = mkdtempSync(join(process.env.RUNNER_TEMP ?? "", "boldo-humo-"));
  execFileSync(TAR, ["-x", "-f", zip, "-C", carpeta], { timeout: 120_000 });
  const exe = join(carpeta, a.programa.nombre);
  writeFileSync(exe, conPuertoAbierto(readFileSync(exe)));
  const info = await primeraApertura(exe, carpeta);
  await reapertura(exe, carpeta, info);
  comprobarInstaladaIntacta();
  exigirSinFallos();
}

export function comprobarInstaladaIntacta() {
  const { identifier } = JSON.parse(readFileSync(join("src-tauri", "tauri.conf.json"), "utf8"));
  const instalada = join(process.env.APPDATA ?? "", identifier);
  comprobar(
    "los datos de una instalada no se tocaron",
    Boolean(process.env.APPDATA) && !existsSync(instalada),
    instalada,
  );
}

export function exigirSinFallos() {
  if (fallos.length) throw new Error(`${fallos.length} comprobaciones fallaron: ${fallos.join("; ")}`);
}

/** La prueba completa: la entrada es `probar-app-ci.mjs`. Falla sin lanzar nada si no está en un runner de GitHub. */
export const principal = () => enCiDeWindows(correr, "App comprobada.", "la prueba de humo");

/**
 * Corre `correr` solo en un runner de GitHub, con plazo, y detiene lo lanzado pase lo que pase. Si falla, imprime el texto
 * de la página y el registro. El paso de CI exige la línea `listo`: sin ella no hay verde.
 * @param {() => Promise<void>} correr @param {string} listo @param {string} que @param {number} [plazoMs]
 */
export async function enCiDeWindows(correr, listo, que, plazoMs = PLAZO_MS) {
  /** @type {NodeJS.Timeout | undefined} */
  let plazo;
  try {
    if (!enCI(process.env) || process.platform !== "win32") {
      throw new Error("Solo en CI de Windows: abre BoldoAtlas en una ventana maximizada.");
    }
    const trabajo = correr();
    // si vence el plazo y después falla, ya no hay quien lo atienda
    void trabajo.catch(() => undefined);
    await Promise.race([
      trabajo,
      new Promise((_, mal) => {
        plazo = setTimeout(() => mal(new Error(`La prueba pasó de ${plazoMs / 1000} s`)), plazoMs);
      }),
    ]);
    console.log(listo);
  } catch (e) {
    const pagina = await evaluarPagina?.(`document.body.innerText.slice(0, 800)`).catch(() => "(sin página)");
    console.error(`\nFALLÓ ${que}: ${e instanceof Error ? e.message : String(e)}`);
    console.error(`\nTexto en la página:\n${pagina ?? "(sin página)"}`);
    console.error(`\nÚltimas líneas del registro:\n${registro.slice(-40).join("\n") || "(vacío)"}`);
    throw e;
  } finally {
    clearTimeout(plazo);
    lanzados.forEach(detener);
  }
}
