<script setup lang="ts">
import { computed, ref, useTemplateRef, watch } from "vue";
import { useI18n } from "vue-i18n";
import { useRoute, useRouter } from "vue-router";
import { toast } from "vue-sonner";
import { refDebounced, useIntersectionObserver } from "@vueuse/core";
import { X } from "@lucide/vue";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  historialBreves,
  historialConflictos,
  historialDetalle,
  historialPagina,
  historialPosteriores,
} from "@/db/cliente";
import { esFallo, traducirError } from "@/db/errores";
import type { TablaCatalogo } from "@/db/tipos";
import { rutaPuesto } from "@/features/arbol/useUbicar";
import BotonExcel from "@/features/excel/BotonExcel.vue";
import type { Lista } from "@/features/excel/exportar";
import { hojaHistorial } from "@/features/excel/listas";
import { frase } from "@/features/historial/frases";
import { destinoDe, instantes, leerVarias } from "@/features/historial/historial";
import ListaHistorial from "@/features/historial/ListaHistorial.vue";
import type { AccionBreve, FilaDetalle, Filtro, Pregunta, Sentido } from "@/features/historial/tipos";
import { useFicha } from "@/features/trabajadores/useFicha";
import { MODO_LADO } from "@/lado/modo";
import { BaseCambiada } from "@/lib/baseActiva";
import { usePregunta } from "@/lib/pregunta";
import { useOrganizacion } from "@/stores/organizacion";

// Historial: las acciones de la más nueva a la más antigua, por partes desde Rust. Deshacer, rehacer y volver a un punto
// pasan por el store (la misma cola que los lotes) y recargan los datos; la lista se vuelve a leer cada vez que cambian.
const PAGINA = 50;
const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const org = useOrganizacion();
const ficha = useFicha();

const texto = ref("");
const buscado = refDebounced(texto, 300);
const desde = ref("");
const hasta = ref("");
// «Ver historial» desde una ficha: ?tabla=…&id=…
const fila = computed<[string, string] | undefined>(() => {
  const { tabla, id } = route.query;
  return typeof tabla === "string" && typeof id === "string" ? [tabla, id] : undefined;
});
const filtro = computed<Filtro>(() => ({
  texto: buscado.value.trim() || undefined,
  ...instantes(desde.value, hasta.value),
  fila: fila.value,
}));
const filtrando = computed(
  () => !!(filtro.value.texto || filtro.value.desde || filtro.value.hasta || fila.value),
);

const acciones = ref<AccionBreve[]>([]);
const abierta = ref<string | null>(null);
const detalle = ref<FilaDetalle[] | null>(null);
// reka cierra el diálogo antes del clic de confirmar: cerrar no borra lo preguntado, confirmar lo toma
const {
  valor: pregunta,
  abierta: preguntando,
  preguntar,
  cerrar: cerrarPregunta,
  tomar: tomarPregunta,
} = usePregunta<Pregunta>();
const fin = ref(false);
const cargando = ref(false);
const error = ref<string | null>(null);
let vuelta = 0;
const pagina = (antes: string | null, cuantas: number) => historialPagina(filtro.value, antes, cuantas);

/** Lee `n` desde `antes` (null: desde arriba). `sumar`: van al final de lo que ya hay. Una lectura más nueva gana. */
async function leer(antes: string | null, n: number, sumar: boolean) {
  const esta = ++vuelta;
  cargando.value = true;
  try {
    const r = await leerVarias(pagina, antes, n);
    if (esta !== vuelta) return;
    acciones.value = sumar ? [...acciones.value, ...r.acciones] : r.acciones;
    fin.value = r.fin;
    error.value = null;
  } catch (e) {
    if (esta === vuelta && !(e instanceof BaseCambiada)) error.value = traducirError(e);
  } finally {
    if (esta === vuelta) cargando.value = false;
  }
}
const masAbajo = () => {
  if (!cargando.value && !fin.value)
    void leer(acciones.value[acciones.value.length - 1]?.id ?? null, PAGINA, true);
};
watch(
  filtro,
  () => {
    abierta.value = null;
    void leer(null, PAGINA, false);
  },
  { immediate: true },
);
// Cada carga del store trae arreglos nuevos: tras un cambio (aquí, con Ctrl+Z o en otra vista) se relee lo que se veía.
watch(
  () => org.unidades,
  () => {
    void leer(null, Math.max(acciones.value.length, PAGINA), false);
    void leerDetalle();
  },
);
// Al bajar se piden más; el botón queda para el teclado y si el observador no alcanza.
const fondo = useTemplateRef<InstanceType<typeof Button>>("fondo");
useIntersectionObserver(
  () => fondo.value?.$el as HTMLElement | undefined,
  ([e]) => e?.isIntersecting && masAbajo(),
);

