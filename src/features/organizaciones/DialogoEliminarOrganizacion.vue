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
  aconsejaSinCopia,
  claveAbierta,
  claveFalloFuera,
  claveHecha,
  claveQueSeBorra,
  espacioQueLibera,
  ID_SECCION,
  intentoTrasFallo,
  opcionesEliminar,
  pestanasDe,
  quedanAuxiliares,
  sinArchivoAlAbrir,
  textoAConfirmar,
  useConfirmacion,
} from "./eliminar";

const props = defineProps<{ organizacion: Organizacion }>();
const abierto = defineModel<boolean>("open", { required: true });
const emit = defineEmits<{ terminado: [eliminada: boolean] }>();

const { t, locale } = useI18n();
const organizaciones = useOrganizaciones();
const pestanas = usePestanas();

const ID_CAMPO = "eliminar-org-escrito";
const copia = ref(true);
const archivo = ref(false);
const corriendo = ref(false);
const error = ref("");
const codigo = ref("");
const detalle = ref("");
/** Rust dijo que el archivo no está, o que lo borró, y la lista quizá aún no lo sepa: solo se termina sin las casillas. */
const noEncontrado = ref(false);
let eliminada = false;

const nombre = computed(() => textoAConfirmar(props.organizacion, t("barra.sinNombre")));
const sinArchivo = computed(() => noEncontrado.value || !props.organizacion.existe);
const intento = computed(() => organizaciones.intentosEliminar.get(props.organizacion.id));
const { escrito, confirmado, alEnter, trasFallo } = useConfirmacion(
  () => nombre.value,
  () => sinArchivo.value,
  () => confirmar(),
);

watch(abierto, (a) => {
  if (!a) return;
  escrito.value = "";
  copia.value = true;
  archivo.value = false;
  error.value = "";
  codigo.value = "";
  detalle.value = "";
  noEncontrado.value = sinArchivoAlAbrir(intento.value, organizaciones.listaAlDia);
  eliminada = false;
});

const opciones = computed(() =>
  opcionesEliminar(props.organizacion, { copia: copia.value, archivo: archivo.value }, sinArchivo.value),
);
const seBorra = computed(() =>
  t(
    `organizaciones.eliminar.seBorra.${claveQueSeBorra(props.organizacion, sinArchivo.value, opciones.value.borrarArchivo, intento.value)}`,
    { copia: intento.value?.copia ?? "" },
  ),
);
// La que el texto de arriba no nombra: copió, y el archivo sigue o no se sabe qué pasó con él.
const copiaAnterior = computed(() =>
  intento.value?.copia && !(sinArchivo.value && intento.value.archivoBorrado) ? intento.value.copia : "",
);
const auxiliares = computed(() => quedanAuxiliares(props.organizacion, sinArchivo.value, intento.value));
const ofreceCopia = computed(() => !sinArchivo.value && (!props.organizacion.externa || archivo.value));
const libera = computed(() => espacioQueLibera(props.organizacion, opciones.value.borrarArchivo));
const nPestanas = computed(() => pestanasDe(pestanas.lista, props.organizacion.id));
const sePuede = computed(() => confirmado.value && !corriendo.value && !organizaciones.listaProtegida);
// Tras un fallo sin archivo, lo que falta es terminar: ya no hay nada que copiar ni borrar de él.
const etiqueta = computed(() =>
  t(error.value && sinArchivo.value ? "organizaciones.eliminar.terminar" : "organizaciones.eliminar.confirmar"),
);

// La abierta desmonta la vista mientras se cambia: este diálogo ya no está al terminar, y lo que haya que decir va en un aviso.
let desmontado = false;
onBeforeUnmount(() => (desmontado = true));

async function avisarFuera(o: Organizacion, mensaje: string) {
  if (!mensaje) return toast(t("organizaciones.eliminar.noSeHizo"));
  const lista = await organizaciones.cargarLista();
  const clave = claveFalloFuera({
    pasoAOtra: o.activa && baseActual() !== o.id,
    sigueEnLaLista: lista.ok ? organizaciones.lista.some((x) => x.id === o.id) : null,
  });
  if (!clave) return toast.error(mensaje);
  if (clave === "falloSinVuelta") organizaciones.olvidarEliminada(o.id);
  toast.error(t(`organizaciones.eliminar.${clave}`, { nombre: nombre.value }), {
    description: mensaje,
    duration: Infinity,
  });
}

async function confirmar() {
  if (!sePuede.value) return;
  const o = props.organizacion;
  const pedidas = opciones.value;
  const sinArchivoAlPedir = sinArchivo.value;
  const intentoAlPedir = intento.value;
  const avisoAuxiliares = auxiliares.value ? t("organizaciones.eliminar.auxiliares", { ruta: o.ruta }) : undefined;
  corriendo.value = true;
  error.value = "";
  codigo.value = "";
  detalle.value = "";
  const r = await organizaciones.eliminar(o.id, pedidas);
  corriendo.value = false;
  if (r.ok) {
    organizaciones.intentosEliminar.delete(o.id);
    toast.success(t(`organizaciones.eliminar.${claveHecha(o, pedidas, sinArchivoAlPedir, intentoAlPedir)}`, { nombre: nombre.value }), {
      description: avisoAuxiliares,
    });
    eliminada = true;
    abierto.value = false;
    emit("terminado", true);
    return;
  }
  if (r.codigo === "lista_protegida") organizaciones.listaProtegida = true;
  trasFallo(r.codigo);
  if (r.codigo === "no_encontrado" || r.avance?.archivoBorrado) noEncontrado.value = true;
  const sabido = intentoTrasFallo(organizaciones.intentosEliminar.get(o.id), r.avance);
  if (sabido) organizaciones.intentosEliminar.set(o.id, sabido);
  if (desmontado) {
    await avisarFuera(o, r.mensaje);
    await nextTick();
    return document.getElementById(ID_SECCION)?.focus(); // si sigue en Configuración
  }
  // CANCELADO llega sin mensaje: no se hizo, y no se dice otra cosa
  error.value = r.mensaje || t("organizaciones.eliminar.noSeHizo");
  codigo.value = r.codigo ?? "";
  detalle.value = r.detalle ?? "";
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
        <p v-if="organizacion.activa">{{ t(`organizaciones.eliminar.${claveAbierta(organizacion)}`) }}</p>
        <p v-if="auxiliares">{{ t("organizaciones.eliminar.auxiliares", { ruta: organizacion.ruta }) }}</p>
        <p v-if="copiaAnterior">{{ t("organizaciones.eliminar.copiaAnterior", { copia: copiaAnterior }) }}</p>
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
          <p v-if="!copia" role="alert" class="text-destructive">
            {{
              intento?.copia
                ? t("organizaciones.eliminar.sinCopiaConAnterior", { copia: intento.copia })
                : t("organizaciones.eliminar.sinCopia")
            }}
          </p>
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
            @keydown.enter.prevent="alEnter"
          />
        </div>

        <div v-if="error" role="alert" class="grid gap-1 text-destructive">
          <p>{{ error }}</p>
          <p v-if="codigo === 'no_encontrado'">{{ t("organizaciones.eliminar.noEncontrado") }}</p>
          <p v-else-if="codigo === 'fallo'">{{ t("organizaciones.eliminar.trasFallo") }}</p>
          <p v-else-if="ofreceCopia && copia && aconsejaSinCopia(codigo, detalle)">
            {{ t("organizaciones.eliminar.sinPoderCopiar") }}
          </p>
          <p v-if="!escrito && codigo !== 'lista_protegida'">{{ t("organizaciones.eliminar.escribeOtraVez") }}</p>
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
