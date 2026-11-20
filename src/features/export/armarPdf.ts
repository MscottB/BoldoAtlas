import type { OpcionesPdf, PaginaPdf } from "./pdf";
import type { PedidoPdf } from "./pdf.worker";
import PdfWorker from "./pdf.worker?worker";

/** Como los fallos de Rust: `mensajeFallo` lo dice con el texto general y el detalle. */
const fallo = (detalle: string) => ({ codigo: "pdf_armar", detalle });

/** El PDF, armado en un worker propio que se cierra al terminar: pdfmake no se carga en la ventana. */
export function armarPdf(
  paginas: PaginaPdf[],
  o: OpcionesPdf,
  alAvanzar: (hechas: number, total: number) => void,
): Promise<Uint8Array> {
  const worker = new PdfWorker();
  const listo = new Promise<Uint8Array>((resolver, rechazar) => {
    worker.onmessage = ({
      data,
    }: MessageEvent<{ avance?: [number, number]; pdf?: Uint8Array; error?: string }>) => {
      if (data.avance) alAvanzar(...data.avance);
      else if (data.pdf) resolver(data.pdf);
      else rechazar(fallo(data.error ?? ""));
    };
    worker.onerror = (e) => rechazar(fallo(e.message));
    worker.onmessageerror = () => rechazar(fallo("messageerror"));
  }).finally(() => worker.terminate());
  // Las hojas de la cuadrícula comparten el dibujo: viaja una vez, no una por hoja.
  const indice = new Map<string, number>();
  for (const p of paginas) if (!indice.has(p.svg)) indice.set(p.svg, indice.size);
  const pedido: PedidoPdf = {
    svgs: [...indice.keys()],
    paginas: paginas.map((p) => ({ ...p, svg: indice.get(p.svg)! })),
    o,
  };
  worker.postMessage(pedido);
  return listo;
}
