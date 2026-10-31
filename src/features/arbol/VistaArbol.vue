<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, provide, ref, shallowRef, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useI18n } from "vue-i18n";
import { VueFlow, useVueFlow, type Edge, type Node, type NodeDragEvent } from "@vue-flow/core";
import { MiniMap } from "@vue-flow/minimap";
import "@vue-flow/core/dist/style.css";
import "@vue-flow/core/dist/theme-default.css";
import "@vue-flow/minimap/dist/style.css";
import { toast } from "vue-sonner";
import { ArrowUp, CalendarClock, LoaderCircle, Network } from "@lucide/vue";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
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
  personasPorUnidad,
  ruta,
  rutasPorTipo,
  tiposEnUso,
} from "./jerarquia";
import {
  aristasDibujadas,
  grafoElk,
  posiciones,
  reubicar,
  subgrafoVisible,
  colapsadosIniciales,
  unidadesDeRama,
  type NodoUbicado,
  type Subgrafo,
} from "./layout";
import LayoutWorker from "./layout.worker?worker";
import { LIMITE_TARJETAS, colaDeUltimo, conMinimapa, tarjetasLigeras } from "./rendimiento";
import { CONTEXTO_LIENZO } from "./contexto";
import { destinoAlSoltar, useLienzo } from "./useLienzo";
import { recordarPorArbol, useVista } from "./useVista";
import {
  CRITERIO_LEYENDA,
  arbolDeVista,
  jefeEnTarjeta,
  leerVista,
  leyendasEnUso,
  tamPuesto,
  tamUnidad,
  tipoArista,
  tipoDeMarca,
} from "./vista";
import NodoUnidad, { type DatosNodo } from "./NodoUnidad.vue";
import NodoPuesto, { type DatosPuesto } from "./NodoPuesto.vue";
import BarraLienzo from "./BarraLienzo.vue";
import BarraSeleccion from "./BarraSeleccion.vue";
import MenuLienzo from "./MenuLienzo.vue";
import LeyendaLienzo, { type EntradaLeyenda } from "./LeyendaLienzo.vue";
import PanelUnidad from "@/features/unidades/PanelUnidad.vue";
import { formatearFecha } from "@/features/puestos/puestos";
import { useTema } from "@/features/tema/useTema";
import { leerEstadoArbol, type EstadoArbol } from "@/features/pestanas/pestanas";
import { useEstadoPestana } from "@/features/pestanas/usePestanas";

type Punto = { x: number; y: number };

const { t, locale } = useI18n();
const route = useRoute();
const router = useRouter();
const org = useOrganizacion();
const {
  colapsados,
  seleccion,
  seleccionadas,
  expandir,
  centrarEn,
  sumarVarias,
  podarSeleccion,
  limpiarMultiple,
  avisoExpansion,
  cancelarExpansion,
} = useLienzo();
const {
  fitView,
  fitBounds,
  findNode,
  setCenter,
  updateNode,
  updateNodeInternals,
  areNodesInitialized,
  getSelectedNodes,
  removeSelectedElements,
  setViewport,
  viewport,
} = useVueFlow();
const { config } = useVista();
const { escala } = useTema();

// Opciones de «Vista» que cambian lo dibujado. Solo cuentan los tipos que alguna unidad usa.
const tiposUso = computed(() => tiposEnUso(org.enFecha.unidades, org.catalogos.tipos_unidad));
const tiposRuta = computed(
  () => new Set(tiposUso.value.filter((x) => config.value.rutaTipos.includes(x.id)).map((x) => x.id)),
);
const porLeyenda = computed(() => config.value.colorearPor === CRITERIO_LEYENDA);
const tipoMarca = computed(() => tipoDeMarca(config.value.colorearPor, tiposUso.value));
// Sobre todas las unidades, no solo la rama enfocada: la marca puede venir de un superior fuera de ella.
const marcas = computed(() =>
  tipoMarca.value ? marcasPorUnidad(org.enFecha.unidades, tipoMarca.value) : null,
);
const rutas = computed(() =>
  tiposRuta.value.size
    ? rutasPorTipo(org.enFecha.unidades, org.catalogos.tipos_unidad, tiposRuta.value)
    : null,
);
// Igual que la tarjeta de NodoUnidad (misma función); con la ruta por tipo suma una línea, y la compacta es de una línea.
const TAM = computed(() => tamUnidad(config.value, !!rutas.value, escala.value));

