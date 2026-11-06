<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from "vue";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  borrarEliminada,
  listarEliminadas,
  restaurarEliminada,
  type Organizacion,
  type OrganizacionEliminada,
} from "@/db/cliente";
import { falloOrganizacion } from "@/features/respaldos/respaldos";
import { tamano } from "@/lib/formato";
import { claseSelect } from "@/lib/utils";
import type { Resultado } from "@/stores/organizacion";
import { useOrganizaciones } from "@/stores/organizaciones";
import DialogoEliminarOrganizacion from "./DialogoEliminarOrganizacion.vue";
import { ID_SECCION, textoAConfirmar } from "./eliminar";
import { PALETA } from "./paleta";

const { t, locale } = useI18n();
const organizaciones = useOrganizaciones();

const idEliminar = (id: string) => `org-eliminar-${id}`;
const idBorrarCopia = (nombre: string) => `copia-borrar-${nombre}`;
const idMotivoQuitar = (id: string) => `org-quitar-motivo-${id}`;
const idColor = (id: string) => `org-color-${id}`;

const copias = ref<OrganizacionEliminada[]>([]);
const errorCarga = ref("");
// Antes de la primera lectura, o si falló, no se sabe si hay: no se dice que no.
const listaLeida = ref(false);
const copiasLeidas = ref(false);
const ocupado = ref(false);
/** Mientras algo corre, y con una lista que no se puede cambiar: Rust lo rechazaría igual. */
const bloqueado = computed(() => ocupado.value || organizaciones.enCurso || organizaciones.listaProtegida);

async function cargar() {
  const lista = await organizaciones.cargarLista();
  listaLeida.value = lista.ok;
  let mensaje = lista.ok ? "" : lista.mensaje;
  try {
    copias.value = await listarEliminadas();
    copiasLeidas.value = true;
  } catch (e) {
    copiasLeidas.value = false;
    mensaje ||= falloOrganizacion(e).mensaje;
  }
  errorCarga.value = mensaje;
}
onMounted(cargar);

const nombreDe = (o: Pick<Organizacion, "nombre">) => textoAConfirmar(o, t("barra.sinNombre"));
const nombreDeCopia = (c: OrganizacionEliminada) => nombreDe({ nombre: c.organizacion });
// Lo que no se pudo leer no rompe la pantalla ni se muestra como un número falso.
const espacio = (bytes: number | null) =>
  typeof bytes === "number" && Number.isFinite(bytes)
    ? tamano(bytes, locale.value)
    : t("organizaciones.seccion.sinDato");
function fecha(valor: string) {
  const d = new Date(valor);
  return Number.isNaN(d.getTime())
    ? valor
    : new Intl.DateTimeFormat(locale.value, { dateStyle: "medium", timeStyle: "short" }).format(d);
}

function avisarFallo(r: { mensaje: string; codigo?: string }) {
  if (r.codigo === "lista_protegida") organizaciones.listaProtegida = true;
  else if (r.mensaje) toast.error(r.mensaje);
}

function enfocar(id: string | undefined) {
  const el = id ? document.getElementById(id) : null;
  (el && !(el as HTMLButtonElement).disabled ? el : document.getElementById(ID_SECCION))?.focus();
}
// Donde estaba la fila: la que tomó su lugar, la última si era la última, o el título si no queda ninguna.
const filaEn = (i: number) => {
  const o = organizaciones.lista[Math.min(i, organizaciones.lista.length - 1)];
  return o && idEliminar(o.id);
};
const copiaEn = (i: number) => {
  const c = copias.value[Math.min(i, copias.value.length - 1)];
  return c && idBorrarCopia(c.nombre);
};

/** Una acción a la vez, con los botones desactivados: al terminar se relee todo, y el foco queda en `foco`. */
async function correr(
  accion: () => Promise<Resultado>,
  foco: () => string | undefined,
  fallo: (e: unknown) => ReturnType<typeof falloOrganizacion> = falloOrganizacion,
) {
  ocupado.value = true;
  const r = await accion().catch(fallo);
  if (!r.ok) avisarFallo(r);
  await cargar();
  ocupado.value = false;
  await nextTick();
  enfocar(foco());
}

async function cambiarColor(o: Organizacion, e: Event) {
  const select = e.target as HTMLSelectElement;
  const r = await organizaciones.cambiarColor(o.id, select.value);
  if (r.ok) return;
  select.value = organizaciones.lista.find((x) => x.id === o.id)?.color ?? o.color;
  avisarFallo(r);
}

// Las confirmaciones de una sola acción. No se limpia al cerrar: el texto sigue ahí mientras el diálogo se va.
interface Pregunta {
  titulo: string;
  texto: string;
  si: string;
  destructiva: boolean;
  accion: () => Promise<void>;
}
const pregunta = ref<Pregunta | null>(null);
const preguntando = ref(false);
let respondida = false;
function preguntar(p: Pregunta) {
  pregunta.value = p;
  respondida = false;
  preguntando.value = true;
}
function responder() {
  if (respondida) return; // un segundo clic mientras el diálogo se va
  respondida = true;
  void pregunta.value?.accion();
}
// Con un sí, el foco lo deja `correr` al terminar: el botón que abrió el diálogo está desactivado, o ya no existe.
const alCerrarPregunta = (e: Event) => respondida && e.preventDefault();

