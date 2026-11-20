<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from "vue";
import { useI18n } from "vue-i18n";
import { toast } from "vue-sonner";
import type { ElkNode } from "elkjs/lib/elk.bundled.js";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { archivoAbrirCarpeta, archivoGuardar } from "@/db/cliente";
import type { NodoUbicado } from "@/features/arbol/layout";
import LayoutWorker from "@/features/arbol/layout.worker?worker";
import { LIMITE_TARJETAS, colaDeUltimo } from "@/features/arbol/rendimiento";
import { useVista } from "@/features/arbol/useVista";
import { crearAviso } from "@/features/excel/aviso";
import { formatearFecha, hoyISO } from "@/features/puestos/puestos";
import { mensajeFallo } from "@/features/respaldos/respaldos";
import SelectorUnidad from "@/features/unidades/SelectorUnidad.vue";
import { useRetornoFoco } from "@/lib/foco";
import { guardarPreferencia, leerPreferencia } from "@/lib/preferencias";
import { useOrganizacion } from "@/stores/organizacion";
import { armarPdf } from "./armarPdf";
import { escalaQueCabe, fondoDePng, nombreArchivo, pngMenorQuePantalla } from "./formatos";
import type { Nivel } from "./niveles";
import type { Hoja, Orientacion, Reparto } from "./paginas";
import { avisosPdf, paginasPdf, type PdfDeAlcance } from "./paginasDeAlcance";
import { cuantasTarjetas, prepararImagen, type Alcance, type PedidoImagen } from "./preparar";
import { ErrorImagen, copiarImagen, svgABlob, svgAImagen } from "./raster";
import { dibujarSvg, type EntradaSvg } from "./treeSvg";

// «Exportar como imagen», o en PDF: alcance, nivel, formato y vista previa. Se abre desde la página Importar y exportar,
// la barra del árbol y el clic derecho en una unidad (`rama`). `pantalla`: lo que muestra el lienzo, para que las ramas
// salgan como ahí.
const abierto = defineModel<boolean>("open", { required: true });
const props = defineProps<{
  rama?: string | null;
  pantalla?: PedidoImagen["pantalla"];
}>();
const { t, locale } = useI18n();
const org = useOrganizacion();
const { config } = useVista();
const retorno = useRetornoFoco();

const NIVELES: Nivel[] = ["estructura", "presentacion", "pantalla"];
const FORMATOS = ["png", "jpg", "svg", "pdf"] as const;
const ESCALAS = [1, 2, 3, 4] as const;
const FONDOS = ["blanco", "transparente"] as const;
type Formato = (typeof FORMATOS)[number];
const HOJAS: Hoja[] = ["carta", "oficio", "a4", "a3", "a2"];
const ORIENTACIONES: Orientacion[] = ["horizontal", "vertical"];
const REPARTOS: Reparto[] = ["una", "ramas", "cuadricula"];

// Se recuerda por PC lo elegido la última vez, salvo el alcance (es de cada imagen).
const PREFERENCIA = "imagen";
const elegir = <T,>(lista: readonly T[], valor: unknown, porDefecto: T): T =>
  lista.includes(valor as T) ? (valor as T) : porDefecto;
const guardada = leerPreferencia<Record<string, unknown>>(PREFERENCIA, {}) ?? {};
const nivel = ref<Nivel>(elegir(NIVELES, guardada.nivel, "estructura"));
const formato = ref<Formato>(elegir(FORMATOS, guardada.formato, "png"));
const fondo = ref<(typeof FONDOS)[number]>(elegir(FONDOS, guardada.fondo, "blanco"));
const escala = ref<(typeof ESCALAS)[number]>(elegir(ESCALAS, guardada.escala, 2));
const hoja = ref<Hoja>(elegir(HOJAS, guardada.hoja, "carta"));
const orientacion = ref<Orientacion>(elegir(ORIENTACIONES, guardada.orientacion, "horizontal"));
const reparto = ref<Reparto>(elegir(REPARTOS, guardada.reparto, "ramas"));
watch([nivel, formato, fondo, escala, hoja, orientacion, reparto], ([n, f, fo, e, h, o, r]) =>
  guardarPreferencia(PREFERENCIA, {
    nivel: n,
    formato: f,
    fondo: fo,
    escala: e,
    hoja: h,
    orientacion: o,
    reparto: r,
  }),
);
const esPdf = computed(() => formato.value === "pdf");
const raster = computed(() => formato.value === "png" || formato.value === "jpg");
const opcionesPdf = computed(() => ({
  hoja: hoja.value,
  orientacion: orientacion.value,
  reparto: reparto.value,
}));

