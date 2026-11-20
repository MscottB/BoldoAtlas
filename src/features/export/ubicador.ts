import type { ElkNode } from "elkjs/lib/elk.bundled.js";
import type { NodoUbicado } from "@/features/arbol/layout";
import LayoutWorker from "@/features/arbol/layout.worker?worker";
import { colaDeUltimo } from "@/features/arbol/rendimiento";
import { REEMPLAZADO } from "./paginasDeAlcance";

/**
 * El layout en el worker del lienzo, para las ventanas de exportar: siguen respondiendo con organizaciones grandes. Si
 * llega otro pedido mientras uno corre, el anterior ya no sirve (colaDeUltimo) y se rechaza con REEMPLAZADO. El worker
 * se crea al primer pedido (así no lo hay en las pruebas) y otra vez si muere; `cerrar`, al desmontar la ventana.
 */
export function ubicadorEnWorker() {
  let worker: Worker | null = null;
  const cola = colaDeUltimo<ElkNode, NodoUbicado[]>((id, grafo) =>
    (worker ??= crearWorker()).postMessage({ id, grafo }),
  );
  function crearWorker() {
    const w = new LayoutWorker();
    w.onmessage = ({ data }: MessageEvent<{ id: number; ubicados?: NodoUbicado[]; error?: string }>) =>
      cola.recibir(data.id, data.ubicados, data.error);
    w.onerror = w.onmessageerror = (e: Event) => {
      e.preventDefault();
      w.terminate();
      worker = null;
      cola.fallar(e instanceof ErrorEvent ? e.message : e.type);
    };
    return w;
  }
  return {
    ubicar: async (grafo: ElkNode): Promise<NodoUbicado[]> =>
      (await cola.pedir(grafo)) ?? Promise.reject(REEMPLAZADO),
    cerrar: () => worker?.terminate(),
  };
}