// Vista enfocada: /?raiz=<id>. Una raíz que ya no existe se ignora y se ve todo.
const raiz = computed(() => {
  const r = route.query.raiz;
  return typeof r === "string" && org.enFecha.porId.has(r) ? r : null;
});
const mostradas = computed(() =>
  raiz.value ? unidadesDeRama(org.enFecha.unidades, raiz.value) : org.enFecha.unidades,
);
const origen = computed(() => (raiz.value ? ruta(org.enFecha.unidades, raiz.value) : []));
// Cada árbol (completo o subárbol guardado) recuerda su última configuración; una rama sin guardar usa la general.
const arbol = computed(() => arbolDeVista(raiz.value, org.subarboles));
recordarPorArbol(computed(() => (arbol.value === undefined ? null : (arbol.value ?? "completo"))));

// Al cambiar de vista, tras el próximo layout: encuadrar todo, o centrar en `centrar`.
// `revelar` lo fija "Ver en el árbol completo": la unidad que estaba enfocada. Si no, manda /?ver=<id> (desde Revisión o la
// paleta de comandos): se abre el árbol completo con esa unidad seleccionada y centrada.
let revelar: string | null = null;
const verDeLaRuta = () =>
  typeof route.query.ver === "string" && org.enFecha.porId.has(route.query.ver) ? route.query.ver : null;
let encuadrar = false;
let centrar: string | null = null;
watch(
  raiz,
  () => {
    const destino = revelar ?? verDeLaRuta();
    const c = colapsadosIniciales(mostradas.value);
    if (destino) for (const a of ruta(org.enFecha.unidades, destino).slice(0, -1)) c.delete(a.id);
    colapsados.value = c;
    seleccion.value = centrar = destino;
    encuadrar = !destino;
    revelar = null;
  },
  { immediate: true },
);

// Al volver a una pestaña (o a esta ruta dentro de ella): sus ramas plegadas, selección, encuadre y resaltado. Sin estado
// guardado rige lo de siempre (ramas iniciales, encuadrar todo, el resaltado de la sesión).
// `encuadre`: el guardado, hasta que se aplica (si la pestaña se deja antes, se conserva ese y no el de por defecto).
let encuadre: EstadoArbol["encuadre"] = null;
const previo = leerEstadoArbol(
  useEstadoPestana(() => ({
    colapsados: [...colapsados.value],
    seleccion: seleccion.value,
    encuadre: encuadre ?? { ...viewport.value },
    resaltar: { ...config.value.resaltar },
  })),
);
encuadre = previo?.encuadre ?? null;
if (previo) {
  colapsados.value = previo.colapsados;
  seleccion.value = previo.seleccion && org.enFecha.porId.has(previo.seleccion) ? previo.seleccion : null;
  config.value = { ...config.value, resaltar: leerVista({ resaltar: previo.resaltar }).resaltar };
  centrar = null;
  encuadrar = true; // tras el primer layout se aplica `encuadre` (o se encuadra todo si no había)
}

