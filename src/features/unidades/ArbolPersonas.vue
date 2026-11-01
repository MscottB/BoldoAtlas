<script setup lang="ts">
import { computed, nextTick, ref, shallowRef, useId, useTemplateRef, watch } from "vue";
import { useI18n } from "vue-i18n";
import { useVirtualList } from "@vueuse/core";
import { ChevronRight } from "@lucide/vue";
import { useLienzo } from "@/features/arbol/useLienzo";
import { iniciales, normalizarTexto } from "@/lib/texto";
import { useOrganizacion } from "@/stores/organizacion";
import {
  accionTecla,
  aplanarArbol,
  claveUnidad,
  idsDelArbol,
  visiblesDeBusqueda,
  type FilaArbol,
  type NodoArbol,
} from "./arbolPersonas";
import type { FilaPersonaUnidad } from "./personas";
import TextoResaltado from "./TextoResaltado.vue";

// Vista «Árbol» de la pestaña Personas: esquema con sangría desde la unidad del panel. Solo lee lo que le pasan.
const props = defineProps<{ raiz: NodoArbol; texto: string; coinciden: Set<string> }>();
const emit = defineEmits<{ persona: [fila: FilaPersonaUnidad] }>();
const { t } = useI18n();
const org = useOrganizacion();
const { revelar } = useLienzo();
const uid = useId();

const raizId = computed(() => props.raiz.unidad.id);
const buscado = computed(() => normalizarTexto(props.texto));
const visibles = computed(() =>
  buscado.value ? visiblesDeBusqueda(props.raiz, props.coinciden, buscado.value) : null,
);

// Sin búsqueda se abre lo pedido (al comienzo, el primer nivel). Con búsqueda todo parte abierto para ver lo que
// coincide, y lo que se pliegue se olvida al cambiar el texto.
const abiertas = shallowRef(new Set([raizId.value]));
const cerradas = shallowRef(new Set<string>());
const estaAbierta = (id: string) => (buscado.value ? !cerradas.value.has(id) : abiertas.value.has(id));
function plegar(id: string, abrir: boolean) {
  const conjunto = buscado.value ? cerradas : abiertas;
  const s = new Set(conjunto.value);
  if (abrir === !buscado.value) s.add(id);
  else s.delete(id);
  conjunto.value = s;
}
watch(buscado, () => (cerradas.value = new Set()));

const filas = computed(() => aplanarArbol(props.raiz, estaAbierta, visibles.value));

// Como la lista: solo las filas a la vista van al DOM. Todas miden lo mismo (dos líneas); se mide la primera dibujada.
const altoFila = ref(49);
const {
  list: ventana,
  containerProps,
  wrapperProps,
  scrollTo,
} = useVirtualList(filas, { itemHeight: () => altoFila.value, overscan: 10 });
const arbol = useTemplateRef<HTMLElement>("arbol");
const contenedor = containerProps.ref;
watch(
  ventana,
  () => {
    const fila = arbol.value?.children[0];
    if (fila) altoFila.value = fila.getBoundingClientRect().height;
  },
  { flush: "post" },
);

// Tabulador móvil: una sola fila entra en el orden de tabulación. Si la activa no está dibujada, la primera que sí.
const activa = ref(claveUnidad(raizId.value));
const claveTab = computed(() =>
  ventana.value.some((v) => v.data.clave === activa.value) ? activa.value : ventana.value[0]?.data.clave,
);
const enfocar = (indice: number) =>
  arbol.value?.querySelector<HTMLElement>(`[data-indice="${indice}"]`)?.focus({ preventScroll: true });

async function irA(i: number) {
  activa.value = filas.value[i].clave;
  const c = contenedor.value;
  if (!ventana.value.some((v) => v.index === i)) scrollTo(i);
  else if (c) {
    const arriba = i * altoFila.value;
    if (arriba < c.scrollTop) c.scrollTop = arriba;
    else if (arriba + altoFila.value > c.scrollTop + c.clientHeight)
      c.scrollTop = arriba + altoFila.value - c.clientHeight;
  }
  await nextTick();
  enfocar(i);
}

