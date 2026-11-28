// Prueba de humo de la app real: extrae la portable de Windows ya construida, la abre y, por CDP, comprueba en su página
// el puente de Tauri (baseId, bloqueo, reabrir, segunda instancia, fotos que solo la web guarda). La app no escribe un registro propio:
// «registro» es lo que imprime el proceso más la consola de la página.
// Solo en CI: abre una ventana maximizada, y en el equipo de alguien aparecería en su pantalla.
import { execFileSync, spawn } from "node:child_process";
import {
  existsSync,
  globSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, win32 } from "node:path";
import { pathToFileURL } from "node:url";
import { TAR, artefactos } from "./release.mjs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
// un id válido: el rechazo debe venir de que es otra base, no de su forma
export const OTRA_BASE = "00000000-0000-4000-8000-000000000000";
const ORGANIZACION = "Organización de humo";
const RAIZ = "Raíz de humo";
const RAIZ_NUEVA = "Raíz renombrada";
const PERSONA = { id: "humo-persona", nombre: "Persona de humo" };
// El nombre que el visor debe mostrar como texto: si se leyera como HTML, cerraría el bloque y correría el onerror.
const NOMBRE_XSS = `</script><img src=x onerror="window.__xss=1">`;
// PNG de 1×1: la foto que el paso de las fotos siembra con la app cerrada
const FOTO =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAEBgIApD5fRAAAAABJRU5ErkJggg==";
const PUERTO = 9222;
// Lo que wry pasa a WebView2 cuando la app no fija sus argumentos (wry/src/webview2/mod.rs).
const ARGUMENTOS_WRY = "--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection";
const ARGUMENTOS_HUMO = `--remote-debugging-port=${PUERTO} --remote-allow-origins=*`;
const ESPERA_ARRANQUE_MS = 8000; // ESPERA_ARRANQUE de organizaciones.rs: una segunda instancia no debe llegar a esperarla
// Antes de los 5 min del paso de CI: al vencer aquí se imprime el informe; si vence el paso, no queda nada.
const PLAZO_MS = 270_000;

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

