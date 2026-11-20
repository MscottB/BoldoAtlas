<script setup lang="ts">
import { computed, onBeforeUnmount, ref, shallowRef, watch } from "vue";
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
import { archivoAbrirCarpeta, archivoGuardar, leerMeta } from "@/db/cliente";
import { useVista } from "@/features/arbol/useVista";
import { crearAviso } from "@/features/excel/aviso";
import { formatearFecha, hoyISO } from "@/features/puestos/puestos";
import { mensajeFallo } from "@/features/respaldos/respaldos";
import SelectorUnidad from "@/features/unidades/SelectorUnidad.vue";
import { useRetornoFoco } from "@/lib/foco";
import { guardarPreferencia, leerPreferencia } from "@/lib/preferencias";
import { VERSION_ACTUAL } from "@/stores/actualizaciones";
import { useOrganizacion } from "@/stores/organizacion";
import { armarPdf } from "./armarPdf";
import { nombreArchivo, paginasDelPdf } from "./formatos";
import { textosManual } from "./manual";
import { manualDeAlcance } from "./manualDeAlcance";
import OpcionesHoja from "./OpcionesHoja.vue";
import { ErrorCiclo, LISTA_HOJAS, ORIENTACIONES, type Hoja, type Orientacion } from "./paginas";
import { CAMBIO, avisosPdf, falloAlGuardar } from "./paginasDeAlcance";
import type { Alcance } from "./preparar";
import { ubicadorEnWorker } from "./ubicador";

// «Manual de organización y funciones», en PDF. Se abre desde la página Importar y exportar y con el clic derecho en
// una unidad (`rama`). Todo se calcula y se arma al guardar, con avance y Cancelar; después, el aviso de aceptación.
const abierto = defineModel<boolean>("open", { required: true });
const props = defineProps<{ rama?: string | null }>();
const { t, locale } = useI18n();
const org = useOrganizacion();
const { config } = useVista();
const retorno = useRetornoFoco();

// Se recuerda por PC lo elegido la última vez, salvo el alcance.
const PREFERENCIA = "manual";
const elegir = <T,>(lista: readonly T[], valor: unknown, porDefecto: T): T =>
  lista.includes(valor as T) ? (valor as T) : porDefecto;
const guardada = leerPreferencia<Record<string, unknown>>(PREFERENCIA, {}) ?? {};
const personas = ref(guardada.personas !== false);
const hoja = ref<Hoja>(elegir(LISTA_HOJAS, guardada.hoja, "carta"));
const orientacion = ref<Orientacion>(elegir(ORIENTACIONES, guardada.orientacion, "vertical"));
watch([personas, hoja, orientacion], ([p, h, o]) =>
  guardarPreferencia(PREFERENCIA, { personas: p, hoja: h, orientacion: o }),
);

const elegida = ref<string | null>(props.rama ?? null);
// Cada vez que se abre, el alcance que trae quien la abre. Cerrarla cancela lo que se esté armando.
watch(abierto, (si) => {
  if (si) elegida.value = props.rama ?? null;
  else armando.value?.abort();
});
// Una unidad que no existe a la fecha que se ve (o ya no existe) vuelve a ser toda la organización.
const alcance = computed<Alcance>(() =>
  elegida.value && org.enFecha.porId.has(elegida.value) ? { rama: elegida.value } : "todo",
);
const textoAlcance = computed(() =>
  alcance.value === "todo" ? t("imagen.alcanceTodo") : org.enFecha.porId.get(alcance.value.rama)!.nombre,
);
const NINGUNA = new Set<string>();

const { ubicar, cerrar } = ubicadorEnWorker();
const ocupado = ref(false);
// Mientras se calcula o se arma: para cancelarlo, y cuánto lleva.
const armando = shallowRef<AbortController | null>(null);
const avance = ref("");
const avisoAbierto = ref(false);
const aviso = crearAviso((v) => (avisoAbierto.value = v));
// Cerrar el aviso de cualquier forma es no aceptarlo. «Acepto» responde antes (el cierre llega después, en otra vuelta).
watch(avisoAbierto, (v) => v || aviso.cerrado());
// Lo que dice el aviso además de «queda sin cifrar»: letra bajo 8 pt, o más de 200 páginas.
const avisos = ref<string[]>([]);
// Si cambia el organigrama mientras se arma o se pregunta, el manual sería el de antes: se corta y se avisa.
watch([() => org.enFecha, () => org.catalogos], () => {
  if (!armando.value) return;
  armando.value.abort(CAMBIO);
  avisoAbierto.value = false;
});
onBeforeUnmount(() => {
  cerrar();
  armando.value?.abort();
});

