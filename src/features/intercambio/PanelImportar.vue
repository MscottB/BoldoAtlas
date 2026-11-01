<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { useI18n } from "vue-i18n";
import { toast } from "vue-sonner";
import { FolderOpen } from "@lucide/vue";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  importarAbrir,
  importarAgregar,
  importarComparar,
  importarElegir,
  importarReemplazar,
  importarVolver,
  revisionAplicar,
  revisionResumen,
  type InformeImportacion,
  type InformeRevision,
  type ResumenImportacion,
  type ResumenRevision,
} from "@/db/cliente";
import { rutaTexto } from "@/features/arbol/jerarquia";
import { tamano } from "@/lib/formato";
import { claseSelect } from "@/lib/utils";
import { useOrganizacion } from "@/stores/organizacion";
import BarraAvance from "./BarraAvance.vue";
import ListaDetalle from "./ListaDetalle.vue";
import RevisarDecidir from "./RevisarDecidir.vue";
import {
  conFilas,
  intentar,
  intentarTrabajo,
  revisionConDecisiones,
  revisionDejada,
  useAvance,
  useTrabajo,
} from "./intercambio";

const emit = defineEmits<{ terminar: [] }>();
const { t, te, locale } = useI18n();
const router = useRouter();
const org = useOrganizacion();
const trabajo = useTrabajo();
const avance = useAvance(() => trabajo.actual.value);

type Paso = "elegir" | "abriendo" | "revision" | "comparando" | "decidir" | "aplicando" | "hecho" | "hechoRevision";
const paso = ref<Paso>("elegir");
const archivo = ref<{ nombre: string; bytes: number } | null>(null);
const codigo = ref("");
const error = ref("");

// Al cambiar de paso, el foco va al título: lector de pantalla y teclado siguen el asistente.
const titulo = ref<HTMLElement | null>(null);
watch(paso, () => nextTick(() => titulo.value?.focus()));

async function elegir() {
  error.value = "";
  const propio = trabajo.actual.value ?? trabajo.nuevo();
  const r = await intentar(() => importarElegir(propio));
  if (trabajo.actual.value !== propio) return;
  if (!r.ok) error.value = r.mensaje;
  else if (r.valor) archivo.value = r.valor;
}

const resumen = ref<ResumenImportacion | null>(null);
async function abrir() {
  const propio = trabajo.actual.value;
  if (!propio) return;
  error.value = "";
  paso.value = "abriendo";
  avance.value = null;
  const r = await intentarTrabajo(t("trabajos.importarAbrir"), () => importarAbrir(propio, codigo.value));
  if (trabajo.actual.value !== propio) return; // se canceló: lo que llega tarde no cambia nada
  if (!r.ok) {
    paso.value = "elegir";
    if (r.codigo !== "cancelado") error.value = r.mensaje;
    return;
  }
  codigo.value = ""; // ya cumplió: no se queda en memoria de la interfaz
  resumen.value = r.valor;
  modo.value = r.valor.informe ? "agregar" : r.valor.parcial ? "revisar" : "reemplazar";
  lugares.value = Object.fromEntries(
    (r.valor.ramas ?? []).filter((x) => x.pideLugar).map((x) => [x.id, ""]),
  );
  paso.value = "revision";
}

const modo = ref<"agregar" | "revisar" | "reemplazar">("agregar");
// "" = como árbol independiente
const lugares = ref<Record<string, string>>({});
const filas = computed(() => conFilas(resumen.value?.informe?.tablas ?? [], (f) => f.trae));
const agregadas = computed(() => informe.value?.tablas.filter((x) => x.nuevas > 0) ?? []);
const opciones = computed(() =>
  org.unidades
    .map((u) => ({ id: u.id, texto: rutaTexto(org.unidades, u.id) }))
    .sort((a, b) => a.texto.localeCompare(b.texto, locale.value)),
);

// Por qué no se puede agregar, con el código que da Rust (sin datos personales).
const porQueNoAgregar = computed(() => {
  const clave = `intercambio.motivoRevision.${resumen.value?.motivoRevision}`;
  const motivo = te(clave) ? t(clave) : t("intercambio.motivoRevision.fallo");
  return t(
    resumen.value?.parcial ? "intercambio.importar.nadaDisponible" : "intercambio.importar.agregarNoDisponible",
    { motivo },
  );
});

