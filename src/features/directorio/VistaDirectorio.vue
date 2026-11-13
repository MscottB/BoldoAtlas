<script setup lang="ts">
import { computed, ref, useTemplateRef, watch } from "vue";
import { useI18n } from "vue-i18n";
import { useRoute } from "vue-router";
import { useVirtualList } from "@vueuse/core";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronDown,
  Columns3,
  Download,
  ListFilter,
  Minus,
  Plus,
  X,
} from "@lucide/vue";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { TablaCatalogo } from "@/db/tipos";
import { tiposEnUso, vigentesPorPuesto } from "@/features/arbol/jerarquia";
import { MAX_BOTONES_NIVEL, nivelVecino } from "@/features/arbol/niveles";
import { usePuesto } from "@/features/puestos/usePuesto";
import { useFicha } from "@/features/trabajadores/useFicha";
import SelectorUnidad from "@/features/unidades/SelectorUnidad.vue";
import ArbolPersonas from "@/features/unidades/ArbolPersonas.vue";
import { arbolDePersonas, claveVacante, contarFilas, profundidad } from "@/features/unidades/arbolPersonas";
import { filtrarPersonasUnidad, personasDelAlcance } from "@/features/unidades/personas";
import BotonUbicar from "@/features/arbol/BotonUbicar.vue";
import { guardarPreferenciaOrg, leerPreferenciaOrg } from "@/lib/preferencias";
import { raizDelPanel, usePanel } from "@/features/pestanas/panel";
import { clicNuevaPestana, useEstadoPestana } from "@/features/pestanas/usePestanas";
import { useOrganizacion } from "@/stores/organizacion";
import { MOSTRAR_PROXIMAMENTE } from "@/app/proximamente";
import { MODO_LADO } from "@/lado/modo";
import { claseSelect, cn } from "@/lib/utils";
import {
  FILTROS_PLEGADOS,
  SIN_FILTROS,
  candidatasDirectorio,
  columnaVisible,
  filtrarYOrdenar,
  leerColumnas,
  leerEstadoDirectorio,
  pulsarFila,
  type FilaDirectorio,
  type Filtros,
  type Orden,
  type Pulsable,
} from "./filtrar";

const { t } = useI18n();
const org = useOrganizacion();
const ficha = useFicha();
const puesto = usePuesto();
// Con el directorio en los dos paneles, el buscador de este.
const { panel } = usePanel();
const enfocarBuscador = () =>
  raizDelPanel(panel).querySelector<HTMLInputElement>("[data-buscar-directorio]")?.focus();

// Los filtros y el orden se recuerdan por organización; cada pestaña, además, recuerda los suyos (validados al leer).
const dePestana = useEstadoPestana(() => ({ filtros: { ...filtros.value }, orden: { ...orden.value } }));
const guardado = leerEstadoDirectorio(dePestana ?? leerPreferenciaOrg<unknown>("directorio", null));
const filtros = ref<Filtros>(guardado.filtros);
const orden = ref<Orden>(guardado.orden);
// «Ver en el directorio» del panel de una unidad: solo esa unidad y su rama, sin los demás filtros. Una persona abierta en
// una pestaña nueva (?persona=): solo sus filas.
const { unidad: pedida, persona } = useRoute().query;
if (!dePestana && typeof pedida === "string") filtros.value = { ...SIN_FILTROS, unidad: pedida };
else if (!dePestana && typeof persona === "string") filtros.value = { ...SIN_FILTROS, persona };
// La persona es de su pestaña: no queda como filtro por defecto del directorio.
const preferencia = () => ({ filtros: { ...filtros.value, persona: null }, orden: orden.value });
watch([filtros, orden], () => guardarPreferenciaOrg("directorio", preferencia()), { deep: true });
const nombrePersona = computed(
  () => org.trabajadores.find((x) => x.id === filtros.value.persona)?.nombre ?? t("directorio.persona"),
);
const hayFiltros = computed(() => JSON.stringify(filtros.value) !== JSON.stringify(SIN_FILTROS));

