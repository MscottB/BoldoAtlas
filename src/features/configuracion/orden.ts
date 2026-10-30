/** La lista de ids con `id` movido `delta` lugares (-1 sube, 1 baja); en los extremos queda igual. */
export function moverEn(ids: readonly string[], id: string, delta: -1 | 1): string[] {
  const resultado = [...ids];
  const i = resultado.indexOf(id);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= resultado.length) return resultado;
  [resultado[i], resultado[j]] = [resultado[j], resultado[i]];
  return resultado;
}
