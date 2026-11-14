import type { Hoja } from "./libro";
import EscribirWorker from "./escribir.worker?worker";

/** Como los fallos de Rust: `mensajeFallo` lo dice en el idioma activo (`respaldos.error.excel_libro`). */
const fallo = (detalle: string) => ({ codigo: "excel_libro", detalle });

/** `escribirLibro` en un worker propio, que se cierra al terminar: ExcelJS no queda cargado en la ventana. */
export function escribirAparte(hojas: Hoja[]): Promise<Uint8Array> {
  const worker = new EscribirWorker();
  const listo = new Promise<Uint8Array>((resolver, rechazar) => {
    worker.onmessage = ({ data }: MessageEvent<{ libro?: Uint8Array; error?: string }>) =>
      data.libro ? resolver(data.libro) : rechazar(fallo(data.error ?? ""));
    worker.onerror = (e) => rechazar(fallo(e.message));
    worker.onmessageerror = () => rechazar(fallo("messageerror"));
  }).finally(() => worker.terminate());
  worker.postMessage(hojas);
  return listo;
}