const elegida = ref<string | null>(props.rama ?? null);
const abrirTodo = ref(false);
const previa = shallowRef<string | null>(null);
// La clave del texto que dice por qué no hay vista previa.
const fallo = ref<string | null>(null);
// Lo que midió la vista previa del PDF: sus páginas y avisos.
const pdfPrevia = shallowRef<PdfDeAlcance | null>(null);
// Lo que midió la vista previa: con ello se avisa si el PNG saldría ilegible.
const chicaPrevia = ref(false);
// Cada vez que se abre: el alcance que trae quien la abre, y las ramas como en pantalla.
watch(abierto, (si) => {
  if (!si) {
    armando.value?.abort(); // cerrar la ventana cancela el PDF
    return;
  }
  elegida.value = props.rama ?? null;
  abrirTodo.value = false;
  previa.value = null; // la de la vez anterior puede ser de otra rama
  fallo.value = null;
  chicaPrevia.value = false;
  pdfPrevia.value = null;
});
// Una unidad que no existe a la fecha que se ve (o ya no existe) vuelve a ser toda la organización.
const alcance = computed<Alcance>(() =>
  elegida.value && org.enFecha.porId.has(elegida.value) ? { rama: elegida.value } : "todo",
);
const textoAlcance = computed(() =>
  alcance.value === "todo" ? t("imagen.alcanceTodo") : org.enFecha.porId.get(alcance.value.rama)!.nombre,
);
const NINGUNA = new Set<string>();

const pedido = computed<PedidoImagen>(() => ({
  alcance: alcance.value,
  nivel: nivel.value,
  abrirTodo: abrirTodo.value,
  config: config.value,
  pantalla: props.pantalla,
  ubicar,
}));
const tarjetas = computed(() => (abierto.value ? cuantasTarjetas(pedido.value) : 0));

// El layout corre en el worker del lienzo: la ventana sigue respondiendo con organizaciones grandes. Si llega otro
// pedido mientras uno corre, el anterior ya no sirve (colaDeUltimo).
const REEMPLAZADO = new Error("reemplazado");
let worker: Worker | null = null;
// Se crea al pedir el primer layout (así no lo hay en las pruebas) y otra vez si muere.
const cola = colaDeUltimo<ElkNode, NodoUbicado[]>((id, grafo) =>
  (worker ??= crearWorker()).postMessage({ id, grafo }),
);
function crearWorker() {
  const w = new LayoutWorker();
  w.onmessage = ({ data }: MessageEvent<{ id: number; ubicados?: NodoUbicado[]; error?: string }>) =>
    cola.recibir(data.id, data.ubicados, data.error);
  w.onerror = w.onmessageerror = (e: Event) => {
    e.preventDefault();
    w.terminate();
    worker = null;
    cola.fallar(e instanceof ErrorEvent ? e.message : e.type);
  };
  return w;
}
async function ubicar(grafo: ElkNode): Promise<NodoUbicado[]> {
  return (await cola.pedir(grafo)) ?? Promise.reject(REEMPLAZADO);
}
onBeforeUnmount(() => {
  worker?.terminate();
  armando.value?.abort();
  clearTimeout(espera);
});