const accion = computed(() => acciones.value.find((a) => a.id === abierta.value) ?? null);
async function leerDetalle() {
  const id = abierta.value;
  if (!id) return;
  try {
    const d = await historialDetalle(id);
    if (abierta.value === id) detalle.value = d;
  } catch (e) {
    if (!(e instanceof BaseCambiada)) toast.error(traducirError(e));
  }
}
watch(abierta, () => {
  detalle.value = null;
  tomarPregunta();
  void leerDetalle();
});

const CATALOGO: Record<string, TablaCatalogo> = {
  cargo_id: "cargos",
  sede_id: "sedes",
  jornada_id: "jornadas",
  tipo_contrato_id: "tipos_contrato",
  tipo_id: "tipos_unidad",
};
const UNIDAD = new Set(["parent_id", "unidad_id", "origen_id", "destino_id"]);
/** El nombre de lo que apunta un campo `*_id` del detalle, entre lo que hay hoy. */
function nombreDe(columna: string, id: string): string | null {
  const catalogo = CATALOGO[columna];
  if (catalogo) return org.catalogos[catalogo].find((v) => v.id === id)?.nombre ?? null;
  if (UNIDAD.has(columna)) return org.porId.get(id)?.nombre ?? null;
  if (columna === "puesto_id" || columna === "jefe_puesto_id") {
    const p = org.puestos.find((x) => x.id === id);
    return p ? nombreDe("cargo_id", p.cargo_id) : null;
  }
  const lista = {
    trabajador_id: org.trabajadores,
    leyenda_id: org.leyendas,
    etiqueta_id: org.etiquetas,
    zona_id: org.zonas,
  }[columna];
  return lista?.find((x) => x.id === id)?.nombre ?? null;
}
const nombreFila = ([tabla, id]: [string, string]) =>
  nombreDe({ unidades: "unidad_id", trabajadores: "trabajador_id", puestos: "puesto_id" }[tabla] ?? "", id) ??
  t("historial.vista.otro");

const destino = computed(() => accion.value && destinoDe(accion.value, org));
function ir() {
  const d = destino.value;
  if (!d) return void toast.error(t("historial.vista.noEsta"));
  if ("unidad" in d) void router.push({ name: "arbol", query: { ver: d.unidad } });
  else if ("puesto" in d) void router.push(rutaPuesto(d.puesto));
  else void ficha.intentarAbrir(d.persona);
}

const ocupado = ref(false);
/** De a una: lo que pide Rust antes de cambiar algo, y el cambio mismo. */
async function trabajar(sentido: Sentido, hacer: () => Promise<void>) {
  if (ocupado.value) return;
  ocupado.value = true;
  try {
    await hacer();
  } catch (e) {
    if (!(e instanceof BaseCambiada)) toast.error(traducirError(esFallo(e) ? { ...e, sentido } : e));
  } finally {
    ocupado.value = false;
  }
}
async function mover(a: AccionBreve, ids: string[], sentido: Sentido) {
  const r = await org.moverAcciones(ids, sentido);
  if (!r.ok) return void (r.mensaje && toast.error(r.mensaje));
  toast(
    ids.length > 1
      ? t(`historial.vista.juntas.hecho.${sentido}`, { n: ids.length })
      : t(`historial.${sentido === "deshacer" ? "deshecho" : "rehecho"}`, { frase: frase(a, t) }),
  );
}
// Antes de mover una sola, Rust dice cuáles van con ella; si hay, se pregunta.
function pedirMover(sentido: Sentido) {
  const a = accion.value;
  if (!a) return;
  void trabajar(sentido, async () => {
    const otras = await historialConflictos(a.id, sentido);
    if (!otras.length) return mover(a, [a.id], sentido);
    preguntar({ tipo: "juntas", sentido, acciones: await historialBreves(otras) });
  });
}
function pedirVolver() {
  const a = accion.value;
  if (!a) return;
  void trabajar("deshacer", async () => {
    const { n, bloqueada } = await historialPosteriores(a.id);
    if (n) preguntar({ tipo: "volver", n, bloqueada });
    else toast(t("historial.vista.nadaDespues"));
  });
}
function confirmar() {
  const [p, a] = [tomarPregunta(), accion.value];
  if (!p || !a || (p.tipo === "volver" && p.bloqueada)) return;
  const sentido = p.tipo === "juntas" ? p.sentido : "deshacer";
  void trabajar(sentido, async () => {
    if (p.tipo === "juntas") return mover(a, [a.id, ...p.acciones.map((x) => x.id)], p.sentido);
    const r = await org.volverA(a.id);
    if (r.ok) toast(t("historial.vista.volvisteHecho", { n: r.n }, r.n ?? 0));
    else if (r.mensaje) toast.error(r.mensaje);
  });
}