function pedirQuitar(o: Organizacion, i: number) {
  preguntar({
    titulo: t("organizaciones.seccion.quitarTitulo", { nombre: nombreDe(o) }),
    texto: t(
      o.existe ? "organizaciones.seccion.quitarTexto" : "organizaciones.seccion.quitarTextoSinArchivo",
      {
        ruta: o.ruta,
      },
    ),
    si: t("organizaciones.seccion.quitar"),
    destructiva: false,
    accion: () =>
      correr(
        () => organizaciones.quitar(o.id),
        () => filaEn(i),
      ),
  });
}

function pedirBorrarCopia(c: OrganizacionEliminada, i: number) {
  preguntar({
    titulo: t("organizaciones.seccion.borrarCopiaTitulo", { nombre: nombreDeCopia(c) }),
    texto: t("organizaciones.seccion.borrarCopiaTexto", {
      archivo: c.nombre,
      fecha: fecha(c.fecha),
      tamano: espacio(c.bytes),
    }),
    si: t("organizaciones.seccion.borrarCopia"),
    destructiva: true,
    accion: () =>
      correr(
        async () => {
          await borrarEliminada(c.nombre);
          organizaciones.copiaBorrada(c.nombre);
          return { ok: true };
        },
        () => copiaEn(i),
        falloDeCopia,
      ),
  });
}

function pedirRestaurar(c: OrganizacionEliminada) {
  let nueva: string | undefined;
  preguntar({
    titulo: t("organizaciones.seccion.restaurarTitulo", { nombre: nombreDeCopia(c) }),
    texto: t("organizaciones.seccion.restaurarTexto", { archivo: c.nombre, fecha: fecha(c.fecha) }),
    si: t("organizaciones.seccion.restaurar"),
    destructiva: false,
    accion: () =>
      correr(
        async () => {
          nueva = await restaurarEliminada(c.nombre);
          toast.success(t("organizaciones.seccion.restaurada", { nombre: nombreDeCopia(c) }));
          return { ok: true };
        },
        // la fila de la nueva, que es lo que se fue a buscar, sin caer en un botón que borra; si falló, la misma copia
        () => (nueva ? idColor(nueva) : idBorrarCopia(c.nombre)),
        falloDeCopia,
      ),
  });
}

/** Con una copia, `desconocido` es que esa copia ya no está, no una organización de la lista. */
function falloDeCopia(e: unknown) {
  const f = falloOrganizacion(e);
  return f.codigo === "desconocido" ? { ...f, mensaje: t("organizaciones.seccion.copiaNoEsta") } : f;
}

const elegida = ref<Organizacion | null>(null);
const eliminando = ref(false);
let filaElegida = 0;
function pedirEliminar(o: Organizacion, i: number) {
  elegida.value = o;
  filaElegida = i;
  eliminando.value = true;
}
// Lo que dijo Rust tras un fallo, como que su archivo ya no está. Si ya no está en la lista, se queda el último dato: el diálogo se va.
watch(
  () => organizaciones.lista,
  (lista) => {
    const ahora = lista.find((o) => o.id === elegida.value?.id);
    if (ahora) elegida.value = ahora;
  },
);
async function trasEliminar(eliminada: boolean) {
  await cargar();
  if (!eliminada) return;
  await nextTick();
  enfocar(filaEn(filaElegida));
}
</script>