// Las filas se arman una vez por cambio del store; teclear o ordenar solo filtra y ordena.
const candidatas = computed(() => candidatasDirectorio(org));
const filas = computed(() => filtrarYOrdenar(candidatas.value, filtros.value, orden.value));
// Solo las filas a la vista van al DOM: con 10.000 personas, abrir tardaba 1 s y cada tecla al filtrar 0,2–0,5 s (nota de
// rendimiento). Todas las filas miden lo mismo (una línea): se mide la primera dibujada, que cambia con la escala.
const altoFila = ref(33);
const { list: ventana, containerProps, wrapperProps } = useVirtualList(filas, {
  itemHeight: () => altoFila.value,
  overscan: 10,
});
const cuerpo = useTemplateRef("cuerpo");
watch(
  ventana,
  () => {
    const fila = cuerpo.value?.rows[0];
    if (fila) altoFila.value = fila.getBoundingClientRect().height;
  },
  { flush: "post" },
);
const tipos = computed(() => tiposEnUso(org.unidades, org.catalogos.tipos_unidad));
const sinDatos = computed(() => !org.puestos.length && !org.trabajadores.length);

// Cada selector ofrece todos los valores del catálogo: los desactivados siguen asignados a alguien.
const selectores = computed(() => {
  const opciones = (tabla: TablaCatalogo) =>
    [...org.catalogos[tabla]]
      .sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre, "es"))
      .map((v) => ({ id: v.id, nombre: v.deleted_at ? `${v.nombre} ${t("directorio.desactivado")}` : v.nombre }));
  return [
    { campo: "cargo_id", etiqueta: "directorio.cargo", opciones: opciones("cargos") },
    { campo: "tipo_contrato_id", etiqueta: "directorio.tipoContrato", opciones: opciones("tipos_contrato") },
    { campo: "sede_id", etiqueta: "directorio.sede", opciones: opciones("sedes") },
    { campo: "jornada_id", etiqueta: "directorio.jornada", opciones: opciones("jornadas") },
    {
      campo: "etiqueta",
      etiqueta: "directorio.etiqueta",
      opciones: org.etiquetas.map((e) => ({ id: e.id, nombre: e.nombre })),
    },
  ] as const;
});
// «Filtros (n)»: cuenta lo activo dentro del botón; «Quitar filtros» vacía solo eso.
const enFiltros = computed(() => FILTROS_PLEGADOS.filter((k) => filtros.value[k]).length);
const quitarPlegados = () => {
  for (const k of FILTROS_PLEGADOS) filtros.value[k] = null;
};

// «Columnas»: lo elegido se recuerda por organización (las pestañas no lo guardan: es cómo se ve, no qué se busca).
const columnas = ref(leerColumnas(leerPreferenciaOrg<unknown>("directorio:columnas", null)));
watch(columnas, (c) => guardarPreferenciaOrg("directorio:columnas", c), { deep: true });
const ver = (clave: string) => columnaVisible(columnas.value, clave, tipos.value);
const tiposVisibles = computed(() => tipos.value.filter((x) => ver(`tipo:${x.id}`)));
const opcionales = computed(() => [
  { clave: "reemplazo", nombre: t("directorio.reemplazo") },
  ...tipos.value.map((x) => ({ clave: `tipo:${x.id}`, nombre: x.nombre })),
  ...(["tipoContrato", "sede", "jornada"] as const).map((c) => ({ clave: c, nombre: t(`directorio.${c}`) })),
]);
// Sin ninguna columna de unidad a la vista no hay encabezado que muestre el orden por unidad: vuelve a persona.
watch(
  [tiposVisibles, () => orden.value.campo],
  ([visibles, campo]) => {
    if (campo === "unidad" && !visibles.length) orden.value = { campo: "persona", asc: true };
  },
  { immediate: true },
);
const NINGUNA = new Set<string>();
const estados = ["ocupado", "vacante", "sinPuesto"] as const;

function ordenarPor(campo: Orden["campo"]) {
  orden.value = { campo, asc: orden.value.campo === campo ? !orden.value.asc : true };
}
const ariaSort = (campo: Orden["campo"]) =>
  orden.value.campo !== campo ? "none" : orden.value.asc ? "ascending" : "descending";

// Clic en la fila (o Enter sobre el nombre, que es un botón dentro de ella): la ficha de la persona o, en una vacante, el puesto.
// Ctrl+clic o clic central sobre una persona: ella sola en una pestaña nueva. Las filas del árbol hacen lo mismo.
const abrir = (e: MouseEvent | null, f: Pulsable) =>
  pulsarFila(e, f, {
    nueva: (ev, persona) => clicNuevaPestana(ev, { name: "directorio", query: { persona } }),
    ficha: (id) => void ficha.intentarAbrir(id),
    puesto: (id) => puesto.abrir(id),
  });
