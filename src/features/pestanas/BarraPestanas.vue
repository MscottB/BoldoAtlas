<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, useTemplateRef, watch } from "vue";
import { useI18n } from "vue-i18n";
import { Plus, X } from "@lucide/vue";
import { Button } from "@/components/ui/button";
import { RUTA_INICIO } from "./pestanas";
import { ID_AREA, abrirEnPestanaNueva, idPestana, usePestanas } from "./usePestanas";

// Barra de pestañas sobre el área central (App.vue la muestra desde la segunda pestaña). Patrón tablist con activación
// manual: las flechas solo mueven el foco (Enter o Espacio activan), para no montar el lienzo de cada pestaña al pasar.
const { t } = useI18n();
const pestanas = usePestanas();
const items = computed(() => pestanas.lista.map((p) => ({ id: p.id, titulo: pestanas.titulo(p) })));

// Foco itinerante: la pestaña con tabindex 0 es la última enfocada; si ya no está, la activa.
const foco = ref<string | null>(null);
const enfocable = (id: string) =>
  (foco.value && pestanas.lista.some((p) => p.id === foco.value) ? foco.value : pestanas.activa) === id;
async function enfocar(id: string) {
  foco.value = id;
  await nextTick(); // mover una pestaña la saca y la vuelve a poner en el DOM: pierde el foco
  document.getElementById(idPestana(id))?.focus();
}

// Con muchas pestañas la barra se desplaza: la activa siempre a la vista (también al cambiar con Ctrl+Tab).
watch(
  () => pestanas.activa,
  async (id) => {
    await nextTick();
    document.getElementById(idPestana(id))?.scrollIntoView({ block: "nearest", inline: "nearest" });
  },
  { immediate: true },
);

const aviso = ref(""); // región viva: dónde quedó la pestaña movida con el teclado
function moverA(id: string, posicion: number) {
  pestanas.mover(id, posicion);
  const i = pestanas.lista.findIndex((p) => p.id === id);
  aviso.value = t("pestanas.movida", {
    titulo: items.value[i]?.titulo,
    posicion: i + 1,
    total: pestanas.lista.length,
  });
  void enfocar(id);
}

function tecla(e: KeyboardEvent, i: number) {
  const lista = pestanas.lista;
  const id = lista[i]!.id;
  const paso = e.key === "ArrowLeft" ? -1 : e.key === "ArrowRight" ? 1 : 0;
  if (paso && e.ctrlKey && e.shiftKey) moverA(id, i + paso);
  else if (paso && !e.ctrlKey && !e.metaKey && !e.altKey)
    void enfocar(lista[(i + paso + lista.length) % lista.length]!.id);
  else if (e.key === "Home") void enfocar(lista[0]!.id);
  else if (e.key === "End") void enfocar(lista[lista.length - 1]!.id);
  else if (e.key === "Delete") pestanas.cerrar(id);
  else return;
  // Son de la barra: que no lleguen a los atajos del lienzo (flechas, Supr).
  e.preventDefault();
  e.stopPropagation();
}

// Arrastrar para reordenar, con eventos de puntero: Tauri en Windows intercepta el arrastre nativo (HTML5 drag & drop).
const barra = useTemplateRef("barra");
const arrastrada = ref<string | null>(null);
let inicio: { id: string; x: number } | null = null;
let recienArrastrada = false; // el clic que sigue a soltar no activa la pestaña
function alPresionar(e: PointerEvent, id: string) {
  recienArrastrada = false;
  if (e.button !== 0) return;
  inicio = { id, x: e.clientX };
  window.addEventListener("pointermove", alMover);
  window.addEventListener("pointerup", alSoltar);
  window.addEventListener("pointercancel", alSoltar);
}
function alMover(e: PointerEvent) {
  if (!inicio || (!arrastrada.value && Math.abs(e.clientX - inicio.x) < 6)) return;
  arrastrada.value = inicio.id;
  const bajo = [...(barra.value?.querySelectorAll<HTMLElement>("[data-pestana]") ?? [])].findIndex((el) => {
    const r = el.getBoundingClientRect();
    return e.clientX >= r.left && e.clientX < r.right;
  });
  if (bajo >= 0) pestanas.mover(inicio.id, bajo);
}
function alSoltar() {
  window.removeEventListener("pointermove", alMover);
  window.removeEventListener("pointerup", alSoltar);
  window.removeEventListener("pointercancel", alSoltar);
  recienArrastrada = !!arrastrada.value;
  setTimeout(() => (recienArrastrada = false)); // el clic, si viene, llega antes
  arrastrada.value = null;
  inicio = null;
}