async function guardar() {
  if (ocupado.value) return;
  ocupado.value = true;
  const control = (armando.value = new AbortController());
  const conPersonas = personas.value;
  try {
    avance.value = t("pdf.preparando");
    const m = await manualDeAlcance(
      {
        alcance: alcance.value,
        conPersonas,
        hoja: hoja.value,
        orientacion: orientacion.value,
        config: config.value,
        ubicar,
      },
      { senal: control.signal, alAvanzar: (x) => (avance.value = x) },
    );
    const meta = await leerMeta();
    control.signal.throwIfAborted();
    const { encabezado } = m;
    // Antes del aviso, el PDF entero: así dice cuántas páginas son de verdad (el índice y las tablas largas suman).
    const pdf = await armarPdf(
      {
        tipo: "manual",
        datos: { unidades: m.unidades, general: m.general, dibujos: m.dibujos },
        o: {
          hoja: hoja.value,
          orientacion: orientacion.value,
          encabezado,
          // Los números los pone cada página: aquí quedan las marcas tal cual.
          pagina: t("pdf.pagina", { n: "{n}", m: "{m}" }),
          titulo: t("manual.titulo"),
          conPersonas,
          textos: textosManual(),
          portada: {
            organizacion: encabezado.organizacion,
            alcance: encabezado.alcance,
            fecha: encabezado.fecha,
            version: t("manual.version", { version: VERSION_ACTUAL }),
            revision: t("manual.revision", { revision: meta.data_revision ?? "?" }),
            logo: encabezado.logo,
          },
        },
      },
      (n, total) => (avance.value = t("manual.armando", { n, m: total })),
      control.signal,
    );
    avance.value = "";
    avisos.value = avisosPdf("ramas", { ilegible: m.ilegible, total: paginasDelPdf(pdf) }, locale.value);
    if (!(await aviso.preguntar())) {
      control.signal.throwIfAborted(); // se cerró porque cambió el organigrama: se avisa
      return;
    }
    // El nombre lleva la organización y la rama, nunca a una persona.
    const rama = alcance.value === "todo" ? "" : textoAlcance.value;
    const archivo = nombreArchivo(org.org.nombre, rama, "manual", "pdf", org.fechaVista ?? hoyISO());
    const nombre = await archivoGuardar(archivo, pdf, "pdf");
    if (nombre)
      toast.success(t("imagen.guardada", { nombre }), {
        duration: 10000,
        action: {
          label: t("excel.abrirCarpeta"),
          onClick: () => void archivoAbrirCarpeta().catch((x: unknown) => toast.error(mensajeFallo(x))),
        },
      });
  } catch (e) {
    // Cancelado por la persona o al cerrar: nada que decir. Si cambió el organigrama, se dice que vuelva a guardar.
    const que = falloAlGuardar(e, true, control.signal);
    if (que === "interrumpido") toast.info(t("pdf.interrumpido"));
    else if (que === "error") toast.error(e instanceof ErrorCiclo ? t("pdf.ciclo") : mensajeFallo(e));
  } finally {
    armando.value = null;
    avance.value = "";
    ocupado.value = false;
  }
}
</script>

<template>
  <Dialog v-model:open="abierto">
    <DialogContent
      data-dialogo-manual
      class="sm:max-w-md"
      @open-auto-focus="retorno.alAbrir"
      @close-auto-focus="retorno.alCerrar"
    >
      <DialogHeader>
        <DialogTitle>{{ t("manual.titulo") }}</DialogTitle>
        <DialogDescription>
          {{ t("manual.descripcion") }}
          <template v-if="org.fechaVista">
            {{ t("manual.aFecha", { fecha: formatearFecha(org.fechaVista, locale) }) }}
          </template>
        </DialogDescription>
      </DialogHeader>

      <div class="grid gap-4">
        <div class="grid gap-1.5">
          <Label for="manual-alcance">{{ t("imagen.alcance") }}</Label>
          <SelectorUnidad
            id="manual-alcance"
            :excluidas="NINGUNA"
            :texto="textoAlcance"
            :ninguna="t('imagen.alcanceTodo')"
            :unidades="org.enFecha.unidades"
            :disabled="ocupado"
            @elegir="elegida = $event"
          />
        </div>
        <label class="grid grid-cols-[auto_1fr] gap-x-2 text-sm">
          <input
            v-model="personas"
            type="checkbox"
            data-accion="manual-personas"
            class="mt-0.5 size-4 accent-primary"
            :disabled="ocupado"
          />
          <span>{{ t("manual.personas") }}</span>
          <span class="col-start-2 text-xs text-muted-foreground">{{ t("manual.personasAyuda") }}</span>
        </label>
        <OpcionesHoja v-model:hoja="hoja" v-model:orientacion="orientacion" :disabled="ocupado" />
      </div>

      <DialogFooter>
        <template v-if="armando && !avisoAbierto">
          <p role="status" data-avance-manual class="self-center text-sm sm:mr-auto">
            {{ avance || t("pdf.preparando") }}
          </p>
          <Button type="button" variant="outline" data-accion="cancelar-manual" @click="armando.abort()">
            {{ t("pdf.cancelar") }}
          </Button>
        </template>
        <Button type="button" data-accion="guardar-manual" :disabled="ocupado" @click="guardar">
          {{ t("imagen.guardar") }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
  <AlertDialog v-model:open="avisoAbierto">
    <AlertDialogContent data-aviso-manual>
      <AlertDialogHeader>
        <AlertDialogTitle>{{ t("excel.aviso.titulo") }}</AlertDialogTitle>
        <AlertDialogDescription>
          {{ t("pdf.aviso") }}
          <template v-for="a in avisos" :key="a"> {{ a }}</template>
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>{{ t("excel.aviso.cancelar") }}</AlertDialogCancel>
        <AlertDialogAction data-accion="aceptar-aviso-manual" @click="aviso.aceptar()">
          {{ t("imagen.aceptar") }}
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</template>
