<script setup lang="ts">
import { computed, inject, onBeforeUnmount, onMounted, ref, useId, useTemplateRef } from "vue";
import { useI18n } from "vue-i18n";
import { toast } from "vue-sonner";
import { Trash2 } from "@lucide/vue";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CONTEXTO_LIENZO } from "@/features/arbol/contexto";
import { useLienzo } from "@/features/arbol/useLienzo";
import { useVista } from "@/features/arbol/useVista";
import { useOrganizacion } from "@/stores/organizacion";
import { excluidasParaConexion, porQueNoSeVe } from "./panel";
import SelectorUnidad from "./SelectorUnidad.vue";

// La ventanita de una conexión: descripción, cambiar una de sus unidades (`fija`: la que no se ofrece cambiar) y eliminar.
// A una fecha pasada, solo de lectura.
const props = defineProps<{ id: string; fija?: string }>();
const emit = defineEmits<{ cerrar: [] }>();

const { t } = useI18n();
const org = useOrganizacion();
const { colapsados } = useLienzo();
const { config } = useVista();
const { mostradas } = inject(CONTEXTO_LIENZO)!;
const uid = useId();
const soloLectura = computed(() => !!org.fechaVista);

const conexion = computed(() => org.conexiones.find((c) => c.id === props.id));
const nombre = (id: string) => org.enFecha.porId.get(id)?.nombre ?? org.porId.get(id)?.nombre ?? "";
const titulo = computed(
  () =>
    conexion.value &&
    t("conexion.titulo", {
      origen: nombre(conexion.value.origen_id),
      destino: nombre(conexion.value.destino_id),
    }),
);

const extremos = computed(() => {
  const c = conexion.value;
  if (!c) return [];
  return [
    { campo: "origen_id" as const, actual: c.origen_id, otro: c.destino_id },
    { campo: "destino_id" as const, actual: c.destino_id, otro: c.origen_id },
  ].filter((e) => e.actual !== props.fija);
});
async function cambiar(campo: "origen_id" | "destino_id", unidad: string | null) {
  if (!unidad) return;
  const r = await org.actualizarConexion(props.id, { [campo]: unidad });
  if (!r.ok) toast.error(r.mensaje);
}

const aviso = computed(() => {
  const c = conexion.value;
  if (!c) return null;
  if (!config.value.relacionesLaterales) return t("unidad.relacionesApagadas");
  for (const id of [c.origen_id, c.destino_id]) {
    const motivo = porQueNoSeVe(mostradas.value, colapsados.value, id);
    if (motivo)
      return t(motivo === "plegada" ? "unidad.ocultaPlegada" : "unidad.ocultaFuera", { nombre: nombre(id) });
  }
  return null;
});

// La descripción se guarda al terminar de escribir o al cerrarse la ventanita, cualquiera sea la forma (Esc, clic afuera).
const descripcion = ref(conexion.value?.etiqueta ?? "");
const campo = useTemplateRef<HTMLElement>("campo");
let eliminada = false;
async function guardar() {
  if (eliminada || soloLectura.value || !conexion.value) return;
  if ((descripcion.value.trim() || null) === conexion.value.etiqueta) return;
  const r = await org.actualizarConexion(props.id, { etiqueta: descripcion.value });
  if (!r.ok) toast.error(r.mensaje);
}
onBeforeUnmount(guardar);
// Tras «Conectar con…» la ventanita ya estaba abierta: el foco no entra solo a este contenido.
onMounted(() => campo.value?.querySelector("input")?.focus());

async function eliminar() {
  eliminada = true;
  const r = await org.eliminarConexion(props.id);
  if (r.ok) return emit("cerrar");
  eliminada = false;
  toast.error(r.mensaje);
}
</script>

<template>
  <div v-if="conexion" class="grid gap-3">
    <h2 class="text-sm font-semibold break-words">{{ titulo }}</h2>

    <template v-if="soloLectura">
      <p class="text-sm" :class="!conexion.etiqueta && 'text-muted-foreground'">
        {{ conexion.etiqueta || t("conexion.sinDescripcion") }}
      </p>
      <p class="text-xs text-muted-foreground">{{ t("arbol.fecha.panelSoloLectura") }}</p>
    </template>

    <template v-else>
      <div ref="campo" class="grid gap-1.5">
        <Label :for="`${uid}-descripcion`">{{ t("unidad.descripcionConexion") }}</Label>
        <Input
          :id="`${uid}-descripcion`"
          v-model="descripcion"
          autocomplete="off"
          @change="guardar"
          @keydown.enter="emit('cerrar')"
        />
      </div>
      <div class="grid gap-1.5" role="group" :aria-labelledby="`${uid}-cambiar`">
        <span :id="`${uid}-cambiar`" class="text-sm font-medium">{{ t("conexion.cambiarUnidad") }}</span>
        <SelectorUnidad
          v-for="e in extremos"
          :key="e.campo"
          :excluidas="excluidasParaConexion(org.conexiones, e.otro)"
          :texto="nombre(e.actual)"
          :aria-label="t('conexion.cambiarUnidadDe', { nombre: nombre(e.actual) })"
          @elegir="cambiar(e.campo, $event)"
        />
      </div>
      <Button type="button" variant="destructive" size="sm" class="justify-self-start" @click="eliminar">
        <Trash2 aria-hidden="true" />
        {{ t("conexion.eliminar") }}
      </Button>
    </template>

    <p v-if="aviso" class="text-xs text-muted-foreground">{{ aviso }}</p>
  </div>
</template>
