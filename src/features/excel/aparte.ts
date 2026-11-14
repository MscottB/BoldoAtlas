import type { Hoja } from "./libro";
import EscribirWorker from "./escribir.worker?worker";

/** `escribirLibro` en un worker propio, que se cierra al terminar: ExcelJS no queda cargado en la ventana. */
export function escribirAparte(hojas: Hoja[]): Promise<Uint8Array> {
  const worker = new EscribirWorker();
  const listo = new Promise<Uint8Array>((resolver, rechazar) => {
    worker.onmessage = ({ data }: MessageEvent<{ libro?: Uint8Array; error?: string }>) =>
      data.libro ? resolver(data.libro) : rechazar(data.error);
    worker.onerror = worker.onmessageerror = () => rechazar("worker");
  }).finally(() => worker.terminate());
  worker.postMessage(hojas);
  return listo;
}
