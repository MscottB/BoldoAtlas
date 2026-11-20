// Lo que solo se puede hacer en el navegador (Image, canvas, portapapeles). Lo que se calcula sin él está en formatos.ts.
import { escalaQueCabe } from "./formatos";

/** Lo que falló al armar la imagen; la ventana lo dice con `imagen.error.<codigo>`. */
export class ErrorImagen extends Error {
  readonly codigo: "leer" | "lienzo" | "crear";
  constructor(codigo: ErrorImagen["codigo"]) {
    super(codigo);
    this.codigo = codigo;
  }
}

function cargar(svg: string): Promise<HTMLImageElement> {
  return new Promise((ok, mal) => {
    const img = new Image();
    img.onload = () => ok(img);
    img.onerror = () => mal(new ErrorImagen("leer"));
    // data: y no blob:, que la CSP de la app (img-src 'self' data:) no deja cargar; la vista previa usa lo mismo
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  });
}

/** El SVG ya armado, dibujado en un canvas a `escala` (si no cabe, baja) y pasado a PNG o JPG. El JPG no tiene
 * transparencia: va siempre sobre blanco. El PNG transparente se pide con un SVG armado sin fondo. */
export async function svgABlob(
  svg: string,
  ancho: number,
  alto: number,
  o: { escala: 1 | 2 | 3 | 4; formato: "png" | "jpg"; fondo: "blanco" | "transparente" },
): Promise<Blob> {
  const e = escalaQueCabe(ancho, alto, o.escala).escala;
  const img = await cargar(svg);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(ancho * e));
  canvas.height = Math.max(1, Math.round(alto * e));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new ErrorImagen("lienzo");
  if (o.formato === "jpg" || o.fondo === "blanco") {
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((ok) =>
    canvas.toBlob(ok, o.formato === "jpg" ? "image/jpeg" : "image/png", 0.92),
  );
  if (!blob) throw new ErrorImagen("crear");
  return blob;
}

/** Lo mismo, como bytes (para «Guardar como»). */
export async function svgAImagen(...a: Parameters<typeof svgABlob>): Promise<Uint8Array> {
  return new Uint8Array(await (await svgABlob(...a)).arrayBuffer());
}

/** Pone un PNG en el portapapeles. Recibe la promesa del Blob (`svgABlob(...)`) sin esperarla antes: así el clic
 * conserva su permiso para escribir en el portapapeles mientras se arma la imagen. */
export async function copiarImagen(png: Blob | Promise<Blob>): Promise<void> {
  await navigator.clipboard.write([new ClipboardItem({ "image/png": png })]);
}
