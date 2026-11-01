<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useI18n } from "vue-i18n";
import { toast } from "vue-sonner";
import { FilePlus, FileSpreadsheet, FolderOpen, Sparkles } from "@lucide/vue";
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
import BloquePlegable from "@/components/BloquePlegable.vue";
import BotonTema from "@/components/BotonTema.vue";
import AvisoActualizacion from "@/features/actualizaciones/AvisoActualizacion.vue";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import SelectorIdioma from "@/components/SelectorIdioma.vue";
import { respaldarAntesDeReemplazar } from "@/db/cliente";
import AccesosRapidos from "@/features/inicio/AccesosRapidos.vue";
import ListaCaminos, { type Camino } from "@/features/inicio/ListaCaminos.vue";
import PanelOrganizacion from "@/features/inicio/PanelOrganizacion.vue";
import RecientesInicio from "@/features/inicio/RecientesInicio.vue";
import { useRecientes } from "@/features/inicio/useRecientes";
import { conRespaldoPrevio } from "@/features/respaldos/respaldos";
import { useOrganizacion, type Resultado } from "@/stores/organizacion";
import { MOSTRAR_PROXIMAMENTE } from "@/app/proximamente";
import icono from "../../assets/brand/icono.png";

const { t } = useI18n();
const router = useRouter();
const route = useRoute();
const org = useOrganizacion();
const recientes = useRecientes();

const todos: Camino[] = [
  { id: "vacia", icono: FilePlus },
  { id: "excel", icono: FileSpreadsheet, fase: "bienvenida.llegaFase4" },
  { id: "boldo", icono: FolderOpen },
  { id: "ejemplo", icono: Sparkles },
];
const caminos = todos.filter((c) => MOSTRAR_PROXIMAMENTE || !c.fase);

async function entrar(r: Resultado) {
  if (!r.ok) return void toast.error(r.mensaje);
  // Es otra organización: lo que se abrió en la anterior no vale (y la lista nombra personas).
  recientes.vaciar();
  await router.replace("/");
}

// Con datos en la base, empezar de nuevo los reemplaza: pide confirmación y hace antes un respaldo.
const hayDatos = computed(() => !org.vacia);
const confirmando = ref(false);
// No se limpia al cerrar el diálogo: la acción lo necesita después de que el diálogo se cierra.
const reemplazo = ref<"vacia" | "ejemplo">("vacia");
const ocupado = ref(false);

// Con datos, las tarjetas de empezar de nuevo van plegadas; se abren solas si llega una acción o hay un diálogo abierto.
const accionPedida = typeof route.query.accion === "string";

const creando = ref(false);
const nombreOrg = ref("");
const nombreRaiz = ref("");
// El foco entra al primer campo (no al botón de cerrar) y, al cerrar, vuelve a la tarjeta que abrió el diálogo; si no hubo
// clic (menú de la app, ?accion=vacia), a la tarjeta «vacía». No depende de dónde estuviera el foco antes.
let origen: HTMLElement | null = null;
function alAbrir(e: Event) {
  e.preventDefault();
  document.getElementById("bienvenida-org")?.focus();
}
function alCerrar(e: Event) {
  e.preventDefault();
  (origen?.isConnected ? origen : document.getElementById("bienvenida-camino-vacia"))?.focus();
}
async function elegir(c: Camino, desde: EventTarget | null = null) {
  if (c.fase) return;
  origen = desde instanceof HTMLElement ? desde : null;
  if (c.id === "boldo") return router.push({ path: "/importar-exportar", query: { accion: "importar" } });
  if (c.id === "ejemplo") {
    if (!hayDatos.value) return entrar(await org.cargarEjemplo());
    reemplazo.value = "ejemplo";
    confirmando.value = true;
    return;
  }
  creando.value = true;
}
async function crear() {
  if (!nombreOrg.value.trim() || !nombreRaiz.value.trim() || org.guardando || ocupado.value) return;
  if (hayDatos.value) {
    reemplazo.value = "vacia";
    confirmando.value = true;
    return;
  }
  await entrar(await org.crearOrganizacion(nombreOrg.value, nombreRaiz.value));
}
async function reemplazar() {
  ocupado.value = true;
  const datos =
    reemplazo.value === "vacia" ? { nombre: nombreOrg.value, nombreRaiz: nombreRaiz.value } : undefined;
  try {
    await entrar(
      await conRespaldoPrevio(respaldarAntesDeReemplazar, () => org.reemplazarCon(reemplazo.value, datos)),
    );
  } finally {
    ocupado.value = false;
  }
}

