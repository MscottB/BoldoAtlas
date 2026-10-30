<script setup lang="ts">
import { computed, onMounted, ref, useId } from "vue";
import { useI18n } from "vue-i18n";
import { toast } from "vue-sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Asignacion } from "@/db/tipos";
import { vigentesPorPuesto } from "@/features/arbol/jerarquia";
import { useOrganizacion } from "@/stores/organizacion";
import SelectorPersona from "./SelectorPersona.vue";
import { esTitularVigente, formatearFecha, hoyISO, type EleccionPersona } from "./puestos";

// Formulario pequeño de una acción del puesto. Las fechas son <input type="date">: entregan AAAA-MM-DD o "".
const props = defineProps<{
  puestoId: string;
  tipo: "titular" | "reemplazo" | "terminar";
  /** La asignación que se termina (solo con tipo "terminar"). */
  asignacion?: Asignacion;
}>();
const emit = defineEmits<{ listo: []; cancelar: [] }>();

const { t, locale } = useI18n();
const org = useOrganizacion();
const uid = useId();

const eleccion = ref<EleccionPersona | null>(null);
const fecha = ref(hoyISO());
const hasta = ref(""); // solo reemplazo; vacío = sigue vigente hasta "Terminar asignación"
const motivo = ref("");
const error = ref("");
const enviando = ref(false);
const raiz = ref<HTMLElement | null>(null);

const titularActual = computed(() => {
  const a = vigentesPorPuesto(org.asignaciones).get(props.puestoId)?.titular;
  return a && org.trabajadores.find((w) => w.id === a.trabajador_id)?.nombre;
});

onMounted(() => raiz.value?.querySelector<HTMLElement>("button, input")?.focus());

async function confirmar() {
  error.value = "";
  if (!fecha.value) return void (error.value = t("puesto.error.fecha"));
  if (props.tipo === "terminar")
    return resolver(
      await org.terminarAsignacion(props.asignacion!.id, fecha.value, motivo.value.trim() || null),
    );
  const e = eleccion.value;
  if (!e) return void (error.value = t("puesto.error.persona"));
  if (
    "id" in e &&
    props.tipo === "titular" &&
    esTitularVigente(vigentesPorPuesto(org.asignaciones), props.puestoId, e.id)
  ) {
    toast.info(t("puesto.yaEsTitular"));
    return emit("listo"); // sin escribir: no deja una fila nueva en el historial
  }
  const h = props.tipo === "reemplazo" ? hasta.value || null : null;
  enviando.value = true;
  const r =
    "id" in e
      ? await (props.tipo === "titular"
          ? org.asignarTitular(props.puestoId, e.id, fecha.value)
          : org.registrarReemplazo(props.puestoId, e.id, fecha.value, h))
      : await org.asignarNuevaPersona(props.puestoId, props.tipo, e.nombre, fecha.value, h);
  enviando.value = false;
  resolver(r);
}

function resolver(r: { ok: boolean; mensaje?: string }) {
  if (r.ok) emit("listo");
  else error.value = r.mensaje ?? "";
}
</script>

<template>
  <form
    ref="raiz"
    class="grid gap-3 rounded-lg border bg-muted/30 p-3 sm:grid-cols-2"
    @submit.prevent="confirmar"
  >
    <h3 class="text-sm font-medium sm:col-span-2">{{ t(`puesto.accion.${tipo}`) }}</h3>

    <div v-if="tipo !== 'terminar'" class="grid gap-1.5 sm:col-span-2">
      <Label :for="`${uid}-persona`">{{ t("puesto.persona") }}</Label>
      <SelectorPersona :id="`${uid}-persona`" v-model="eleccion" />
    </div>
    <p v-else class="text-sm sm:col-span-2">
      {{
        t("puesto.terminaA", {
          nombre: org.trabajadores.find((w) => w.id === asignacion!.trabajador_id)?.nombre ?? "",
        })
      }}
    </p>

    <div class="grid gap-1.5">
      <Label :for="`${uid}-fecha`">{{ t(tipo === "terminar" ? "puesto.hasta" : "puesto.desde") }}</Label>
      <Input :id="`${uid}-fecha`" v-model="fecha" type="date" required />
    </div>
    <div v-if="tipo === 'reemplazo'" class="grid gap-1.5">
      <Label :for="`${uid}-hasta`">{{ t("puesto.hastaOpcional") }}</Label>
      <Input :id="`${uid}-hasta`" v-model="hasta" type="date" />
    </div>
    <div v-if="tipo === 'terminar'" class="grid gap-1.5">
      <Label :for="`${uid}-motivo`">{{ t("puesto.motivo") }}</Label>
      <Input :id="`${uid}-motivo`" v-model="motivo" autocomplete="off" />
    </div>

    <p v-if="tipo === 'titular' && titularActual" class="text-xs text-muted-foreground sm:col-span-2">
      {{
        t("puesto.cierraTitular", { nombre: titularActual, fecha: formatearFecha(fecha || hoyISO(), locale) })
      }}
    </p>
    <p v-if="error" role="alert" class="text-sm text-destructive sm:col-span-2">{{ error }}</p>

    <div class="flex justify-end gap-2 sm:col-span-2">
      <Button type="button" variant="outline" @click="emit('cancelar')">{{ t("puesto.cancelar") }}</Button>
      <Button type="submit" :disabled="enviando">{{ t("puesto.confirmar") }}</Button>
    </div>
  </form>
</template>
