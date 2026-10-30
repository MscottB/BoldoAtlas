// `npm run app`: abre la app en desarrollo en el primer puerto libre desde 1420.
// Tauri necesita la URL exacta de Vite, así que el puerto se elige antes y se pasa a ambos.
// Al terminar (ventana cerrada, Ctrl+C o señal) se detiene todo el árbol de procesos lanzado.
import { execFileSync, spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const INTENTOS = 20;
const WINDOWS = process.platform === "win32";
const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * @param {number} desde
 * @param {(puerto: number) => Promise<boolean>} ocupado
 */
export async function primerPuertoLibre(desde, ocupado) {
  for (let p = desde; p < desde + INTENTOS; p++) if (!(await ocupado(p))) return p;
  throw new Error(`No hay puertos libres entre ${desde} y ${desde + INTENTOS - 1}`);
}

/** PID únicos que escuchan (LISTENING) en `puerto`, según la salida de `netstat -ano`. */
export function pidsEscuchando(salida, puerto) {
  const pids = new Set();
  for (const linea of salida.split(/\r?\n/)) {
    const c = linea.trim().split(/\s+/);
    if (c.length >= 5 && /^TCP$/i.test(c[0]) && c[1].endsWith(`:${puerto}`) && /^(LISTENING|ESCUCHANDO)$/i.test(c[3]))
      pids.add(Number(c[4]));
  }
  return [...pids];
}

/** Solo se detiene un proceso ajeno al lanzador si es el Vite de ESTE repositorio. */
export function esViteDeEsteRepo(linea, repo) {
  const norm = (s) => s.toLowerCase().replaceAll("/", "\\");
  const l = norm(linea ?? "");
  return l.includes("vite") && l.includes(norm(repo));
}

// Vite escucha en "localhost", que en Windows puede resolver a ::1 o a 127.0.0.1: se prueban ambos.
const escucha = (puerto, host) =>
  new Promise((resolve) => {
    const s = createServer()
      .once("error", (e) => resolve(e.code !== "EADDRINUSE" && e.code !== "EACCES"))
      .once("listening", () => s.close(() => resolve(true)))
      .listen(puerto, host);
  });

const enUso = async (puerto) => !(await escucha(puerto, "127.0.0.1")) || !(await escucha(puerto, "::1"));

const salida = (cmd, args) => execFileSync(cmd, args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });

function matarArbol(pid) {
  try {
    if (WINDOWS) execFileSync("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore" });
    else process.kill(-pid, "SIGKILL");
  } catch {
    // ya no existe
  }
}

function lineaDeComando(pid) {
  try {
    if (!WINDOWS) return salida("ps", ["-o", "args=", "-p", String(pid)]);
    const ps = `(Get-CimInstance Win32_Process -Filter 'ProcessId=${pid}').CommandLine`;
    return salida("powershell", ["-NoProfile", "-Command", ps]);
  } catch {
    return "";
  }
}

/** Si algo sigue escuchando en el puerto, detiene el Vite de este repositorio; cualquier otro proceso solo se avisa. */
export function liberarPuerto(puerto) {
  let pids = [];
  try {
    pids = WINDOWS
      ? pidsEscuchando(salida("netstat", ["-ano", "-p", "tcp"]), puerto)
      : salida("lsof", ["-ti", `tcp:${puerto}`, "-sTCP:LISTEN"]).split(/\s+/).filter(Boolean).map(Number);
  } catch {
    return; // sin netstat/lsof (o nadie escucha): nada que hacer
  }
  for (const pid of pids) {
    if (esViteDeEsteRepo(lineaDeComando(pid), REPO)) {
      console.log(`Vite quedó escuchando en el puerto ${puerto} (PID ${pid}); se detiene.`);
      matarArbol(pid);
    } else console.warn(`El puerto ${puerto} sigue ocupado por el PID ${pid}, que no es el Vite de este proyecto; no se toca.`);
  }
}

/** Ejecuta `comando` y lo mantiene vivo mientras dure; al salir de cualquier forma no quedan procesos ni el puerto ocupado. */
export function ejecutar(comando, puerto, env) {
  // shell: npm es un .cmd en Windows; un solo texto evita la advertencia DEP0190 (la ruta no lleva espacios)
  const hijo = spawn(comando, { stdio: "inherit", shell: true, detached: !WINDOWS, env });
  let terminado = false;
  const cerrar = (codigo) => {
    if (terminado) return;
    terminado = true;
    // un PID que ya terminó podría haberse reasignado a otro proceso: solo se mata el árbol de uno vivo
    if (hijo.exitCode === null && hijo.signalCode === null && hijo.pid) matarArbol(hijo.pid);
    liberarPuerto(puerto);
    process.exit(codigo);
  };
  for (const s of ["SIGINT", "SIGTERM", "SIGBREAK"]) process.on(s, () => cerrar(130));
  hijo.on("exit", (codigo) => cerrar(codigo ?? 1));
  hijo.on("error", () => cerrar(1));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const puerto = await primerPuertoLibre(1420, enUso);
  if (puerto !== 1420) console.log(`El puerto 1420 está ocupado; se usa el ${puerto}.`);
  const config = join("src-tauri", "target", "dev-puerto.json");
  mkdirSync(dirname(config), { recursive: true });
  writeFileSync(config, JSON.stringify({ build: { devUrl: `http://localhost:${puerto}` } }));
  ejecutar(`npm run tauri -- dev --config ${config}`, puerto, { ...process.env, BOLDO_PUERTO: String(puerto) });
}
