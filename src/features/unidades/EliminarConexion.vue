<script setup lang="ts">
import { computed, ref, shallowRef, watch } from "vue";
import { useI18n } from "vue-i18n";
import { toast } from "vue-sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useOrganizacion } from "@/stores/organizacion";

// Pregunta antes de eliminar una conexión y, tras eliminarla, ofrece Deshacer. `id`: la que se pide eliminar (null = nada).
const props = defineProps<{ id: string | null }>();
// `eliminada` llega cuando el diálogo ya soltó el foco: ahí quien lo abrió decide adónde va.
const emit = defineEmits<{ cerrar: []; eliminada: [] }>();

const { t } = useI18n();
const org = useOrganizacion();

// Se fijan al pedirla: AlertDialogAction cierra el diálogo antes de que corra su @click.
const objetivo = shallowRef<{ id: string; origen: string; destino: string } | null>(null);
const abierto = ref(false);
const nombre = (id: string) => org.porId.get(id)?.nombre ?? "";
watch(
  () => props.id,
  (id) => {
    const c = org.conexiones.find((x) => x.id === id);
    if (!c) return;
    objetivo.value = { id: c.id, origen: nombre(c.origen_id), destino: nombre(c.destino_id) };
    abierto.value = true;
  },
);
watch(abierto, (a) => a || emit("cerrar"));
const nombres = computed(() => ({ origen: objetivo.value?.origen, destino: objetivo.value?.destino }));

let eliminando: Promise<boolean> | null = null;
async function eliminar() {
  const { id } = objetivo.value!;
  const r = await org.eliminarConexion(id);
  if (!r.ok) {
    toast.error(r.mensaje);
    return false;
  }
  toast(t("conexion.eliminada", nombres.value), {
    duration: 8000,
    action: {
      label: t("unidad.deshacer"),
      onClick: async () => {
        const d = await org.deshacer(id);
        if (!d.ok) toast.error(d.mensaje);
      },
    },
  });
  return true;
}
function confirmar() {
  eliminando = eliminar();
}
async function alSoltarFoco(e: Event) {
  if (!eliminando) return; // Cancelar: el foco vuelve solo a quien abrió
  e.preventDefault();
  const ok = await eliminando;
  eliminando = null;
  if (ok) emit("eliminada");
}
</script>

<template>
  <AlertDialog v-model:open="abierto">
    <AlertDialogContent @close-auto-focus="alSoltarFoco">
      <AlertDialogHeader>
        <AlertDialogTitle>{{ t("conexion.eliminarTitulo", nombres) }}</AlertDialogTitle>
        <AlertDialogDescription>{{ t("conexion.eliminarTexto") }}</AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>{{ t("arbol.cancelar") }}</AlertDialogCancel>
        <AlertDialogAction @click="confirmar">{{ t("conexion.eliminarBoton") }}</AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</template>
