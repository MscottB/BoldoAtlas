import pdfMake from "pdfmake/build/pdfmake";
import vfs from "pdfmake/build/vfs_fonts";
import { documentoManual, type DatosManualPdf, type OpcionesManual } from "./manualPdf";
import { documentoPdf, type OpcionesPdf, type PaginaPdf, type TDocumentDefinitions } from "./pdf";

// Las fuentes (Roboto) vienen en el paquete, y nada se baja de la red: ni fuentes ni imágenes.
pdfMake.addVirtualFileSystem(vfs);
pdfMake.setUrlAccessPolicy(() => false);

/**
 * Los bytes del PDF de un documento. Avisa cuántas partes lleva dibujadas, de las de `content` (en el organigrama, una
 * por página). `compress` en false, solo para leerlo en las pruebas.
 */
export async function generarDocumento(
  documento: TDocumentDefinitions,
  alAvanzar: (hechas: number, total: number) => void,
  compress = true,
): Promise<Uint8Array> {
  const total = documento.content.length;
  let hechas = -1;
  // pdfmake avisa qué parte del dibujo de las páginas va hecha (de 0 a 1), no la página. Se dice la que se está
  // dibujando: desde la 1, nunca «página 0».
  pdfMake.setProgressCallback((parte) => {
    const n = Math.max(1, Math.ceil(parte * total));
    if (n !== hechas) alAvanzar((hechas = n), total);
  });
  // No con getBuffer: en 0.3.11 un error del flujo lo deja esperando para siempre.
  const flujo = await pdfMake.createPdf({ ...documento, compress }).getStream();
  const partes = await new Promise<Uint8Array[]>((resolver, rechazar) => {
    const leidas: Uint8Array[] = [];
    flujo.on("data", (p) => leidas.push(p as Uint8Array));
    flujo.on("end", () => resolver(leidas));
    flujo.on("error", rechazar);
    flujo.end();
  });
  const pdf = new Uint8Array(partes.reduce((n, p) => n + p.length, 0));
  partes.reduce((n, p) => (pdf.set(p, n), n + p.length), 0);
  return pdf;
}

/** Los bytes del PDF del organigrama. Avisa cuántas páginas lleva dibujadas. */
export const generarPdf = (
  paginas: PaginaPdf[],
  o: OpcionesPdf,
  alAvanzar: (hechas: number, total: number) => void,
  compress = true,
) => generarDocumento(documentoPdf(paginas, o), alAvanzar, compress);

/** Lo que manda `armarPdf`: el PDF del organigrama o el manual. */
export type PedidoPdf =
  | { tipo: "organigrama"; paginas: PaginaPdf[]; o: OpcionesPdf }
  | { tipo: "manual"; datos: DatosManualPdf; o: OpcionesManual };

// En las pruebas (node) no hay `self`: ahí solo se usa generarDocumento.
if (typeof self !== "undefined")
  self.onmessage = async ({ data }: MessageEvent<PedidoPdf>) => {
    try {
      const documento =
        data.tipo === "manual" ? documentoManual(data.datos, data.o) : documentoPdf(data.paginas, data.o);
      const pdf = await generarDocumento(documento, (hechas, total) =>
        self.postMessage({ avance: [hechas, total] }),
      );
      self.postMessage({ pdf }, { transfer: [pdf.buffer] });
    } catch (error) {
      self.postMessage({ error: String(error) });
    }
  };
