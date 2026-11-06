<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useI18n } from "vue-i18n";
import { toast } from "vue-sonner";
import { FilePlus, FileSpreadsheet, FolderOpen, Import, Sparkles } from "@lucide/vue";
import { Button } from "@/components/ui/button";
import BotonTema from "@/components/BotonTema.vue";
import AvisoActualizacion from "@/features/actualizaciones/AvisoActualizacion.vue";
import { buscarActualizaciones } from "@/features/actualizaciones/acciones";
import { versionVisible } from "@/app/version";
import { useActualizaciones } from "@/stores/actualizaciones";
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
import AccesosRapidos from "@/features/inicio/AccesosRapidos.vue";
import { ID_TITULO_INICIO as ID_TITULO, enfocarAlVolver, volverAlTerminar } from "@/features/inicio/foco";
import ListaCaminos, { type Camino } from "@/features/inicio/ListaCaminos.vue";
import PanelOrganizacion from "@/features/inicio/PanelOrganizacion.vue";
import RecientesInicio from "@/features/inicio/RecientesInicio.vue";
import PreguntaArchivo from "@/features/organizaciones/PreguntaArchivo.vue";
import { useOrganizacion, type Resultado } from "@/stores/organizacion";
import { useOrganizaciones } from "@/stores/organizaciones";
import { MOSTRAR_PROXIMAMENTE } from "@/app/proximamente";
import icono from "../../assets/brand/icono.png";

const { t } = useI18n();
const router = useRouter();
const route = useRoute();
const org = useOrganizacion();
const organizaciones = useOrganizaciones();
const actualizaciones = useActualizaciones();

const todos: Camino[] = [
  { id: "vacia", icono: FilePlus },
  { id: "archivo", icono: FolderOpen },
  { id: "excel", icono: FileSpreadsheet, fase: "bienvenida.llegaFase4" },
  { id: "boldo", icono: Import },
  { id: "ejemplo", icono: Sparkles },
];
const caminos = todos.filter((c) => MOSTRAR_PROXIMAMENTE || !c.fase);

// Rust no lista un `boldo.db` sin nada que perder (`esta_vacia`): sin la abierta en la lista, Inicio es el de una instalación
// nueva. Si la lista no se pudo leer, se mira lo cargado: solo cambia lo que se muestra, porque crear ya no reemplaza nada.
// Sin sus datos cargados no se sabe si tiene: se muestra como con datos, y el panel dice que no cargaron.
const conDatos = computed(() =>
  organizaciones.listaAlDia ? !!organizaciones.abierta : !org.cargado || !org.vacia,
);
// Con una sola, ya es la del panel: la lista empieza a servir con otra.
const verRecientes = computed(
  () => organizaciones.recientes.length > 0 && (organizaciones.varias || !conDatos.value),
);

/** Una acción a la vez: crear o abrir cambian de organización, y la vista se va. */
const ocupado = ref(false);
async function hacer(desde: string, accion: () => Promise<Resultado & { avisos?: string[] }>) {
  if (ocupado.value || organizaciones.enCurso) return;
  ocupado.value = true;
  // Si algo falla tras desmontarse Inicio, vuelve a mostrarse: el foco, al botón desde el que se pidió.
  volverAlTerminar(desde);
  const r = await accion();
  ocupado.value = false;
  if (!r.ok) return void toast.error(r.mensaje);
  volverAlTerminar(null);
  for (const a of r.avisos ?? []) toast.warning(t(`organizaciones.avisoArchivo.${a}`));
}

const creando = ref(false);
const nombreOrg = ref("");
const nombreRaiz = ref("");
// El foco entra al primer campo (no al botón de cerrar) y, al cerrar, vuelve al botón que abrió el diálogo; si no hubo
// clic (menú de la app, ?accion=vacia), al de crear. No depende de dónde estuviera el foco antes.
let origen: HTMLElement | null = null;
const idCrear = () => (conDatos.value ? "inicio-crear" : "bienvenida-camino-vacia");
function alAbrir(e: Event) {
  e.preventDefault();
  document.getElementById("bienvenida-org")?.focus();
}
function alCerrar(e: Event) {
  e.preventDefault();
  (origen?.isConnected ? origen : document.getElementById(idCrear()))?.focus();
}
function pedirNombres(desde: EventTarget | null = null) {
  if (ocupado.value) return;
  origen = desde instanceof HTMLElement ? desde : null;
  creando.value = true;
}
async function crear() {
  if (!nombreOrg.value.trim() || !nombreRaiz.value.trim() || ocupado.value) return;
  await hacer(idCrear(), () =>
    organizaciones.crear("vacia", { nombre: nombreOrg.value, nombreRaiz: nombreRaiz.value }),
  );
}

const preguntas = ref<InstanceType<typeof PreguntaArchivo> | null>(null);
const abrirArchivo = (desde: string) =>
  hacer(desde, () =>
    organizaciones.agregarArchivo((p) => preguntas.value?.preguntar(p) ?? Promise.resolve(false)),
  );