// Si la fila enfocada sale del DOM (se desplazó con la rueda, cambiaron los datos), el foco no cae en <body>.
watch(ventana, () => {
  if (!arbol.value?.contains(document.activeElement)) return;
  void nextTick(() => {
    if (arbol.value?.contains(document.activeElement)) return;
    enfocar(Math.ceil((contenedor.value?.scrollTop ?? 0) / altoFila.value));
  });
});

// Otra unidad en el panel: el árbol parte de nuevo desde ella.
watch(raizId, (id) => {
  abiertas.value = new Set([id]);
  cerradas.value = new Set();
  activa.value = claveUnidad(id);
  scrollTo(0);
});

function activar(f: FilaArbol) {
  if (f.clase === "persona") emit("persona", f.fila);
  else if (f.clase === "unidad") revelar(f.nodo.unidad.id);
}
function alTeclear(e: KeyboardEvent, f: FilaArbol, i: number) {
  if (e.ctrlKey || e.altKey || e.metaKey) return;
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    e.stopPropagation();
    const jefe = e.shiftKey && f.clase === "unidad" ? f.nodo.jefe : null;
    if (jefe) emit("persona", jefe);
    else activar(f);
    return;
  }
  const accion = accionTecla(filas.value, i, e.key);
  if (!accion) return;
  e.preventDefault();
  e.stopPropagation();
  if (accion.tipo === "ir") void irA(accion.indice);
  else if (accion.tipo === "plegar") plegar(accion.id, accion.abrir);
}

const nombreTipo = computed(() => new Map(org.catalogos.tipos_unidad.map((x) => [x.id, x.nombre])));
const nombreJefe = (j: FilaPersonaUnidad) =>
  j.tipo === "reemplazo" ? t("arbol.reemplazo", { nombre: j.nombre }) : j.nombre;
const personaDe = (f: FilaArbol) =>
  f.clase === "persona" ? f.fila : f.clase === "unidad" ? f.nodo.jefe : null;

defineExpose({
  /** Abre todo lo que se ve. */
  expandirTodo() {
    if (buscado.value) cerradas.value = new Set();
    else abiertas.value = new Set(idsDelArbol(props.raiz));
  },
  /** Deja la unidad del panel con su primer nivel: como la carpeta raíz de un explorador, ella sigue abierta. */
  contraerTodo() {
    if (buscado.value) cerradas.value = new Set(idsDelArbol(props.raiz).filter((id) => id !== raizId.value));
    else abiertas.value = new Set([raizId.value]);
    scrollTo(0);
  },
});
</script>

