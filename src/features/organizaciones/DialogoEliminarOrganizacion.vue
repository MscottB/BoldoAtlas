<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { toast } from "vue-sonner";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Organizacion } from "@/db/cliente";
import { usePestanas } from "@/features/pestanas/usePestanas";
import { baseActual } from "@/lib/baseActiva";
import { tamano } from "@/lib/formato";
import { useOrganizaciones } from "@/stores/organizaciones";
import {
  claveHecha,
  claveQueSeBorra,
  confirmaEliminar,
  espacioQueLibera,
  ID_SECCION,
  opcionesEliminar,
  pestanasDe,
  textoAConfirmar,
} from "./eliminar";

const props = defineProps<{ organizacion: Organizacion }>();
const abierto = defineModel<boolean>("open", { required: true });
const emit = defineEmits<{ terminado: [eliminada: boolean] }>();

const { t, locale } = useI18n();
const organizaciones = useOrganizaciones();
const pestanas = usePestanas();

const ID_CAMPO = "eliminar-org-escrito";
const escrito = ref("");
const copia = ref(true);
const archivo = ref(false);
const corriendo = ref(false);
const error = ref("");
const codigo = ref("");
/** Rust dijo que el archivo no está aunque la lista diga otra cosa: solo se termina sin las casillas. */
const noEncontrado = ref(false);
let eliminada = false;

watch(abierto, (a) => {
  if (!a) return;
  escrito.value = "";
  copia.value = true;
  archivo.value = false;
  error.value = "";
  codigo.value = "";
  noEncontrado.value = false;
  eliminada = false;
});

const nombre = computed(() => textoAConfirmar(props.organizacion, t("barra.sinNombre")));
const sinArchivo = computed(() => noEncontrado.value || !props.organizacion.existe);
const opciones = computed(() =>
  opcionesEliminar(props.organizacion, { copia: copia.value, archivo: archivo.value }, sinArchivo.value),
);
const seBorra = computed(() =>
  t(
    `organizaciones.eliminar.seBorra.${claveQueSeBorra(props.organizacion, sinArchivo.value, opciones.value.borrarArchivo)}`,
  ),
);
const ofreceCopia = computed(() => !sinArchivo.value && (!props.organizacion.externa || archivo.value));
const libera = computed(() => espacioQueLibera(props.organizacion, opciones.value.borrarArchivo));
const nPestanas = computed(() => pestanasDe(pestanas.lista, props.organizacion.id));
const sePuede = computed(
  () =>
    confirmaEliminar(escrito.value, nombre.value) && !corriendo.value && !organizaciones.listaProtegida,
);
// Tras un fallo sin archivo, lo que falta es terminar: ya no hay nada que copiar ni borrar de él.
const etiqueta = computed(() =>
  t(error.value && sinArchivo.value ? "organizaciones.eliminar.terminar" : "organizaciones.eliminar.confirmar"),
);

// La abierta desmonta la vista mientras se cambia: este diálogo ya no está al terminar, y lo que haya que decir va en un aviso.
let desmontado = false;
onBeforeUnmount(() => (desmontado = true));

function avisarFuera(o: Organizacion, mensaje: string) {
  if (!mensaje) return toast(t("organizaciones.eliminar.noSeHizo"));
  // Rust ya pasó a otra: sigue en la lista, y ahora se elimina como cualquier otra
  if (o.activa && baseActual() !== o.id)
    return toast.error(t("organizaciones.eliminar.falloYaEnOtra", { nombre: nombre.value }), {
      description: mensaje,
      duration: Infinity,
    });
  toast.error(mensaje);
}

async function confirmar() {
  if (!sePuede.value) return;
  const o = props.organizacion;
  const pedidas = opciones.value;
  corriendo.value = true;
  error.value = "";
  codigo.value = "";
  const r = await organizaciones.eliminar(o.id, pedidas);
  corriendo.value = false;
  if (r.ok) {
    toast.success(t(`organizaciones.eliminar.${claveHecha(o, pedidas)}`, { nombre: nombre.value }));
    eliminada = true;
    abierto.value = false;
    emit("terminado", true);
    return;
  }
  if (r.codigo === "lista_protegida") organizaciones.listaProtegida = true;
  if (desmontado) {
    avisarFuera(o, r.mensaje);
    await nextTick();
    return document.getElementById(ID_SECCION)?.focus(); // si sigue en Configuración
  }
  // CANCELADO llega sin mensaje: no se hizo, y no se dice otra cosa
  error.value = r.mensaje || t("organizaciones.eliminar.noSeHizo");
  codigo.value = r.codigo ?? "";
  if (r.codigo === "no_encontrado") noEncontrado.value = true;
  emit("terminado", false);
  await nextTick();
  document.getElementById(ID_CAMPO)?.focus();
}

