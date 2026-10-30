import { computed, ref, shallowRef, watch, type ComputedRef } from "vue";
import { toast } from "vue-sonner";
import type { Puesto, Trabajador, Unidad } from "@/db/tipos";
import { i18n } from "@/i18n";
import { normalizarTexto } from "@/lib/texto";
import { useOrganizacion } from "@/stores/organizacion";
import { hijos, ruta, tipoHijo, type Vigentes } from "./jerarquia";
import { sumar, type Seleccion } from "./multiple";
import { useVista } from "./useVista";
import type { Resaltado } from "./vista";

/** Sin filtros todo coincide; con texto, etiqueta y criterios de puestos (`cumplen`) deben cumplirse todos. */
export function coincideFiltro(
  u: Unidad,
  texto: string,
  etiquetadas: Set<string> | null,
  cumplen: Set<string> | null = null,
): boolean {
  if (etiquetadas && !etiquetadas.has(u.id)) return false;
  if (cumplen && !cumplen.has(u.id)) return false;
  const buscado = normalizarTexto(texto);
  return !buscado || normalizarTexto(u.nombre).includes(buscado);
}

/**
 * Unidades que cumplen todos los criterios de resaltado ligados a puestos y personas, o null si no hay ninguno activo.
 * Cada criterio se mira solo en los puestos de la propia unidad (no en su rama): vacantes = puesto sin titular vigente;
 * sede, contrato y jornada = titular vigente con ese valor (un reemplazo no cuenta); cargo = puesto con ese cargo.
 */
export function unidadesQueCumplen(
  r: Omit<Resaltado, "etiqueta" | "texto">,
  puestos: (Puesto & { deleted_at?: string | null })[],
  vigentes: Vigentes,
  trabajadores: Trabajador[],
): Set<string> | null {
  const pruebas: [unknown, (p: Puesto, t: Trabajador | undefined) => boolean][] = [
    [r.vacantes, (_, t) => !t],
    [r.sede, (_, t) => t?.sede_id === r.sede],
    [r.contrato, (_, t) => t?.tipo_contrato_id === r.contrato],
    [r.jornada, (_, t) => t?.jornada_id === r.jornada],
    [r.cargo, (p) => p.cargo_id === r.cargo],
  ];
  const activas = pruebas.filter(([criterio]) => criterio).map(([, prueba]) => prueba);
  if (!activas.length) return null;
  const persona = new Map(trabajadores.map((t) => [t.id, t]));
  const cubiertos = new Map<string, boolean[]>();
  for (const p of puestos) {
    if (p.deleted_at) continue;
    const t = persona.get(vigentes.get(p.id)?.titular?.trabajador_id ?? "");
    const ok = cubiertos.get(p.unidad_id) ?? activas.map(() => false);
    activas.forEach((prueba, i) => (ok[i] ||= prueba(p, t)));
    cubiertos.set(p.unidad_id, ok);
  }
  return new Set([...cubiertos].filter(([, ok]) => ok.every(Boolean)).map(([id]) => id));
}

type Punto = { x: number; y: number };

/** La tarjeta (distinta de la arrastrada) que contiene el centro de la arrastrada. Posiciones = esquina superior izquierda. */
export function destinoAlSoltar(
  id: string,
  pos: Punto,
  posiciones: Map<string, Punto>,
  tam: { ancho: number; alto: number },
): string | null {
  const cx = pos.x + tam.ancho / 2;
  const cy = pos.y + tam.alto / 2;
  for (const [otro, p] of posiciones)
    if (otro !== id && cx >= p.x && cx <= p.x + tam.ancho && cy >= p.y && cy <= p.y + tam.alto) return otro;
  return null;
}

// Estado compartido por el lienzo y el panel de unidad: hay un solo lienzo en la app.
const colapsados = ref(new Set<string>());
const seleccion = ref<string | null>(null);
/** Con 2 o más unidades seleccionadas, todas ellas (y `seleccion` es la última tocada); si no, vacío. */
const multi = shallowRef<ReadonlySet<string>>(new Set());
const seleccionadas = computed<ReadonlySet<string>>(() =>
  multi.value.size ? multi.value : new Set(seleccion.value ? [seleccion.value] : []),
);
// Cambiar `seleccion` a algo fuera del conjunto (clic suelto, Esc, otra rama…) lo deshace.
watch(
  seleccion,
  (id) => {
    if (multi.value.size && (!id || !multi.value.has(id))) multi.value = new Set();
  },
  { flush: "sync" },
);
function aplicar({ ids, foco }: Seleccion) {
  multi.value = ids.size >= 2 ? ids : new Set();
  seleccion.value = foco;
}
const editando = ref<string | null>(null);
/** Unidad que el lienzo debe centrar en cuanto pueda (VistaArbol lo atiende y lo deja en null). */
const centrarEn = ref<string | null>(null);
/** Cada pedido (Supr) sube el contador; el panel de la unidad seleccionada lo atiende con su flujo de eliminar. */
const pedidoEliminar = ref(0);
let etiquetadas: ComputedRef<Set<string> | null> | undefined; // uno para todos los nodos
let cumplen: ComputedRef<Set<string> | null> | undefined;

