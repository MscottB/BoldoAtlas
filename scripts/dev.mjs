// `npm run app`: abre la app en desarrollo en el primer puerto libre desde 1420.
// Tauri necesita la URL exacta de Vite, así que el puerto se elige antes y se pasa a ambos.
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const INTENTOS = 20;

/**
 * @param {number} desde
 * @param {(puerto: number) => Promise<boolean>} ocupado
 */
export async function primerPuertoLibre(desde, ocupado) {
  for (let p = desde; p < desde + INTENTOS; p++) if (!(await ocupado(p))) return p;
  throw new Error(`No hay puertos libres entre ${desde} y ${desde + INTENTOS - 1}`);
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

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const puerto = await primerPuertoLibre(1420, enUso);
  if (puerto !== 1420) console.log(`El puerto 1420 está ocupado; se usa el ${puerto}.`);
  const config = join("src-tauri", "target", "dev-puerto.json");
  mkdirSync(dirname(config), { recursive: true });
  writeFileSync(config, JSON.stringify({ build: { devUrl: `http://localhost:${puerto}` } }));
  // shell: npm es un .cmd en Windows; un solo texto evita la advertencia DEP0190 (la ruta no lleva espacios)
  const dev = spawnSync(`npm run tauri -- dev --config ${config}`, {
    stdio: "inherit",
    shell: true,
    env: { ...process.env, BOLDO_PUERTO: String(puerto) },
  });
  process.exit(dev.status ?? 1);
}
