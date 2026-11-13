<script setup lang="ts">
import { inject } from "vue";
import { useI18n } from "vue-i18n";
import { ArrowLeft, ArrowRight } from "@lucide/vue";
import { CONTEXTO_LIENZO } from "@/features/arbol/contexto";
import { useLienzo } from "@/features/arbol/useLienzo";
import { useVista } from "@/features/arbol/useVista";
import { useOrganizacion } from "@/stores/organizacion";
import { porQueNoSeVe, type FilaConexion } from "./panel";

// Las conexiones de una unidad, con su sentido: las mismas filas en «Conectar con…» y en el panel. `pulsable`: toda la fila es
// un botón (emite `abrir`). Si no, cada fila ofrece sus `acciones` y «Ver en el diagrama», que no cabría dentro de un botón.
defineProps<{ filas: FilaConexion[]; pulsable?: boolean }>();
const emit = defineEmits<{ abrir: [id: string] }>();

const { t } = useI18n();
const org = useOrganizacion();
const { colapsados, verConexion } = useLienzo();
const { config } = useVista();
const { mostradas } = inject(CONTEXTO_LIENZO)!;
const ver = (id: string) => (verConexion.value = id);
const oculta = (id: string) => porQueNoSeVe(mostradas.value, colapsados.value, id);
</script>

<template>
  <ul class="grid gap-1">
    <li
      v-for="f in filas"
      :key="f.id"
      class="flex items-center gap-1 rounded-lg border"
      :class="!pulsable && 'pr-2'"
    >
      <component
        :is="pulsable ? 'button' : 'span'"
        :type="pulsable ? 'button' : undefined"
        :aria-haspopup="pulsable ? 'dialog' : undefined"
        class="grid min-w-0 flex-1 px-2 py-1 text-left"
        :class="
          pulsable &&
          'cursor-pointer rounded-lg hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring'
        "
        @click="pulsable && emit('abrir', f.id)"
      >
        <span class="flex min-w-0 items-center gap-1 font-medium">
          <component
            :is="f.sentido === 'hacia' ? ArrowRight : ArrowLeft"
            class="size-3.5 shrink-0"
            aria-hidden="true"
          />
          <span class="sr-only">{{
            t(f.sentido === "hacia" ? "conexion.vaHacia" : "conexion.vieneDe")
          }}</span>
          <span class="truncate" :title="f.otro.nombre">{{ f.otro.nombre }}</span>
        </span>
        <span v-if="f.etiqueta" class="truncate text-xs text-muted-foreground" :title="f.etiqueta">{{
          f.etiqueta
        }}</span>
        <span v-if="oculta(f.otro.id)" class="text-xs text-muted-foreground">{{
          t(oculta(f.otro.id) === "plegada" ? "unidad.ocultaPlegada" : "unidad.ocultaFuera", {
            nombre: f.otro.nombre,
          })
        }}</span>
        <!-- Solo si abrir la rama la deja a la vista: apagado el interruptor o fuera de la rama enfocada, no serviría. Abrir
             ramas no cambia datos, pero a una fecha el fieldset del panel deshabilita todo: ahí no se ofrece. -->
        <button
          v-if="!pulsable && oculta(f.otro.id) === 'plegada' && config.relacionesLaterales && !org.fechaVista"
          type="button"
          class="justify-self-start rounded text-xs font-medium underline underline-offset-2 hover:no-underline focus-visible:outline-2 focus-visible:outline-ring"
          :aria-label="t('unidad.verConexion', { nombre: f.otro.nombre })"
          @click="ver(f.id)"
        >
          {{ t("conexion.verEnDiagrama") }}
        </button>
      </component>
      <slot name="acciones" :fila="f" />
    </li>
  </ul>
</template>
