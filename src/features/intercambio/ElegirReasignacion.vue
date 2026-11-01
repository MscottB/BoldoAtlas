<script setup lang="ts">
import { onUnmounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { revisionOpciones } from "@/db/cliente";
import { claseSelect } from "@/lib/utils";
import { intentar } from "./intercambio";

const props = defineProps<{ trabajo: string; destino: string; nombre: string }>();
const emit = defineEmits<{ elegir: [id: string] }>();
const { t } = useI18n();

const abierto = ref(false);
const texto = ref("");
const opciones = ref<{ id: string; nombre: string }[]>([]);
const elegida = ref("");

let temporizador: ReturnType<typeof setTimeout> | undefined;
let peticion = 0;
async function buscar() {
  const propia = ++peticion;
  const r = await intentar(() => revisionOpciones(props.trabajo, props.destino, texto.value));
  if (propia !== peticion || !r.ok) return;
  opciones.value = r.valor;
  elegida.value = r.valor[0]?.id ?? "";
}
watch(abierto, (a) => {
  if (a) void buscar();
});
watch(texto, () => {
  clearTimeout(temporizador);
  temporizador = setTimeout(() => void buscar(), 250);
});
onUnmounted(() => clearTimeout(temporizador));
</script>

<template>
  <Button v-if="!abierto" type="button" size="sm" variant="outline" @click="abierto = true">
    {{ t("intercambio.revisar.reasignar") }}
  </Button>
  <form v-else class="flex flex-wrap items-center gap-2" @submit.prevent="elegida && emit('elegir', elegida)">
    <Input
      v-model="texto"
      class="h-8 max-w-48"
      autocomplete="off"
      :aria-label="t('intercambio.revisar.buscarReasignar', { nombre })"
      :placeholder="t('intercambio.revisar.buscar')"
    />
    <select v-model="elegida" :class="claseSelect" class="max-w-64" :aria-label="t('intercambio.revisar.reasignarA', { nombre })">
      <option v-for="o in opciones" :key="o.id" :value="o.id">{{ o.nombre }}</option>
    </select>
    <Button type="submit" size="sm" variant="outline" :disabled="!elegida">{{ t("intercambio.revisar.usar") }}</Button>
  </form>
</template>