/** @param {string} exe @param {import("node:child_process").StdioOptions} stdio @param {NodeJS.ProcessEnv} [env] */
function lanzar(exe, stdio, env = {}) {
  exigirPortable(exe, process.env.RUNNER_TEMP);
  const p = spawn(exe, [], { stdio, env: { ...process.env, ...env } });
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
/**
 * Una línea del registro que es un error de la página, de cualquiera de sus marcos: de la consola, una excepción o del
 * navegador (`Log`). No los avisos ni la salida del proceso.
 * @param {string} linea
 */
export const esErrorDeConsola = (linea) => /^\[(?:excepción|\S+ error)\]/.test(linea);
/** Los errores de la página anotados hasta ahora, en orden. */
export const erroresDeConsola = () => registro.filter(esErrorDeConsola);
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

/**
 * `alEvento` recibe cada evento de CDP (lo que no es una respuesta), además de lo que se anota.
 * @param {string} url @param {(metodo: string, params: any) => void} [alEvento]
 */
async function conectarCdp(url, alEvento) {
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
    if (!d.id) alEvento?.(d.method, d.params);
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

/** La app abierta y lo que se le puede pedir por su página. @param {string} exe @param {NodeJS.ProcessEnv} [env] */
export async function abrirApp(exe, env) {
  const proceso = lanzar(exe, ["ignore", "pipe", "pipe"], env);
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
    /** Un comando de CDP tal cual, como `Page.captureScreenshot`. */
    enviar,
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
    poner("bienvenida-raiz", ${JSON.stringify(RAIZ)});
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
    sql: "INSERT INTO trabajadores (id, nombre, created_at, updated_at) VALUES (?1, ?2, ?3, ?3)",
    params: [PERSONA.id, PERSONA.nombre, ahora],
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

  await app.evaluar(`location.hash = "#/directorio"`);
  await app.hasta(
    `[...document.querySelectorAll("tr")].some((f) => f.innerText.includes(${JSON.stringify(PERSONA.nombre)}))`,
    "la persona en el directorio",
  );

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

/** Una tecla con Ctrl, como la pulsa quien usa la app: llega a `window` por el cuerpo de la página. @param {string} tecla */
const conCtrl = (tecla) =>
  `document.body.dispatchEvent(new KeyboardEvent("keydown", { key: ${JSON.stringify(tecla)}, ctrlKey: true, bubbles: true, cancelable: true }))`;

/** Al abrir, la app muestra Inicio, que no atiende atajos: se pasa al árbol. @param {Awaited<ReturnType<typeof abrirApp>>} app */
const alArbol = async (app) => {
  // recién abierta, la app puede pasar a Inicio después de que pedimos el árbol: se vuelve a pedir mientras espera
  await app.hasta(
    `(location.hash === "#/" || ((location.hash = "#/"), false)) && !!document.querySelector(".vue-flow")`,
    "que la app muestre el árbol",
  );
};

/** El botón con ese `data-accion`, como expresión para la página. @param {string} a */
const por = (a) => `document.querySelector('[data-accion="${a}"]')`;

/**
 * Pulsa el botón con ese `data-accion` recién cuando está habilitado: el archivo aparece antes de que la ventana suelte
 * `ocupado`. @param {Awaited<ReturnType<typeof abrirApp>>} app
 */
const clicEn = (app) => async (/** @type {string} */ a) => {
  await app.hasta(
    `(() => { const e = ${por(a)}; return Boolean(e) && !e.matches(":disabled"); })()`,
    `el botón ${a}`,
  );
  await app.evaluar(`${por(a)}.click()`);
};

/**
 * Deshacer y rehacer que sobreviven a cerrar la app: se renombra una unidad, Ctrl+Z devuelve el nombre anterior y, ya con
 * la app cerrada y vuelta a abrir, Ctrl+Y vuelve a poner el nuevo. `revisarBase` comprueba `rutaBd` antes de cada escritura.
 * @param {string} exe @param {string} carpeta
 */
async function historialPersistente(exe, carpeta) {
  const nombreDe = (/** @type {Awaited<ReturnType<typeof abrirApp>>} */ app, /** @type {string} */ baseId) =>
    app
      .llamar("db_consultar", {
        baseId,
        sql: "SELECT nombre FROM unidades WHERE nombre IN (?1, ?2)",
        params: [RAIZ, RAIZ_NUEVA],
      })
      .then((r) => (r.ok ? (r.valor[0]?.nombre ?? null) : null));

  let app = await abrirApp(exe);
  let info = await revisarBase(app, carpeta);
  const hasta = (/** @type {string} */ esperado, /** @type {string} */ que) =>
    esperar(async () => (await nombreDe(app, info.baseId)) === esperado, que);
  await verTexto(app, ORGANIZACION);
  const renombrado = await app.llamar("db_lote", {
    baseId: info.baseId,
    sentencias: [
      {
        sql: "UPDATE unidades SET nombre = ?1, updated_at = ?2 WHERE nombre = ?3",
        params: [RAIZ_NUEVA, new Date().toISOString(), RAIZ],
      },
    ],
    versionApp: "humo",
  });
  comprobar(
    "renombrar una unidad queda en el historial",
    renombrado.ok && typeof renombrado.valor === "string",
    renombrado,
  );

  await alArbol(app);
  await app.evaluar(conCtrl("z"));
  await hasta(RAIZ, "que Ctrl+Z devuelva el nombre anterior").then(
    () => comprobar("Ctrl+Z devuelve el nombre anterior", true),
    async (e) =>
      comprobar(
        "Ctrl+Z devuelve el nombre anterior",
        false,
        `${e.message}; ruta ${await app.evaluar("location.hash")}; avisos: ${await app.evaluar(
          `[...document.querySelectorAll("[data-sonner-toast]")].map((t) => t.innerText).join(" | ")`,
        )}`,
      ),
  );
  comprobar("la app cierra sola y con código 0 antes de rehacer", (await app.cerrar()) === 0);

  // otra apertura de verdad: lo deshecho tiene que seguir en la base
  app = await abrirApp(exe);
  info = await revisarBase(app, carpeta);
  await verTexto(app, ORGANIZACION);
  // si no, Ctrl+Y «pasaría» sin hacer nada
  comprobar("tras reabrir la app sigue el nombre deshecho", (await nombreDe(app, info.baseId)) === RAIZ);
  await alArbol(app);
  await app.evaluar(conCtrl("y"));
  await hasta(RAIZ_NUEVA, "que Ctrl+Y, tras reabrir la app, vuelva a poner el nombre nuevo").then(
    () => comprobar("Ctrl+Y tras cerrar y abrir la app vuelve a poner el nombre nuevo", true),
    (e) => comprobar("Ctrl+Y tras cerrar y abrir la app vuelve a poner el nombre nuevo", false, e.message),
  );
  comprobar("la app del historial cierra sola y con código 0", (await app.cerrar()) === 0);
}

/**
 * «Volver a este punto» en la vista Historial: tres cambios seguidos, se vuelve al primero y los dos siguientes quedan
 * deshechos. Sigue a `historialPersistente`, que deja la raíz con `RAIZ_NUEVA`. `revisarBase` comprueba `rutaBd` antes de
 * cada escritura.
 * @param {string} exe @param {string} carpeta
 */
async function historialVolverAPunto(exe, carpeta) {
  const nombres = ["Raíz uno", "Raíz dos", "Raíz tres"];
  const app = await abrirApp(exe);
  const info = await revisarBase(app, carpeta);
  await verTexto(app, ORGANIZACION);
  /** @type {string[]} */
  const acciones = [];
  let antes = RAIZ_NUEVA;
  for (const nombre of nombres) {
    await revisarBase(app, carpeta);
    const r = await app.llamar("db_lote", {
      baseId: info.baseId,
      sentencias: [
        {
          sql: "UPDATE unidades SET nombre = ?1, updated_at = ?2 WHERE nombre = ?3",
          params: [nombre, new Date().toISOString(), antes],
        },
      ],
      versionApp: "humo",
    });
    comprobar(`renombrar a «${nombre}» queda en el historial`, r.ok && typeof r.valor === "string", r);
    acciones.push(r.valor);
    antes = nombre;
  }

  const fila = `[data-accion=${JSON.stringify(acciones[0])}]`;
  const clic = (/** @type {string} */ selector) =>
    app.evaluar(`document.querySelector(${JSON.stringify(selector)}).click()`);
  const hayUno = (/** @type {string} */ selector, /** @type {string} */ que) =>
    app.hasta(`!!document.querySelector(${JSON.stringify(selector)})`, que);
  await revisarBase(app, carpeta);
  // por el árbol, como los otros pasos: el store queda cargado y «Volver a este punto» no se rechaza con `sinCargar`
  await alArbol(app);
  await app.evaluar(`location.hash = "#/historial"`);
  await hayUno(fila, "el primero de los tres cambios en el Historial");
  await clic(`${fila} > button`);
  await hayUno(`${fila} [data-volver]`, "«Volver a este punto» en su detalle");
  await clic(`${fila} [data-volver]`);
  await hayUno("[data-confirmar]", "el diálogo que confirma cuántos deshace");
  await clic("[data-confirmar]");

  const estados = () =>
    app
      .llamar("db_consultar", {
        baseId: info.baseId,
        sql: "SELECT estado FROM historial_acciones WHERE id IN (?1, ?2, ?3) ORDER BY id",
        params: acciones,
      })
      .then((r) => (r.ok ? r.valor.map((/** @type {{ estado: string }} */ f) => f.estado).join() : null));
  await esperar(
    async () => (await estados()) === "hecha,deshecha,deshecha",
    "que los dos cambios siguientes queden deshechos",
  ).then(
    () => comprobar("«Volver a este punto» deshace los dos cambios siguientes", true),
    async (e) =>
      comprobar(
        "«Volver a este punto» deshace los dos cambios siguientes",
        false,
        `${e.message}; ${await estados()}`,
      ),
  );
  const nombre = await app.llamar("db_consultar", {
    baseId: info.baseId,
    sql: "SELECT nombre FROM unidades WHERE nombre IN (?1, ?2, ?3)",
    params: nombres,
  });
  comprobar(
    "la raíz vuelve al nombre del primer cambio",
    nombre.ok && nombre.valor[0]?.nombre === nombres[0],
    nombre,
  );
  await revisarBase(app, carpeta);
  comprobar("la app de volver a un punto cierra sola y con código 0", (await app.cerrar()) === 0);
}

/**
 * La app de escritorio no guarda fotos: si una base las trae, un aviso ofrece quitarlas. Con la app cerrada se siembra una
 * en la base de prueba (la ruta ya la comprobó `revisarBase`, y aquí se vuelve a exigir dentro de la carpeta temporal),
 * y al abrir hay que ver el aviso, pulsar «Quitar las fotos ahora» y terminar sin fotos. Va al final: ningún otro paso
 * parte de una base con fotos, así que el aviso no estorba a los demás.
 * @param {string} exe @param {string} carpeta @param {{ rutaBd: string, baseId: string }} info
 */
async function fotosSoloEnLaWeb(exe, carpeta, info) {
  if (!dentroDe(info.rutaBd, carpeta))
    throw new Error(`La base no está en la carpeta temporal: ${info.rutaBd}`);
  const { DatabaseSync } = await import("node:sqlite");
  const conBase = (/** @type {(c: import("node:sqlite").DatabaseSync) => any} */ f) => {
    const c = new DatabaseSync(info.rutaBd);
    try {
      return f(c);
    } finally {
      c.close();
    }
  };
  const conFoto = () =>
    conBase((c) => c.prepare("SELECT count(*) AS n FROM trabajadores WHERE foto_png IS NOT NULL").get()?.n);
  conBase((c) => c.prepare("UPDATE trabajadores SET foto_png = ?1 WHERE id = ?2").run(FOTO, PERSONA.id));
  comprobar("la foto sembrada con la app cerrada está en la base", conFoto() === 1, conFoto());

  const app = await abrirApp(exe);
  const abierta = await revisarBase(app, carpeta);
  comprobar("la base de las fotos es la misma", abierta.rutaBd === info.rutaBd, abierta.rutaBd);
  // por atributo y no por texto: el idioma de la interfaz sale del sistema
  const boton = `document.querySelector('[data-accion="quitar-fotos"]')`;
  const avisa = await app.hasta(`Boolean(${boton})`, "el aviso para quitar las fotos");
  comprobar("la app avisa de las fotos al abrir", avisa === true, avisa);
  await app.evaluar(`${boton}.click()`);
  await app.hasta(
    `window.__TAURI_INTERNALS__.invoke("fotos_pendientes").then((p) => p.organizaciones.length === 0 && p.respaldos === 0)`,
    "que fotos_pendientes dé cero",
  );
  const pendientes = await app.llamar("fotos_pendientes");
  comprobar(
    "tras quitarlas no queda ninguna pendiente",
    pendientes.ok && pendientes.valor.organizaciones.length === 0 && pendientes.valor.respaldos === 0,
    pendientes,
  );

  const lote = await app.llamar("db_lote", {
    baseId: abierta.baseId,
    sentencias: [{ sql: "UPDATE trabajadores SET foto_png = ?1 WHERE id = ?2", params: [FOTO, PERSONA.id] }],
    versionApp: "humo",
  });
  comprobar(
    "db_lote con foto_png da foto_no_permitida",
    !lote.ok && lote.error === "foto_no_permitida",
    lote,
  );

  const codigo = await app.cerrar();
  comprobar("la app de las fotos cierra sola y con código 0", codigo === 0, codigo);
  const quedan = conFoto();
  const personas = conBase((c) => c.prepare("SELECT count(*) AS n FROM trabajadores").get()?.n);
  comprobar("foto_png es NULL en todas las personas", quedan === 0 && personas > 0, { quedan, personas });
}

/**
 * Exportar el organigrama como imagen. El «Guardar como» nativo no se maneja desde aquí: la app lo salta solo si el
 * arnés la lanza con `BOLDO_GUARDAR_EN` y esa carpeta existe dentro de `datos/` de la portable (excel.rs).
 * Con la app abierta se siembra la persona como jefa de la raíz (cargo, puesto, titular vigente). Después, con la app
 * vuelta a abrir, se guarda: Presentación (lleva a la persona), Estructura (no la lleva, sí la raíz), un PNG y un PDF.
 * Todo por atributo `data-accion`: la interfaz sale en inglés. `revisarBase` comprueba `rutaBd` antes de cada escritura.
 * @param {string} exe @param {string} carpeta
 */
async function exportarImagen(exe, carpeta) {
  const destino = join(carpeta, "datos", "imagenes-humo");
  mkdirSync(destino, { recursive: true });

  let app = await abrirApp(exe);
  const info = await revisarBase(app, carpeta);
  const raiz = await app.llamar("db_consultar", {
    baseId: info.baseId,
    sql: "SELECT id, nombre FROM unidades WHERE parent_id IS NULL AND deleted_at IS NULL LIMIT 1",
    params: [],
  });
  const unidad = raiz.ok ? raiz.valor[0] : undefined;
  comprobar("la raíz sembrada se puede leer", Boolean(unidad), raiz);
  if (!unidad) throw new Error("sin raíz: no se puede sembrar el puesto");
  const t = new Date().toISOString();
  const ids = { cargo: "humo-cargo", puesto: "humo-puesto", asignacion: "humo-asignacion" };
  const lote = await app.llamar("db_lote", {
    baseId: info.baseId,
    versionApp: "humo",
    sentencias: [
      {
        sql: "INSERT INTO cargos (id, nombre, created_at, updated_at) VALUES (?1, 'Cargo de humo', ?2, ?2)",
        params: [ids.cargo, t],
      },
      {
        sql: "INSERT INTO puestos (id, unidad_id, cargo_id, orden, created_at, updated_at) VALUES (?1, ?2, ?3, 0, ?4, ?4)",
        params: [ids.puesto, unidad.id, ids.cargo, t],
      },
      {
        sql: `INSERT INTO asignaciones (id, puesto_id, trabajador_id, tipo, desde, hasta, created_at, updated_at)
              VALUES (?1, ?2, ?3, 'titular', '2020-01-01', NULL, ?4, ?4)`,
        params: [ids.asignacion, ids.puesto, PERSONA.id, t],
      },
      {
        sql: "UPDATE unidades SET jefe_puesto_id = ?1, updated_at = ?3 WHERE id = ?2",
        params: [ids.puesto, unidad.id, t],
      },
    ],
  });
  comprobar("se sembró la jefatura de la raíz con la persona de humo", lote.ok, lote);
  comprobar("la app de la siembra cierra sola y con código 0", (await app.cerrar()) === 0);

  app = await abrirApp(exe, { BOLDO_GUARDAR_EN: destino });
  await revisarBase(app, carpeta);
  try {
    await alArbol(app);
    const clic = clicEn(app);
    await clic("abrir-imagen-barra");
    await app.hasta(`Boolean(document.querySelector("[data-dialogo-imagen]"))`, "el diálogo de la imagen");
    const guardar = async (
      /** @type {string} */ nivel,
      /** @type {string} */ formato,
      /** @type {string[]} */ opciones = [],
    ) => {
      await clic(`nivel-${nivel}`);
      await clic(`formato-${formato}`);
      for (const o of opciones) await clic(o);
      await clic("guardar-imagen");
      // el aviso de «queda sin cifrar» sale en cada exportación
      await esperar(async () => {
        if (await app.evaluar(`Boolean(${por("aceptar-aviso-imagen")})`)) {
          await app.evaluar(`${por("aceptar-aviso-imagen")}.click()`);
        }
        return readdirSync(destino).some((f) => f.includes(`_${nivel}`) && f.endsWith(`.${formato}`));
      }, `el archivo de ${nivel} .${formato} guardado`);
      await app.hasta(`!${por("guardar-imagen")}.disabled`, "que Guardar vuelva a estar disponible");
    };
    await guardar("presentacion", "svg");
    await guardar("estructura", "svg");
    await guardar("estructura", "png");
    // El PDF: carta horizontal repartida por ramas (el reparto lo arma un worker, así que el archivo tarda más)
    await guardar("estructura", "pdf", ["hoja-carta", "orientacion-horizontal", "reparto-ramas"]);
  } catch (e) {
    const avisos = await app
      .evaluar(`[...document.querySelectorAll("[data-sonner-toast]")].map((t) => t.innerText).join(" | ")`)
      .catch(() => "");
    const ruta = await app.evaluar("location.hash").catch(() => "");
    throw new Error(`${e instanceof Error ? e.message : e}; ruta ${ruta}; avisos: ${avisos}`, { cause: e });
  }
  const archivos = readdirSync(destino);
  const de = (/** @type {string} */ nivel, /** @type {string} */ ext) =>
    archivos.find((f) => f.includes(`_${nivel}`) && f.endsWith(`.${ext}`));
  const leer = (/** @type {string | undefined} */ f) => (f ? readFileSync(join(destino, f), "utf8") : "");
  const presentacion = leer(de("presentacion", "svg"));
  const estructura = leer(de("estructura", "svg"));
  const png = de("estructura", "png");
  comprobar(
    "se guardaron la Presentación y la Estructura en SVG y la Estructura en PNG",
    Boolean(presentacion && estructura && png),
    archivos,
  );
  comprobar(
    "el SVG de Presentación lleva el nombre de la persona",
    presentacion.includes(PERSONA.nombre),
    presentacion.slice(0, 200),
  );
  comprobar(
    "el SVG de Estructura no lleva el nombre de la persona",
    !estructura.includes(PERSONA.nombre),
    PERSONA.nombre,
  );
  comprobar(
    "el SVG de Estructura lleva el nombre de la raíz",
    estructura.includes(unidad.nombre),
    unidad.nombre,
  );
  const cabecera = png ? readFileSync(join(destino, png)).subarray(0, 8).toString("hex") : "";
  comprobar("el PNG empieza con la firma de PNG", cabecera === "89504e470d0a1a0a", cabecera);
  const pdf = de("estructura", "pdf");
  const bytesPdf = pdf ? readFileSync(join(destino, pdf)) : Buffer.alloc(0);
  comprobar(
    "el PDF de Estructura empieza con %PDF",
    bytesPdf.subarray(0, 4).toString("latin1") === "%PDF",
    bytesPdf.length,
  );
  // pdfkit escribe el texto como números de glifo en hexadecimal: esta búsqueda solo atrapa un nombre en claro (en
  // los metadatos, por ejemplo). Que ningún texto con personas llegue al PDF lo prueba pdf_estructura_sin_personas.
  comprobar(
    "el PDF de Estructura no lleva el nombre de la persona en claro",
    bytesPdf.length > 0 && !bytesPdf.toString("latin1").includes(PERSONA.nombre),
    PERSONA.nombre,
  );
  await revisarBase(app, carpeta);
  const codigo = await app.cerrar();
  comprobar("la app de la imagen cierra sola y con código 0", codigo === 0, codigo);
}

/**
 * El manual de organización y funciones, sin personas. Parte de la base que sembró `exportarImagen` (la persona de humo
 * es jefa de la raíz). Se abre desde Importar/Exportar y se guarda con `BOLDO_GUARDAR_EN`, por `data-accion`: la
 * interfaz sale en inglés. `revisarBase` comprueba `rutaBd` antes de cerrar.
 * @param {string} exe @param {string} carpeta
 */
async function manualSinPersonas(exe, carpeta) {
  const destino = join(carpeta, "datos", "manual-humo");
  mkdirSync(destino, { recursive: true });
  const app = await abrirApp(exe, { BOLDO_GUARDAR_EN: destino });
  await revisarBase(app, carpeta);
  try {
    // al arrancar, la app puede ir a Inicio después de este cambio de ruta: se repite hasta quedar
    await app.hasta(
      `(location.hash === "#/importar-exportar" || ((location.hash = "#/importar-exportar"), false)) && Boolean(${por("abrir-manual")})`,
      "Importar/Exportar con el botón del manual",
    );
    const clic = clicEn(app);
    await clic("abrir-manual");
    await app.hasta(`Boolean(document.querySelector("[data-dialogo-manual]"))`, "el diálogo del manual");
    // Sin personas, en carta vertical
    await app.evaluar(`(() => { const c = ${por("manual-personas")}; if (c.checked) c.click(); })()`);
    await app.hasta(`!${por("manual-personas")}.checked`, "la casilla de personas sin marcar");
    await clic("hoja-carta");
    await clic("orientacion-vertical");
    await clic("guardar-manual");
    // El manual se arma en un worker y luego pide aceptar «queda sin cifrar»
    await esperar(async () => {
      if (await app.evaluar(`Boolean(${por("aceptar-aviso-manual")})`)) {
        await app.evaluar(`${por("aceptar-aviso-manual")}.click()`);
      }
      return readdirSync(destino).some((f) => f.includes("_manual") && f.endsWith(".pdf"));
    }, "el PDF del manual guardado");
  } catch (e) {
    const avisos = await app
      .evaluar(`[...document.querySelectorAll("[data-sonner-toast]")].map((t) => t.innerText).join(" | ")`)
      .catch(() => "");
    throw new Error(`${e instanceof Error ? e.message : e}; avisos: ${avisos}`, { cause: e });
  }
  const archivo = readdirSync(destino).find((f) => f.includes("_manual") && f.endsWith(".pdf"));
  const bytes = archivo ? readFileSync(join(destino, archivo)) : Buffer.alloc(0);
  comprobar("el manual empieza con %PDF", bytes.subarray(0, 4).toString("latin1") === "%PDF", bytes.length);
  // Como en el PDF de la imagen: pdfkit escribe el texto como glifos, así que esto solo atrapa un nombre en claro.
  comprobar(
    "el manual sin personas no lleva el nombre de la persona en claro",
    bytes.length > 0 && !bytes.toString("latin1").includes(PERSONA.nombre),
    PERSONA.nombre,
  );
  await revisarBase(app, carpeta);
  const codigo = await app.cerrar();
  comprobar("la app del manual cierra sola y con código 0", codigo === 0, codigo);
}

/**
 * Lo único que el visor puede pedir: su propio archivo y lo que va en `data:` (el logo). Todo lo demás sería ir a la red.
 * @param {string} url @param {string} archivo la URL `file:` del visor
 */
export const pedidoPermitido = (url, archivo) => url === archivo || url.startsWith("data:");

/** El Edge que trae Windows, en cualquiera de sus dos carpetas de programas. @param {NodeJS.ProcessEnv} [e] */
export const rutaEdge = (e = process.env) =>
  [e["ProgramFiles(x86)"], e.ProgramFiles]
    .filter((d) => d !== undefined)
    .map((d) => join(d, "Microsoft", "Edge", "Application", "msedge.exe"))
    .find((r) => existsSync(r));

/**
 * Abre un visor HTML en Edge sin interfaz, con su perfil en `carpeta/edge`, y por CDP comprueba que dibuja, que la lista se
 * recorre con el teclado, que plegar la raíz deja una tarjeta, que la búsqueda encuentra `unidad` y la muestra como
 * texto, que no pide nada a la red y que la CSP no reclama. Edge se cierra pase lo que pase.
 * @param {string} archivo @param {string} carpeta @param {{ raiz: string, unidad: { id: string, nombre: string } }} o
 */
export async function revisarVisorEnEdge(archivo, carpeta, { raiz, unidad }) {
  const edge = rutaEdge();
  if (!edge) throw new Error("No está msedge.exe en Archivos de programa");
  const perfil = join(carpeta, "edge");
  mkdirSync(perfil, { recursive: true });
  const proceso = spawn(
    edge,
    [
      "--headless=new",
      "--remote-debugging-port=0",
      "--remote-allow-origins=*",
      `--user-data-dir=${perfil}`,
      "--no-first-run",
      "--no-default-browser-check",
      "about:blank",
    ],
    { stdio: "ignore" },
  );
  lanzados.push(proceso);
  try {
    // Con el puerto 0, Edge elige uno libre y lo escribe en la primera línea de DevToolsActivePort.
    const activo = join(perfil, "DevToolsActivePort");
    const puerto = await esperar(
      async () => existsSync(activo) && readFileSync(activo, "utf8").split("\n")[0].trim(),
      "el puerto de depuración de Edge",
    );
    const url = await esperar(async () => {
      /** @type {{ type: string, webSocketDebuggerUrl: string }[]} */
      const lista = await (await fetch(`http://127.0.0.1:${puerto}/json/list`)).json();
      return lista.find((t) => t.type === "page")?.webSocketDebuggerUrl;
    }, "la página de Edge");
    const inicio = registro.length;
    const direccion = pathToFileURL(archivo).href;
    /** @type {string[]} */
    const pedidos = [];
    const { enviar } = await conectarCdp(url, (metodo, params) => {
      if (metodo === "Network.requestWillBeSent") pedidos.push(params.request.url);
    });
    /** @param {string} expression @returns {Promise<any>} */
    const evaluar = async (expression) => {
      const r = await enviar("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
      if (r.exceptionDetails)
        throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
      return r.result.value;
    };
    const hasta = (/** @type {string} */ c, /** @type {string} */ que) => esperar(() => evaluar(c), que);
    const tarjetas = `document.querySelectorAll('main[data-visor="dibujo"] [data-id]').length`;
    const dibujado = `Boolean(document.querySelector('main[data-visor="dibujo"] svg')) && !document.querySelector('[data-visor="estado"]').textContent`;
    // La red se mira desde antes de cargar el archivo.
    await enviar("Network.enable");
    await enviar("Page.navigate", { url: direccion });
    await hasta(`location.href === ${JSON.stringify(direccion)} && ${dibujado}`, "que el visor dibuje");
    const n = await evaluar(tarjetas);
    comprobar("el visor dibuja más de una tarjeta", n > 1, n);

    // La lista, con la raíz abierta: ArrowDown (una tecla de verdad, por CDP) pasa de la primera fila a la siguiente.
    await evaluar(`document.querySelector('[data-visor="vista-lista"]').click()`);
    await evaluar(`document.querySelector('[data-visor="fila"][tabindex="0"]').focus()`);
    const foco = `document.activeElement?.dataset.unidad ?? ""`;
    const antes = await evaluar(foco);
    for (const type of ["keyDown", "keyUp"])
      await enviar("Input.dispatchKeyEvent", {
        type,
        key: "ArrowDown",
        code: "ArrowDown",
        windowsVirtualKeyCode: 40,
      });
    const despues = await evaluar(foco);
    comprobar(
      "ArrowDown en la lista mueve el foco a otra fila",
      Boolean(antes && despues && despues !== antes),
      {
        antes,
        despues,
      },
    );
    await evaluar(`document.querySelector('[data-visor="vista-diagrama"]').click()`);

    // Plegar la raíz: su botón es un <g> del SVG, que no tiene .click().
    await evaluar(
      `document.querySelector('[data-plegar=${JSON.stringify(raiz)}]').dispatchEvent(new MouseEvent("click", { bubbles: true }))`,
    );
    const plegada = await hasta(
      `${tarjetas} === 1 && ${dibujado}`,
      "una sola tarjeta tras plegar la raíz",
    ).then(
      () => true,
      () => false,
    );
    comprobar("plegar la raíz deja una sola tarjeta", plegada, await evaluar(tarjetas));

    // Buscar la unidad por su nombre, que lleva </script>: aparece, y como texto.
    await evaluar(
      `(() => { const c = document.querySelector('[data-visor="buscar"]'); c.value = ${JSON.stringify(unidad.nombre)}; c.dispatchEvent(new Event("input")); })()`,
    );
    const encontrada = await evaluar(
      `[...document.querySelectorAll('[data-visor="resultado"]')].find((r) => r.dataset.unidad === ${JSON.stringify(unidad.id)})?.firstChild?.textContent ?? null`,
    );
    comprobar(
      "buscar la unidad la encuentra, con su nombre como texto",
      encontrada === unidad.nombre,
      encontrada,
    );
    const xss = await evaluar(`[typeof window.__xss, document.querySelectorAll('img[src="x"]').length]`);
    comprobar("el nombre con </script> no corre nada", xss[0] === "undefined" && xss[1] === 0, xss);

    const afuera = pedidos.filter((u) => !pedidoPermitido(u, direccion));
    comprobar(
      "el visor no pide nada fuera de su archivo",
      pedidos.length > 0 && afuera.length === 0,
      pedidos,
    );
    const csp = registro.slice(inicio).filter((l) => /Content Security Policy/i.test(l));
    comprobar("la CSP del visor no reclama", csp.length === 0, csp);
  } finally {
    detener(proceso);
  }
}

/**
 * El visor HTML, sobre la base que sembró `exportarImagen` (la persona de humo es jefa de la raíz). Con la app abierta se
 * crea una hija de la raíz llamada `NOMBRE_XSS`; con la app vuelta a abrir y `BOLDO_GUARDAR_EN`, se guarda un visor de
 * Presentación desde el diálogo de la imagen, por `data-accion`, y se revisa en Edge. `revisarBase` comprueba `rutaBd`
 * antes de cada escritura.
 * @param {string} exe @param {string} carpeta
 */
async function exportarVisor(exe, carpeta) {
  const destino = join(carpeta, "datos", "visor-humo");
  mkdirSync(destino, { recursive: true });

  let app = await abrirApp(exe);
  let info = await revisarBase(app, carpeta);
  const leida = await app.llamar("db_consultar", {
    baseId: info.baseId,
    sql: "SELECT id, tipo_id FROM unidades WHERE parent_id IS NULL AND deleted_at IS NULL LIMIT 1",
    params: [],
  });
  /** @type {{ id: string, tipo_id: string } | undefined} */
  const fila = leida.ok ? leida.valor[0] : undefined;
  comprobar("hay una raíz para el visor", Boolean(fila), leida);
  if (!fila) throw new Error("sin raíz: no se puede probar el visor");
  const raiz = fila.id;
  // la organización de prueba trae solo la raíz: se le crea una hija, así hay una rama que plegar
  const hija = "humo-hija-visor";
  info = await revisarBase(app, carpeta);
  const t = new Date().toISOString();
  const lote = await app.llamar("db_lote", {
    baseId: info.baseId,
    versionApp: "humo",
    sentencias: [
      {
        sql: `INSERT INTO unidades (id, tipo_id, nombre, parent_id, orden, created_at, updated_at)
              VALUES (?1, ?2, ?3, ?4, 0, ?5, ?5)`,
        params: [hija, fila.tipo_id, NOMBRE_XSS, raiz, t],
      },
    ],
  });
  comprobar("se creó una hija de la raíz con </script> en el nombre", lote.ok, lote);
  comprobar("la app de la siembra del visor cierra sola y con código 0", (await app.cerrar()) === 0);

  app = await abrirApp(exe, { BOLDO_GUARDAR_EN: destino });
  await revisarBase(app, carpeta);
  const guardado = () => readdirSync(destino).find((f) => f.includes("_presentacion") && f.endsWith(".html"));
  try {
    await alArbol(app);
    const clic = clicEn(app);
    await clic("abrir-imagen-barra");
    await app.hasta(`Boolean(document.querySelector("[data-dialogo-imagen]"))`, "el diálogo de la imagen");
    await clic("nivel-presentacion");
    await clic("formato-html");
    await clic("guardar-imagen");
    // el aviso de «queda sin cifrar» sale también con el visor
    await esperar(async () => {
      if (await app.evaluar(`Boolean(${por("aceptar-aviso-imagen")})`)) {
        await app.evaluar(`${por("aceptar-aviso-imagen")}.click()`);
      }
      return Boolean(guardado());
    }, "el visor HTML de Presentación guardado");
  } catch (e) {
    const avisos = await app
      .evaluar(`[...document.querySelectorAll("[data-sonner-toast]")].map((t) => t.innerText).join(" | ")`)
      .catch(() => "");
    throw new Error(`${e instanceof Error ? e.message : e}; avisos: ${avisos}`, { cause: e });
  }
  await revisarBase(app, carpeta);
  const codigo = await app.cerrar();
  comprobar("la app del visor cierra sola y con código 0", codigo === 0, codigo);

  const archivo = join(destino, /** @type {string} */ (guardado()));
  const html = readFileSync(archivo, "utf8");
  comprobar(
    "el visor de Presentación lleva el nombre de la persona",
    html.includes(PERSONA.nombre),
    PERSONA.nombre,
  );
  comprobar(
    "el nombre con </script> no queda tal cual en el archivo",
    !html.includes(NOMBRE_XSS),
    NOMBRE_XSS,
  );
  await revisarVisorEnEdge(archivo, carpeta, { raiz, unidad: { id: hija, nombre: NOMBRE_XSS } });
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
  await historialPersistente(exe, carpeta);
  await historialVolverAPunto(exe, carpeta);
  await exportarImagen(exe, carpeta);
  await exportarVisor(exe, carpeta);
  await manualSinPersonas(exe, carpeta);
  await fotosSoloEnLaWeb(exe, carpeta, info);
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