function salirDeComparar() {
  // cancelar a mitad de la comparación suelta el trabajo: el archivo se vuelve a abrir con su código
  void cancelar();
}

const informe = ref<InformeImportacion | null>(null);
async function agregar() {
  const propio = trabajo.actual.value;
  if (!propio) return;
  paso.value = "aplicando";
  avance.value = { etapa: "aplicando", hecho: 0, total: 0 };
  const destino = Object.fromEntries(Object.entries(lugares.value).map(([k, v]) => [k, v || null]));
  const r = await intentarTrabajo(t("trabajos.importarAgregar"), () => importarAgregar(propio, destino));
  if (!r.ok) {
    paso.value = "revision";
    toast.error(r.mensaje);
    return;
  }
  informe.value = r.valor;
  const cargado = await org.cargar();
  if (!cargado.ok) toast.error(cargado.mensaje);
  await trabajo.soltar();
  paso.value = "hecho";
}

const confirmando = ref(false);
function aplicar() {
  if (modo.value === "reemplazar") confirmando.value = true;
  else if (modo.value === "revisar") void comparar();
  else void agregar();
}

const revision = ref<ResumenRevision | null>(null);
const decisiones = computed(() => revision.value?.decisiones ?? 0);
const destinos = computed(() =>
  Object.fromEntries(Object.entries(lugares.value).map(([k, v]) => [k, v || null])),
);
async function comparar() {
  const propio = trabajo.actual.value;
  if (!propio) return;
  falloAplicar.value = null;
  paso.value = "comparando";
  avance.value = { etapa: "comparando", hecho: 0, total: 0 };
  const r = await intentarTrabajo(t("trabajos.importarComparar"), () => importarComparar(propio, destinos.value));
  if (trabajo.actual.value !== propio) return;
  if (!r.ok) {
    paso.value = "revision";
    if (r.codigo !== "cancelado") toast.error(r.mensaje);
    return;
  }
  revision.value = r.valor;
  paso.value = "decidir";
}

/** De la revisión a elegir qué hacer con el archivo: se pierden las decisiones, el archivo sigue abierto. */
async function volverAOpciones() {
  const propio = trabajo.actual.value;
  falloAplicar.value = null;
  revision.value = null;
  paso.value = "revision";
  if (propio) await importarVolver(propio);
}

const informeRevision = ref<InformeRevision | null>(null);
const falloAplicar = ref<{ codigo: string; mensaje: string } | null>(null);
// Ya no se puede volver atrás ni descartar: Rust aplica. El resultado se recoge siempre, también si se salió del panel.
let aplicandoRevision = false;
let fuera = false;
async function aplicarRevision(version: number, confirmado: boolean) {
  const propio = trabajo.actual.value;
  if (!propio) return;
  falloAplicar.value = null;
  aplicandoRevision = true;
  paso.value = "aplicando";
  avance.value = { etapa: "aplicando", hecho: 0, total: 0 };
  const r = await intentarTrabajo(t("trabajos.importarAplicarRevision"), () =>
    revisionAplicar(propio, version, confirmado),
  );
  aplicandoRevision = false;
  if (!r.ok) {
    falloAplicar.value = { codigo: r.codigo, mensaje: r.mensaje };
    if (fuera) {
      toast.error(r.mensaje);
      dejarRevision(propio);
    } else {
      paso.value = "decidir";
    }
    return;
  }
  revisionConDecisiones(false);
  informeRevision.value = r.valor;
  revision.value = null;
  const cargado = await org.cargar();
  if (!cargado.ok) toast.error(cargado.mensaje);
  await trabajo.soltar();
  if (fuera) toast.success(t("intercambio.revisar.aplicadoFuera"));
  else paso.value = "hechoRevision";
}

