<script setup lang="ts">
import { computed, nextTick, ref, shallowRef, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useI18n } from "vue-i18n";
import { VueFlow, useVueFlow, type Edge, type Node, type NodeDragEvent } from "@vue-flow/core";
import { MiniMap } from "@vue-flow/minimap";
import "@vue-flow/core/dist/style.css";
import "@vue-flow/core/dist/theme-default.css";
import "@vue-flow/minimap/dist/style.css";
import { toast } from "vue-sonner";
import { ArrowUp, Network } from "@lucide/vue";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import type { Etiqueta, Unidad } from "@/db/tipos";
import { useOrganizacion } from "@/stores/organizacion";
import { creaCiclo, dotacionPorUnidad, indiceHijos, ruta } from "./jerarquia";
import {
  calcularLayout,
  subgrafoVisible,
  colapsadosIniciales,
  unidadesDeRama,
  type Subgrafo,
} from "./layout";
import { destinoAlSoltar, useLienzo } from "./useLienzo";
import NodoUnidad, { type DatosNodo } from "./NodoUnidad.vue";
import BarraLienzo from "./BarraLienzo.vue";

const TAM = { ancho: 220, alto: 112 }; // igual que la tarjeta de NodoUnidad
type Punto = { x: number; y: number };

const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const org = useOrganizacion();
const { colapsados, seleccion, expandir } = useLienzo();
const { fitView, setCenter, updateNode, areNodesInitialized } = useVueFlow();

// Vista enfocada: /?raiz=<id>. Una raíz que ya no existe se ignora y se ve todo.
const raiz = computed(() => {
  const r = route.query.raiz;
  return typeof r === "string" && org.porId.has(r) ? r : null;
});
const mostradas = computed(() => (raiz.value ? unidadesDeRama(org.unidades, raiz.value) : org.unidades));
const origen = computed(() => (raiz.value ? ruta(org.unidades, raiz.value) : []));

// Al cambiar de vista, tras el próximo layout: encuadrar todo, o centrar en `centrar`.
// `revelar` lo fija "Ver en el árbol completo": la unidad que estaba enfocada.
let revelar: string | null = null;
let encuadrar = false;
let centrar: string | null = null;
watch(
  raiz,
  () => {
    const c = colapsadosIniciales(mostradas.value);
    if (revelar) for (const a of ruta(org.unidades, revelar).slice(0, -1)) c.delete(a.id);
    colapsados.value = c;
    seleccion.value = centrar = revelar;
    encuadrar = !revelar;
    revelar = null;
  },
  { immediate: true },
);

// El layout es asíncrono: solo aplica el del último cambio, junto con el subgrafo que lo produjo.
const vista = shallowRef<{ g: Subgrafo; pos: Map<string, Punto> } | null>(null);
let ultimo = 0;
watch(
  () => subgrafoVisible(mostradas.value, org.conexiones, colapsados.value),
  async (g) => {
    const este = ++ultimo;
    const pos = await calcularLayout(g, TAM);
    if (este !== ultimo) return;
    vista.value = { g, pos };
    if (!encuadrar && !centrar) return;
    const id = centrar;
    encuadrar = false;
    centrar = null;
    await nextTick(); // Vue Flow ya recibió los nodos nuevos: desde aquí, "medidos" se refiere a ellos
    pendiente.value = { centrar: id };
  },
  { immediate: true },
);

// fitView ignora los nodos sin medir: se espera a que Vue Flow los mida todos (de inmediato si ya lo estaban).
const pendiente = ref<{ centrar: string | null } | null>(null);
watch([pendiente, areNodesInitialized], ([p, medidos]) => {
  if (!p || !medidos) return;
  pendiente.value = null;
  const c = p.centrar && vista.value?.pos.get(p.centrar);
  if (c) void setCenter(c.x + TAM.ancho / 2, c.y + TAM.alto / 2, { zoom: 1 });
  else void fitView();
});

const trabajadorPorId = computed(() => new Map(org.trabajadores.map((x) => [x.id, x])));
const etiquetasDe = computed(() => {
  const porId = new Map(org.etiquetas.map((e) => [e.id, e]));
  const m = new Map<string, Etiqueta[]>();
  for (const { unidad_id, etiqueta_id } of org.unidadEtiquetas) {
    const e = porId.get(etiqueta_id);
    if (e) m.set(unidad_id, [...(m.get(unidad_id) ?? []), e]);
  }
  return m;
});

const nodos = computed<Node<DatosNodo>[]>(() => {
  if (!vista.value) return [];
  const { g, pos } = vista.value;
  const indice = indiceHijos(mostradas.value);
  const dotaciones = dotacionPorUnidad(mostradas.value, org.trabajadores);
  return g.nodos.map((u) => {
    const { total, vacantes } = dotaciones.get(u.id)!;
    return {
      id: u.id,
      type: "unidad",
      position: pos.get(u.id)!,
      data: {
        unidad: u,
        jefe: (u.jefe_id && trabajadorPorId.value.get(u.jefe_id)) || null, // jefe borrado → Sin jefatura
        total,
        vacantes,
        etiquetas: etiquetasDe.value.get(u.id) ?? [],
        hijos: indice.get(u.id)?.length ?? 0,
      },
    };
  });
});

