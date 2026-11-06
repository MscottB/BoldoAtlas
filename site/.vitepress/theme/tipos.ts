export type Lang = "es" | "en";

export interface Enlace {
  texto: string;
  href: string;
}

// temas: hay una captura para el tema claro y otra para el oscuro; ayuda: sale de ayuda/img (una sola versión)
export interface Imagen {
  nombre: string;
  ancho: number;
  alto: number;
  alt: string;
  temas: boolean;
  ayuda?: boolean;
  leyenda?: string;
}

export interface Funcion {
  id: string;
  etiqueta: string;
  titulo: string;
  texto: string;
  puntos: string[];
  imagen: Imagen;
  enlace?: Enlace;
}

export interface Seccion {
  id: string;
  titulo: string;
  parrafos: string[];
  puntos?: string[];
  // varios cuando la sección tiene más de un lugar para comprobarla (el código y el reporte privado)
  enlace?: Enlace | Enlace[];
}
