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
// `plegado:*`, tema, idioma, respaldos y recientes siguen por PC.
const POR_ORGANIZACION = /^(vista|vista:[^:]+|directorio|directorio:columnas|personas:vista|minimapa)$/;

/** Copia, una vez por copia de la app, las preferencias antiguas a las de la organización `id`. Deja las originales. */
export function migrarPreferencias(id: string, dirDatos: string): void {
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