// El menú de la app y la paleta llegan aquí con ?accion=vacia|ejemplo.
onMounted(() => {
  const c = caminos.find((x) => x.id === route.query.accion);
  if (!c) return;
  void router.replace({ path: route.path }); // la acción es de una sola vez: no se repite al volver atrás
  void elegir(c);
});
</script>

<template>
  <section class="mx-auto flex max-w-3xl flex-col gap-6 p-8">
    <header class="flex flex-col gap-2">
      <div class="flex items-start justify-between gap-4">
        <img :src="icono" alt="" class="size-12 dark:rounded-lg dark:bg-primary dark:p-1" />
        <div class="flex flex-wrap items-center justify-end gap-2">
          <AvisoActualizacion />
          <SelectorIdioma />
          <BotonTema />
        </div>
      </div>
      <h1 class="text-xl font-semibold">{{ t("bienvenida.titulo") }}</h1>
      <p v-if="!hayDatos" class="text-muted-foreground">{{ t("bienvenida.subtitulo") }}</p>
    </header>

    <template v-if="hayDatos">
      <PanelOrganizacion />
      <RecientesInicio />
      <AccesosRapidos />
      <BloquePlegable
        clave="inicio-empezar"
        :titulo="t('inicio.empezarDeNuevo')"
        :abrir="accionPedida || creando || confirmando"
      >
        <div class="flex flex-col gap-3 pt-2">
          <p class="text-sm text-muted-foreground">
            {{ t("bienvenida.hayDatos", { nombre: org.org.nombre || t("barra.sinNombre") }) }}
          </p>
          <ListaCaminos :caminos="caminos" :ocupado="org.guardando || ocupado" @elegir="elegir" />
        </div>
      </BloquePlegable>
    </template>
    <ListaCaminos v-else :caminos="caminos" :ocupado="org.guardando || ocupado" @elegir="elegir" />

    <Dialog v-model:open="creando">
      <DialogContent @open-auto-focus="alAbrir" @close-auto-focus="alCerrar">
        <form class="grid gap-4" @submit.prevent="crear">
          <DialogHeader>
            <DialogTitle>{{ t("bienvenida.vacia.titulo") }}</DialogTitle>
            <DialogDescription>{{ t("bienvenida.vacia.texto") }}</DialogDescription>
          </DialogHeader>
          <div class="grid gap-1.5">
            <Label for="bienvenida-org">{{ t("bienvenida.organizacion") }}</Label>
            <Input id="bienvenida-org" v-model="nombreOrg" autocomplete="off" />
          </div>
          <div class="grid gap-1.5">
            <Label for="bienvenida-raiz">{{ t("bienvenida.raiz") }}</Label>
            <Input
              id="bienvenida-raiz"
              v-model="nombreRaiz"
              :placeholder="t('bienvenida.raizEjemplo')"
              autocomplete="off"
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" @click="creando = false">{{
              t("bienvenida.cancelar")
            }}</Button>
            <Button
              type="submit"
              :disabled="!nombreOrg.trim() || !nombreRaiz.trim() || org.guardando || ocupado"
            >
              {{ t("bienvenida.crear") }}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>

    <AlertDialog v-model:open="confirmando">
      <!-- Con el formulario abierto, Cancelar devuelve el foco a él (no a la tarjeta). -->
      <AlertDialogContent @close-auto-focus="creando || alCerrar($event)">
        <AlertDialogHeader>
          <AlertDialogTitle>{{ t(`bienvenida.reemplazarTitulo.${reemplazo}`) }}</AlertDialogTitle>
          <AlertDialogDescription>
            {{ t("bienvenida.reemplazarTexto", { nombre: org.org.nombre || t("barra.sinNombre") }) }}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{{ t("bienvenida.cancelar") }}</AlertDialogCancel>
          <AlertDialogAction @click="reemplazar">{{ t("bienvenida.reemplazar") }}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </section>
</template>