<template>
  <p v-if="!filas.length" class="text-sm text-muted-foreground">{{ t("personas.sinResultados") }}</p>
  <div v-else v-bind="containerProps" class="min-h-40 flex-1 overflow-auto rounded-lg border">
    <p :id="`${uid}-ayuda`" class="sr-only">{{ t("personas.arbol.ayuda") }}</p>
    <div
      ref="arbol"
      v-bind="wrapperProps"
      role="tree"
      :aria-label="t('personas.arbol.nombre', { unidad: raiz.unidad.nombre })"
      :aria-describedby="`${uid}-ayuda`"
    >
      <div
        v-for="{ data: f, index } in ventana"
        :key="f.clave"
        role="treeitem"
        :data-indice="index"
        :aria-level="f.nivel"
        :aria-posinset="f.posicion"
        :aria-setsize="f.hermanos"
        :aria-expanded="f.clase === 'unidad' ? f.abierta : undefined"
        :aria-keyshortcuts="f.clase === 'unidad' && f.nodo.jefe ? 'Shift+Enter' : undefined"
        :tabindex="f.clave === claveTab ? 0 : -1"
        class="flex items-center gap-2 border-b py-1.5 pr-2 pl-1 text-left focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
        :class="f.clase !== 'vacante' && 'cursor-pointer hover:bg-accent'"
        @focus="activa = f.clave"
        @click="activar(f)"
        @keydown="alTeclear($event, f, index)"
      >
        <!-- Las guías de la sangría, una línea por nivel; sin tope, una cadena muy honda se comería la fila. -->
        <span
          class="-my-1.5 shrink-0 self-stretch bg-[repeating-linear-gradient(to_right,var(--border)_0_1px,transparent_1px_0.875rem)]"
          :style="{ width: `${Math.min(f.nivel - 1, 10) * 0.875}rem` }"
          aria-hidden="true"
        />
        <span
          v-if="f.clase === 'unidad' && f.abierta !== undefined"
          class="-mx-1 grid size-6 shrink-0 place-items-center rounded"
          aria-hidden="true"
          @click.stop="plegar(f.nodo.unidad.id, !f.abierta)"
        >
          <ChevronRight
            class="size-4 transition-transform motion-reduce:transition-none"
            :class="f.abierta && 'rotate-90'"
          />
        </span>
        <span v-else class="-mx-1 size-6 shrink-0" aria-hidden="true" />
        <img
          v-if="personaDe(f)?.foto"
          :src="`data:image/png;base64,${personaDe(f)?.foto}`"
          alt=""
          class="size-8 shrink-0 rounded-full object-cover"
        />
        <span
          v-else-if="personaDe(f)"
          class="grid size-8 shrink-0 place-items-center rounded-full bg-muted text-xs"
          aria-hidden="true"
        >
          {{ iniciales(personaDe(f)?.nombre ?? "") }}
        </span>
        <span v-else class="size-8 shrink-0 rounded-full border border-dashed" aria-hidden="true" />

        <span v-if="f.clase === 'unidad'" class="grid min-w-0 flex-1">
          <span class="flex min-w-0 items-baseline gap-1.5">
            <span class="max-w-[70%] shrink-0 truncate font-semibold">
              <TextoResaltado :texto="f.nodo.unidad.nombre" :buscado="buscado" />
            </span>
            <!-- Si no cabe se corta el tipo, no la cifra. -->
            <span class="min-w-0 truncate text-xs text-muted-foreground">
              {{ t("personas.arbol.nPersonas", f.nodo.total) }} · {{ nombreTipo.get(f.nodo.unidad.tipo_id) }}
            </span>
          </span>
          <span v-if="f.nodo.jefe" class="truncate text-xs text-muted-foreground">
            <span
              class="hover:underline"
              :title="t('personas.arbol.verJefe')"
              @click.stop="emit('persona', f.nodo.jefe!)"
            >
              <TextoResaltado :texto="nombreJefe(f.nodo.jefe)" :buscado="buscado" />
            </span>
            ·
            <TextoResaltado :texto="f.nodo.jefe.cargo" :buscado="buscado" />
          </span>
          <span v-else class="truncate text-xs text-muted-foreground">{{ t("arbol.sinJefatura") }}</span>
        </span>
        <span v-else-if="f.clase === 'persona'" class="grid min-w-0 flex-1">
          <span class="truncate font-medium">
            <TextoResaltado :texto="f.fila.nombre" :buscado="buscado" />
          </span>
          <span class="truncate text-xs text-muted-foreground">
            <TextoResaltado :texto="f.fila.cargo" :buscado="buscado" />
            <span v-if="f.fila.tipo === 'reemplazo'" class="font-medium text-amber-800 dark:text-amber-400">
              · {{ t("puesto.tipo.reemplazo") }}
            </span>
          </span>
        </span>
        <span v-else class="grid min-w-0 flex-1">
          <span class="truncate font-medium text-amber-800 dark:text-amber-400">
            {{ t("puesto.vacante") }}
          </span>
          <span class="truncate text-xs text-muted-foreground">
            <TextoResaltado :texto="f.vacante.cargo" :buscado="buscado" />
          </span>
        </span>
      </div>
    </div>
  </div>
</template>
