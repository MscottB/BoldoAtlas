// Fuera del componente: también la usa la imagen exportada (export/treeSvg).
/** Una fila de la leyenda: una marca (con código), una entrada de leyenda de puestos (con descripción) o un tipo de línea (`trazo`). */
export interface EntradaLeyenda {
  clave: string;
  color: string | null;
  codigo?: string | null;
  nombre: string;
  descripcion?: string | null;
  trazo?: "punteado" | "puntos" | "continuo";
}
