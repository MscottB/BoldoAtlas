/** Los únicos comandos de Rust que el iframe del lado alcanza. */
export const PERMITIDOS = ["db_consultar"] as const;

interface Internos {
  invoke: (cmd: string, args?: Record<string, unknown>, opciones?: unknown) => Promise<unknown>;
  convertFileSrc: (ruta: string, protocolo?: string) => string;
  transformCallback: (llamada?: (r: unknown) => void, unaVez?: boolean) => number;
  metadata: unknown;
}
type ConInternos = { __TAURI_INTERNALS__: Internos };

/**
 * El IPC del iframe sin depender de que Tauri se lo dé: lo que `@tauri-apps/api` busca en `window.__TAURI_INTERNALS__`.
 * Solo pasa `db_consultar`, siempre con el id del lado, por el `invoke` del padre (mismo origen); lo demás se rechaza
 * con `solo_lectura`, como un error de Rust. El resultado se copia para que sus objetos sean de este iframe.
 */
export function instalarPuente(id: string, padre: Window): void {
  // Se toma ahora: si el padre fuera esta misma ventana, buscarlo después daría con el puente y no con Tauri.
  const del = (padre as unknown as ConInternos).__TAURI_INTERNALS__;
  const invocar = del.invoke.bind(del);
  (window as unknown as ConInternos).__TAURI_INTERNALS__ = {
    invoke: async (cmd, args, opciones) => {
      if (!(PERMITIDOS as readonly string[]).includes(cmd)) return Promise.reject("solo_lectura");
      return structuredClone(await invocar(cmd, { ...args, baseId: id }, opciones));
    },
    // las fotos llegan por `foto://<id del lado>/…`
    convertFileSrc: del.convertFileSrc.bind(del),
    transformCallback: del.transformCallback.bind(del),
    metadata: del.metadata,
  };
}