const explorar = (desde: string) => hacer(desde, organizaciones.explorarEjemplo);

function elegir(c: Camino, desde: EventTarget | null = null) {
  if (c.fase || ocupado.value) return;
  if (c.id === "boldo") return router.push({ path: "/importar-exportar", query: { accion: "importar" } });
  if (c.id === "archivo") return abrirArchivo("bienvenida-camino-archivo");
  if (c.id === "ejemplo") return explorar("bienvenida-camino-ejemplo");
  pedirNombres(desde);
}

onMounted(async () => {
  // El menú de la app y la paleta llegan aquí con ?accion=vacia|ejemplo.
  const accion = route.query.accion;
  if (accion === "vacia" || accion === "ejemplo") {
    void router.replace({ path: route.path }); // la acción es de una sola vez: no se repite al volver atrás
    if (accion === "vacia") pedirNombres();
    else void explorar(ID_TITULO);
  }
  // Las fechas, y si cada archivo sigue en su lugar (un pendrive que se conectó), al día.
  await organizaciones.cargarLista();
  // Con la lista ya leída, que decide qué se muestra: tras eliminar la abierta, o si falló algo pedido desde aquí, el
  // foco no queda en <body>.
  await nextTick();
  enfocarAlVolver();
});
</script>

<template>
  <section class="mx-auto flex max-w-3xl flex-col gap-6 p-8">
    <header class="flex flex-col gap-2">
      <div class="flex items-start justify-between gap-4">
        <img :src="icono" alt="" class="size-12 dark:rounded-lg dark:bg-primary dark:p-1" />
        <div class="flex flex-wrap items-center justify-end gap-2">
          <AvisoActualizacion destacado />
          <SelectorIdioma />
          <BotonTema />
        </div>
      </div>
      <h1 :id="ID_TITULO" tabindex="-1" class="text-xl font-semibold outline-none">
        {{ t("bienvenida.titulo") }}
      </h1>
      <p v-if="!conDatos" class="text-muted-foreground">{{ t("bienvenida.subtitulo") }}</p>
      <p class="flex flex-wrap items-center gap-x-3 text-sm text-muted-foreground">
        <span>{{ versionVisible() }}</span>
        <RouterLink to="/acerca" class="underline underline-offset-4 hover:text-foreground">{{
          t("nav.acerca")
        }}</RouterLink>
        <button
          type="button"
          class="underline underline-offset-4 hover:text-foreground disabled:no-underline"
          :disabled="actualizaciones.buscando"
          @click="buscarActualizaciones"
        >
          {{ actualizaciones.buscando ? t("actualizar.buscando") : t("actualizar.buscar") }}
        </button>
      </p>
    </header>

    <template v-if="conDatos">
      <PanelOrganizacion />
      <RecientesInicio v-if="verRecientes" />
      <AccesosRapidos />
      <section aria-labelledby="inicio-otra" class="flex flex-col gap-2">
        <h2 id="inicio-otra" class="text-base font-semibold">{{ t("inicio.otra") }}</h2>
        <div class="flex flex-wrap gap-2">
          <Button
            id="inicio-crear"
            type="button"
            variant="outline"
            :aria-disabled="ocupado || undefined"
            class="aria-disabled:opacity-50"
            @click="pedirNombres($event.currentTarget)"
          >
            <FilePlus aria-hidden="true" />
            {{ t("bienvenida.crear") }}
          </Button>
          <Button
            id="inicio-archivo"
            type="button"
            variant="outline"
            :aria-disabled="ocupado || undefined"
            class="aria-disabled:opacity-50"
            @click="abrirArchivo('inicio-archivo')"
          >
            <FolderOpen aria-hidden="true" />
            {{ t("inicio.abrirArchivo") }}
          </Button>
          <Button
            id="inicio-ejemplo"
            type="button"
            variant="outline"
            :aria-disabled="ocupado || undefined"
            class="aria-disabled:opacity-50"
            @click="explorar('inicio-ejemplo')"
          >
            <Sparkles aria-hidden="true" />
            {{ t("inicio.ejemplo") }}
          </Button>
        </div>
      </section>
    </template>
    <template v-else>
      <ListaCaminos :caminos="caminos" :ocupado="ocupado" @elegir="elegir" />
      <RecientesInicio v-if="verRecientes" />
    </template>
    <p role="status" class="text-sm text-muted-foreground empty:hidden">
      {{ ocupado ? t("inicio.trabajando") : "" }}
    </p>

    <PreguntaArchivo ref="preguntas" :titulo="t('inicio.abrirArchivo')" />

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
              :disabled="!nombreOrg.trim() || !nombreRaiz.trim()"
              :aria-disabled="ocupado || undefined"
              class="aria-disabled:opacity-50"
              :aria-busy="ocupado"
            >
              {{ t("bienvenida.crear") }}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  </section>
</template>
