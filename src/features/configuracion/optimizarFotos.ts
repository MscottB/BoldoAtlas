import { invoke } from "@tauri-apps/api/core";
import { consultar } from "@/db/cliente";
import { optimizarFoto } from "@/features/trabajadores/foto";

export interface Candidata {
  id: string;
  nombre: string;
  updated_at: string;
  /** Lo que ocupa hoy en la base, en base64. */
  bytes: number;
}

/** Bajo esto (base64) una foto ya pesa como una optimizada y no vale la pena leerla. */
export const UMBRAL_BASE64 = 48 * 1024;
/** Incluye a las personas eliminadas: su foto también ocupa y vuelve si se las restaura. */
const SQL_CANDIDATAS = `SELECT id, nombre, updated_at, octet_length(foto_png) AS bytes FROM trabajadores
  WHERE octet_length(foto_png) > ? ORDER BY id`;
const SQL_TOTAL = "SELECT COALESCE(SUM(octet_length(foto_png)), 0) AS bytes FROM trabajadores";

export const leerCandidatas = () => consultar<Candidata>(SQL_CANDIDATAS, [UMBRAL_BASE64]);
export const bytesEnFotos = async () => (await consultar<{ bytes: number }>(SQL_TOTAL))[0]?.bytes ?? 0;

const largoBase64 = (bytes: number) => Math.ceil(bytes / 3) * 4;

/** Hasta `n` repartidas parejo: la estimación no debe depender de quiénes quedan primero. */
export function muestra<T>(lista: T[], n: number): T[] {
  if (lista.length <= n) return lista;
  return Array.from({ length: n }, (_, i) => lista[Math.floor((i * lista.length) / n)]!);
}

export interface Pasos {
  leer: (id: string) => Promise<Blob>;
  convertir: (foto: Blob) => Promise<Blob>;
  /** Escribe un lote en una transacción; devuelve cuántas se escribieron (las que cambiaron entre medio no). */
  guardar: (lote: FotoLista[]) => Promise<number>;
}

export interface FotoLista {
  candidata: Candidata;
  foto: Blob;
}

/** Cuánto ocuparían: convierte una muestra y lo extiende al total. Una foto que falla aquí no cuenta. */
export async function estimar(candidatas: Candidata[], pasos: Pick<Pasos, "leer" | "convertir">, n = 8) {
  const total = candidatas.reduce((s, c) => s + c.bytes, 0);
  let antes = 0;
  let despues = 0;
  for (const c of muestra(candidatas, n)) {
    try {
      const nueva = await pasos.convertir(await pasos.leer(c.id));
      antes += c.bytes;
      despues += Math.min(c.bytes, largoBase64(nueva.size));
    } catch {
      /* ya la informará el trabajo, si falla de verdad */
    }
  }
  return { fotos: candidatas.length, total, quedarian: antes ? Math.round((total * despues) / antes) : total };
}

export interface Resultado {
  optimizadas: number;
  /** Convertirla no la dejaba más liviana: se quedó igual. */
  sinGanancia: number;
  /** Nombres de quienes no se pudo: su foto sigue como estaba. */
  fallidas: string[];
  cancelado: boolean;
}

export const LOTE_FOTOS = 25;

/**
 * Una foto a la vez y un lote a la vez, para que la ventana siga respondiendo y cancelar deje lo ya guardado. Lo que falla
 * se anota y se sigue: nunca se pierde la foto original de quien falla.
 */
export async function optimizarTodas(
  candidatas: Candidata[],
  pasos: Pasos,
  opciones: { cancelado: () => boolean; alAvanzar: (hechas: number) => void; lote?: number },
): Promise<Resultado> {
  const tope = opciones.lote ?? LOTE_FOTOS;
  const r: Resultado = { optimizadas: 0, sinGanancia: 0, fallidas: [], cancelado: false };
  let lote: FotoLista[] = [];
  const vaciar = async () => {
    if (!lote.length) return;
    const este = lote;
    lote = [];
    try {
      r.optimizadas += await pasos.guardar(este);
    } catch {
      r.fallidas.push(...este.map((f) => f.candidata.nombre));
    }
  };
  let hechas = 0;
  for (const c of candidatas) {
    if (opciones.cancelado()) {
      r.cancelado = true;
      break;
    }
    try {
      const original = await pasos.leer(c.id);
      const foto = await pasos.convertir(original);
      if (foto === original) r.sinGanancia++;
      else lote.push({ candidata: c, foto });
    } catch {
      r.fallidas.push(c.nombre);
    }
    if (lote.length >= tope) await vaciar();
    opciones.alAvanzar(++hechas);
  }
  await vaciar();
  return r;
}

/** Cuerpo binario de `fotos_guardar` (src-tauri/src/fotos.rs): descripción en JSON, sin imágenes, y luego las imágenes. */
export async function armarLote(lote: FotoLista[], versionApp: string): Promise<Uint8Array> {
  const imagenes = await Promise.all(lote.map((f) => f.foto.arrayBuffer()));
  const meta = new TextEncoder().encode(
    JSON.stringify({
      version_app: versionApp,
      filas: lote.map((f, i) => ({
        id: f.candidata.id,
        version: f.candidata.updated_at,
        previos: f.candidata.bytes,
        largo: imagenes[i]!.byteLength,
      })),
    }),
  );
  const cuerpo = new Uint8Array(
    4 + meta.length + imagenes.reduce((s, b) => s + b.byteLength, 0),
  );
  new DataView(cuerpo.buffer).setUint32(0, meta.length, true);
  cuerpo.set(meta, 4);
  let pos = 4 + meta.length;
  for (const b of imagenes) {
    cuerpo.set(new Uint8Array(b), pos);
    pos += b.byteLength;
  }
  return cuerpo;
}

/** Los pasos reales: leer y guardar, en binario y sin pasar las fotos por JSON. */
export const PASOS: Pasos = {
  leer: async (id) => new Blob([await invoke<ArrayBuffer>("foto_bytes", { id })]),
  convertir: optimizarFoto,
  guardar: async (lote) => invoke<number>("fotos_guardar", await armarLote(lote, __APP_VERSION__)),
};

/** El archivo de la base solo baja de tamaño al compactarla. */
export const compactar = () => invoke<void>("fotos_compactar");
