<script setup lang="ts">
import { computed, inject, ref, useId, useTemplateRef } from "vue";
import { useI18n } from "vue-i18n";
import { toast } from "vue-sonner";
import { Pencil, X } from "@lucide/vue";
import { CONTEXTO_LIENZO } from "@/features/arbol/contexto";
import { useLienzo, ventanaConexion, verConexion } from "@/features/arbol/useLienzo";
import { useVista } from "@/features/arbol/useVista";
import { useOrganizacion } from "@/stores/organizacion";
import { excluidasParaConexion, porQueNoSeVe } from "./panel";
import EliminarConexion from "./EliminarConexion.vue";
import SelectorUnidad from "./SelectorUnidad.vue";

// Conexiones de la unidad con otras unidades (no cambian la jerarquía). Primero se elige la unidad; la descripción, opcional,
// se escribe después en la misma ventanita con la que se editan.
const props = defineProps<{ unidadId: string }>();
const { t } = useI18n();
const org = useOrganizacion();
const { colapsados } = useLienzo();
const { config } = useVista();
const { mostradas } = inject(CONTEXTO_LIENZO)!;
const uid = useId();

const filas = computed(() =>
  org.conexiones.flatMap((c) => {
    const otroId =
      c.origen_id === props.unidadId ? c.destino_id : c.destino_id === props.unidadId ? c.origen_id : "";
    const otro = org.porId.get(otroId);
    return otro
      ? [
          {
            id: c.id,
            otro,
            etiqueta: c.etiqueta,
            oculta: porQueNoSeVe(mostradas.value, colapsados.value, otroId),
          },
        ]
      : [];
  }),
);
const excluidas = computed(() => excluidasParaConexion(org.conexiones, props.unidadId));
const raiz = useTemplateRef<HTMLElement>("raiz");

const editar = (id: string, e: Event) => {
  const boton = e.currentTarget as HTMLElement;
  ventanaConexion.value = {
    id,
    fija: props.unidadId,
    ancla: boton.getBoundingClientRect(),
    foco: boton,
  };
};

const cuadro = () => new Promise(requestAnimationFrame);
let creando = false;
async function conectar(destino: string | null) {
  if (!destino || creando) return; // un doble clic en la lista no crea dos
  creando = true;
  const r = await org.crearConexion(props.unidadId, destino);
  creando = false;
  if (!r.ok) return void toast.error(r.mensaje);
  // El buscador que se cierra devuelve el foco a su botón: se espera (con tope) para no sacárselo después a la ventanita.
  for (let i = 0; i < 60 && document.querySelector('[role="dialog"]'); i++) await cuadro();
  const boton = raiz.value?.querySelector<HTMLElement>("[data-conectar]");
  if (boton)
    ventanaConexion.value = {
      id: r.id!,
      fija: props.unidadId,
      ancla: boton.getBoundingClientRect(),
      foco: boton,
    };
  verConexion.value = r.id!; // si quedó hacia una rama plegada, la abre y muestra la línea
}

const quitando = ref<string | null>(null);
// Su fila ya no está: el foco no se pierde.
const alEliminar = () => raiz.value?.closest<HTMLElement>("[data-panel-unidad]")?.focus();
</script>

<template>
  <section ref="raiz" class="grid gap-1.5" :aria-labelledby="`${uid}-titulo`">
    <h3 :id="`${uid}-titulo`" class="text-sm font-medium">
      {{ t("unidad.conexiones") }}
      <span class="font-normal text-muted-foreground">({{ filas.length }})</span>
    </h3>
    <p class="text-xs text-muted-foreground">{{ t("unidad.conexionesAyuda") }}</p>
    <ul v-if="filas.length" class="grid gap-1" :aria-labelledby="`${uid}-titulo`">
      <li v-for="f in filas" :key="f.id" class="flex items-center gap-1 rounded-lg border px-2 py-1">
        <span class="grid min-w-0 flex-1">
          <span class="truncate font-medium">{{ f.otro.nombre }}</span>
          <span v-if="f.etiqueta" class="truncate text-xs text-muted-foreground" :title="f.etiqueta">{{
            f.etiqueta
          }}</span>
          <span v-if="f.oculta" class="text-xs text-muted-foreground">{{
            t(f.oculta === "plegada" ? "unidad.ocultaPlegada" : "unidad.ocultaFuera", {
              nombre: f.otro.nombre,
            })
          }}</span>
          <!-- Solo si abrir la rama la deja a la vista: apagado el interruptor o fuera de la rama enfocada, no serviría. Abrir
               ramas no cambia datos, pero a una fecha el fieldset del panel deshabilita todo: ahí no se ofrece. -->
          <button
            v-if="f.oculta === 'plegada' && config.relacionesLaterales && !org.fechaVista"
            type="button"
            class="justify-self-start rounded text-xs font-medium underline underline-offset-2 hover:no-underline focus-visible:outline-2 focus-visible:outline-ring"
            :aria-label="t('unidad.verConexion', { nombre: f.otro.nombre })"
            @click="verConexion = f.id"
          >
            {{ t("conexion.verEnDiagrama") }}
          </button>
        </span>
        <button
          type="button"
          class="grid size-6 shrink-0 place-items-center rounded hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50"
          :aria-label="t('unidad.editarConexion', { nombre: f.otro.nombre })"
          :title="t('unidad.editarConexion', { nombre: f.otro.nombre })"
          aria-haspopup="dialog"
          @click="editar(f.id, $event)"
        >
          <Pencil class="size-3.5" aria-hidden="true" />
        </button>
        <button
          type="button"
          class="grid size-6 shrink-0 place-items-center rounded hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50"
          :aria-label="t('unidad.quitarConexion', { nombre: f.otro.nombre })"
          :title="t('unidad.quitarConexion', { nombre: f.otro.nombre })"
          aria-haspopup="dialog"
          @click="quitando = f.id"
        >
          <X class="size-4" aria-hidden="true" />
        </button>
      </li>
    </ul>
    <p v-else class="text-sm text-muted-foreground">{{ t("unidad.sinConexiones") }}</p>
    <p v-if="filas.length && !config.relacionesLaterales" class="text-xs text-muted-foreground">
      {{ t("unidad.relacionesApagadas") }}
    </p>
    <SelectorUnidad
      data-conectar
      :excluidas="excluidas"
      :texto="t('unidad.conectarCon')"
      @elegir="conectar"
    />
    <EliminarConexion :id="quitando" @cerrar="quitando = null" @eliminada="alEliminar" />
  </section>
</template>