function expandir(id: string) {
  if (!colapsados.value.has(id)) return;
  const s = new Set(colapsados.value);
  s.delete(id);
  colapsados.value = s;
}

export function useLienzo() {
  const org = useOrganizacion();
  const { config } = useVista();
  // El resaltado vive en la configuración de la vista (así lo guardan las vistas nombradas).
  etiquetadas ??= computed(() => {
    const id = config.value.resaltar.etiqueta;
    return id
      ? new Set(org.unidadEtiquetas.filter((x) => x.etiqueta_id === id).map((x) => x.unidad_id))
      : null;
  });
  cumplen ??= computed(() =>
    unidadesQueCumplen(
      config.value.resaltar,
      org.enFecha.puestos,
      org.enFecha.vigentes,
      org.enFecha.trabajadores,
    ),
  );

  /** Crea una subunidad de `padre` (o una raíz) con nombre provisorio y la deja seleccionada y en edición. */
  async function nuevaUnidad(padre: Unidad | null) {
    if (org.fechaVista) return; // solo lectura
    const hermanos = padre ? hijos(org.unidades, padre.id) : org.raices;
    const tipo_id = tipoHijo(org.catalogos.tipos_unidad, padre?.tipo_id ?? null);
    if (!tipo_id) return void toast.error(i18n.global.t("arbol.sinTiposActivos"));
    const r = await org.crearUnidad({
      tipo_id,
      nombre: i18n.global.t("arbol.nuevaUnidad"),
      parent_id: padre?.id ?? null,
      orden: Math.max(-1, ...hermanos.map((h) => h.orden)) + 1,
    });
    if (!r.ok) return void toast.error(r.mensaje);
    if (padre) expandir(padre.id);
    seleccion.value = editando.value = r.id!;
  }

  /** Nueva unidad hija de la seleccionada; si no hay, de la raíz enfocada; si tampoco, una raíz nueva. */
  const nuevaHija = (raiz: string | null) => {
    const padre = seleccion.value ?? raiz;
    return nuevaUnidad(padre ? (org.porId.get(padre) ?? null) : null);
  };

  /** Abre las ramas que esconden la unidad. */
  function abrirRuta(id: string) {
    const abiertas = new Set(colapsados.value);
    for (const a of ruta(org.enFecha.unidades, id).slice(0, -1)) abiertas.delete(a.id);
    if (abiertas.size !== colapsados.value.size) colapsados.value = abiertas; // no relanzar el layout sin necesidad
  }

  /** Selecciona solo la unidad, abre las ramas que la esconden y pide centrarla. */
  function revelar(id: string) {
    multi.value = new Set();
    abrirRuta(id);
    seleccion.value = centrarEn.value = id;
  }

  /** Mayús+flecha: suma la unidad a la selección, la revela y pide centrarla. */
  function extender(id: string) {
    abrirRuta(id);
    aplicar(sumar(seleccionadas.value, id, false));
    centrarEn.value = id;
  }

  /** Copia la rama y deja la copia seleccionada y centrada. */
  async function duplicar(id: string) {
    if (org.fechaVista) return; // solo lectura
    const r = await org.duplicarRama(id);
    if (!r.ok) return void toast.error(r.mensaje);
    revelar(r.id!);
    toast.success(i18n.global.t("unidad.duplicada", { nombre: org.porId.get(id)?.nombre }));
  }

  return {
    colapsados,
    seleccion,
    seleccionadas,
    editando,
    centrarEn,
    pedidoEliminar,
    expandir,
    nuevaUnidad,
    nuevaHija,
    revelar,
    extender,
    duplicar,
    /** Ctrl+clic (`alternar`) o Mayús+clic sobre una tarjeta. */
    sumarASeleccion: (id: string, alternar: boolean) => aplicar(sumar(seleccionadas.value, id, alternar)),
    /** El recuadro: suma varias a la vez (la última queda como foco). */
    sumarVarias(ids: string[]) {
      if (ids.length) aplicar({ ids: new Set([...seleccionadas.value, ...ids]), foco: ids[ids.length - 1] });
    },
    /** Quita de la selección múltiple lo que ya no se dibuja (por ejemplo, tras plegar su superior). */
    podarSeleccion(visibles: ReadonlySet<string>) {
      if (!multi.value.size) return;
      const ids = new Set([...multi.value].filter((id) => visibles.has(id)));
      if (ids.size === multi.value.size) return;
      aplicar({
        ids,
        foco: seleccion.value && ids.has(seleccion.value) ? seleccion.value : ([...ids].pop() ?? null),
      });
    },
    plegarSeleccion() {
      colapsados.value = new Set([...colapsados.value, ...seleccionadas.value]);
    },
    alternarRama(id: string) {
      const s = new Set(colapsados.value);
      if (!s.delete(id)) s.add(id);
      colapsados.value = s;
    },
    seleccionar(id: string | null) {
      seleccion.value = id;
    },
    coincide: (u: Unidad) =>
      coincideFiltro(u, config.value.resaltar.texto, etiquetadas!.value, cumplen!.value),
  };
}
