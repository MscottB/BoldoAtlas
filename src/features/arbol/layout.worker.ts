import ELK, { type ElkNode } from "elkjs/lib/elk.bundled.js";

// elk fuera del hilo principal: con 2.000 unidades tarda 1–2 s y la interfaz no debe congelarse (nota de rendimiento).
// Recibe { id, grafo } (de grafoElk) y responde { id, ubicados } o { id, error }.
const elk = new ELK();
self.onmessage = async ({ data: { id, grafo } }: MessageEvent<{ id: number; grafo: ElkNode }>) => {
  try {
    const r = await elk.layout(grafo);
    self.postMessage({ id, ubicados: (r.children ?? []).map(({ id, x, y }) => ({ id, x, y })) });
  } catch (error) {
    self.postMessage({ id, error: String(error) });
  }
};
