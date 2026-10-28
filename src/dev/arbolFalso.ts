export interface NodoFalso {
  id: string;
  padre: string | null;
  nombre: string;
}

/** PRNG mulberry32: mismo resultado para la misma semilla. */
function aleatorio(semilla: number): () => number {
  let a = semilla >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Árbol de prueba con una raíz y como máximo `hijosMax` hijos por nodo. */
export function generarArbolFalso(n: number, hijosMax: number, semilla: number): { nodos: NodoFalso[] } {
  const azar = aleatorio(semilla);
  const nodos: NodoFalso[] = [{ id: "n0", padre: null, nombre: "Unidad 0" }];
  const hijos = new Map<string, number>();
  const candidatos = ["n0"];
  for (let i = 1; i < n; i++) {
    const k = Math.floor(azar() * candidatos.length);
    const padre = candidatos[k];
    const id = `n${i}`;
    nodos.push({ id, padre, nombre: `Unidad ${i}` });
    candidatos.push(id);
    const total = (hijos.get(padre) ?? 0) + 1;
    hijos.set(padre, total);
    if (total >= hijosMax) candidatos.splice(k, 1);
  }
  return { nodos };
}
