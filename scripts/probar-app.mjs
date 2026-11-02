// Prueba de humo de la app real: extrae la portable de Windows ya construida, la abre y, por CDP, comprueba en su página
// el puente de Tauri (baseId, protocolo foto:, bloqueo, reabrir, segunda instancia). La app no escribe un registro propio:
// «registro» es lo que imprime el proceso más la consola de la página.
// Solo en CI: abre una ventana maximizada, y en el equipo de alguien aparecería en su pantalla.
import { execFileSync, spawn } from "node:child_process";
import { existsSync, globSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, win32 } from "node:path";
import { fileURLToPath } from "node:url";
import { TAR, artefactos } from "./release.mjs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
// un id válido: el rechazo debe venir de que es otra base, no de su forma
const OTRA_BASE = "00000000-0000-4000-8000-000000000000";
const ORGANIZACION = "Organización de humo";
const PERSONA = { id: "humo-foto", nombre: "Persona de humo" };
// PNG de 1×1
const FOTO =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAEBgIApD5fRAAAAABJRU5ErkJggg==";
const PUERTO = 9222;
// Lo que wry pasa a WebView2 cuando la app no fija sus argumentos (wry/src/webview2/mod.rs).
const ARGUMENTOS_WRY = "--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection";
const ESPERA_ARRANQUE_MS = 8000; // ESPERA_ARRANQUE de organizaciones.rs: una segunda instancia no debe llegar a esperarla

/** @param {NodeJS.ProcessEnv} e */
export const enCI = (e) => e.CI === "true" && e.GITHUB_ACTIONS === "true" && Boolean(e.RUNNER_TEMP);

/** @param {string} ruta @param {string} carpeta */
export function dentroDe(ruta, carpeta) {
  const r = win32.relative(carpeta, ruta);
  return r !== "" && !r.startsWith("..") && !win32.isAbsolute(r);
}

/**
 * El exe con el puerto de depuración abierto en vez de los argumentos de wry, del mismo largo: un `&str` guarda su largo
 * aparte. WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS no sirve: wry siempre fija argumentos, y mandan sobre la variable y sobre
 * la política de WebView2 (probado en el runner: el navegador corre sin el puerto). Así se prueba el binario publicado y
 * no otro compilado aparte. Solo la copia temporal: la que se sube a Actions queda igual.
 * shortcut: depende de ese texto de wry. Si cambia, falla aquí mismo; entonces, compilar con `additionalBrowserArgs`.
 * @param {Buffer} exe
 */
export function conPuertoAbierto(exe) {
  const buscado = Buffer.from(ARGUMENTOS_WRY);
  const primero = exe.indexOf(buscado);
  if (primero < 0 || exe.indexOf(buscado, primero + 1) >= 0) {
    throw new Error(
      `El exe debe tener una sola vez «${ARGUMENTOS_WRY}»: ¿cambió wry o se fijó additionalBrowserArgs?`,
    );
  }
  const parchado = Buffer.from(exe);
  parchado.write(
    `--remote-debugging-port=${PUERTO} --remote-allow-origins=*`.padEnd(buscado.length, " "),
    primero,
  );
  return parchado;
}

/** @type {string[]} */
const registro = [];
/** @param {string} linea */
const anotar = (linea) => void registro.push(linea);
/** @type {string[]} */
const fallos = [];
/** @param {string} nombre @param {boolean} ok @param {unknown} [detalle] */
function comprobar(nombre, ok, detalle = "") {
  console.log(`${ok ? "ok   " : "FALLA"} ${nombre}${ok ? "" : `: ${JSON.stringify(detalle)}`}`);
  if (!ok) fallos.push(nombre);
}