// Si la barra desaparece en pleno arrastre (p. ej. Ctrl+W deja una sola pestaña), sin escuchas colgando.
onBeforeUnmount(alSoltar);

function alPulsar(id: string) {
  if (recienArrastrada) return void (recienArrastrada = false);
  pestanas.activar(id);
}
// Clic central sobre una pestaña: la cierra.
function alPulsarAux(e: MouseEvent, id: string) {
  if (e.button !== 1) return;
  e.preventDefault();
  pestanas.cerrar(id);
}
</script>

<template>
  <div class="flex shrink-0 items-end gap-1 border-b bg-background px-2 pt-1">
    <div
      ref="barra"
      role="tablist"
      :aria-label="t('pestanas.barra')"
      class="flex min-w-0 items-end gap-0.5 overflow-x-auto"
    >
      <div
        v-for="(p, i) in items"
        :key="p.id"
        data-pestana
        role="presentation"
        class="flex max-w-52 min-w-24 shrink-0 touch-none items-center rounded-t-md select-none"
        :class="[
          p.id === pestanas.activa
            ? 'bg-accent font-medium text-foreground shadow-[inset_0_-2px_0_var(--primary)]'
            : 'text-muted-foreground hover:bg-accent hover:text-foreground',
          arrastrada === p.id && 'opacity-60',
        ]"
        @pointerdown="alPresionar($event, p.id)"
        @auxclick="alPulsarAux($event, p.id)"
        @mousedown.middle.prevent
      >
        <button
          :id="idPestana(p.id)"
          type="button"
          role="tab"
          :aria-selected="p.id === pestanas.activa"
          :aria-controls="ID_AREA"
          aria-describedby="pestanas-ayuda"
          :tabindex="enfocable(p.id) ? 0 : -1"
          :title="p.titulo"
          class="min-w-0 flex-1 truncate rounded-sm py-1.5 pr-1 pl-3 text-left text-sm focus-visible:outline-2 focus-visible:outline-ring"
          @click="alPulsar(p.id)"
          @keydown="tecla($event, i)"
          @focus="foco = p.id"
        >
          {{ p.titulo }}
        </button>
        <button
          type="button"
          :tabindex="enfocable(p.id) ? 0 : -1"
          :aria-label="t('pestanas.cerrar', { titulo: p.titulo })"
          :title="t('pestanas.cerrar', { titulo: p.titulo })"
          class="mr-1 shrink-0 rounded-sm p-0.5 hover:bg-background focus-visible:outline-2 focus-visible:outline-ring"
          @click="pestanas.cerrar(p.id)"
        >
          <X class="size-3.5" aria-hidden="true" />
        </button>
      </div>
    </div>
    <Button
      variant="ghost"
      size="icon"
      class="mb-0.5 size-7 shrink-0"
      :aria-label="t('pestanas.nueva')"
      :title="t('pestanas.nuevaAtajo')"
      aria-keyshortcuts="Control+T"
      @click="abrirEnPestanaNueva(RUTA_INICIO)"
    >
      <Plus aria-hidden="true" />
    </Button>
    <p id="pestanas-ayuda" class="sr-only">{{ t("pestanas.ayudaTeclado") }}</p>
    <p class="sr-only" role="status">{{ aviso }}</p>
  </div>
</template>
