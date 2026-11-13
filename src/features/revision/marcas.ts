/** «Así está bien»: avisos que el autor dio por buenos, por clave de aviso. */
export interface Marca {
  motivo: string;
  /** AAAA-MM-DD. */
  fecha: string;
}
export type Marcas = Record<string, Marca>;

export const MOTIVO_MAX = 200;

const CLAVE = /^(sinJefatura|vacias|vacantes|sinPuesto|correos|nombres|sinUso):[\w:,-]+$/;
const FECHA = /^\d{4}-\d{2}-\d{2}$/;

// Object.fromEntries define claves propias: un «__proto__» del texto no toca el prototipo.
const desde = (entradas: [string, Marca][]): Marcas => Object.fromEntries(entradas);

/** Lee lo guardado en la base; descarta lo que no calza, sin fallar. */
export function leerMarcas(texto: string | undefined): Marcas {
  if (!texto) return {};
  let crudo: unknown;
  try {
    crudo = JSON.parse(texto);
  } catch {
    return {};
  }
  if (typeof crudo !== "object" || crudo === null || Array.isArray(crudo)) return {};
  const validas: [string, Marca][] = [];
  for (const [clave, v] of Object.entries(crudo)) {
    if (!CLAVE.test(clave) || typeof v !== "object" || v === null) continue;
    const { motivo, fecha } = v as Record<string, unknown>;
    if (typeof motivo !== "string" || typeof fecha !== "string" || !FECHA.test(fecha)) continue;
    const limpio = motivo.trim();
    if (limpio && limpio.length <= MOTIVO_MAX) validas.push([clave, { motivo: limpio, fecha }]);
  }
  return desde(validas);
}

/** Quita las marcas de avisos que ya no existen. */
export function podar(m: Marcas, vigentes: Set<string>): Marcas {
  return desde(Object.entries(m).filter(([c]) => vigentes.has(c)));
}

/** null si el motivo queda vacío o demasiado largo. */
export function marcar(
  m: Marcas,
  clave: string,
  motivo: string,
  hoy: string,
  vigentes: Set<string>,
): Marcas | null {
  const limpio = motivo.trim();
  if (!limpio || limpio.length > MOTIVO_MAX) return null;
  return podar(
    desde([...Object.entries(m).filter(([c]) => c !== clave), [clave, { motivo: limpio, fecha: hoy }]]),
    vigentes,
  );
}

export function desmarcar(m: Marcas, clave: string, vigentes: Set<string>): Marcas {
  return podar(desde(Object.entries(m).filter(([c]) => c !== clave)), vigentes);
}
