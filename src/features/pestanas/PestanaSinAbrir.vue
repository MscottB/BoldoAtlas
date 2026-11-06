<script setup lang="ts">
import { computed, nextTick, ref } from "vue";
import { useI18n } from "vue-i18n";
import { TriangleAlert } from "@lucide/vue";
import { toast } from "vue-sonner";
import { Button } from "@/components/ui/button";
import { buscarActualizaciones } from "@/features/actualizaciones/acciones";
import PreguntaArchivo from "@/features/organizaciones/PreguntaArchivo.vue";
import { useOrganizaciones } from "@/stores/organizaciones";
import { detalleUtil, sePuedeBuscar, sePuedeCerrar, sePuedeReintentar } from "./pestanas";
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

const preguntas = ref<InstanceType<typeof PreguntaArchivo> | null>(null);

const buscando = ref(false); // sin `disabled`: el botón no pierde el foco, al que vuelve el diálogo
async function buscar() {
  const org = pestanas.lista.find((p) => p.id === props.id)?.org;
  if (!org || buscando.value) return;
  buscando.value = true;
  const r = await organizaciones.agregarArchivo((p) => preguntas.value?.preguntar(p) ?? Promise.resolve(false), org);
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

const puedeReintentar = computed(() => sePuedeReintentar(props.motivo));
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
      <Button v-if="sePuedeCerrar(motivo.codigo, pestanas.lista.length)" variant="outline" @click="cerrar">
        {{ t("organizaciones.cerrarPestana") }}
      </Button>
    </div>
    <p role="status" class="text-sm text-muted-foreground">
      {{ buscando ? t("organizaciones.buscandoArchivo") : "" }}
    </p>
    <PreguntaArchivo ref="preguntas" :titulo="t('organizaciones.buscarArchivo')" />
  </section>
</template>
