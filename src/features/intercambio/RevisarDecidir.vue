<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { TriangleAlert } from "@lucide/vue";
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
import {
  importarComparar,
  revisionDecidir,
  revisionMasivo,
  revisionVerificar,
  type AccionMasiva,
  type Eleccion,
  type ResumenRevision,
  type TipoCaso,
} from "@/db/cliente";
import { toast } from "vue-sonner";
import GrupoCasos from "./GrupoCasos.vue";
import ListaBloqueos from "./ListaBloqueos.vue";
import { intentar, intentarTrabajo, revisionConDecisiones } from "./intercambio";

const props = defineProps<{
  trabajo: string;
  resumen: ResumenRevision;
  lugares: Record<string, string | null>;
  avisoRetomada?: boolean;
  /** Por qué no se aplicó, si se vuelve aquí desde «Aplicando». */
  fallo?: { codigo: string; mensaje: string } | null;
}>();
const emit = defineEmits<{
  "update:resumen": [r: ResumenRevision];
  volver: [];
  salir: [];
  aplicar: [version: number, confirmado: boolean];
}>();
const { t } = useI18n();

const resumen = computed(() => props.resumen);
const fijar = (r: ResumenRevision) => emit("update:resumen", r);

// Sube con cada cambio en bloque: las listas abiertas vuelven a pedir su página. Una decisión suelta no las recarga, para no
// mover la fila que se está mirando; los bloqueos sí cambian con cada comprobación.
const recarga = ref(0);
const recargaBloqueos = ref(0);
// Sube al comparar de nuevo: las filas no heredan lo que tenían abierto o escrito.
const generacion = ref(0);
const verificando = ref(false);
const baseCambio = ref(false);
const error = ref("");
// Por qué falló «Aplicar». Una verificación que pasa no lo explica ni lo arregla (un disco lleno): sigue a la vista hasta otra acción.
const errorAplicar = ref("");

// Una decisión anota al instante; la comprobación completa va después, una a la vez, y solo sobre lo último decidido.
let temporizador: ReturnType<typeof setTimeout> | undefined;
let desmontado = false;
function pedirVerificacion() {
  clearTimeout(temporizador);
  temporizador = setTimeout(() => void verificar(), 300);
}
async function verificar() {
  if (verificando.value || desmontado) return;
  verificando.value = true;
  const r = await intentar(() => revisionVerificar(props.trabajo));
  verificando.value = false;
  if (desmontado) return;
  if (!r.ok) {
    if (r.codigo === "base_cambio") baseCambio.value = true;
    else error.value = r.mensaje;
    return;
  }
  error.value = "";
  fijar(r.valor);
  recargaBloqueos.value++;
  // se decidió algo mientras tanto
  if (!r.valor.verificada) pedirVerificacion();
}
onMounted(() => {
  const f = props.fallo;
  if (f?.codigo === "base_cambio") baseCambio.value = true;
  else if (f && f.codigo !== "bloqueada" && f.codigo !== "sin_verificar") errorAplicar.value = f.mensaje;
  if (!baseCambio.value && (f || !resumen.value.verificada)) void verificar();
});
onUnmounted(() => {
  desmontado = true;
  clearTimeout(temporizador);
});

async function decidir(tabla: string, id: string, eleccion: Eleccion) {
  errorAplicar.value = "";
  const r = await intentar(() => revisionDecidir(props.trabajo, tabla, id, eleccion));
  if (!r.ok) {
    toast.error(r.mensaje);
    // la fila ya mostraba lo que se eligió: vuelve a lo que Rust tiene
    recarga.value++;
    return;
  }
  fijar(r.valor);
  pedirVerificacion();
}

async function enBloque(accion: AccionMasiva, tipo: TipoCaso | null = null) {
  errorAplicar.value = "";
  const r = await intentar(() => revisionMasivo(props.trabajo, accion, tipo));
  if (!r.ok) {
    toast.error(r.mensaje);
    return;
  }
  fijar(r.valor);
  recarga.value++;
  pedirVerificacion();
}