const aristas = computed<Edge[]>(() => {
  if (!vista.value) return [];
  const { g } = vista.value;
  return [
    ...g.jerarquicas.map(([a, b]) => ({ id: `${a}>${b}`, source: a, target: b, type: "smoothstep" })),
    ...g.laterales.map((c) => ({
      id: c.id,
      source: c.origen_id,
      target: c.destino_id,
      label: c.etiqueta ?? undefined,
      style: { stroke: "var(--marca)", strokeDasharray: "6 4" },
    })),
  ];
});

// Separado de `moviendo`: AlertDialogAction cierra el diálogo antes de que corra su @click.
const confirmando = ref(false);
const moviendo = ref<{ unidad: Unidad; destino: Unidad } | null>(null);

function alSoltar({ node }: NodeDragEvent) {
  const pos = vista.value?.pos;
  if (!pos) return;
  const destino = destinoAlSoltar(node.id, node.position, pos, TAM);
  const unidad = org.porId.get(node.id);
  // La tarjeta vuelve a su lugar; si se confirma el movimiento, el layout la reubica.
  updateNode(node.id, { position: pos.get(node.id) });
  if (!unidad || !destino || destino === unidad.parent_id) return;
  if (creaCiclo(org.unidades, unidad.id, destino)) return void toast.warning(t("store.cicloRama"));
  moviendo.value = { unidad, destino: org.porId.get(destino)! };
  confirmando.value = true;
}

async function mover() {
  const m = moviendo.value;
  if (!m) return;
  expandir(m.destino.id);
  const r = await org.moverUnidad(m.unidad.id, m.destino.id);
  if (!r.ok) toast.error(r.mensaje);
}

const irA = (id: string | null) => router.push({ query: id ? { raiz: id } : {} });
function verCompleto() {
  revelar = raiz.value;
  // Si la navegación no cambió `raiz` (p. ej. abortada), que no quede pendiente para otra.
  void irA(null)
    .then(() => nextTick())
    .finally(() => (revelar = null));
}
</script>

<template>
  <section class="flex h-full flex-col">
    <nav
      v-if="raiz"
      class="flex flex-wrap items-center gap-2 border-b px-3 py-2 text-sm"
      :aria-label="t('arbol.rutaOrigen')"
    >
      <ol class="flex flex-wrap items-center gap-1">
        <li v-for="(u, i) in origen" :key="u.id" class="flex items-center gap-1">
          <span v-if="i" aria-hidden="true" class="text-muted-foreground">›</span>
          <span v-if="u.id === raiz" class="font-semibold" aria-current="page">{{ u.nombre }}</span>
          <button
            v-else
            type="button"
            class="rounded hover:underline focus-visible:outline-2 focus-visible:outline-ring"
            @click="irA(u.id)"
          >
            {{ u.nombre }}
          </button>
        </li>
      </ol>
      <span class="ml-auto flex gap-1">
        <Button variant="outline" size="sm" @click="irA(org.porId.get(raiz)?.parent_id ?? null)">
          <ArrowUp aria-hidden="true" />
          {{ t("arbol.subirNivel") }}
        </Button>
        <Button variant="outline" size="sm" @click="verCompleto">{{ t("arbol.verCompleto") }}</Button>
      </span>
    </nav>
    <BarraLienzo :raiz="raiz" />
    <div class="relative min-h-0 flex-1">
      <!-- Sin only-render-visible-elements: empeora el arrastre (nota de rendimiento). -->
      <VueFlow
        :nodes="nodos"
        :edges="aristas"
        :min-zoom="0.05"
        :elements-selectable="false"
        :nodes-connectable="false"
        :nodes-focusable="false"
        :edges-focusable="false"
        :zoom-on-double-click="false"
        :delete-key-code="null"
        class="lienzo"
        @node-drag-stop="alSoltar"
        @pane-click="seleccion = null"
      >
        <template #node-unidad="p">
          <NodoUnidad :id="p.id" :data="p.data" />
        </template>
        <MiniMap pannable zoomable />
      </VueFlow>
      <div
        v-if="org.vacia"
        class="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-3 text-center"
      >
        <Network class="size-10 text-muted-foreground" aria-hidden="true" />
        <h1 class="text-lg font-semibold">{{ t("arbol.vacioTitulo") }}</h1>
        <p class="max-w-sm text-sm text-muted-foreground">{{ t("arbol.vacioTexto") }}</p>
      </div>
    </div>
    <AlertDialog v-model:open="confirmando">
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {{
              t("arbol.confirmarMover", {
                unidad: moviendo?.unidad.nombre,
                destino: moviendo?.destino.nombre,
              })
            }}
          </AlertDialogTitle>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{{ t("arbol.cancelar") }}</AlertDialogCancel>
          <AlertDialogAction @click="mover">{{ t("arbol.mover") }}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </section>
</template>

<style scoped>
/* Etiquetas de las conexiones laterales y minimapa legibles en ambos temas. */
.lienzo :deep(.vue-flow__edge-textbg) {
  fill: var(--background);
}
.lienzo :deep(.vue-flow__edge-text) {
  fill: var(--foreground);
}
.lienzo :deep(.vue-flow__minimap) {
  background: var(--card);
}
.lienzo :deep(.vue-flow__minimap-mask) {
  fill: color-mix(in oklab, var(--muted) 60%, transparent);
}
</style>