// «Limpiar todo» desaparece al limpiar: el foco pasa al buscador para no quedar en el body.
function limpiarTodo() {
  filtros.value = { ...SIN_FILTROS };
  enfocarBuscador();
}
// El botón desaparece con la etiqueta: el foco pasa al buscador para no quedar en el body.
function quitarPersona() {
  filtros.value.persona = null;
  enfocarBuscador();
}
const delTipo = (f: FilaDirectorio, tipoId: string) => f.ruta.find((r) => r.tipoId === tipoId)?.nombre;

// Lista o árbol: se recuerda por organización, como las columnas (es cómo se ve, no qué se busca).
const vista = ref(leerPreferenciaOrg<unknown>("directorio:vista", "lista") === "arbol" ? "arbol" : "lista");
watch(vista, (v) => guardarPreferenciaOrg("directorio:vista", v));
// El árbol es de hoy, como la lista: parte de la raíz (o de cada una) o de la rama elegida en Unidad. Se arma solo si
// se ve, y se rehace con los datos o la rama, no con cada tecla: los filtros solo eligen qué se ve.
const deHoy = computed(() => {
  const vigentes = vigentesPorPuesto(org.asignaciones);
  const personas = personasDelAlcance(
    org.puestos,
    vigentes,
    org.trabajadores,
    org.catalogos.cargos,
    org.porId,
  );
  return { vigentes, personas: filtrarPersonasUnidad(personas, "", "nombre") };
});
const arbol = computed(() => {
  const { vigentes, personas } = deHoy.value;
  const jefaturas = new Set(org.unidades.map((u) => u.jefe_puesto_id));
  const deJefatura = personas.filter((f) => jefaturas.has(f.puestoId));
  const rama = filtros.value.unidad ? org.porId.get(filtros.value.unidad) : undefined;
  return (rama ? [rama] : org.raices).map((r) =>
    arbolDePersonas(r, org.unidades, org.puestos, personas, vigentes, org.catalogos.cargos, deJefatura),
  );
});
// Se ven los puestos de la lista (con su titular y su reemplazo, o vacantes) y las unidades que los contienen.
const filtrado = computed(() => Object.entries(filtros.value).some(([k, v]) => k !== "unidad" && !!v));
const coinciden = computed(() => {
  const puestos = new Set(filas.value.flatMap((f) => (f.puestoId ? [f.puestoId] : [])));
  const claves = new Set([...puestos].map(claveVacante));
  for (const f of deHoy.value.personas) if (puestos.has(f.puestoId)) claves.add(f.clave);
  return claves;
});
// Cuántas personas y vacantes muestra el árbol. Sin ninguna, lo que deja la lista son personas sin puesto: se dice.
const enArbol = computed(() => contarFilas(arbol.value, filtrado.value ? coinciden.value : null));
const soloSinPuesto = computed(
  () => !enArbol.value && !!filas.value.length && filas.value.every((f) => f.estado === "sinPuesto"),
);

// Plegar por niveles, como el lienzo (mismos límites, textos y paso): un botón por nivel real si caben; si son muchos,
// «−», el nivel y «+».
const vistaArbol = useTemplateRef<InstanceType<typeof ArbolPersonas>>("vistaArbol");
const hondura = computed(() => profundidad(arbol.value));
// El nivel a la vista lo da el árbol (sigue a lo que se pliega a mano); antes de montarse, el de partida: las raíces abiertas.
const nivelVisto = computed(() => vistaArbol.value?.nivel ?? Math.min(2, hondura.value));
const verNivel = (n: number) => vistaArbol.value?.hastaNivel(n);
</script>