// El layout corre en un worker (la interfaz sigue respondiendo): solo aplica el del último cambio, junto con el subgrafo
// que lo produjo; mientras tanto se avisa «Ordenando…».
const vista = shallowRef<{ g: Subgrafo; pos: Map<string, Punto> } | null>(null);
// Lo dibujado (nodos y líneas de Vue Flow): solo se reemplaza si cambian las tarjetas o las líneas. Si no (reordenar, volver
// a aplicar una vista, otra densidad), las tarjetas se mueven en su lugar: rehacer los nodos de Vue Flow compara todos contra
// todos (~1 s con 2.000 tarjetas); moverlos cuesta unos ms.
const dibujo = shallowRef<{ g: Subgrafo; pos: Map<string, Punto> } | null>(null);
const forma = (g: Subgrafo) =>
  JSON.stringify([
    g.nodos.map((u) => u.id),
    g.puestos.map((p) => p.id),
    g.jerarquicas,
    g.laterales.map((c) => [c.id, c.origen_id, c.destino_id, c.etiqueta]),
  ]);
let worker: Worker;
const cola = colaDeUltimo<ReturnType<typeof grafoElk>, NodoUbicado[]>((id, grafo) =>
  worker.postMessage({ id, grafo }),
);
// Si el worker muere sin responder (no cargó, sin memoria…), se crea otro y el pedido en curso falla: si no, ningún
// layout más saldría nunca.
function crearWorker() {
  worker = new LayoutWorker();
  worker.onmessage = ({ data }: MessageEvent<{ id: number; ubicados?: NodoUbicado[]; error?: string }>) =>
    cola.recibir(data.id, data.ubicados, data.error);
  worker.onerror = worker.onmessageerror = (e: Event) => {
    e.preventDefault();
    worker.terminate();
    crearWorker();
    cola.fallar(e instanceof ErrorEvent ? e.message : e.type);
  };
}
crearWorker();
// El aviso aparece solo si el layout tarda: uno rápido no parpadea ni se anuncia.
const ordenando = ref(false);
let demora: ReturnType<typeof setTimeout> | undefined;
onBeforeUnmount(() => {
  worker.terminate();
  clearTimeout(demora);
});
function avisarOrdenando(si: boolean) {
  clearTimeout(demora);
  if (si) demora = setTimeout(() => (ordenando.value = true), 300);
  else ordenando.value = false;
}
// Solo el valor: reemplazar toda la configuración (aplicar una vista) no rehace los nodos si «Ver puestos» no cambió.
const verPuestos = computed(() => config.value.verPuestos);
const sinPuestoJefe = computed(() => jefeEnTarjeta(config.value));
// Cada layout pedido lleva su número: tras esperar, solo sigue si no llegó otro (ver el encuadre antes de dibujar).
let secuencia = 0;
// «Reordenar»: vuelve a calcular el layout y encuadra.
const reordenado = ref(0);
function reordenar() {
  encuadrar = true;
  reordenado.value++;
}
watch(
  () => ({
    g: subgrafoVisible(
      mostradas.value,
      org.conexiones,
      colapsados.value,
      verPuestos.value ? org.enFecha.puestos : [],
      sinPuestoJefe.value,
    ),
    tam: TAM.value,
    tamDelPuesto: tamPuesto(config.value, escala.value),
    opciones: {
      direccion: config.value.direccion,
      densidad: config.value.densidad,
      alinearPorTipo: config.value.alinearPorTipo,
    },
    tipos: config.value.alinearPorTipo ? org.catalogos.tipos_unidad : [],
    reordenado: reordenado.value,
  }),
  async ({ g, tam, tamDelPuesto, opciones, tipos }) => {
    const este = ++secuencia;
    avisarOrdenando(true);
    const ubicados = await cola.pedir(grafoElk(g, tam, tamDelPuesto, opciones, tipos)).catch((e) => {
      console.error(e);
      toast.error(t("arbol.errorOrdenar"));
      avisarOrdenando(false);
      return null;
    });
    if (!ubicados) return; // llegó otro cambio (manda ese) o falló (ya se avisó)
    avisarOrdenando(false);
    const pos = posiciones(g, ubicados, tam, tamDelPuesto, opciones);
    // Al pasar a muchas tarjetas se encuadra antes de dibujarlas: así nacen ligeras, sin montar antes el detalle de todas
    // (con 2.000, 1,3 s de interfaz congelada). Las medidas de las tarjetas ya se conocen: no hace falta esperar a Vue Flow.
    if (!centrar && !conMinimapa(g.nodos.length + g.puestos.length) && conMinimapa(nodos.value.length)) {
      const ps = [...pos.values()];
      const x = Math.min(...ps.map((p) => p.x));
      const y = Math.min(...ps.map((p) => p.y));
      const ancho = Math.max(tam.ancho, tamDelPuesto.ancho);
      const alto = Math.max(tam.alto, tamDelPuesto.alto);
      encuadrar = false;
      await fitBounds({
        x,
        y,
        width: Math.max(...ps.map((p) => p.x)) + ancho - x,
        height: Math.max(...ps.map((p) => p.y)) + alto - y,
      });
      if (este !== secuencia) return; // mientras se encuadraba llegó otro cambio
    }
    const antes = dibujo.value;
    vista.value = { g, pos };
    // Sin avisar a `nodos`: las tarjetas se mueven en su lugar.
    if (antes && forma(antes.g) === forma(g)) reubicar(pos, antes.pos, findNode);
    else dibujo.value = vista.value;
    podarSeleccion(new Set(g.nodos.map((u) => u.id))); // lo que se plegó ya no cuenta como seleccionado
    if (!encuadrar && !centrar) return;
    const id = centrar;
    encuadrar = false;
    centrar = null;
    await nextTick(); // Vue Flow ya recibió los nodos nuevos: desde aquí, "medidos" se refiere a ellos
    pendiente.value = { centrar: id };
  },
  { immediate: true },
);