// La entrada del dibujo para lo elegido ahora: la comparten la vista previa, Guardar y Copiar.
// Si falla, el próximo pedido lo vuelve a intentar.
let calculo: Promise<EntradaSvg> | null = null;
function entrada() {
  if (!calculo) {
    const p = prepararImagen(pedido.value);
    calculo = p;
    p.catch(() => calculo === p && (calculo = null));
  }
  return calculo;
}
// Lo mismo para el PDF: todas sus páginas, medidas y dibujadas.
let calculoPdf: Promise<PdfDeAlcance> | null = null;
function paginas() {
  if (!calculoPdf) {
    const p = paginasPdf(pedido.value, opcionesPdf.value);
    calculoPdf = p;
    p.catch(() => calculoPdf === p && (calculoPdf = null));
  }
  return calculoPdf;
}
// repartirPorRamas lo dice así si una unidad queda debajo de sí misma.
const esCiclo = (e: unknown) => e instanceof Error && e.message.includes("ciclo");
const dataUrl = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
let espera: ReturnType<typeof setTimeout> | undefined;
let vuelta = 0; // sube con cada cambio: una vista previa de antes no se muestra
async function mostrar() {
  const v = vuelta;
  try {
    // Un data: URL en un <img>: el SVG no corre nada.
    if (esPdf.value) {
      const r = await paginas();
      if (v !== vuelta) return;
      // La primera página del PDF: en cuadrícula, el mapa.
      previa.value = dataUrl((r.mapa ?? r.paginas[0]!).svg);
      pdfPrevia.value = r;
    } else {
      const e = await entrada();
      if (v !== vuelta) return;
      const { svg, ancho, alto } = dibujarSvg(e);
      previa.value = dataUrl(svg);
      chicaPrevia.value = pngMenorQuePantalla(ancho, alto);
    }
    fallo.value = null;
  } catch (e) {
    if (v !== vuelta || e === REEMPLAZADO) return;
    console.error(e);
    previa.value = null; // no queda a la vista una imagen de antes
    fallo.value = esCiclo(e) ? "pdf.ciclo" : "imagen.previaFallo";
  }
}
// Cada cambio se espera 300 ms: tocar varias opciones seguidas arma una sola vista previa.
function programar() {
  vuelta++;
  fallo.value = null; // el error de antes no tapa el «Preparando…»
  chicaPrevia.value = false;
  pdfPrevia.value = null;
  calculo = null;
  calculoPdf = null;
  clearTimeout(espera);
  if (abierto.value) espera = setTimeout(() => void mostrar(), 300);
}
// Personalizar no se puede tocar con la ventana abierta: basta con ver si cambia la configuración entera.
watch([pedido, () => org.enFecha, abierto, esPdf, opcionesPdf], programar);
onMounted(programar); // no en el servidor de las pruebas: ahí no hay worker

const ocupado = ref(false);
const chica = ref(false); // lo que dice el aviso de aceptación: la imagen saldría ilegible
const avisoAbierto = ref(false);
const aviso = crearAviso((v) => (avisoAbierto.value = v));
// Cerrar el aviso de cualquier forma es no aceptarlo. «Acepto» responde antes (el cierre llega después, en otra vuelta).
watch(avisoAbierto, (v) => v || aviso.cerrado());
// Lo que el PDF avisa antes de guardar, y también bajo la vista previa: ilegible en una página, o más de 200.
const avisos = computed(() =>
  esPdf.value && pdfPrevia.value ? avisosPdf(reparto.value, pdfPrevia.value, locale.value) : [],
);
// Mientras se arma el PDF: para cancelarlo, y cuántas páginas lleva.
const armando = shallowRef<AbortController | null>(null);
const avance = ref("");

// Lo que falló al armar la imagen, con su texto; lo demás (guardar, portapapeles), con `otro`.
const textoError = (e: unknown, otro: () => string) =>
  e instanceof ErrorImagen ? t(`imagen.error.${e.codigo}`) : esCiclo(e) ? t("pdf.ciclo") : otro();
const conFondo = () => fondoDePng(formato.value, fondo.value) === "blanco";

