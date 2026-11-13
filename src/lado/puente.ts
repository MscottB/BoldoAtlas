import { idLado } from "./modo";

/** Los únicos comandos de Rust que el iframe del lado alcanza. */
export const PERMITIDOS = ["db_consultar"] as const;

/**
 * Con qué argumentos sale `cmd` desde el panel de al lado: los mismos, con el id del lado como `baseId`; null si no se
 * deja pasar (quien llama lo rechaza con `solo_lectura`). El límite firme es Rust: con el id del lado, escribir da
 * `otra_base`.
 */
export function filtrarLado(cmd: string, args: Record<string, unknown> = {}): Record<string, unknown> | null {
  return (PERMITIDOS as readonly string[]).includes(cmd) ? { ...args, baseId: idLado() } : null;
}

/** Un error de este iframe; si no se puede copiar (lleva una función, por ejemplo), el mismo y no un DataCloneError. */
function copiaDe(e: unknown): unknown {
  try {
    return structuredClone(e);
  } catch {
    return e;
  }
}

interface Internos {
  invoke: (cmd: string, args?: Record<string, unknown>, opciones?: unknown) => Promise<unknown>;
  convertFileSrc: (ruta: string, protocolo?: string) => string;
  transformCallback: (llamada?: (r: unknown) => void, unaVez?: boolean) => number;
  unregisterCallback: (id: number) => void;
  metadata: unknown;
}
type ConInternos = { __TAURI_INTERNALS__?: Internos };

/**
 * Solo donde Tauri no le da IPC al iframe (sus scripts van al marco principal en macOS y Linux): lo que
 * `@tauri-apps/api` busca en `window.__TAURI_INTERNALS__`, tomado del padre (mismo origen). En Windows ya está, no se
 * puede reemplazar y no se toca: ahí filtra `src/db/cliente.ts`. Respuestas y errores se copian para que sus objetos
 * sean de este iframe.
 */
export function instalarPuente(padre: Window): void {
  const propio = window as unknown as ConInternos;
  if (propio.__TAURI_INTERNALS__) return;
  // Se toma ahora: si el padre fuera esta misma ventana, buscarlo después daría con el puente y no con Tauri.
  const del = (padre as unknown as ConInternos).__TAURI_INTERNALS__!;
  const invocar = del.invoke.bind(del);
  propio.__TAURI_INTERNALS__ = {
    invoke: (cmd, args, opciones) => {
      const conLado = filtrarLado(cmd, args);
      if (!conLado) return Promise.reject("solo_lectura");
      return invocar(cmd, conLado, opciones).then(
        (r) => structuredClone(r),
        (e: unknown) => Promise.reject(copiaDe(e)),
      );
    },
    // las fotos llegan por `foto://<id del lado>/…`
    convertFileSrc: del.convertFileSrc.bind(del),
    transformCallback: del.transformCallback.bind(del),
    unregisterCallback: del.unregisterCallback.bind(del),
    metadata: del.metadata,
  };
}