// Piden centrar una unidad (flechas, paleta). Si su rama estaba plegada aún no tiene lugar: se centra tras el layout.
watch(centrarEn, (id) => {
  if (!id) return;
  centrarEn.value = null;
  if (vista.value?.pos.has(id)) pendiente.value = { centrar: id };
  else centrar = id;
});

// Otra dirección o densidad cambia la forma de todo el árbol: se encuadra tras el próximo layout, y los puntos de
// conexión (arriba/abajo o izquierda/derecha) se vuelven a medir.
watch(
  [() => config.value.direccion, () => config.value.densidad], // solo si cambian (aplicar una vista reemplaza todo)
  async () => {
    encuadrar = true;
    await nextTick();
    updateNodeInternals();
  },
);

// Con una fecha elegida no hay selección múltiple (es de solo lectura).
watch(
  () => org.fechaVista,
  (f) => f && limpiarMultiple(),
);

// Otra fecha cambia qué unidades se ven: se encuadra una vez tras el próximo layout (las ramas plegadas se conservan).
watch(
  () => org.fechaVista,
  () => (encuadrar = true),
);

// fitView ignora los nodos sin medir: se espera a que Vue Flow los mida todos (de inmediato si ya lo estaban).
const pendiente = ref<{ centrar: string | null } | null>(null);
watch([pendiente, areNodesInitialized], ([p, medidos]) => {
  if (!p || !medidos) return;
  pendiente.value = null;
  const c = p.centrar && vista.value?.pos.get(p.centrar);
  if (c) void setCenter(c.x + TAM.value.ancho / 2, c.y + TAM.value.alto / 2, { zoom: 1 });
  else if (encuadre) void setViewport(encuadre);
  else void fitView();
  encuadre = null;
});

const visibles = computed(() => new Set(vista.value?.g.nodos.map((u) => u.id)));

const trabajadorPorId = computed(() => new Map(org.enFecha.trabajadores.map((x) => [x.id, x])));
const etiquetasDe = computed(() => {
  const porId = new Map(org.etiquetas.map((e) => [e.id, e]));
  const m = new Map<string, Etiqueta[]>();
  for (const { unidad_id, etiqueta_id } of org.unidadEtiquetas) {
    const e = porId.get(etiqueta_id);
    if (e) m.set(unidad_id, [...(m.get(unidad_id) ?? []), e]);
  }
  return m;
});

