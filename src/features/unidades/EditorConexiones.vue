<script setup lang="ts">
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import { toast } from "vue-sonner";
import { X } from "@lucide/vue";
import { Input } from "@/components/ui/input";
import { useOrganizacion } from "@/stores/organizacion";
import { excluidasParaConexion } from "./panel";
import SelectorUnidad from "./SelectorUnidad.vue";

// Conexiones laterales de la unidad con otras unidades (no cambian la jerarquía).
const props = defineProps<{ unidadId: string }>();
const { t } = useI18n();
const org = useOrganizacion();

const filas = computed(() =>
  org.conexiones.flatMap((c) => {
    const otroId =
      c.origen_id === props.unidadId ? c.destino_id : c.destino_id === props.unidadId ? c.origen_id : "";
    const otro = org.porId.get(otroId);
    return otro ? [{ id: c.id, otro, etiqueta: c.etiqueta }] : [];
  }),
);
const excluidas = computed(() => excluidasParaConexion(org.conexiones, props.unidadId));
const etiqueta = ref("");

async function conectar(destino: string | null) {
  if (!destino) return;
  const r = await org.crearConexion(props.unidadId, destino, etiqueta.value.trim() || null);
  if (r.ok) etiqueta.value = "";
  else toast.error(r.mensaje);
}
async function quitar(id: string) {
  const r = await org.eliminarConexion(id);
  if (!r.ok) toast.error(r.mensaje);
}
</script>

<template>
  <div class="grid gap-2">
    <ul v-if="filas.length" class="grid gap-1" :aria-label="t('unidad.conexiones')">
      <li v-for="f in filas" :key="f.id" class="flex items-center gap-2 rounded-lg border px-2 py-1">
        <span class="grid min-w-0 flex-1">
          <span class="truncate font-medium">{{ f.otro.nombre }}</span>
          <span v-if="f.etiqueta" class="truncate text-xs text-muted-foreground">{{ f.etiqueta }}</span>
        </span>
        <button
          type="button"
          class="grid size-6 shrink-0 place-items-center rounded hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"
          :aria-label="t('unidad.quitarConexion', { nombre: f.otro.nombre })"
          @click="quitar(f.id)"
        >
          <X class="size-4" aria-hidden="true" />
        </button>
      </li>
    </ul>
    <p v-else class="text-sm text-muted-foreground">{{ t("unidad.sinConexiones") }}</p>
    <Input
      v-model="etiqueta"
      class="h-8"
      autocomplete="off"
      :aria-label="t('unidad.descripcionConexion')"
      :placeholder="t('unidad.descripcionConexion')"
    />
    <SelectorUnidad :excluidas="excluidas" :texto="t('unidad.conectarCon')" @elegir="conectar" />
  </div>
</template>