<template>
  <section class="flex h-full flex-col gap-3 p-6">
    <header class="flex flex-wrap items-center gap-2">
      <h1 class="text-lg font-semibold">{{ t("nav.directorio") }}</h1>
      <span class="text-sm text-muted-foreground" aria-live="polite">{{
        vista === "arbol" ? t("directorio.arbol.filas", enArbol) : t("directorio.filas", filas.length)
      }}</span>
      <div v-if="!sinDatos" role="group" :aria-label="t('personas.vista.titulo')" class="flex gap-1">
        <Button
          v-for="o in ['lista', 'arbol'] as const"
          :key="o"
          type="button"
          size="sm"
          :variant="vista === o ? 'default' : 'outline'"
          :aria-pressed="vista === o"
          :data-vista-directorio="o"
          @click="vista = o"
        >
          {{ t(`personas.vista.${o}`) }}
        </Button>
      </div>
      <Tooltip v-if="MOSTRAR_PROXIMAMENTE">
        <TooltipTrigger as-child>
          <Button variant="outline" aria-disabled="true" class="ml-auto cursor-not-allowed text-muted-foreground">
            <Download aria-hidden="true" />
            {{ t("directorio.exportar") }}
          </Button>
        </TooltipTrigger>
        <TooltipContent>{{ t("barra.llegaFase4") }}</TooltipContent>
      </Tooltip>
    </header>

    <p v-if="sinDatos" class="text-sm text-muted-foreground">{{
      t(MODO_LADO ? "directorio.vacioLado" : "directorio.vacio")
    }}</p>
    <template v-else>
      <form
        class="flex flex-wrap items-center gap-2"
        role="search"
        :aria-label="t('directorio.filtros')"
        @submit.prevent
      >
        <Input
          v-model="filtros.texto"
          data-buscar-directorio
          type="search"
          class="h-8 w-64"
          :aria-label="t('directorio.buscar')"
          :placeholder="t('directorio.buscar')"
        />
        <div class="w-56">
          <SelectorUnidad
            :aria-label="t('directorio.unidad')"
            class="h-8"
            :excluidas="NINGUNA"
            :texto="filtros.unidad ? (org.porId.get(filtros.unidad)?.nombre ?? '') : t('directorio.todasUnidades')"
            :ninguna="t('directorio.todasUnidades')"
            @elegir="filtros.unidad = $event"
          />
        </div>
        <Popover>
          <PopoverTrigger as-child>
            <Button type="button" variant="outline" size="sm" class="h-8">
              <ListFilter aria-hidden="true" />
              {{ t("directorio.filtrosBoton") }}
              <span v-if="enFiltros" class="rounded-full bg-marca px-1.5 text-xs text-marca-foreground">
                <span aria-hidden="true">{{ enFiltros }}</span>
                <span class="sr-only">{{ t("directorio.filtrosActivos", enFiltros) }}</span>
              </span>
              <ChevronDown class="-ml-0.5 size-3 opacity-60" aria-hidden="true" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" class="w-72 gap-3 text-sm">
            <label v-for="s in selectores" :key="s.campo" class="grid gap-1">
              <span class="font-medium">{{ t(s.etiqueta) }}</span>
              <select v-model="filtros[s.campo]" :class="cn(claseSelect, 'w-full')">
                <option :value="null">{{ t("directorio.todos") }}</option>
                <option v-for="o in s.opciones" :key="o.id" :value="o.id">{{ o.nombre }}</option>
              </select>
            </label>
            <label class="grid gap-1">
              <span class="font-medium">{{ t("directorio.estado") }}</span>
              <select v-model="filtros.estado" :class="cn(claseSelect, 'w-full')">
                <option :value="null">{{ t("directorio.todos") }}</option>
                <option v-for="e in estados" :key="e" :value="e">{{ t(`directorio.${e}`) }}</option>
              </select>
            </label>
            <Button type="button" variant="outline" size="sm" class="self-start" @click="quitarPlegados">
              {{ t("directorio.quitarFiltros") }}
            </Button>
          </PopoverContent>
        </Popover>
        <span
          v-if="filtros.persona"
          class="inline-flex h-8 items-center gap-1 rounded-full border bg-accent pr-1 pl-3 text-sm text-foreground"
        >
          {{ t("directorio.filtroPersona", { nombre: nombrePersona }) }}
          <button
            type="button"
            class="rounded-full p-1 hover:bg-background focus-visible:outline-2 focus-visible:outline-ring"
            :aria-label="t('directorio.quitarPersona', { nombre: nombrePersona })"
            :title="t('directorio.quitarPersona', { nombre: nombrePersona })"
            @click="quitarPersona"
          >
            <X class="size-3.5" aria-hidden="true" />
          </button>
        </span>
        <Button v-if="hayFiltros" type="button" variant="ghost" size="sm" @click="limpiarTodo">
          {{ t("directorio.limpiar") }}
        </Button>
        <div
          v-if="vista === 'arbol'"
          v-show="!soloSinPuesto"
          role="group"
          :aria-label="t('arbol.niveles.titulo')"
          class="ml-auto flex items-center gap-1"
        >
          <template v-if="hondura <= MAX_BOTONES_NIVEL">
            <Button
              v-for="n in hondura"
              :key="n"
              type="button"
              size="icon-sm"
              :aria-label="t('arbol.niveles.ver', { n }, n)"
              :title="t('arbol.niveles.ver', { n }, n)"
              variant="outline"
              :aria-pressed="n === nivelVisto"
              :class="n === nivelVisto && 'bg-accent'"
              @click="verNivel(n)"
            >
              {{ n }}
            </Button>
          </template>
          <template v-else>
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              :disabled="nivelVisto <= 1"
              :aria-label="t('arbol.niveles.menos')"
              :title="t('arbol.niveles.menos')"
              @click="verNivel(nivelVecino(nivelVisto, hondura, -1))"
            >
              <Minus aria-hidden="true" />
            </Button>
            <span
              class="min-w-6 text-center text-sm tabular-nums"
              role="status"
              :aria-label="t('arbol.niveles.actual', { n: nivelVisto })"
              >{{ nivelVisto }}</span
            >
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              :disabled="nivelVisto >= hondura"
              :aria-label="t('arbol.niveles.mas')"
              :title="t('arbol.niveles.mas')"
              @click="verNivel(nivelVecino(nivelVisto, hondura, 1))"
            >
              <Plus aria-hidden="true" />
            </Button>
          </template>
          <Button
            type="button"
            variant="outline"
            size="sm"
            :aria-label="t('arbol.niveles.verTodo')"
            :title="t('arbol.niveles.verTodo')"
            @click="vistaArbol?.expandirTodo()"
          >
            {{ t("arbol.niveles.todo") }}
          </Button>
        </div>
        <DropdownMenu v-else>
          <DropdownMenuTrigger as-child>
            <Button type="button" variant="outline" size="sm" class="ml-auto h-8">
              <Columns3 aria-hidden="true" />
              {{ t("directorio.columnas") }}
              <ChevronDown class="-ml-0.5 size-3 opacity-60" aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <!-- Elegir una columna no cierra el menú: se suelen cambiar varias seguidas. -->
          <DropdownMenuContent align="end" class="w-56">
            <DropdownMenuCheckboxItem
              v-for="c in opcionales"
              :key="c.clave"
              :model-value="ver(c.clave)"
              @update:model-value="columnas = { ...columnas, [c.clave]: $event === true }"
              @select="(e: Event) => e.preventDefault()"
            >
              {{ c.nombre }}
            </DropdownMenuCheckboxItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </form>

      <template v-if="vista === 'arbol'">
        <p v-if="soloSinPuesto" class="text-sm text-muted-foreground">{{ t("directorio.arbol.sinPuesto") }}</p>
        <!-- Oculto, no desmontado: al volver conserva lo plegado a mano. -->
        <div v-show="!soloSinPuesto" class="contents">
          <ArbolPersonas
            ref="vistaArbol"
            :raiz="arbol"
            :texto="filtros.texto"
            :coinciden="coinciden"
            directorio
            :filtrado="filtrado"
            @abrir="(f, e) => abrir(e, f)"
          />
        </div>
      </template>
      <p v-else-if="!filas.length" class="text-sm text-muted-foreground">{{ t("directorio.sinResultados") }}</p>
      <div v-else v-bind="containerProps" class="min-h-0 flex-1 overflow-auto rounded-lg border">
        <div v-bind="wrapperProps">
          <table
            class="w-full border-collapse text-left text-sm"
            :aria-label="t('directorio.tabla')"
            :aria-rowcount="filas.length + 1"
          >
            <thead class="sticky top-0 z-10 bg-muted text-muted-foreground">
              <tr aria-rowindex="1">
                <th
                  v-for="c in ['persona', 'cargo'] as const"
                  :key="c"
                  scope="col"
                  class="px-3 py-2 font-medium whitespace-nowrap"
                  :aria-sort="ariaSort(c)"
                >
                  <button
                    type="button"
                    class="inline-flex items-center gap-1 rounded-sm hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
                    @click="ordenarPor(c)"
                  >
                    {{ t(`directorio.${c}`) }}
                    <ArrowUp v-if="orden.campo === c && orden.asc" class="size-3.5" aria-hidden="true" />
                    <ArrowDown v-else-if="orden.campo === c" class="size-3.5" aria-hidden="true" />
                    <ArrowUpDown v-else class="size-3.5 opacity-50" aria-hidden="true" />
                  </button>
                </th>
                <th v-if="ver('reemplazo')" scope="col" class="px-3 py-2 font-medium whitespace-nowrap">
                  {{ t("directorio.reemplazo") }}
                </th>
                <th
                  v-for="(tipo, i) in tiposVisibles"
                  :key="tipo.id"
                  scope="col"
                  class="px-3 py-2 font-medium whitespace-nowrap"
                  :aria-sort="i === 0 ? ariaSort('unidad') : undefined"
                >
                  <!-- Se ordena por la ruta completa de la unidad; el botón va en la primera columna de tipo visible. -->
                  <button
                    v-if="i === 0"
                    type="button"
                    class="inline-flex items-center gap-1 rounded-sm hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
                    :title="t('directorio.ordenarUnidad')"
                    @click="ordenarPor('unidad')"
                  >
                    {{ tipo.nombre }}
                    <ArrowUp v-if="orden.campo === 'unidad' && orden.asc" class="size-3.5" aria-hidden="true" />
                    <ArrowDown v-else-if="orden.campo === 'unidad'" class="size-3.5" aria-hidden="true" />
                    <ArrowUpDown v-else class="size-3.5 opacity-50" aria-hidden="true" />
                    <span class="sr-only">{{ t("directorio.ordenarUnidad") }}</span>
                  </button>
                  <template v-else>{{ tipo.nombre }}</template>
                </th>
                <th scope="col" class="px-3 py-2 font-medium whitespace-nowrap">{{ t("directorio.correo") }}</th>
                <template v-for="c in ['tipoContrato', 'sede', 'jornada'] as const" :key="c">
                  <th v-if="ver(c)" scope="col" class="px-3 py-2 font-medium whitespace-nowrap">
                    {{ t(`directorio.${c}`) }}
                  </th>
                </template>
              </tr>
            </thead>
            <tbody ref="cuerpo">
              <tr
                v-for="{ data: f, index } in ventana"
                :key="f.clave"
                :aria-rowindex="index + 2"
                class="cursor-pointer border-t hover:bg-accent"
                @click="abrir($event, f)"
                @auxclick="abrir($event, f)"
                @mousedown.middle.prevent
              >
                <th scope="row" class="px-3 py-1.5 font-normal whitespace-nowrap">
                  <span class="flex items-center justify-between gap-2">
                    <button
                      type="button"
                      class="rounded-sm text-left font-medium hover:underline focus-visible:outline-2 focus-visible:outline-ring"
                      :class="!f.persona && 'font-normal text-muted-foreground italic'"
                    >
                      {{ f.persona ?? t("directorio.vacante") }}
                    </button>
                    <!-- «Ver en el organigrama»: el puesto de la fila; una persona sin puesto, los suyos (si tiene). -->
                    <span class="-my-1 inline-flex">
                      <BotonUbicar :persona-id="f.personaId" :puesto-id="f.puestoId" :nombre="f.persona" icono />
                    </span>
                  </span>
                </th>
                <td class="px-3 py-1.5 whitespace-nowrap">
                  <span v-if="f.estado === 'sinPuesto'" class="text-muted-foreground italic">{{
                    t("directorio.sinPuesto")
                  }}</span>
                  <template v-else>{{ f.cargo }}</template>
                </td>
                <td v-if="ver('reemplazo')" class="px-3 py-1.5 whitespace-nowrap">{{ f.reemplazo }}</td>
                <td v-for="tipo in tiposVisibles" :key="tipo.id" class="px-3 py-1.5 whitespace-nowrap">
                  {{ delTipo(f, tipo.id) }}
                </td>
                <td class="px-3 py-1.5 whitespace-nowrap">{{ f.correo }}</td>
                <template v-for="c in ['tipoContrato', 'sede', 'jornada'] as const" :key="c">
                  <td v-if="ver(c)" class="px-3 py-1.5 whitespace-nowrap">{{ f[c] }}</td>
                </template>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </template>
  </section>
</template>
