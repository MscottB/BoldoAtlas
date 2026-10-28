<script setup lang="ts">
import { ref, shallowRef } from "vue";
import { VueFlow, useVueFlow, type Edge, type Node } from "@vue-flow/core";
import { MiniMap } from "@vue-flow/minimap";
import ELK from "elkjs/lib/elk.bundled.js";
import "@vue-flow/core/dist/style.css";
import "@vue-flow/core/dist/theme-default.css";
import "@vue-flow/minimap/dist/style.css";
import { generarArbolFalso } from "./arbolFalso";

const ANCHO = 180;
const ALTO = 56;

const cantidad = ref(2000);
const nodos = shallowRef<Node[]>([]);
const aristas = shallowRef<Edge[]>([]);
const resultados = ref<Record<string, number | string>>({});
const { setViewport, fitView, findNode } = useVueFlow();
const soloVisibles = ref(true);

async function generar() {
  resultados.value = { estado: "calculando layout…" };
  const { nodos: falsos } = generarArbolFalso(cantidad.value, 6, 1);
  const t0 = performance.now();
  const grafo = await new ELK().layout({
    id: "raiz",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": "DOWN",
      "elk.spacing.nodeNode": "24",
      "elk.layered.spacing.nodeNodeBetweenLayers": "48",
    },
    children: falsos.map((n) => ({ id: n.id, width: ANCHO, height: ALTO })),
    edges: falsos
      .filter((n) => n.padre)
      .map((n) => ({ id: `e-${n.id}`, sources: [n.padre as string], targets: [n.id] })),
  });
  const msLayout = performance.now() - t0;
  const pos = new Map(grafo.children?.map((c) => [c.id, { x: c.x ?? 0, y: c.y ?? 0 }]));
  nodos.value = falsos.map((n) => ({
    id: n.id,
    position: pos.get(n.id) ?? { x: 0, y: 0 },
    data: { label: n.nombre },
    style: { width: `${ANCHO}px`, height: `${ALTO}px` },
  }));
  aristas.value = falsos
    .filter((n) => n.padre)
    .map((n) => ({ id: `e-${n.id}`, source: n.padre as string, target: n.id, type: "smoothstep" }));
  resultados.value = { nodos: cantidad.value, msLayout: Math.round(msLayout) };
}

/** Recorre en círculo la zona de la raíz a zoom 0,6 durante 3 s (como un arrastre del usuario) y cuenta cuadros. */
function medirFps() {
  const raiz = findNode("n0")?.position ?? { x: 0, y: 0 };
  const zoom = 0.6;
  let cuadros = 0;
  const inicio = performance.now();
  const paso = (ahora: number) => {
    const t = (ahora - inicio) / 1000;
    const cx = raiz.x + 400 * Math.cos(t * 2);
    const cy = raiz.y + 300 + 200 * Math.sin(t * 2);
    void setViewport({ x: 640 - cx * zoom, y: 360 - cy * zoom, zoom });
    cuadros++;
    if (ahora - inicio < 3000) requestAnimationFrame(paso);
    else
      resultados.value = {
        ...resultados.value,
        [soloVisibles.value ? "fpsSoloVisibles" : "fpsTodos"]: Math.round(cuadros / ((ahora - inicio) / 1000)),
        nodosEnPantalla: document.querySelectorAll(".vue-flow__node").length,
      };
  };
  requestAnimationFrame(paso);
}
</script>

<template>
  <div class="flex h-screen flex-col">
    <header class="flex items-center gap-3 border-b p-3 text-sm">
      <label class="flex items-center gap-2">
        Nodos
        <input v-model.number="cantidad" type="number" min="10" step="500" class="w-24 rounded border px-2 py-1" />
      </label>
      <button type="button" class="rounded bg-primary px-3 py-1 text-primary-foreground" @click="generar">
        Generar
      </button>
      <button type="button" class="rounded border px-3 py-1" @click="medirFps">Medir FPS</button>
      <button type="button" class="rounded border px-3 py-1" @click="fitView()">Encuadrar</button>
      <label class="flex items-center gap-1"><input v-model="soloVisibles" type="checkbox" /> Solo visibles</label>
      <pre id="resultados" class="ml-auto font-mono text-xs">{{ JSON.stringify(resultados) }}</pre>
    </header>
    <VueFlow
      :nodes="nodos"
      :edges="aristas"
      :only-render-visible-elements="soloVisibles"
      :min-zoom="0.05"
      class="flex-1"
    >
      <MiniMap />
    </VueFlow>
  </div>
</template>
