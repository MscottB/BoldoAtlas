export interface ReleaseApi {
  tag_name: string;
  draft?: boolean;
  published_at?: string | null;
}

// La lista de la API no sale ordenada por fecha de publicación (alpha.10 aparece detrás de alpha.9), así que se
// elige la más reciente por published_at, sin contar borradores. Empates: la última de la lista.
export function masReciente<T extends ReleaseApi>(lista: T[]): T | undefined {
  let mejor: T | undefined;
  for (const r of lista) {
    if (r.draft || !r.published_at) continue;
    if (!mejor || Date.parse(r.published_at) >= Date.parse(mejor.published_at as string)) mejor = r;
  }
  return mejor;
}