async function guardar() {
  if (ocupado.value) return;
  ocupado.value = true;
  try {
    const f = formato.value;
    let bytes: Uint8Array;
    let bajada: string | undefined; // se dice solo si de verdad se guardó
    if (f === "pdf") {
      const r = (pdfPrevia.value = await paginas());
      if (!(await aviso.preguntar())) return;
      const control = (armando.value = new AbortController());
      avance.value = "";
      bytes = await armarPdf(
        r.paginas,
        {
          hoja: hoja.value,
          orientacion: orientacion.value,
          encabezado: r.encabezado,
          // Los números los pone cada página: aquí quedan las marcas tal cual.
          pagina: t("pdf.pagina", { n: "{n}", m: "{m}" }),
          titulo: t("pdf.titulo"),
          mapa: r.mapa,
        },
        (n, m) => (avance.value = t("pdf.pagina", { n, m })),
        control.signal,
      );
    } else {
      const e = await entrada();
      const { svg, ancho, alto } = dibujarSvg({ ...e, fondo: conFondo() });
      chica.value = f !== "svg" && pngMenorQuePantalla(ancho, alto);
      if (!(await aviso.preguntar())) return;
      if (f === "svg") bytes = new TextEncoder().encode(svg);
      else {
        const cabe = escalaQueCabe(ancho, alto, escala.value);
        if (cabe.bajada)
          bajada = t("imagen.escalaBajada", {
            escala: cabe.escala.toLocaleString(locale.value, { maximumFractionDigits: 2 }),
          });
        bytes = await svgAImagen(svg, ancho, alto, { escala: escala.value, formato: f, fondo: fondo.value });
      }
    }
    const rama = alcance.value === "todo" ? "" : textoAlcance.value;
    const archivo = nombreArchivo(org.org.nombre, rama, nivel.value, f, org.fechaVista ?? hoyISO());
    const nombre = await archivoGuardar(archivo, bytes, f);
    if (nombre)
      toast.success(t("imagen.guardada", { nombre }), {
        description: bajada,
        duration: 10000,
        action: {
          label: t("excel.abrirCarpeta"),
          onClick: () => void archivoAbrirCarpeta().catch((x: unknown) => toast.error(mensajeFallo(x))),
        },
      });
  } catch (e) {
    // Cancelado: no hay nada que decir (y su mensaje no está traducido).
    if (e instanceof DOMException && e.name === "AbortError") return;
    toast.error(textoError(e, () => mensajeFallo(e)));
  } finally {
    armando.value = null;
    ocupado.value = false;
  }
}

// El portapapeles solo acepta escribir justo tras un clic: aquí, el de «Acepto» del aviso. `copiarImagen` llama a
// `navigator.clipboard.write` sin esperar nada (recibe la promesa de la imagen), en la misma vuelta de ese clic.
async function copiar() {
  if (ocupado.value) return;
  ocupado.value = true;
  try {
    // Antes del aviso (se puede esperar): el clic de «Acepto» es el gesto, y después no se espera nada.
    const e = await entrada();
    const fondoPng = fondoDePng(formato.value, fondo.value);
    const { svg, ancho, alto } = dibujarSvg({ ...e, fondo: fondoPng === "blanco" });
    chica.value = pngMenorQuePantalla(ancho, alto);
    if (!(await aviso.preguntar())) return;
    await copiarImagen(svgABlob(svg, ancho, alto, { escala: 2, formato: "png", fondo: fondoPng }));
    const cabe = escalaQueCabe(ancho, alto, 2);
    toast.success(t("imagen.copiada"), {
      description: cabe.bajada
        ? t("imagen.escalaBajada", {
            escala: cabe.escala.toLocaleString(locale.value, { maximumFractionDigits: 2 }),
          })
        : undefined,
    });
  } catch (e) {
    // Si la imagen no se pudo armar, clipboard.write falla con su propio error (DOMException), no con el
    // ErrorImagen: casi siempre se dice «no se pudo copiar». En Linux (WebKitGTK) puede no aceptar imágenes.
    console.error(e);
    toast.error(textoError(e, () => t("imagen.error.copiar")));
  } finally {
    ocupado.value = false;
  }
}
</script>

