// La portada vieja tenía todo en una página; sus anclas (en enlaces guardados o compartidos) llevan a la página nueva.
// #por-que y #lo-nuevo siguen en Inicio.
const FUNCIONES = ["arboles", "personas", "fechas", "directorio", "portable", "compartir", "sistemas"];
const ANCLAS: Record<string, string> = {
  "#funciones": "/funciones",
  "#confianza": "/seguridad",
  "#preguntas": "/acerca#preguntas",
  ...Object.fromEntries(FUNCIONES.map((id) => [`#${id}`, `/funciones#${id}`])),
};

/** `ruta` sin la base del sitio (`/` o `/en/`) y `hash` con `#`. Devuelve la ruta nueva, o null si no hay que ir a otra. */
export function destinoAncla(ruta: string, hash: string): string | null {
  const prefijo = ruta === "/" ? "" : ruta === "/en/" ? "/en" : null;
  const destino = ANCLAS[hash];
  return prefijo === null || !destino ? null : prefijo + destino;
}
