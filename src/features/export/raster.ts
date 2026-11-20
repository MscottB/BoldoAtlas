// Lo que solo se puede hacer en el navegador (Image, canvas, portapapeles). Lo que se calcula sin él está en formatos.ts.
import { escalaQueCabe } from "./formatos";

function cargar(svg: string): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }));
  return new Promise((ok, mal) => {
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      ok(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      mal(new Error("No se pudo leer el dibujo SVG como imagen."));
    };
    img.src = url;
  });
}

/** El SVG ya armado, dibujado en un canvas a `escala` (si no cabe, baja) y pasado a PNG o JPG. El JPG no tiene
 * transparencia: va siempre sobre blanco. El PNG transparente se pide con un SVG armado sin fondo. */
export async function svgAImagen(
  svg: string,
  ancho: number,
  alto: number,
  o: { escala: number; formato: "png" | "jpg"; fondo: "blanco" | "transparente" },
): Promise<Uint8Array> {
  const e = escalaQueCabe(ancho, alto, o.escala as 1 | 2 | 3 | 4).escala;
  const img = await cargar(svg);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(ancho * e));
  canvas.height = Math.max(1, Math.round(alto * e));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No se pudo crear el lienzo para la imagen.");
  if (o.formato === "jpg" || o.fondo === "blanco") {
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((ok) =>
    canvas.toBlob(ok, o.formato === "jpg" ? "image/jpeg" : "image/png", 0.92),
  );
  if (!blob) throw new Error("No se pudo crear la imagen: es demasiado grande.");
  return new Uint8Array(await blob.arrayBuffer());
}

/** Pone un PNG en el portapapeles. */
export async function copiarImagen(png: Uint8Array): Promise<void> {
  const blob = new Blob([png as BlobPart], { type: "image/png" });
  await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
}
