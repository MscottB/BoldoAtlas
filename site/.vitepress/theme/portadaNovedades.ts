// novedades.json acumula todas las novedades, de la más nueva a la más antigua; la portada muestra solo las últimas.
export const PORTADA = 3;

export const portada = <T>(lista: T[]): T[] => lista.slice(0, PORTADA);