/** Salir no pierde las decisiones sin avisar: un diálogo global pregunta si se vuelve o se descartan. */
function dejarRevision(propio: string) {
  if (!resumen.value || !decisiones.value) {
    revisionConDecisiones(false);
    void trabajo.soltar();
    return;
  }
  revisionDejada.value = {
    trabajo: propio,
    decisiones: decisiones.value,
    lugares: destinos.value,
    importacion: resumen.value,
    volviendo: false,
  };
}
const lineasHechas = computed(() =>
  (informeRevision.value?.tablas ?? []).flatMap((f) =>
    (["agregadas", "cambiadas", "vaciadas", "borradas", "localesBorradas", "revividas", "unidas", "omitidas"] as const)
      .filter((k) => f[k] > 0)
      .map((k) => ({ clave: `${f.tabla}-${k}`, tabla: f.tabla, que: k, n: f[k] })),
  ),
);
async function reemplazar() {
  const propio = trabajo.actual.value;
  if (!propio) return;
  paso.value = "aplicando";
  avance.value = { etapa: "aplicando", hecho: 0, total: 0 };
  // si sale bien, la app se reinicia: `app.restart` no pasa por «¿Seguro que quieres salir?» (src-tauri/src/salida.rs)
  const r = await intentarTrabajo(t("trabajos.importarReemplazar"), () => importarReemplazar(propio));
  if (!r.ok) {
    paso.value = "revision";
    toast.error(r.mensaje);
  }
}

async function cancelar() {
  paso.value = "elegir";
  codigo.value = "";
  archivo.value = null;
  resumen.value = null;
  revision.value = null;
  falloAplicar.value = null;
  await trabajo.soltar();
}
async function salir() {
  await cancelar();
  emit("terminar");
}
async function verResultado() {
  await router.replace("/");
}

// Volver a una revisión que se dejó atrás: sigue en Rust, con sus decisiones.
const retomada = ref(false);
onMounted(async () => {
  const dejada = revisionDejada.value;
  if (!dejada?.volviendo) return;
  revisionDejada.value = null;
  trabajo.actual.value = dejada.trabajo;
  lugares.value = Object.fromEntries(Object.entries(dejada.lugares).map(([k, v]) => [k, v ?? ""]));
  const r = await intentar(() => revisionResumen(dejada.trabajo));
  if (!r.ok) {
    await cancelar();
    revisionConDecisiones(false);
    error.value = r.mensaje;
    return;
  }
  retomada.value = true;
  resumen.value = dejada.importacion;
  modo.value = "revisar";
  revision.value = r.valor;
  paso.value = "decidir";
});
onUnmounted(() => {
  codigo.value = "";
  fuera = true;
  if (aplicandoRevision) return;
  const propio = trabajo.actual.value;
  if (paso.value === "decidir" && propio) {
    dejarRevision(propio);
    return;
  }
  revisionConDecisiones(false);
  void trabajo.soltar();
});
</script>

