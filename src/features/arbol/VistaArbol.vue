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
import {
  creaCiclo,
  dotacionPorUnidad,
  indiceHijos,
  jefeVisible,
  leyendaDeMarcas,
  marcasPorUnidad,
  ruta,
  rutasPorTipo,
  rutaSuperiores,
  tiposEnUso,
  vigentesPorPuesto,
} from "./jerarquia";
import {
  calcularLayout,
  subgrafoVisible,
  colapsadosIniciales,
  unidadesDeRama,
  type Subgrafo,
} from "./layout";
import { destinoAlSoltar, useLienzo } from "./useLienzo";
import { recordarPorArbol, useVista } from "./useVista";
import {
  CRITERIO_LEYENDA,
  arbolDeVista,
  leyendasEnUso,
  opcionesElk,
  tamPuesto,
  tamUnidad,
  tipoArista,
  tipoDeMarca,
} from "./vista";
import NodoUnidad, { type DatosNodo } from "./NodoUnidad.vue";
import NodoPuesto, { type DatosPuesto } from "./NodoPuesto.vue";
import BarraLienzo from "./BarraLienzo.vue";
import LeyendaLienzo, { type EntradaLeyenda } from "./LeyendaLienzo.vue";
import PanelUnidad from "@/features/unidades/PanelUnidad.vue";

type Punto = { x: number; y: number };

const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const org = useOrganizacion();
const { colapsados, seleccion, expandir } = useLienzo();
const { fitView, setCenter, updateNode, updateNodeInternals, areNodesInitialized } = useVueFlow();
const { config } = useVista();

// Opciones de «Vista» que cambian lo dibujado. Solo cuentan los tipos que alguna unidad usa.
const tiposUso = computed(() => tiposEnUso(org.unidades, org.catalogos.tipos_unidad));
const tiposRuta = computed(
  () => new Set(tiposUso.value.filter((x) => config.value.rutaTipos.includes(x.id)).map((x) => x.id)),
);
const porLeyenda = computed(() => config.value.colorearPor === CRITERIO_LEYENDA);
const tipoMarca = computed(() => tipoDeMarca(config.value.colorearPor, tiposUso.value));
// Sobre todas las unidades, no solo la rama enfocada: la marca puede venir de un superior fuera de ella.
const marcas = computed(() => (tipoMarca.value ? marcasPorUnidad(org.unidades, tipoMarca.value) : null));
const rutas = computed(() =>
  tiposRuta.value.size ? rutasPorTipo(org.unidades, org.catalogos.tipos_unidad, tiposRuta.value) : null,
);
// Igual que la tarjeta de NodoUnidad (misma función); con la ruta por tipo suma una línea, y la compacta es de una línea.
const TAM = computed(() => tamUnidad(config.value, !!rutas.value));

// Vista enfocada: /?raiz=<id>. Una raíz que ya no existe se ignora y se ve todo.
const raiz = computed(() => {
  const r = route.query.raiz;
  return typeof r === "string" && org.porId.has(r) ? r : null;
});
const mostradas = computed(() => (raiz.value ? unidadesDeRama(org.unidades, raiz.value) : org.unidades));
const origen = computed(() => (raiz.value ? ruta(org.unidades, raiz.value) : []));
// Cada árbol (completo o subárbol guardado) recuerda su última configuración; una rama sin guardar usa la general.
const arbol = computed(() => arbolDeVista(raiz.value, org.subarboles));
recordarPorArbol(computed(() => (arbol.value === undefined ? null : (arbol.value ?? "completo"))));