<template>
  <Dialog v-model:open="abierto">
    <DialogContent
      data-dialogo-imagen
      class="sm:max-w-3xl"
      @open-auto-focus="retorno.alAbrir"
      @close-auto-focus="retorno.alCerrar"
    >
      <DialogHeader>
        <DialogTitle>{{ t("imagen.titulo") }}</DialogTitle>
        <DialogDescription>
          {{ t("imagen.descripcion") }}
          <template v-if="org.fechaVista">
            {{ t("imagen.aFecha", { fecha: formatearFecha(org.fechaVista, locale) }) }}
          </template>
        </DialogDescription>
      </DialogHeader>

      <div class="grid gap-4 sm:grid-cols-[minmax(0,16rem)_minmax(0,1fr)]">
        <div class="grid content-start gap-4">
          <div class="grid gap-1.5">
            <Label for="imagen-alcance">{{ t("imagen.alcance") }}</Label>
            <SelectorUnidad
              id="imagen-alcance"
              :excluidas="NINGUNA"
              :texto="textoAlcance"
              :ninguna="t('imagen.alcanceTodo')"
              :unidades="org.enFecha.unidades"
              :disabled="ocupado"
              @elegir="elegida = $event"
            />
            <label class="flex items-center gap-2 text-sm">
              <input v-model="abrirTodo" type="checkbox" class="size-4 accent-primary" :disabled="ocupado" />
              {{ t("imagen.abrirTodo") }}
            </label>
          </div>

          <fieldset class="grid gap-1.5" :disabled="ocupado">
            <legend class="mb-1 text-sm font-medium">{{ t("imagen.nivel") }}</legend>
            <label v-for="n in NIVELES" :key="n" class="grid grid-cols-[auto_1fr] gap-x-2 text-sm">
              <input
                v-model="nivel"
                type="radio"
                name="imagen-nivel"
                :value="n"
                :data-accion="`nivel-${n}`"
                class="mt-0.5 size-4 accent-primary"
              />
              <span>{{ t(`imagen.niveles.${n}`) }}</span>
              <span class="col-start-2 text-xs text-muted-foreground">{{
                t(`imagen.niveles.${n}Ayuda`)
              }}</span>
            </label>
          </fieldset>

          <fieldset class="grid gap-1.5" :disabled="ocupado">
            <legend class="mb-1 text-sm font-medium">{{ t("imagen.formato") }}</legend>
            <div class="flex flex-wrap gap-x-4 gap-y-1">
              <label v-for="f in FORMATOS" :key="f" class="flex items-center gap-1.5 text-sm">
                <input
                  v-model="formato"
                  type="radio"
                  name="imagen-formato"
                  :value="f"
                  :data-accion="`formato-${f}`"
                  class="size-4 accent-primary"
                />
                {{ f.toUpperCase() }}
              </label>
            </div>
          </fieldset>

          <template v-if="formato === 'png'">
            <fieldset class="grid gap-1.5" :disabled="ocupado">
              <legend class="mb-1 text-sm font-medium">{{ t("imagen.fondo") }}</legend>
              <div class="flex flex-wrap gap-x-4 gap-y-1">
                <label v-for="f in FONDOS" :key="f" class="flex items-center gap-1.5 text-sm">
                  <input
                    v-model="fondo"
                    type="radio"
                    name="imagen-fondo"
                    :value="f"
                    class="size-4 accent-primary"
                  />
                  {{ t(`imagen.fondos.${f}`) }}
                </label>
              </div>
            </fieldset>
          </template>
          <fieldset v-if="raster" class="grid gap-1.5" :disabled="ocupado">
            <legend class="mb-1 text-sm font-medium">{{ t("imagen.tamano") }}</legend>
            <div class="flex flex-wrap gap-x-4 gap-y-1">
              <label v-for="e in ESCALAS" :key="e" class="flex items-center gap-1.5 text-sm">
                <input
                  v-model="escala"
                  type="radio"
                  name="imagen-escala"
                  :value="e"
                  class="size-4 accent-primary"
                />
                {{ e }}x
              </label>
            </div>
          </fieldset>

          <template v-if="esPdf">
            <fieldset class="grid gap-1.5" :disabled="ocupado">
              <legend class="mb-1 text-sm font-medium">{{ t("pdf.hoja") }}</legend>
              <div class="flex flex-wrap gap-x-4 gap-y-1">
                <label v-for="h in HOJAS" :key="h" class="flex items-center gap-1.5 text-sm">
                  <input
                    v-model="hoja"
                    type="radio"
                    name="pdf-hoja"
                    :value="h"
                    :data-accion="`hoja-${h}`"
                    class="size-4 accent-primary"
                  />
                  {{ t(`pdf.hojas.${h}`) }}
                </label>
              </div>
            </fieldset>
            <fieldset class="grid gap-1.5" :disabled="ocupado">
              <legend class="mb-1 text-sm font-medium">{{ t("pdf.orientacion") }}</legend>
              <div class="flex flex-wrap gap-x-4 gap-y-1">
                <label v-for="o in ORIENTACIONES" :key="o" class="flex items-center gap-1.5 text-sm">
                  <input
                    v-model="orientacion"
                    type="radio"
                    name="pdf-orientacion"
                    :value="o"
                    :data-accion="`orientacion-${o}`"
                    class="size-4 accent-primary"
                  />
                  {{ t(`pdf.orientaciones.${o}`) }}
                </label>
              </div>
            </fieldset>
            <fieldset class="grid gap-1.5" :disabled="ocupado">
              <legend class="mb-1 text-sm font-medium">{{ t("pdf.reparto") }}</legend>
              <label v-for="r in REPARTOS" :key="r" class="flex items-center gap-1.5 text-sm">
                <input
                  v-model="reparto"
                  type="radio"
                  name="pdf-reparto"
                  :value="r"
                  :data-accion="`reparto-${r}`"
                  class="size-4 accent-primary"
                />
                {{ t(`pdf.repartos.${r}`) }}
              </label>
            </fieldset>
          </template>
        </div>

        <div class="grid min-h-48 content-start gap-2">
          <p class="text-sm font-medium">{{ t("imagen.vistaPrevia") }}</p>
          <div class="flex h-72 items-center justify-center overflow-hidden rounded-md border bg-white p-2">
            <img
              v-if="previa"
              :src="previa"
              :alt="t('imagen.vistaPrevia')"
              class="max-h-full max-w-full object-contain"
            />
            <p v-else class="text-sm text-neutral-500">
              {{ t(fallo ?? "imagen.preparando") }}
            </p>
          </div>
          <p v-if="esPdf && pdfPrevia" data-paginas-pdf class="text-sm">
            {{ t("pdf.paginas", { n: pdfPrevia.total.toLocaleString(locale) }, pdfPrevia.total) }}
          </p>
          <p v-for="a in avisos" :key="a" role="status" data-aviso-pdf class="text-sm">{{ a }}</p>
          <p v-if="tarjetas > LIMITE_TARJETAS" role="status" data-aviso-tarjetas class="text-sm">
            {{
              t("imagen.muchas", {
                n: tarjetas.toLocaleString(locale),
                limite: LIMITE_TARJETAS.toLocaleString(locale),
              })
            }}
          </p>
          <p v-if="chicaPrevia && raster" role="status" data-aviso-chica class="text-sm">
            {{ t("imagen.chica") }}
          </p>
        </div>
      </div>

      <DialogFooter>
        <template v-if="armando">
          <p role="status" data-avance-pdf class="self-center text-sm sm:mr-auto">
            {{ avance || t("pdf.armando") }}
          </p>
          <Button type="button" variant="outline" data-accion="cancelar-pdf" @click="armando.abort()">
            {{ t("pdf.cancelar") }}
          </Button>
        </template>
        <Button
          v-if="!esPdf"
          type="button"
          variant="outline"
          data-accion="copiar-imagen"
          :disabled="ocupado"
          @click="copiar"
        >
          {{ t("imagen.copiar") }}
        </Button>
        <Button type="button" data-accion="guardar-imagen" :disabled="ocupado" @click="guardar">
          {{ t("imagen.guardar") }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
  <AlertDialog v-model:open="avisoAbierto">
    <AlertDialogContent data-aviso-imagen>
      <AlertDialogHeader>
        <AlertDialogTitle>{{ t("excel.aviso.titulo") }}</AlertDialogTitle>
        <AlertDialogDescription v-if="esPdf">
          {{ t("pdf.aviso") }}
          <template v-for="a in avisos" :key="a"> {{ a }}</template>
        </AlertDialogDescription>
        <AlertDialogDescription v-else>
          {{ t("imagen.aviso") }}
          <template v-if="chica"> {{ t("imagen.chica") }}</template>
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>{{ t("excel.aviso.cancelar") }}</AlertDialogCancel>
        <AlertDialogAction data-accion="aceptar-aviso-imagen" @click="aviso.aceptar()">
          {{ t("imagen.aceptar") }}
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</template>
