<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { DetalleComparado, FilaComparada } from "@/db/cliente";
import { nombreColumna, textoValor } from "@/features/intercambio/intercambio";
import { textoPresencia } from "./comparar";

// Panel lateral con una fila de la comparación: solo lo que difiere, una columna por organización.
const abierto = defineModel<boolean>("open", { required: true });
const props = defineProps<{
  fila: FilaComparada | null;
  detalle: DetalleComparado | null;
  error: string;
  nombreAqui: string;
  nombreAlla: string;
}>();
const { t, locale } = useI18n();

const nombre = computed(() => props.fila?.nombre || t("intercambio.revisar.sinNombre"));
// En el lado donde no está no hay nada que mostrar.
const falta = computed(() => ({
  aqui: props.fila?.presencia === "solo_alla",
  alla: props.fila?.presencia === "solo_aqui",
}));
// Rust ya dice si cambian los puestos de alguien que está en las dos; si está en una sola, se ven los que tenga.
const verPuestos = computed(() => {
  const f = props.fila;
  const d = props.detalle;
  if (!f || !d) return false;
  return f.presencia === "difieren" ? f.columnas.includes("puestos") : d.puestosAqui.length + d.puestosAlla.length > 0;
});
function fecha(f: string | null): string {
  const d = f ? new Date(f) : null;
  return d && !Number.isNaN(d.getTime()) ? d.toLocaleString(locale.value) : "—";
}
</script>

<template>
  <Dialog v-model:open="abierto">
    <DialogContent
      class="top-0 right-0 left-auto h-full max-h-none w-full max-w-lg translate-x-0 translate-y-0 content-start overflow-y-auto rounded-none sm:max-w-lg data-closed:slide-out-to-right data-open:slide-in-from-right"
    >
      <DialogHeader>
        <DialogTitle class="pr-8 break-words">{{ nombre }}</DialogTitle>
        <DialogDescription v-if="fila">
          {{ t(`intercambio.tablas.${fila.tabla}`) }} · {{ textoPresencia(fila.presencia, nombreAqui, nombreAlla) }}
        </DialogDescription>
      </DialogHeader>

      <p v-if="error" role="alert" class="text-destructive">{{ error }}</p>
      <p v-else-if="!detalle" role="status" class="text-muted-foreground">{{ t("comparar.cargando") }}</p>
      <template v-else>
        <table class="w-full table-fixed text-left">
          <caption class="sr-only">{{ t("intercambio.revisar.camposDe", { nombre }) }}</caption>
          <thead>
            <tr class="border-b text-xs text-muted-foreground">
              <th scope="col" class="w-1/4 py-1 pr-3 font-medium">{{ t("intercambio.revisar.campo") }}</th>
              <th scope="col" class="py-1 pr-3 font-medium break-words">{{ nombreAqui }}</th>
              <th scope="col" class="py-1 pr-3 font-medium break-words">{{ nombreAlla }}</th>
            </tr>
          </thead>
          <tbody class="divide-y">
            <tr v-for="c in detalle.campos" :key="c.columna" class="align-top">
              <th scope="row" class="py-1 pr-3 font-normal">{{ nombreColumna(c.columna) }}</th>
              <td class="py-1 pr-3 break-words">{{ falta.aqui ? "—" : textoValor(c.columna, c.mio) }}</td>
              <td class="py-1 pr-3 break-words">{{ falta.alla ? "—" : textoValor(c.columna, c.archivo) }}</td>
            </tr>
            <tr v-if="verPuestos" class="align-top">
              <th scope="row" class="py-1 pr-3 font-normal">{{ t("intercambio.tablas.puestos") }}</th>
              <td v-for="(lista, i) in [detalle.puestosAqui, detalle.puestosAlla]" :key="i" class="py-1 pr-3 break-words">
                <ul v-if="lista.length">
                  <li v-for="p in lista" :key="p">{{ p }}</li>
                </ul>
                <template v-else>—</template>
              </td>
            </tr>
          </tbody>
        </table>
        <dl class="grid grid-cols-[auto_1fr] gap-x-3 text-xs text-muted-foreground">
          <template v-if="!falta.aqui">
            <dt>{{ t("comparar.editadaEn", { nombre: nombreAqui }) }}</dt>
            <dd>{{ fecha(detalle.actualizadaAqui) }}</dd>
          </template>
          <template v-if="!falta.alla">
            <dt>{{ t("comparar.editadaEn", { nombre: nombreAlla }) }}</dt>
            <dd>{{ fecha(detalle.actualizadaAlla) }}</dd>
          </template>
        </dl>
      </template>
    </DialogContent>
  </Dialog>
</template>
