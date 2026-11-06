import { baseActual } from "./baseActiva";

const PREFIJO = "boldo:";

// localStorage puede estar bloqueado o corrupto: una preferencia nunca debe romper la app.
export function leerPreferencia<T>(clave: string, porDefecto: T): T {
  try {
    const crudo = localStorage.getItem(PREFIJO + clave);
    return crudo === null ? porDefecto : (JSON.parse(crudo) as T);
  } catch {
    return porDefecto;
  }
}

export function guardarPreferencia(clave: string, valor: unknown): void {
  try {
    localStorage.setItem(PREFIJO + clave, JSON.stringify(valor));
  } catch {
    // sin persistencia: la preferencia vale solo para esta sesión
  }
}

// Preferencias por organización: llevan el id de la base (`<clave>:<db_id>`). Sin base fijada no hay dónde guardarlas.
const claveOrg = (clave: string): string | null => {
  const id = baseActual();
  return id ? `${clave}:${id}` : null;
};

export function leerPreferenciaOrg<T>(clave: string, porDefecto: T): T {
  const k = claveOrg(clave);
  return k ? leerPreferencia(k, porDefecto) : porDefecto;
}

export function guardarPreferenciaOrg(clave: string, valor: unknown): void {
  const k = claveOrg(clave);
  if (k) guardarPreferencia(k, valor);
}

// Lo que antes era por PC y ahora es por organización. `vista:<árbol>` lleva un solo tramo tras «vista:», así que no se
// vuelven a copiar `vista:<árbol>:<db_id>`. shortcut: `vista:<db_id>` (la general ya copiada) sí calza y, si otra copia
// de la app comparte localStorage, deja una clave `vista:<db_id>:<otro>` que nadie lee; inocua, sin limpiar.
// `plegado:*`, tema, idioma y respaldos siguen por PC; `recientes:*` se borra (`borrarRecientesViejos`).
const POR_ORGANIZACION = /^(vista|vista:[^:]+|directorio|directorio:columnas|personas:vista|minimapa)$/;

/** Quita las preferencias de una organización que ya no existe. Las de las demás, y las de cada PC, quedan. */
export function borrarPreferenciasOrg(id: string): void {
  if (!id) return;
  const cola = `:${id}`;
  try {
    const claves = Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i));
    for (const k of claves) {
      if (!k?.startsWith(PREFIJO) || !k.endsWith(cola)) continue;
      if (POR_ORGANIZACION.test(k.slice(PREFIJO.length, -cola.length))) localStorage.removeItem(k);
    }
  } catch {
    // sin localStorage no hay qué borrar, y una preferencia nunca debe romper la app
  }
}

/**
 * El «Abierto recientemente» de antes (`recientes:<ruta>`) nombra personas, ya no se escribe ni hay cómo vaciarlo: se
 * borra. Sin marca, porque también lo dejó quien ya migró; sin esas claves no hace nada.
 */
function borrarRecientesViejos(): void {
  try {
    const claves = Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i));
    for (const k of claves) if (k?.startsWith(`${PREFIJO}recientes:`)) localStorage.removeItem(k);
  } catch {
    // sin localStorage no hay qué borrar
  }
}

/** Copia, una vez por copia de la app, las preferencias antiguas a las de la organización `id`. Deja las originales. */
export function migrarPreferencias(id: string, dirDatos: string): void {
  borrarRecientesViejos();
  const marca = `organizaciones:migrado:${dirDatos}`;
  if (!id || leerPreferencia(marca, false)) return;
  try {
    const claves = Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i));
    for (const k of claves) {
      if (!k?.startsWith(PREFIJO) || !POR_ORGANIZACION.test(k.slice(PREFIJO.length))) continue;
      const destino = `${k}:${id}`;
      const valor = localStorage.getItem(k);
      if (valor !== null && localStorage.getItem(destino) === null) localStorage.setItem(destino, valor);
    }
  } catch {
    return; // sin localStorage no se migra ni se marca: se reintenta en el próximo arranque
  }
  guardarPreferencia(marca, true);
}
