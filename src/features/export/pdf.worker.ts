import pdfMake from "pdfmake/build/pdfmake";
import vfs from "pdfmake/build/vfs_fonts";
import { documentoPdf, type OpcionesPdf, type PaginaPdf } from "./pdf";

// Las fuentes (Roboto) vienen en el paquete, y nada se baja de la red: ni fuentes ni imágenes.
pdfMake.addVirtualFileSystem(vfs);
pdfMake.setUrlAccessPolicy(() => false);

/** Los bytes del PDF. Avisa cuántas páginas lleva dibujadas. `compress` en false, solo para leerlo en las pruebas. */
export async function generarPdf(
  paginas: PaginaPdf[],
  o: OpcionesPdf,
  alAvanzar: (hechas: number, total: number) => void,
  compress = true,
): Promise<Uint8Array> {
  const documento = documentoPdf(paginas, o);
  const total = documento.content.length;
  let hechas = -1;
  // pdfmake avisa qué parte del dibujo de las páginas va hecha (de 0 a 1), no la página.
  pdfMake.setProgressCallback((parte) => {
    const n = Math.floor(parte * total);
    if (n !== hechas) alAvanzar((hechas = n), total);
  });
  const b = await pdfMake.createPdf({ ...documento, compress }).getBuffer();
  return new Uint8Array(b.buffer, b.byteOffset, b.byteLength);
}

/** Lo que manda `armarPdf`: cada dibujo una vez, y cada página con el índice del suyo. */
export interface PedidoPdf {
  svgs: string[];
  paginas: (Omit<PaginaPdf, "svg"> & { svg: number })[];
  o: OpcionesPdf;
}

// En las pruebas (node) no hay `self`: ahí solo se usa generarPdf.
if (typeof self !== "undefined")
  self.onmessage = async ({ data }: MessageEvent<PedidoPdf>) => {
    try {
      const paginas = data.paginas.map((p) => ({ ...p, svg: data.svgs[p.svg]! }));
      const pdf = await generarPdf(paginas, data.o, (hechas, total) =>
        self.postMessage({ avance: [hechas, total] }),
      );
      self.postMessage({ pdf }, { transfer: [pdf.buffer] });
    } catch (error) {
      self.postMessage({ error: String(error) });
    }
  };
