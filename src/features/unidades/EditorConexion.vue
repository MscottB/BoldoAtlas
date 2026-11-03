<script setup lang="ts">
import { computed, inject, onBeforeUnmount, onMounted, ref, useId, useTemplateRef } from "vue";
import { useI18n } from "vue-i18n";
import { toast } from "vue-sonner";
import { ArrowLeftRight, Trash2 } from "@lucide/vue";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CONTEXTO_LIENZO } from "@/features/arbol/contexto";
import { useLienzo, verConexion } from "@/features/arbol/useLienzo";
import { useVista } from "@/features/arbol/useVista";
import { useOrganizacion } from "@/stores/organizacion";
import { conexionOculta, excluidasParaConexion, ultimoEnviado } from "./panel";
import EliminarConexion from "./EliminarConexion.vue";
import SelectorUnidad from "./SelectorUnidad.vue";

// La ventanita de una conexión: descripción, cambiar una de sus unidades (`fija`: la que no se ofrece cambiar), invertir y eliminar.
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
  if (r.ok)
    verConexion.value = props.id; // si quedó hacia una rama plegada, la abre y muestra la línea
  else toast.error(r.mensaje);
}
// Mismas unidades, sentido contrario: no cambia lo que se ve ni hay rama que abrir.
async function invertir() {
  const c = conexion.value;
  if (!c) return;
  const r = await org.actualizarConexion(props.id, { origen_id: c.destino_id, destino_id: c.origen_id });
  if (!r.ok) toast.error(r.mensaje);
}

// Por qué no se ve. Rama plegada: se puede abrir (Ver en el diagrama). Lo demás no se resuelve desde aquí: solo se dice.
const oculta = computed(() => {
  const c = conexion.value;
  if (!c) return null;
  if (!config.value.relacionesLaterales) return { texto: t("unidad.relacionesApagadas"), plegada: false };
  const m = conexionOculta(mostradas.value, colapsados.value, [c.origen_id, c.destino_id]);
  if (!m) return null;
  const plegada = m.motivo === "plegada";
  return {
    texto: t(plegada ? "unidad.ocultaPlegada" : "unidad.ocultaFuera", { nombre: nombre(m.id) }),
    plegada,
  };
});
const ver = () => (verConexion.value = props.id);

// La descripción se guarda al terminar de escribir o al cerrarse la ventanita, cualquiera sea la forma (Esc, clic afuera).
const descripcion = ref(conexion.value?.etiqueta ?? "");
const raiz = useTemplateRef<HTMLElement>("raiz");
const enviado = ultimoEnviado(conexion.value?.etiqueta ?? null);
async function guardar() {
  if (soloLectura.value || !conexion.value) return;
  if (!enviado.cambia(descripcion.value.trim() || null)) return;
  const r = await org.actualizarConexion(props.id, { etiqueta: descripcion.value });
  if (r.ok) return;
  enviado.fallo();
  toast.error(r.mensaje);
}
onBeforeUnmount(guardar);
// El foco entra aquí: tras «Conectar con…» la ventanita ya estaba abierta, y en solo lectura no hay un campo que lo reciba.
onMounted(() => (raiz.value?.querySelector("input") ?? raiz.value)?.focus());

const quitando = ref<string | null>(null);
</script>

<template>
  <div v-if="conexion" ref="raiz" tabindex="-1" class="grid gap-3 outline-hidden">
    <h2 class="text-sm font-semibold break-words" aria-live="polite">{{ titulo }}</h2>

    <template v-if="soloLectura">
      <p class="text-sm" :class="!conexion.etiqueta && 'text-muted-foreground'">
        {{ conexion.etiqueta || t("conexion.sinDescripcion") }}
      </p>
      <p class="text-xs text-muted-foreground">{{ t("arbol.fecha.panelSoloLectura") }}</p>
    </template>

    <template v-else>
      <div class="grid gap-1.5">
        <Label :for="`${uid}-descripcion`">{{ t("unidad.descripcionConexion") }}</Label>
        <Input
          :id="`${uid}-descripcion`"
          v-model="descripcion"
          autocomplete="off"
          @change="guardar"
          @keydown.enter.prevent="emit('cerrar')"
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
    </template>

    <div class="flex flex-wrap gap-2">
      <Button type="button" variant="outline" size="sm" :disabled="soloLectura" @click="invertir">
        <ArrowLeftRight aria-hidden="true" />
        {{ t("conexion.invertir") }}
      </Button>
      <Button v-if="!soloLectura" type="button" variant="destructive" size="sm" @click="quitando = id">
        <Trash2 aria-hidden="true" />
        {{ t("conexion.eliminar") }}
      </Button>
    </div>

    <template v-if="oculta">
      <p class="text-xs text-muted-foreground">{{ oculta.texto }}</p>
      <Button
        v-if="oculta.plegada"
        type="button"
        variant="outline"
        size="sm"
        class="justify-self-start"
        @click="ver"
      >
        {{ t("conexion.verEnDiagrama") }}
      </Button>
    </template>
  </div>
  <EliminarConexion :id="quitando" @cerrar="quitando = null" @eliminada="emit('cerrar')" />
</template>