const grupos = computed(() => resumen.value.grupos);
const totalDe = (tipo: TipoCaso) => grupos.value.find((g) => g.tipo === tipo)?.total ?? 0;
const hayDiferencias = computed(() => grupos.value.length > 0);
const bloqueos = computed(() => resumen.value.bloqueos);
const aplicara = computed(() =>
  (["agregar", "cambiar", "borrar", "borrarLocales", "vaciar", "revivir", "unir", "omitir"] as const)
    .filter((k) => resumen.value.aplicara[k] > 0)
    .map((k) => t(`intercambio.revisar.aplicara.${k}`, resumen.value.aplicara[k])),
);
const nadaQueAplicar = computed(() => {
  const a = resumen.value.aplicara;
  return a.agregar + a.cambiar + a.borrar + a.revivir + a.vaciar === 0;
});
const puedeAplicar = computed(
  () =>
    resumen.value.verificada &&
    bloqueos.value.total === 0 &&
    !nadaQueAplicar.value &&
    !baseCambio.value,
);
const estado = computed(() => {
  if (baseCambio.value) return "";
  if (verificando.value || !resumen.value.verificada) return t("intercambio.revisar.comprobando");
  return "";
});

// Mantener la marca de «se perderán» mientras haya decisiones.
watch(
  () => resumen.value.decisiones,
  (n) => revisionConDecisiones(n > 0),
  { immediate: true },
);

const comparando = ref(false);
async function compararDeNuevo() {
  errorAplicar.value = "";
  comparando.value = true;
  const r = await intentarTrabajo(t("trabajos.importarComparar"), () =>
    importarComparar(props.trabajo, props.lugares),
  );
  comparando.value = false;
  if (!r.ok) {
    error.value = r.mensaje;
    return;
  }
  baseCambio.value = false;
  error.value = "";
  fijar(r.valor);
  generacion.value++;
  recarga.value++;
  recargaBloqueos.value++;
}

// Eliminar mucho de una vez se confirma, con el número real: un archivo puede traer toda la base marcada como eliminada.
const confirmandoBorrado = ref(false);
const masa = computed(() => resumen.value.aplicara.borrar + resumen.value.aplicara.vaciar);
const lineasMasa = computed(() =>
  (["borrar", "vaciar"] as const)
    .filter((k) => resumen.value.aplicara[k] > 0)
    .map((k) => t(`intercambio.revisar.aplicara.${k}`, resumen.value.aplicara[k])),
);
function pedirAplicar() {
  errorAplicar.value = "";
  if (resumen.value.borradoMasivo) confirmandoBorrado.value = true;
  else emit("aplicar", resumen.value.version, false);
}
function aplicarConfirmado() {
  confirmandoBorrado.value = false;
  emit("aplicar", resumen.value.version, true);
}

// Salir con decisiones avisa antes: se pierden.
const saliendo = ref<null | "volver" | "salir">(null);
function pedirSalida(a: "volver" | "salir") {
  if (resumen.value.decisiones > 0) saliendo.value = a;
  else salirYa(a);
}
function salirYa(a: "volver" | "salir") {
  revisionConDecisiones(false);
  saliendo.value = null;
  if (a === "volver") emit("volver");
  else emit("salir");
}
</script>