// Lo que muestra cada tarjeta, para todas las que pueden dibujarse: un layout nuevo reutiliza estos objetos y las tarjetas
// no se vuelven a pintar. Marca, ruta, leyenda y nivel de detalle los lee cada tarjeta del contexto (no rehacen los nodos).
const datosUnidad = computed(() => {
  const indice = indiceHijos(mostradas.value);
  const dotaciones = dotacionPorUnidad(
    mostradas.value,
    org.enFecha.puestos,
    org.enFecha.asignaciones,
    org.fechaVista ?? undefined,
  );
  const vigentes = org.enFecha.vigentes;
  const personas = personasPorUnidad(
    mostradas.value,
    org.enFecha.puestos,
    vigentes,
    trabajadorPorId.value,
    new Map(org.catalogos.cargos.map((c) => [c.id, c.nombre])),
  );
  return new Map(
    mostradas.value.map((u): [string, DatosNodo] => {
      const { total, vacantes } = dotaciones.get(u.id) ?? { total: 0, vacantes: 0 };
      const jefe = jefeVisible(u, vigentes);
      return [
        u.id,
        {
          ...personas.get(u.id)!,
          unidad: u,
          jefe: (jefe && trabajadorPorId.value.get(jefe.trabajador_id)) || null,
          jefeReemplazo: jefe?.tipo === "reemplazo",
          total,
          vacantes,
          etiquetas: etiquetasDe.value.get(u.id) ?? [],
          hijos: indice.get(u.id)?.length ?? 0,
        },
      ];
    }),
  );
});
const datosPuesto = computed(() => {
  const cargos = new Map(org.catalogos.cargos.map((c) => [c.id, c.nombre]));
  const vigentes = org.enFecha.vigentes;
  const nombre = (a?: { trabajador_id: string }) =>
    (a && trabajadorPorId.value.get(a.trabajador_id)?.nombre) || null;
  return new Map(
    (verPuestos.value ? org.enFecha.puestos : []).map((p): [string, DatosPuesto] => [
      p.id,
      {
        cargo: cargos.get(p.cargo_id) ?? "",
        titular: nombre(vigentes.get(p.id)?.titular),
        reemplazo: nombre(vigentes.get(p.id)?.reemplazo),
        leyendaId: p.leyenda_id,
      },
    ]),
  );
});

// Mientras llega el layout de un cambio, `vista` puede nombrar algo que ya no está: se omite hasta el próximo.
const nodos = computed<Node[]>(() => {
  if (!dibujo.value) return [];
  const { g, pos } = dibujo.value;
  return [
    ...g.nodos.flatMap((u) => {
      const data = datosUnidad.value.get(u.id);
      return data ? [{ id: u.id, type: "unidad", position: pos.get(u.id)!, data }] : [];
    }),
    ...g.puestos.flatMap((p) => {
      const data = datosPuesto.value.get(p.id);
      return data
        ? [{ id: p.id, type: "puesto", position: pos.get(p.id)!, draggable: false, selectable: false, data }]
        : [];
    }),
  ];
});