// «Exportar esta lista a Excel»: todas las que cumplen el filtro, no solo las que ya se bajaron.
async function listaExcel(): Promise<Lista> {
  const { acciones: todas } = await leerVarias(pagina, null, Infinity);
  const filtros: [string, string][] = [];
  if (filtro.value.texto) filtros.push([t("historial.vista.buscar"), filtro.value.texto]);
  if (desde.value) filtros.push([t("historial.vista.desde"), desde.value]);
  if (hasta.value) filtros.push([t("historial.vista.hasta"), hasta.value]);
  if (fila.value) filtros.push([t("historial.vista.filtroElemento"), nombreFila(fila.value)]);
  return { nombre: t("historial.vista.titulo"), hojas: [hojaHistorial(todas, t)], filtros };
}
</script>

<template>
  <section class="mx-auto flex max-w-4xl flex-col gap-3 p-6">
    <header class="flex flex-wrap items-center gap-2">
      <h1 class="text-lg font-semibold">{{ t("historial.vista.titulo") }}</h1>
      <BotonExcel v-if="!MODO_LADO" class="ml-auto h-8" :lista="listaExcel" :desactivado="!acciones.length" />
    </header>

    <form
      class="flex flex-wrap items-end gap-3"
      role="search"
      :aria-label="t('historial.vista.buscar')"
      @submit.prevent
    >
      <Input
        v-model="texto"
        type="search"
        class="h-8 w-64"
        :aria-label="t('historial.vista.buscar')"
        :placeholder="t('historial.vista.buscar')"
      />
      <div class="grid gap-1">
        <Label for="historial-desde" class="text-xs">{{ t("historial.vista.desde") }}</Label>
        <Input id="historial-desde" v-model="desde" type="date" class="h-8 w-40" :max="hasta || undefined" />
      </div>
      <div class="grid gap-1">
        <Label for="historial-hasta" class="text-xs">{{ t("historial.vista.hasta") }}</Label>
        <Input id="historial-hasta" v-model="hasta" type="date" class="h-8 w-40" :min="desde || undefined" />
      </div>
    </form>

    <p v-if="fila" class="flex flex-wrap items-center gap-2 text-sm">
      {{ t("historial.vista.soloDe", { nombre: nombreFila(fila) }) }}
      <Button type="button" variant="outline" size="sm" class="h-7" @click="router.replace({ query: {} })">
        <X aria-hidden="true" />
        {{ t("historial.vista.verTodo") }}
      </Button>
    </p>

    <p v-if="error" role="alert" class="text-sm text-destructive">{{ error }}</p>
    <p v-else-if="!acciones.length && !cargando" class="text-sm text-muted-foreground">
      {{ t(filtrando ? "historial.vista.sinResultados" : "historial.vista.vacio") }}
    </p>

    <ListaHistorial
      :acciones="acciones"
      :solo-lectura="org.soloLectura"
      :abierta="abierta"
      :filas="detalle"
      :pregunta="pregunta"
      :preguntando="preguntando"
      :ocupado="ocupado"
      :puede-ir="!!destino"
      :nombre-de="nombreDe"
      @abrir="abierta = $event"
      @ir="ir"
      @mover="pedirMover"
      @volver="pedirVolver"
      @confirmar="confirmar"
      @cancelar="cerrarPregunta"
    />

    <p v-if="cargando" role="status" class="text-sm text-muted-foreground">
      {{ t("historial.vista.cargando") }}
    </p>
    <Button
      v-else-if="!fin && acciones.length"
      ref="fondo"
      type="button"
      variant="ghost"
      size="sm"
      class="self-center"
      @click="masAbajo"
    >
      {{ t("historial.vista.cargarMas") }}
    </Button>
  </section>
</template>