<template>
  <div class="grid gap-4">
    <h2 ref="titulo" tabindex="-1" class="font-medium outline-none">{{ t("intercambio.importar.titulo") }}</h2>

    <form v-if="paso === 'elegir'" class="grid gap-4" @submit.prevent="abrir">
      <div class="flex flex-wrap items-center gap-3">
        <Button type="button" variant="outline" @click="elegir">
          <FolderOpen aria-hidden="true" />
          {{ t("intercambio.importar.elegir") }}
        </Button>
        <p v-if="archivo" class="min-w-0 truncate text-sm">
          {{ archivo.nombre }}
          <span class="text-muted-foreground">({{ tamano(archivo.bytes, locale) }})</span>
        </p>
      </div>
      <div class="grid max-w-sm gap-1.5">
        <Label for="importar-codigo">{{ t("intercambio.importar.codigo") }}</Label>
        <Input
          id="importar-codigo"
          v-model="codigo"
          class="font-mono"
          autocomplete="off"
          autocapitalize="characters"
          spellcheck="false"
          :aria-invalid="!!error"
          :aria-describedby="error ? 'importar-error' : undefined"
        />
        <p class="text-xs text-muted-foreground">{{ t("intercambio.importar.codigoAyuda") }}</p>
      </div>
      <p v-if="error" id="importar-error" role="alert" class="text-sm text-destructive">{{ error }}</p>
      <div class="flex gap-2">
        <Button type="submit" :disabled="!archivo || !codigo.trim()">{{ t("intercambio.importar.abrir") }}</Button>
        <Button type="button" variant="outline" @click="salir">{{ t("intercambio.cancelar") }}</Button>
      </div>
    </form>

    <BarraAvance v-else-if="paso === 'abriendo'" :avance="avance" cancelable @cancelar="cancelar" />
    <BarraAvance v-else-if="paso === 'comparando'" :avance="avance" cancelable @cancelar="salirDeComparar" />
    <BarraAvance v-else-if="paso === 'aplicando'" :avance="avance" :cancelable="false" />

    <template v-else-if="paso === 'revision' && resumen">
      <p class="text-sm">
        {{
          t(resumen.parcial ? "intercambio.importar.traeRamas" : "intercambio.importar.traeTodo", {
            nombre: resumen.organizacion || t("barra.sinNombre"),
          })
        }}
      </p>
      <p v-if="resumen.informe?.nombreHeredado" class="text-sm">
        {{ t("intercambio.importar.tomaraNombre", { nombre: resumen.informe.nombreHeredado }) }}
      </p>
      <div v-if="resumen.informe" class="overflow-x-auto">
        <table class="text-sm">
          <thead>
            <tr class="border-b text-left text-xs text-muted-foreground">
              <th scope="col" class="py-1 pr-6 font-medium">{{ t("intercambio.importar.columna.que") }}</th>
              <th scope="col" class="px-3 text-right font-medium">{{ t("intercambio.importar.columna.trae") }}</th>
              <th scope="col" class="px-3 text-right font-medium">{{ t("intercambio.importar.columna.nuevas") }}</th>
              <th scope="col" class="px-3 text-right font-medium">
                {{ t("intercambio.importar.columna.existentes") }}
              </th>
            </tr>
          </thead>
          <tbody class="divide-y">
            <tr v-for="f in filas" :key="f.tabla">
              <th scope="row" class="py-1 pr-6 text-left font-normal">{{ t(`intercambio.tablas.${f.tabla}`) }}</th>
              <td class="px-3 text-right tabular-nums">{{ f.trae }}</td>
              <td class="px-3 text-right tabular-nums">{{ f.nuevas }}</td>
              <td class="px-3 text-right tabular-nums">{{ f.existentes + f.unidas + f.omitidas }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <fieldset class="grid gap-3">
        <legend class="mb-1 text-sm font-medium">{{ t("intercambio.importar.queHacer") }}</legend>
        <label class="flex items-start gap-2 text-sm" :class="!resumen.informe && 'text-muted-foreground'">
          <input v-model="modo" type="radio" value="agregar" class="mt-1" :disabled="!resumen.informe" />
          <span>
            <span class="font-medium">{{ t("intercambio.importar.agregar") }}</span>
            <span class="block text-muted-foreground">
              {{ resumen.informe ? t("intercambio.importar.agregarAyuda") : porQueNoAgregar }}
            </span>
          </span>
        </label>
        <label class="flex items-start gap-2 text-sm">
          <input v-model="modo" type="radio" value="revisar" class="mt-1" />
          <span>
            <span class="font-medium">{{ t("intercambio.importar.revisar") }}</span>
            <span class="block text-muted-foreground">{{ t("intercambio.importar.revisarAyuda") }}</span>
          </span>
        </label>
        <label class="flex items-start gap-2 text-sm" :class="resumen.parcial && 'text-muted-foreground'">
          <input v-model="modo" type="radio" value="reemplazar" class="mt-1" :disabled="resumen.parcial" />
          <span>
            <span class="font-medium">{{ t("intercambio.importar.reemplazar") }}</span>
            <span class="block text-muted-foreground">
              {{ t(resumen.parcial ? "intercambio.importar.soloCompleta" : "intercambio.importar.reemplazarAyuda") }}
            </span>
          </span>
        </label>
      </fieldset>

      <template v-if="modo !== 'reemplazar'">
        <p v-if="resumen.parcial && !resumen.ramas" role="status" class="text-sm">
          {{ t("intercambio.importar.lugarDesconocido") }}
        </p>
        <div v-if="Object.keys(lugares).length" class="grid gap-3 rounded-lg border p-3">
          <p class="text-sm font-medium">{{ t("intercambio.importar.dondeVa") }}</p>
          <template v-for="r in resumen.ramas ?? []" :key="r.id">
            <div v-if="r.pideLugar" class="grid max-w-lg gap-1.5">
              <Label :for="`lugar-${r.id}`">{{ r.nombre }}</Label>
              <select :id="`lugar-${r.id}`" v-model="lugares[r.id]" :class="claseSelect">
                <option value="">{{ t("intercambio.importar.independiente") }}</option>
                <option v-for="o in opciones" :key="o.id" :value="o.id">
                  {{ t("intercambio.importar.dentroDe", { nombre: o.texto }) }}
                </option>
              </select>
            </div>
          </template>
        </div>
        <ul class="grid gap-1 text-sm text-muted-foreground">
          <template v-for="r in resumen.ramas ?? []" :key="r.id">
            <li v-if="r.dentroDe && !r.existe">
              {{ t("intercambio.importar.vuelveA", { rama: r.nombre, nombre: r.dentroDe }) }}
            </li>
          </template>
          <li v-if="modo === 'agregar' && resumen.informe?.vaciadas">
            {{ t("intercambio.importar.vaciadas", resumen.informe.vaciadas) }}
          </li>
        </ul>
        <ListaDetalle v-if="modo === 'agregar' && resumen.informe" :informe="resumen.informe" />
      </template>

      <p class="text-sm text-muted-foreground">
        {{ t(modo === "revisar" ? "intercambio.importar.revisarNada" : "intercambio.importar.respaldo") }}
      </p>
      <div class="flex gap-2">
        <Button type="button" :disabled="modo === 'agregar' && !resumen.informe" @click="aplicar">
          {{ t(modo === "revisar" ? "intercambio.continuar" : "intercambio.importar.aplicar") }}
        </Button>
        <Button type="button" variant="outline" @click="salir">{{ t("intercambio.cancelar") }}</Button>
      </div>
    </template>

    <RevisarDecidir
      v-else-if="paso === 'decidir' && revision && trabajo.actual.value"
      v-model:resumen="revision"
      :trabajo="trabajo.actual.value"
      :lugares="destinos"
      :aviso-retomada="retomada"
      :fallo="falloAplicar"
      @volver="volverAOpciones"
      @salir="salir"
      @aplicar="aplicarRevision"
    />

    <template v-else-if="paso === 'hechoRevision' && informeRevision">
      <p role="status" class="text-sm">
        {{ t(lineasHechas.length ? "intercambio.revisar.hecho" : "intercambio.revisar.hechoNada") }}
      </p>
      <p v-if="informeRevision.nombreHeredado" class="text-sm">
        {{ t("intercambio.importar.tomoNombre", { nombre: informeRevision.nombreHeredado }) }}
      </p>
      <ul v-if="lineasHechas.length" class="grid gap-1 text-sm">
        <li v-for="l in lineasHechas" :key="l.clave">
          {{ t(`intercambio.tablas.${l.tabla}`) }}: {{ t(`intercambio.revisar.resultado.${l.que}`, l.n) }}
        </li>
      </ul>
      <div>
        <Button type="button" @click="verResultado">{{ t("intercambio.importar.ver") }}</Button>
      </div>
    </template>

    <template v-else-if="paso === 'hecho' && informe">
      <p role="status" class="text-sm">
        {{ t(agregadas.length ? "intercambio.importar.hecho" : "intercambio.importar.hechoNada") }}
      </p>
      <p v-if="informe.nombreHeredado" class="text-sm">
        {{ t("intercambio.importar.tomoNombre", { nombre: informe.nombreHeredado }) }}
      </p>
      <dl v-if="agregadas.length" class="grid grid-cols-[auto_auto] justify-start gap-x-6 gap-y-1 text-sm">
        <template v-for="f in agregadas" :key="f.tabla">
          <dt class="text-muted-foreground">{{ t(`intercambio.tablas.${f.tabla}`) }}</dt>
          <dd class="text-right tabular-nums">{{ f.nuevas }}</dd>
        </template>
      </dl>
      <ListaDetalle :informe="informe" />
      <div>
        <Button type="button" @click="verResultado">{{ t("intercambio.importar.ver") }}</Button>
      </div>
    </template>

    <AlertDialog v-model:open="confirmando">
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{{ t("intercambio.importar.confirmarTitulo") }}</AlertDialogTitle>
          <AlertDialogDescription>
            {{ t("intercambio.importar.confirmarTexto", { nombre: org.org.nombre || t("barra.sinNombre") }) }}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{{ t("intercambio.cancelar") }}</AlertDialogCancel>
          <AlertDialogAction @click="reemplazar">{{ t("intercambio.importar.reemplazar") }}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>
</template>