<template>
  <div class="grid gap-4">
    <p v-if="avisoRetomada" role="status" class="text-sm text-muted-foreground">
      {{ t("intercambio.revisar.retomada") }}
    </p>
    <p class="text-sm">
      {{
        hayDiferencias
          ? t("intercambio.revisar.intro", resumen.iguales)
          : t("intercambio.revisar.sinDiferencias")
      }}
    </p>

    <!-- Lo que detiene «Aplicar», siempre arriba y con un camino para resolverlo. -->
    <div v-if="baseCambio" role="alert" class="grid gap-2 rounded-lg border border-destructive p-3 text-sm">
      <p class="font-medium">{{ t("intercambio.revisar.baseCambioTitulo") }}</p>
      <p>{{ t("intercambio.revisar.baseCambioTexto") }}</p>
      <div>
        <Button type="button" size="sm" :disabled="comparando" @click="compararDeNuevo">
          {{ t("intercambio.revisar.compararDeNuevo") }}
        </Button>
      </div>
    </div>
    <p v-if="resumen.restablecidas && !baseCambio" role="status" class="text-sm">
      {{ t("intercambio.revisar.restablecidas", resumen.restablecidas) }}
    </p>
    <div
      v-if="bloqueos.total && !baseCambio"
      role="alert"
      class="grid gap-2 rounded-lg border border-destructive p-3 text-sm"
    >
      <p class="flex items-center gap-2 font-medium">
        <TriangleAlert class="size-4 shrink-0 text-destructive" aria-hidden="true" />
        {{ t("intercambio.revisar.detenido", bloqueos.total) }}
      </p>
      <ul class="grid list-disc gap-0.5 pl-5">
        <li v-if="bloqueos.duplicado">{{ t("intercambio.revisar.porResolver.duplicado", bloqueos.duplicado) }}</li>
        <li v-if="bloqueos.unica">{{ t("intercambio.revisar.porResolver.unica", bloqueos.unica) }}</li>
        <li v-if="bloqueos.regla">{{ t("intercambio.revisar.porResolver.regla", bloqueos.regla) }}</li>
        <li v-if="bloqueos.referencia">
          {{ t("intercambio.revisar.porResolver.referencia", bloqueos.referencia) }}
        </li>
        <li v-if="bloqueos.ciclo">{{ t("intercambio.revisar.porResolver.ciclo", bloqueos.ciclo) }}</li>
        <li v-if="bloqueos.cadena">{{ t("intercambio.revisar.porResolver.cadena", bloqueos.cadena) }}</li>
      </ul>
    </div>
    <p v-if="error" role="alert" class="text-sm text-destructive">{{ error }}</p>
    <p v-if="errorAplicar" role="alert" class="text-sm text-destructive">{{ errorAplicar }}</p>

    <ListaBloqueos
      :trabajo="trabajo"
      :recarga="recargaBloqueos"
      :resolver-rotas="resumen.resolverRotas"
      :referencias="bloqueos.referencia"
      @decidir="decidir"
      @en-bloque="enBloque"
    />

    <div v-if="totalDe('diferente')" class="flex flex-wrap items-center gap-2">
      <Button type="button" @click="enBloque('recientes')">{{ t("intercambio.revisar.aceptarRecientes") }}</Button>
      <p class="text-sm text-muted-foreground">{{ t("intercambio.revisar.aceptarRecientesAyuda") }}</p>
    </div>
    <p v-if="resumen.dudosas" class="flex items-start gap-2 text-sm">
      <TriangleAlert class="mt-0.5 size-4 shrink-0 text-amber-800 dark:text-amber-400" aria-hidden="true" />
      {{ t("intercambio.revisar.dudosas", resumen.dudosas) }}
    </p>

    <div class="grid gap-3">
      <GrupoCasos
        v-for="g in grupos"
        :key="g.tipo"
        :trabajo="trabajo"
        :tipo="g.tipo"
        :total="g.total"
        :tablas="g.tablas"
        :borrados-aqui="g.borradosAqui"
        :recarga="recarga"
        :generacion="generacion"
        :dudosas="resumen.dudosas > 0"
        @decidir="decidir"
        @en-bloque="enBloque"
      />
    </div>

    <div class="grid gap-2 rounded-lg border p-3 text-sm">
      <p class="font-medium">{{ t("intercambio.revisar.alAplicar") }}</p>
      <p v-if="aplicara.length">{{ aplicara.join(" · ") }}</p>
      <p v-else>{{ t("intercambio.revisar.nadaQueAplicar") }}</p>
      <p class="text-muted-foreground">{{ t("intercambio.importar.respaldo") }}</p>
      <p role="status" class="min-h-5 text-muted-foreground">{{ estado }}</p>
      <div class="flex flex-wrap gap-2">
        <Button type="button" :disabled="!puedeAplicar" @click="pedirAplicar">
          {{ t("intercambio.importar.aplicar") }}
        </Button>
        <Button type="button" variant="outline" @click="pedirSalida('volver')">
          {{ t("intercambio.revisar.volverOpciones") }}
        </Button>
        <Button type="button" variant="outline" @click="pedirSalida('salir')">
          {{ t("intercambio.cancelar") }}
        </Button>
      </div>
    </div>

    <AlertDialog v-model:open="confirmandoBorrado">
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{{ t("intercambio.revisar.borrarMuchosTitulo", masa) }}</AlertDialogTitle>
          <AlertDialogDescription>
            {{ lineasMasa.join(" · ") }}. {{ t("intercambio.revisar.borrarMuchosTexto") }}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{{ t("intercambio.revisar.seguir") }}</AlertDialogCancel>
          <AlertDialogAction @click="aplicarConfirmado">
            {{ t("intercambio.revisar.borrarMuchosSi") }}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    <AlertDialog :open="saliendo !== null" @update:open="(v: boolean) => !v && (saliendo = null)">
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{{ t("intercambio.revisar.perderTitulo") }}</AlertDialogTitle>
          <AlertDialogDescription>
            {{ t("intercambio.revisar.perderTexto", resumen.decisiones) }}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{{ t("intercambio.revisar.seguir") }}</AlertDialogCancel>
          <AlertDialogAction @click="saliendo && salirYa(saliendo)">
            {{ t("intercambio.revisar.perder") }}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>
</template>