// Nivel de detalle (rendimiento.ts): alejado y con muchas tarjetas, tarjetas y aristas ligeras y sin minimapa.
const ligera = computed(() => tarjetasLigeras(viewport.value.zoom, nodos.value.length));
provide(CONTEXTO_LIENZO, {
  marcas,
  rutas,
  leyendas: computed(() => (porLeyenda.value ? new Map(org.leyendas.map((l) => [l.id, l])) : null)),
  ligera,
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

// Solo entre tarjetas que están en `nodos` (una recién eliminada se omite hasta el próximo layout).
const aristas = computed<Edge[]>(() => {
  if (!dibujo.value) return [];
  const { g } = dibujo.value;
  const ids = new Set(nodos.value.map((n) => n.id));
  const entre = (a: string, b: string) => ids.has(a) && ids.has(b);
  return [
    // La unidad baja por sus puestos apilados y de su último puesto salen las líneas a sus hijas (aristasDibujadas).
    ...aristasDibujadas(g)
      .filter(([a, b]) => entre(a, b))
      .map(([a, b]) => ({
        id: `${a}>${b}`,
        source: a,
        target: b,
        // Ligeras: en escalón y sin el trazo invisible que el navegador revisa bajo el puntero en cada evento.
        type: ligera.value ? "step" : tipoArista(config.value.lineas),
        interactionWidth: ligera.value ? 0 : undefined,
      })),
    ...g.laterales
      .filter((c) => entre(c.origen_id, c.destino_id))
      .map((c) => ({
        id: c.id,
        source: c.origen_id,
        target: c.destino_id,
        label: c.etiqueta ?? undefined,
        style: { stroke: "var(--marca)", strokeDasharray: "6 4" },
      })),
  ];
});

// Expandir de más (useLienzo): el diálogo propone expandir igual, solo hasta un nivel, o nada.
const avisoAbierto = ref(false);
watch(avisoExpansion, (a) => (avisoAbierto.value = !!a));
// Cerrado sin elegir (Cancelar, Esc): nada cambia. Los botones de acción ya dejaron el aviso en null antes de esto.
watch(avisoAbierto, (abierto) => abierto || cancelarExpansion());
function expandirConAviso(colapsadosNuevos: Set<string> | null | undefined) {
  if (colapsadosNuevos) colapsados.value = colapsadosNuevos;
  avisoExpansion.value = null;
}

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

// El recuadro (Mayús + arrastrar en el fondo) usa la selección de Vue Flow solo para medir qué unidades encierra: la
// selección de verdad es la de useLienzo, así que la de Vue Flow se vacía de inmediato (si no, arrastraría a las demás).
function alTerminarRecuadro() {
  const ids = getSelectedNodes.value.filter((n) => n.type === "unidad").map((n) => n.id);
  removeSelectedElements();
  if (!org.fechaVista) sumarVarias(ids);
}

// Panel de la unidad seleccionada. Al cerrarlo con el teclado o su botón, el foco vuelve a la tarjeta.
const unidadSeleccionada = computed(() =>
  seleccion.value && seleccionadas.value.size === 1 ? (org.enFecha.porId.get(seleccion.value) ?? null) : null,
);
// `destino`: tarjeta que recibe el foco (al eliminar, la del superior; null = una raíz, sirve la primera); sin él, la seleccionada.
async function cerrarPanel(destino?: string | null) {
  const id = destino === undefined ? seleccion.value : destino;
  seleccion.value = null;
  await nextTick();
  const tarjeta = id
    ? document.querySelector<HTMLElement>(
        `.vue-flow__node[data-id="${CSS.escape(id)}"] :is(button, [role=button])`,
      )
    : destino === null
      ? document.querySelector<HTMLElement>(".vue-flow__node :is(button, [role=button])")
      : null;
  tarjeta?.focus();
}
// Esc en el lienzo cierra el panel, salvo que se esté escribiendo (renombrar una tarjeta).
function escEnLienzo(e: KeyboardEvent) {
  if (!(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) void cerrarPanel();
}

// La banda desaparece con el botón: el foco pasa al botón «Ver en otra fecha», que queda en la barra.
async function volverAHoy() {
  await org.verAFecha(null);
  await nextTick();
  document.querySelector<HTMLElement>("[data-fecha-vista]")?.focus();
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
        <Button variant="outline" size="sm" @click="irA(org.enFecha.porId.get(raiz)?.parent_id ?? null)">
          <ArrowUp aria-hidden="true" />
          {{ t("arbol.subirNivel") }}
        </Button>
        <Button variant="outline" size="sm" @click="verCompleto">{{ t("arbol.verCompleto") }}</Button>
      </span>
    </nav>
    <BarraLienzo :raiz="raiz" :unidades="mostradas" @reordenar="reordenar" />
    <div role="status">
      <div
        v-if="org.fechaVista"
        class="flex flex-wrap items-center gap-2 border-b bg-muted px-3 py-1.5 text-sm text-foreground"
      >
        <CalendarClock class="size-4 shrink-0" aria-hidden="true" />
        <span>
          {{ t("arbol.fecha.viendo", { fecha: formatearFecha(org.fechaVista, locale) }) }}
          <span class="text-muted-foreground">· {{ t("arbol.fecha.soloLectura") }}</span>
        </span>
        <Button variant="outline" size="sm" class="ml-auto" @click="volverAHoy">
          {{ t("arbol.fecha.volver") }}
        </Button>
      </div>
    </div>
    <div class="flex min-h-0 flex-1">
      <div class="relative min-w-0 flex-1" @keydown.esc="escEnLienzo">
        <MenuLienzo :unidades="mostradas" :visibles="visibles" :raiz="raiz" @reordenar="reordenar">
          <!-- Sin only-render-visible-elements: empeora el arrastre (nota de rendimiento). -->
          <VueFlow
            :nodes="nodos"
            :edges="aristas"
            :min-zoom="0.05"
            :nodes-draggable="!org.fechaVista"
            :elements-selectable="!org.fechaVista"
            :select-nodes-on-drag="false"
            :nodes-connectable="false"
            :nodes-focusable="false"
            :edges-focusable="false"
            :zoom-on-double-click="false"
            :delete-key-code="null"
            class="lienzo"
            :class="ligera && 'lienzo-ligero'"
            @node-drag-stop="alSoltar"
            @node-click="removeSelectedElements()"
            @selection-end="alTerminarRecuadro"
            @pane-click="seleccion = null"
          >
            <template #node-unidad="p">
              <NodoUnidad :id="p.id" :data="p.data" />
            </template>
            <template #node-puesto="p">
              <NodoPuesto :id="p.id" :data="p.data" />
            </template>
            <MiniMap v-if="conMinimapa(nodos.length)" pannable zoomable />
          </VueFlow>
        </MenuLienzo>
        <div
          v-if="seleccionadas.size >= 2 && !org.fechaVista"
          class="pointer-events-none absolute inset-x-2 top-2 z-10 flex justify-center"
        >
          <BarraSeleccion class="pointer-events-auto" />
        </div>
        <LeyendaLienzo v-if="leyenda.length" :titulo="tituloLeyenda" :entradas="leyenda" />
        <div role="status" class="pointer-events-none absolute top-2 right-2 z-10">
          <span
            v-if="ordenando"
            class="flex items-center gap-1.5 rounded-md border bg-card px-2 py-1 text-xs text-card-foreground"
          >
            <LoaderCircle class="size-3.5 motion-safe:animate-spin" aria-hidden="true" />
            {{ t("arbol.ordenando") }}
          </span>
        </div>
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
    <AlertDialog v-model:open="avisoAbierto">
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {{ t("arbol.limite.titulo", { n: avisoExpansion?.tarjetas.toLocaleString(locale) }) }}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {{ t("arbol.limite.texto", { limite: LIMITE_TARJETAS.toLocaleString(locale) }) }}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{{ t("arbol.cancelar") }}</AlertDialogCancel>
          <AlertDialogAction @click="expandirConAviso(avisoExpansion?.todo)">
            {{ t("arbol.limite.igual") }}
          </AlertDialogAction>
          <AlertDialogAction v-if="avisoExpansion?.hasta" @click="expandirConAviso(avisoExpansion?.hasta)">
            {{ t("arbol.limite.hastaNivel", { n: avisoExpansion.nivel }) }}
          </AlertDialogAction>
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
/* Ligero: el navegador no revisa aristas ni puntos de conexión bajo el puntero (nota de rendimiento: HitTest). */
.lienzo-ligero :deep(.vue-flow__edge),
.lienzo-ligero :deep(.vue-flow__handle) {
  pointer-events: none;
}
</style>