// Al cambiar de vista, tras el próximo layout: encuadrar todo, o centrar en `centrar`.
// `revelar` lo fija "Ver en el árbol completo": la unidad que estaba enfocada. Al entrar con /?ver=<id> (desde Revisión)
// parte fijado: se abre el árbol completo con esa unidad seleccionada y centrada.
let revelar: string | null =
  typeof route.query.ver === "string" && org.porId.has(route.query.ver) ? route.query.ver : null;
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
  () => ({
    g: subgrafoVisible(
      mostradas.value,
      org.conexiones,
      colapsados.value,
      config.value.verPuestos ? org.puestos : [],
    ),
    tam: TAM.value,
    tamDelPuesto: tamPuesto(config.value),
    opciones: opcionesElk(config.value),
  }),
  async ({ g, tam, tamDelPuesto, opciones }) => {
    const este = ++ultimo;
    const pos = await calcularLayout(g, tam, tamDelPuesto, opciones);
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

// Otra dirección o densidad cambia la forma de todo el árbol: se encuadra tras el próximo layout, y los puntos de
// conexión (arriba/abajo o izquierda/derecha) se vuelven a medir.
watch(
  () => [config.value.direccion, config.value.densidad],
  async () => {
    encuadrar = true;
    await nextTick();
    updateNodeInternals();
  },
);

// fitView ignora los nodos sin medir: se espera a que Vue Flow los mida todos (de inmediato si ya lo estaban).
const pendiente = ref<{ centrar: string | null } | null>(null);
watch([pendiente, areNodesInitialized], ([p, medidos]) => {
  if (!p || !medidos) return;
  pendiente.value = null;
  const c = p.centrar && vista.value?.pos.get(p.centrar);
  if (c) void setCenter(c.x + TAM.value.ancho / 2, c.y + TAM.value.alto / 2, { zoom: 1 });
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

const nodos = computed<Node[]>(() => {
  if (!vista.value) return [];
  const { g, pos } = vista.value;
  const indice = indiceHijos(mostradas.value);
  const dotaciones = dotacionPorUnidad(mostradas.value, org.puestos, org.asignaciones);
  const vigentes = vigentesPorPuesto(org.asignaciones);
  const unidades = g.nodos.map((u): Node<DatosNodo> => {
    const { total, vacantes } = dotaciones.get(u.id)!;
    const jefe = jefeVisible(u, vigentes);
    return {
      id: u.id,
      type: "unidad",
      position: pos.get(u.id)!,
      data: {
        unidad: u,
        jefe: (jefe && trabajadorPorId.value.get(jefe.trabajador_id)) || null,
        jefeReemplazo: jefe?.tipo === "reemplazo",
        total,
        vacantes,
        etiquetas: etiquetasDe.value.get(u.id) ?? [],
        hijos: indice.get(u.id)?.length ?? 0,
        marca: marcas.value?.get(u.id) ?? null,
        ruta: rutas.value
          ? rutaSuperiores(rutas.value, u)
              .map((x) => x.nombre)
              .join(" › ")
          : null,
      },
    };
  });
  const cargos = new Map(org.catalogos.cargos.map((c) => [c.id, c.nombre]));
  const nombre = (a?: { trabajador_id: string }) =>
    (a && trabajadorPorId.value.get(a.trabajador_id)?.nombre) || null;
  const leyendas = porLeyenda.value ? new Map(org.leyendas.map((l) => [l.id, l])) : null;
  const delPuesto = g.puestos.map((p): Node<DatosPuesto> => ({
    id: p.id,
    type: "puesto",
    position: pos.get(p.id)!,
    draggable: false,
    selectable: false,
    data: {
      cargo: cargos.get(p.cargo_id) ?? "",
      titular: nombre(vigentes.get(p.id)?.titular),
      reemplazo: nombre(vigentes.get(p.id)?.reemplazo),
      mostrarCargo: config.value.mostrarCargo,
      mostrarPersona: config.value.mostrarPersona,
      leyenda: (p.leyenda_id && leyendas?.get(p.leyenda_id)) || null,
    },
  }));
  return [...unidades, ...delPuesto];
});

const leyenda = computed<EntradaLeyenda[]>(() => {
  if (!vista.value) return [];
  if (porLeyenda.value)
    return leyendasEnUso(vista.value.g.puestos, org.leyendas).map((l) => ({
      clave: l.id,
      color: l.color,
      nombre: l.nombre,
      descripcion: l.descripcion,
    }));
  return marcas.value
    ? leyendaDeMarcas(marcas.value, vista.value.g.nodos).map((m) => ({
        clave: m.unidad.id,
        color: m.color,
        codigo: m.codigo,
        nombre: m.unidad.nombre,
      }))
    : [];
});
const tituloLeyenda = computed(() =>
  porLeyenda.value
    ? t("arbol.vista.leyendaPuesto")
    : t("arbol.vista.marcaDe", { tipo: tiposUso.value.find((x) => x.id === tipoMarca.value)?.nombre ?? "" }),
);

const aristas = computed<Edge[]>(() => {
  if (!vista.value) return [];
  const { g } = vista.value;
  return [
    ...g.jerarquicas.map(([a, b]) => ({
      id: `${a}>${b}`,
      source: a,
      target: b,
      type: tipoArista(config.value.lineas),
    })),
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
  // Los puestos no reciben tarjetas: solo las unidades son destino.
  const unidadesPos = new Map([...pos].filter(([id]) => org.porId.has(id)));
  const destino = destinoAlSoltar(node.id, node.position, unidadesPos, TAM.value);
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

// Panel de la unidad seleccionada. Al cerrarlo con el teclado o su botón, el foco vuelve a la tarjeta.
const unidadSeleccionada = computed(() =>
  seleccion.value ? (org.porId.get(seleccion.value) ?? null) : null,
);
async function cerrarPanel() {
  const id = seleccion.value;
  seleccion.value = null;
  await nextTick();
  if (id) document.querySelector<HTMLElement>(`.vue-flow__node[data-id="${CSS.escape(id)}"] button`)?.focus();
}
// Esc en el lienzo cierra el panel, salvo que se esté escribiendo (renombrar una tarjeta).
function escEnLienzo(e: KeyboardEvent) {
  if (!(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) void cerrarPanel();
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
    <div class="flex min-h-0 flex-1">
      <div class="relative min-w-0 flex-1" @keydown.esc="escEnLienzo">
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
          <template #node-puesto="p">
            <NodoPuesto :id="p.id" :data="p.data" />
          </template>
          <MiniMap pannable zoomable />
        </VueFlow>
        <LeyendaLienzo v-if="leyenda.length" :titulo="tituloLeyenda" :entradas="leyenda" />
        <div
          v-if="org.vacia"
          class="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-3 text-center"
        >
          <Network class="size-10 text-muted-foreground" aria-hidden="true" />
          <h1 class="text-lg font-semibold">{{ t("arbol.vacioTitulo") }}</h1>
          <p class="max-w-sm text-sm text-muted-foreground">{{ t("arbol.vacioTexto") }}</p>
        </div>
      </div>
      <PanelUnidad v-if="unidadSeleccionada" :unidad="unidadSeleccionada" @cerrar="cerrarPanel" />
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
