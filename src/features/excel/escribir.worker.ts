import { escribirLibro } from "./escribir";
import type { Hoja } from "./libro";

// Escribir el libro de una lista grande toma de 0,3 a 0,5 s (10.000 filas del Directorio): fuera del hilo de la
// ventana, que no se congela. Recibe las hojas y responde { libro } (sus bytes, transferidos) o { error }.
self.onmessage = async ({ data }: MessageEvent<Hoja[]>) => {
  try {
    const libro = await escribirLibro(data);
    self.postMessage({ libro }, { transfer: [libro.buffer] });
  } catch (error) {
    self.postMessage({ error: String(error) });
  }
};