// Después de reka-ui, que al abrir siempre lleva el foco a Cancelar.
const enfocarCampo = () => setTimeout(() => document.getElementById(ID_CAMPO)?.focus());
// La fila ya no está: el foco lo deja quien la mostraba. Si no se eliminó, vuelve solo al botón que abrió el diálogo.
const alCerrar = (e: Event) => eliminada && e.preventDefault();
</script>

<template>
  <AlertDialog :open="abierto" @update:open="(v: boolean) => corriendo || (abierto = v)">
    <AlertDialogContent
      class="max-h-[90vh] overflow-y-auto data-[size=default]:sm:max-w-lg"
      @open-auto-focus="enfocarCampo"
      @close-auto-focus="alCerrar"
    >
      <AlertDialogHeader>
        <AlertDialogTitle>{{ t("organizaciones.eliminar.titulo", { nombre }) }}</AlertDialogTitle>
        <AlertDialogDescription>{{ seBorra }}</AlertDialogDescription>
      </AlertDialogHeader>

      <div class="grid gap-3 text-sm">
        <p>
          {{ t("organizaciones.eliminar.archivo") }}
          <span class="font-mono text-xs break-all">{{ organizacion.ruta }}</span>
        </p>
        <p v-if="libera > 0">
          {{ t("organizaciones.eliminar.libera", { tamano: tamano(libera, locale) }) }}
          <template v-if="opciones.guardarCopia">{{ t("organizaciones.eliminar.liberaConCopia") }}</template>
        </p>
        <p>{{ t("organizaciones.eliminar.noSeTocan") }}</p>
        <p v-if="organizacion.activa">{{ t("organizaciones.eliminar.abierta") }}</p>
        <p v-if="nPestanas">{{ t("organizaciones.eliminar.pestanas", { n: nPestanas }, nPestanas) }}</p>

        <label v-if="organizacion.externa && !sinArchivo" class="flex items-start gap-2">
          <input v-model="archivo" type="checkbox" class="mt-0.5 size-4 shrink-0 accent-primary" :disabled="corriendo" />
          <span>
            {{ t("organizaciones.eliminar.borrarArchivo") }}
            <span class="block font-mono text-xs break-all">{{ organizacion.ruta }}</span>
          </span>
        </label>

        <template v-if="ofreceCopia">
          <label class="flex items-start gap-2">
            <input v-model="copia" type="checkbox" class="mt-0.5 size-4 shrink-0 accent-primary" :disabled="corriendo" />
            <span>
              {{ t("organizaciones.eliminar.copia") }}
              <span class="block text-xs text-muted-foreground">{{ t("organizaciones.eliminar.copiaAyuda") }}</span>
            </span>
          </label>
          <p v-if="!copia" role="alert" class="text-destructive">{{ t("organizaciones.eliminar.sinCopia") }}</p>
        </template>

        <div class="grid gap-1.5">
          <Label :for="ID_CAMPO" class="block leading-relaxed">
            {{ t("organizaciones.eliminar.escribe") }}
            <strong class="select-all">{{ nombre }}</strong>
          </Label>
          <Input
            :id="ID_CAMPO"
            v-model="escrito"
            autocomplete="off"
            spellcheck="false"
            :readonly="corriendo"
            @keydown.enter.prevent="confirmar"
          />
        </div>

        <div v-if="error" role="alert" class="grid gap-1 text-destructive">
          <p>{{ error }}</p>
          <p v-if="noEncontrado">{{ t("organizaciones.eliminar.noEncontrado") }}</p>
          <p v-else-if="codigo === 'fallo'">{{ t("organizaciones.eliminar.trasFallo") }}</p>
          <p v-else-if="ofreceCopia && copia && (codigo === 'danado' || codigo === 'contenido_invalido')">
            {{ t("organizaciones.eliminar.sinPoderCopiar") }}
          </p>
        </div>
        <p role="status" class="text-muted-foreground">
          {{ corriendo ? t("organizaciones.eliminar.eliminando") : "" }}
        </p>
      </div>

      <AlertDialogFooter>
        <AlertDialogCancel :disabled="corriendo">{{ t("organizaciones.cancelar") }}</AlertDialogCancel>
        <Button variant="destructive" :disabled="!sePuede" :aria-busy="corriendo" @click="confirmar">
          {{ etiqueta }}
        </Button>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</template>