/** @param {number} ms */
const pausa = (ms) => new Promise((ok) => setTimeout(ok, ms));
/** @template T @param {() => Promise<T | false | null | undefined>} f @param {string} que @param {number} [ms] @returns {Promise<T>} */
async function esperar(f, que, ms = 30_000) {
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
    return execFileSync("pwsh", ["-NoProfile", "-Command", comando], { encoding: "utf8" });
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
async function abrirApp(exe) {
  const proceso = spawn(exe, [], { stdio: ["ignore", "pipe", "pipe"] });
  for (const salida of [proceso.stdout, proceso.stderr]) {
    salida.on("data", (b) => anotar(`[proceso] ${String(b).trimEnd()}`));
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

  const matar = () => {
    if (salio) return;
    try {
      // solo este PID y sus hijos
      execFileSync("taskkill", ["/PID", String(proceso.pid), "/T", "/F"], { stdio: "ignore" });
    } catch {
      /* ya no estaba */
    }
  };

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
    matar();
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
  // la página aparece en CDP antes de tener los scripts de Tauri
  await esperar(
    () => evaluar(`Boolean(window.__TAURI_INTERNALS__)`),
    "que la página tenga el puente de Tauri",
  );
  return {
    pid: proceso.pid,
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
    matar,
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

/** @param {string} exe */
function segundaInstancia(exe) {
  const inicio = Date.now();
  const p = spawn(exe, [], { stdio: "ignore" });
  return Promise.race([
    new Promise((ok, mal) => {
      p.once("error", mal);
      p.once("exit", (codigo) => ok({ codigo, ms: Date.now() - inicio }));
    }),
    pausa(30_000).then(() => {
      execFileSync("taskkill", ["/PID", String(p.pid), "/T", "/F"], { stdio: "ignore" });
      return { codigo: "no salió en 30 s", ms: Date.now() - inicio };
    }),
  ]);
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
const cargarImagen = (url) => `new Promise((ok) => {
  const img = new Image();
  img.onload = () => ok({ ancho: img.naturalWidth });
  img.onerror = () => ok(null);
  img.src = ${JSON.stringify(url)};
})`;

/** @param {Awaited<ReturnType<typeof abrirApp>>} app @param {string} carpeta */
async function revisarBase(app, carpeta) {
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

/** @param {string} exe @param {string} carpeta @param {(a: Awaited<ReturnType<typeof abrirApp>>) => void} usar */
async function primeraApertura(exe, carpeta, usar) {
  const bd = join(carpeta, "datos", "boldo.db");
  const app = await abrirApp(exe);
  usar(app);
  const info = await revisarBase(app, carpeta);
  comprobar("info_app: baseId UUID y rutaBd en la carpeta temporal", true);

  // la organización se crea desde la interfaz: pasa por el store, cliente.ts y su baseId
  await app.hasta(`document.getElementById("bienvenida-camino-vacia")`, "la pantalla de bienvenida");
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
  await verTexto(app, ORGANIZACION);
  comprobar("la organización creada desde la interfaz muestra su nombre", true);
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

/** @param {string} exe @param {string} carpeta @param {{ baseId: string }} primera @param {(a: Awaited<ReturnType<typeof abrirApp>>) => void} usar */
async function reapertura(exe, carpeta, primera, usar) {
  const app = await abrirApp(exe);
  usar(app);
  const info = await revisarBase(app, carpeta);
  comprobar(
    "reabrir con el bloqueo en disco funciona y conserva el baseId",
    info.baseId === primera.baseId,
    info,
  );
  await verTexto(app, ORGANIZACION);
  comprobar("reabrir conserva la organización", true);
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
  comprobar("la foto de urlFoto carga en la ficha", true);
  comprobar("urlFoto lleva el baseId", url.includes(`/${info.baseId}/${PERSONA.id}?`), url);
  const misma = await app.evaluar(cargarImagen(url));
  comprobar("la misma URL carga en un <img> nuevo", misma?.ancho > 0, misma);
  const conOtra = await app.evaluar(cargarImagen(url.replace(info.baseId, OTRA_BASE)));
  comprobar("la misma URL con otra base da fallo", conOtra === null, conOtra);

  const codigo = await app.cerrar();
  comprobar("la app reabierta cierra sola y con código 0", codigo === 0, codigo);
}

async function principal() {
  /** @type {Awaited<ReturnType<typeof abrirApp>> | undefined} */
  let abierta;
  const usar = (/** @type {Awaited<ReturnType<typeof abrirApp>>} */ app) => void (abierta = app);
  try {
    const a = artefactos("windows", "");
    const [zip, ...otros] = globSync(`release/*/${a.zip}`);
    if (!zip || otros.length)
      throw new Error(`Se esperaba un solo ${a.zip} en release/*/: ${[zip, ...otros]}`);
    const carpeta = mkdtempSync(join(process.env.RUNNER_TEMP ?? "", "boldo-humo-"));
    execFileSync(TAR, ["-x", "-f", zip, "-C", carpeta]);
    const exe = join(carpeta, a.programa.nombre);
    writeFileSync(exe, conPuertoAbierto(readFileSync(exe)));
    const info = await primeraApertura(exe, carpeta, usar);
    await reapertura(exe, carpeta, info, usar);
    if (fallos.length) throw new Error(`${fallos.length} comprobaciones fallaron: ${fallos.join("; ")}`);
    console.log("App comprobada.");
  } catch (e) {
    const pagina = await abierta
      ?.evaluar(`document.body.innerText.slice(0, 800)`)
      .catch(() => "(sin página)");
    console.error(`\nFALLÓ la prueba de humo: ${e instanceof Error ? e.message : String(e)}`);
    console.error(`\nTexto en la página:\n${pagina ?? "(sin página)"}`);
    console.error(`\nÚltimas líneas del registro:\n${registro.slice(-40).join("\n") || "(vacío)"}`);
    throw e;
  } finally {
    abierta?.matar();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (!enCI(process.env) || process.platform !== "win32") {
    console.error("Solo en CI de Windows: abre BoldoAtlas en una ventana maximizada.");
    process.exit(1);
  }
  // process.exit: los hijos de WebView2 pueden seguir teniendo abiertas las tuberías un momento
  principal().then(
    () => process.exit(0),
    () => process.exit(1),
  );
}