<template>
  <section class="grid gap-4" :aria-labelledby="ID_SECCION">
    <div>
      <h2
        :id="ID_SECCION"
        tabindex="-1"
        class="font-medium outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        {{ t("organizaciones.seccion.titulo") }}
      </h2>
      <p class="text-sm text-muted-foreground">{{ t("organizaciones.seccion.ayuda") }}</p>
    </div>

    <p v-if="organizaciones.listaProtegida" role="alert" class="text-sm text-destructive">
      {{ t("organizaciones.seccion.protegida") }}
    </p>
    <div v-if="errorCarga" class="flex flex-wrap items-center gap-3">
      <p role="alert" class="text-sm text-destructive">{{ errorCarga }}</p>
      <Button type="button" variant="outline" size="sm" :disabled="ocupado" @click="cargar">
        {{ t("organizaciones.reintentar") }}
      </Button>
    </div>

    <p v-if="listaLeida && !organizaciones.lista.length" class="text-sm text-muted-foreground">
      {{ t("organizaciones.seccion.vacia") }}
    </p>
    <ul v-else class="divide-y text-sm">
      <li v-for="(o, i) in organizaciones.lista" :key="o.id" class="grid gap-2 py-3">
        <div class="flex flex-wrap items-center gap-2">
          <span class="size-3 shrink-0 rounded-full" :style="{ background: o.color }" aria-hidden="true" />
          <span class="font-medium break-words">{{ nombreDe(o) }}</span>
          <Badge v-if="o.activa" variant="outline">{{ t("organizaciones.seccion.abierta") }}</Badge>
          <Badge v-if="o.externa" variant="outline">{{ t("organizaciones.seccion.externa") }}</Badge>
        </div>
        <p class="font-mono text-xs break-all text-muted-foreground">{{ o.ruta }}</p>
        <p v-if="o.existe" class="tabular-nums">
          {{
            t("organizaciones.seccion.espacio", {
              base: espacio(o.bytesBase),
              respaldos: espacio(o.bytesRespaldos),
            })
          }}
        </p>
        <p v-else class="tabular-nums">
          {{ t("organizaciones.seccion.sinArchivo", { respaldos: espacio(o.bytesRespaldos) }) }}
        </p>
        <div class="flex flex-wrap items-center gap-2">
          <select
            :id="idColor(o.id)"
            :value="o.color"
            :class="claseSelect"
            :disabled="bloqueado"
            :aria-label="t('organizaciones.seccion.color', { nombre: nombreDe(o) })"
            @change="cambiarColor(o, $event)"
          >
            <option v-if="!PALETA.some((p) => p.color === o.color)" :value="o.color">
              {{ t("organizaciones.colores.otro") }}
            </option>
            <option v-for="p in PALETA" :key="p.color" :value="p.color">{{ t(p.nombre) }}</option>
          </select>
          <!-- La única no tiene a cuál pasar antes de quitarla: no se ofrece. -->
          <Button
            v-if="!o.activa || organizaciones.varias"
            type="button"
            variant="outline"
            size="sm"
            :disabled="bloqueado || o.activa"
            :aria-label="t('organizaciones.seccion.quitarDe', { nombre: nombreDe(o) })"
            :aria-describedby="o.activa ? idMotivoQuitar(o.id) : undefined"
            @click="pedirQuitar(o, i)"
          >
            {{ t("organizaciones.seccion.quitar") }}
          </Button>
          <Button
            :id="idEliminar(o.id)"
            type="button"
            variant="destructive"
            size="sm"
            :disabled="bloqueado"
            :aria-label="t('organizaciones.seccion.eliminarDe', { nombre: nombreDe(o) })"
            @click="pedirEliminar(o, i)"
          >
            {{ t("organizaciones.seccion.eliminar") }}
          </Button>
        </div>
        <p
          v-if="o.activa && organizaciones.varias"
          :id="idMotivoQuitar(o.id)"
          class="text-xs text-muted-foreground"
        >
          {{ t("respaldos.error.abierta") }}
        </p>
      </li>
    </ul>

    <section class="grid gap-2" aria-labelledby="cfg-copias-eliminadas">
      <h3 id="cfg-copias-eliminadas" class="text-sm font-medium">{{ t("organizaciones.seccion.copias") }}</h3>
      <p v-if="copias.length || copiasLeidas" class="text-sm text-muted-foreground">
        {{ t(copias.length ? "organizaciones.seccion.copiasAyuda" : "organizaciones.seccion.copiasVacio") }}
      </p>
      <ul v-if="copias.length" class="divide-y text-sm">
        <li v-for="(c, i) in copias" :key="c.nombre" class="grid gap-2 py-3">
          <p>
            <span class="font-medium break-words">{{ nombreDeCopia(c) }}</span>
            <span class="text-muted-foreground"> · {{ fecha(c.fecha) }} · {{ espacio(c.bytes) }}</span>
          </p>
          <p class="font-mono text-xs break-all text-muted-foreground">{{ c.nombre }}</p>
          <div class="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              :disabled="bloqueado"
              :aria-label="t('organizaciones.seccion.restaurarDe', { archivo: c.nombre })"
              @click="pedirRestaurar(c)"
            >
              {{ t("organizaciones.seccion.restaurar") }}
            </Button>
            <Button
              :id="idBorrarCopia(c.nombre)"
              type="button"
              variant="destructive"
              size="sm"
              :disabled="bloqueado"
              :aria-label="t('organizaciones.seccion.borrarCopiaDe', { archivo: c.nombre })"
              @click="pedirBorrarCopia(c, i)"
            >
              {{ t("organizaciones.seccion.borrarCopia") }}
            </Button>
          </div>
        </li>
      </ul>
    </section>

    <p role="status" class="text-sm text-muted-foreground">
      {{ ocupado ? t("organizaciones.seccion.trabajando") : "" }}
    </p>

    <AlertDialog v-model:open="preguntando">
      <AlertDialogContent @close-auto-focus="alCerrarPregunta">
        <AlertDialogHeader>
          <AlertDialogTitle class="break-words">{{ pregunta?.titulo }}</AlertDialogTitle>
          <AlertDialogDescription class="break-words">{{ pregunta?.texto }}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{{ t("organizaciones.cancelar") }}</AlertDialogCancel>
          <AlertDialogAction :variant="pregunta?.destructiva ? 'destructive' : 'default'" @click="responder">
            {{ pregunta?.si }}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    <DialogoEliminarOrganizacion
      v-if="elegida"
      v-model:open="eliminando"
      :organizacion="elegida"
      @terminado="trasEliminar"
    />
  </section>
</template>
