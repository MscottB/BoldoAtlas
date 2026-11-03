<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { TriangleAlert } from "@lucide/vue";
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
import { Button } from "@/components/ui/button";
import type { ArchivoAgregado } from "@/db/cliente";
import { buscarActualizaciones } from "@/features/actualizaciones/acciones";
import { useOrganizaciones } from "@/stores/organizaciones";
import { detalleUtil, sePuedeBuscar } from "./pestanas";
import { ID_AREA, usePestanas } from "./usePestanas";

// La pestaña activa cuya organización no abrió: el motivo, qué se puede hacer y la salida. Las demás pestañas no se tocan.
const props = defineProps<{ id: string; motivo: { codigo: string; mensaje: string; detalle: string } }>();
const { t } = useI18n();
const pestanas = usePestanas();
const organizaciones = useOrganizaciones();
const puedeBuscar = computed(() => sePuedeBuscar(props.motivo));

const copiado = ref(false);
async function copiar() {
  try {
    await navigator.clipboard.writeText(props.motivo.detalle);
    copiado.value = true;
  } catch {
    toast.error(t("organizaciones.errorCopiar"));
  }
}

type Pregunta = NonNullable<ArchivoAgregado["pide"]>;
const PREGUNTAS: Record<Pregunta, { texto: string; si: string }> = {
  red: { texto: "organizaciones.pideRed", si: "organizaciones.copiarYAbrir" },
  otro_id: { texto: "organizaciones.pideOtroId", si: "organizaciones.usarEste" },
  tope: { texto: "organizaciones.pideTope", si: "organizaciones.abrirIgual" },
  journal: { texto: "organizaciones.pideJournal", si: "organizaciones.recuperarYAbrir" },
};
const pregunta = ref<Pregunta>("red"); // no se limpia al cerrar: el texto sigue ahí mientras el diálogo se va
const preguntando = ref(false);
let responder: ((si: boolean) => void) | null = null;
let desmontado = false;
function preguntar(p: Pregunta) {
  if (desmontado) return Promise.resolve(false); // la siguiente pregunta de Rust, ya sin nadie que la responda
  pregunta.value = p;
  preguntando.value = true;
  return new Promise<boolean>((r) => (responder = r));
}
function responderCon(si: boolean) {
  responder?.(si);
  responder = null;
}
// Cancelar, Esc: no se sigue. El sí ya respondió: su clic corre antes que este watcher.
watch(preguntando, (abierto) => abierto || responderCon(false));
onBeforeUnmount(() => {
  desmontado = true;
  responderCon(false); // Ctrl+Tab con la pregunta abierta: Rust espera la respuesta
});

const buscando = ref(false); // sin `disabled`: el botón no pierde el foco, al que vuelve el diálogo
async function buscar() {
  const org = pestanas.lista.find((p) => p.id === props.id)?.org;
  if (!org || buscando.value) return;
  buscando.value = true;
  const r = await organizaciones.agregarArchivo(preguntar, org);
  buscando.value = false;
  if (r.ok) for (const a of r.avisos ?? []) toast.warning(t(`organizaciones.avisoArchivo.${a}`));
  else if (r.mensaje) toast.error(r.mensaje);
  await enfocarSiQuedoSuelto();
}

// El botón pudo desaparecer: con la pestaña ya abierta, o con otro motivo que no lo ofrece.
async function enfocarSiQuedoSuelto() {
  await nextTick();
  if (!document.activeElement || document.activeElement === document.body)
    document.getElementById(ID_AREA)?.focus();
}

const puedeReintentar = computed(() => ["fallo", "abierta_en_otra_copia"].includes(props.motivo.codigo));
async function reintentar() {
  const r = await organizaciones.activarPestana(props.id);
  if (!r.ok && r.mensaje) toast.error(r.mensaje);
  await enfocarSiQuedoSuelto();
}

function cerrar() {
  const r = pestanas.cerrar(props.id);
  if (!r.ok) toast.error(r.mensaje);
}
</script>

<template>
  <section class="mx-auto max-w-xl space-y-4 p-8">
    <div class="flex items-center gap-3">
      <TriangleAlert class="size-6 shrink-0 text-destructive" aria-hidden="true" />
      <h1 class="text-lg font-semibold">{{ t("organizaciones.sinAbrir") }}</h1>
    </div>
    <p role="alert" class="text-sm leading-relaxed">{{ motivo.mensaje }}</p>
    <div v-if="detalleUtil(motivo)" class="space-y-2">
      <p class="text-xs text-muted-foreground">{{ t("organizaciones.detalle") }}</p>
      <pre class="rounded-md bg-muted p-2 text-xs break-words whitespace-pre-wrap select-all">{{
        motivo.detalle
      }}</pre>
      <Button variant="outline" size="sm" @click="copiar">
        {{ copiado ? t("pantallaError.copiado") : t("pantallaError.copiar") }}
      </Button>
    </div>
    <div class="flex flex-wrap gap-2">
      <Button v-if="puedeBuscar" :aria-busy="buscando" @click="buscar">
        {{ t("organizaciones.buscarArchivo") }}
      </Button>
      <Button v-if="puedeReintentar" @click="reintentar">{{ t("organizaciones.reintentar") }}</Button>
      <Button v-if="motivo.codigo === 'esquema_nuevo'" @click="buscarActualizaciones">
        {{ t("menu.actualizar") }}
      </Button>
      <Button variant="outline" @click="cerrar">{{ t("organizaciones.cerrarPestana") }}</Button>
    </div>
    <p role="status" class="text-sm text-muted-foreground">
      {{ buscando ? t("organizaciones.buscandoArchivo") : "" }}
    </p>

    <AlertDialog v-model:open="preguntando">
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{{ t("organizaciones.buscarArchivo") }}</AlertDialogTitle>
          <AlertDialogDescription>{{ t(PREGUNTAS[pregunta].texto) }}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{{ t("organizaciones.cancelar") }}</AlertDialogCancel>
          <AlertDialogAction @click="responderCon(true)">{{ t(PREGUNTAS[pregunta].si) }}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </section>
</template>
