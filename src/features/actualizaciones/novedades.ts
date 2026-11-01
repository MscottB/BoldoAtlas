// Notas por versión (novedades.json, de scripts/novedades.mjs). La ventana de actualización muestra las de todas
// las versiones que el usuario se salta; el diálogo «Novedades», las de las versiones nuevas desde la última que
// se usó en este PC. Las notas se escriben en español (vienen de los PR); en inglés se avisa con un texto.

export interface Novedad {
  version: string;
  fecha: string;
  notas: string;
}

type Semver = { nums: number[]; pre: string[] };

function parsear(v: string): Semver | null {
  const m = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/.exec(v.trim());
  return m ? { nums: [Number(m[1]), Number(m[2]), Number(m[3])], pre: m[4] ? m[4].split(".") : [] } : null;
}

/** Orden SemVer 2.0 (como scripts/publicacion.mjs): negativo si a < b. Una versión inválida va primero. */
export function compararVersiones(a: string, b: string): number {
  const x = parsear(a);
  const y = parsear(b);
  if (!x || !y) return Number(!!x) - Number(!!y);
  for (let i = 0; i < 3; i++) if (x.nums[i] !== y.nums[i]) return x.nums[i]! - y.nums[i]!;
  if (!x.pre.length || !y.pre.length) return y.pre.length - x.pre.length;
  for (let i = 0; i < Math.max(x.pre.length, y.pre.length); i++) {
    const p = x.pre[i];
    const q = y.pre[i];
    if (p === undefined) return -1;
    if (q === undefined) return 1;
    if (p === q) continue;
    const np = /^\d+$/.test(p);
    const nq = /^\d+$/.test(q);
    if (np && nq) return Number(p) - Number(q);
    if (np !== nq) return np ? -1 : 1;
    return p < q ? -1 : 1;
  }
  return 0;
}

/** Lo que trae un novedades.json; cualquier otra cosa (un archivo dañado o de otro formato) es una lista vacía. */
export function leerNovedades(datos: unknown): Novedad[] {
  const versiones = (datos as { versiones?: unknown } | null)?.versiones;
  if (!Array.isArray(versiones)) return [];
  return versiones.filter(
    (v): v is Novedad =>
      typeof v?.version === "string" && typeof v?.fecha === "string" && typeof v?.notas === "string",
  );
}

/** Versiones con `desde` < versión ≤ `hasta`, de la más nueva a la más antigua. */
export function notasEntre(lista: Novedad[], desde: string, hasta: string): Novedad[] {
  return lista
    .filter((n) => compararVersiones(n.version, desde) > 0 && compararVersiones(n.version, hasta) <= 0)
    .sort((a, b) => compararVersiones(b.version, a.version));
}

/**
 * Lo que muestra el diálogo «Novedades» al abrir una versión nueva: lo publicado desde la última versión usada en
 * este PC. Nada en el primer uso (no hay «desde») ni al volver a una versión anterior.
 */
export function novedadesPendientes(lista: Novedad[], ultimaUsada: string | null, actual: string): Novedad[] {
  if (!ultimaUsada || compararVersiones(actual, ultimaUsada) <= 0) return [];
  return notasEntre(lista, ultimaUsada, actual);
}
