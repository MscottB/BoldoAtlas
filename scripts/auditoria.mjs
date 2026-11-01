// Lee el JSON de `cargo audit` y decide si la auditoría falla (.github/workflows/auditoria.yml). cargo audit no filtra
// por gravedad: falla con cualquier vulnerabilidad. Aquí falla solo con CVSS 7 o más. Los avisos («sin mantenimiento»,
// «unsound») se muestran sin fallar: suelen venir de dependencias de Tauri que no se pueden cambiar desde aquí.
// Uso: node scripts/auditoria.mjs <cargo-audit.json>
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const PESOS = {
  AV: { N: 0.85, A: 0.62, L: 0.55, P: 0.2 },
  AC: { L: 0.77, H: 0.44 },
  UI: { N: 0.85, R: 0.62 },
  CIA: { H: 0.56, L: 0.22, N: 0 },
};

/**
 * Puntaje base de un vector CVSS 3.x.
 * @param {string | null | undefined} vector
 * @returns {number | null} null si falta o no se sabe leer
 */
export function puntajeCvss(vector) {
  // shortcut: solo CVSS 3.x; un vector 4.0 cuenta como gravedad desconocida. Si RustSec los adopta, calcularlos.
  if (!/^CVSS:3\.[01]\//.test(vector ?? "")) return null;
  const m = /** @type {Record<string, any>} */ (
    Object.fromEntries((vector ?? "").split("/").map((p) => p.split(":")))
  );
  const cambia = m.S === "C";
  const pr = { N: 0.85, L: cambia ? 0.68 : 0.62, H: cambia ? 0.5 : 0.27 }[/** @type {"N"} */ (m.PR)];
  const [av, ac, ui] = [
    PESOS.AV[/** @type {"N"} */ (m.AV)],
    PESOS.AC[/** @type {"L"} */ (m.AC)],
    PESOS.UI[/** @type {"N"} */ (m.UI)],
  ];
  const [c, i, a] = [m.C, m.I, m.A].map((x) => PESOS.CIA[/** @type {"N"} */ (x)]);
  if ([pr, av, ac, ui, c, i, a].some((x) => x === undefined)) return null;
  const isc = 1 - (1 - c) * (1 - i) * (1 - a);
  const impacto = cambia ? 7.52 * (isc - 0.029) - 3.25 * (isc - 0.02) ** 15 : 6.42 * isc;
  if (impacto <= 0) return 0;
  const suma = impacto + 8.22 * av * ac * pr * ui;
  return Math.ceil(Math.min(cambia ? 1.08 * suma : suma, 10) * 10 - 1e-9) / 10;
}

/** @typedef {{ advisory?: { id?: string, title?: string, cvss?: string | null } | null, package: { name: string, version: string } }} Hallazgo */

/**
 * Sin gravedad conocida también falla: RustSec no siempre la publica y es mejor mirarla que dejarla pasar en verde.
 * @param {{ vulnerabilities: { list: Hallazgo[] }, warnings?: Record<string, Hallazgo[]> }} informe
 */
export function revisar(informe) {
  const graves = [];
  const menores = [];
  for (const v of informe.vulnerabilities.list) {
    const puntaje = puntajeCvss(v.advisory?.cvss);
    (puntaje === null || puntaje >= 7 ? graves : menores).push({ ...v, puntaje });
  }
  return { graves, menores, avisos: Object.values(informe.warnings ?? {}).flat() };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const ruta = process.argv[2];
  if (!ruta) throw new Error("Uso: node scripts/auditoria.mjs <cargo-audit.json>");
  // un JSON vacío o roto (cargo audit no corrió) lanza aquí: mejor un fallo visible que un verde sin auditar
  const { graves, menores, avisos } = revisar(JSON.parse(readFileSync(ruta, "utf8")));
  /** @param {Hallazgo} h */
  const linea = (h) =>
    `${h.advisory?.id ?? "?"} ${h.package.name} ${h.package.version}: ${h.advisory?.title ?? ""}`;
  for (const a of avisos) console.log(`::notice::${linea(a)}`);
  for (const m of menores) console.log(`::warning::CVSS ${m.puntaje}: ${linea(m)}`);
  for (const g of graves) console.log(`::error::CVSS ${g.puntaje ?? "desconocido"}: ${linea(g)}`);
  console.log(`${graves.length} graves, ${menores.length} menores, ${avisos.length} avisos.`);
  if (graves.length) process.exit(1);
}
