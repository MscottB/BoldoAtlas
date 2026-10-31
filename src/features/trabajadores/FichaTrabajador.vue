<script setup lang="ts">
import { computed, reactive, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { toast } from "vue-sonner";
import { ImagePlus, Trash2, X } from "@lucide/vue";
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
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { TablaCatalogo, Trabajador } from "@/db/tipos";
import { jefeVisible, rutaTexto, vigentesPorPuesto } from "@/features/arbol/jerarquia";
import { asignacionesDePersona, formatearFecha, type FilaPersona } from "@/features/puestos/puestos";
import { usePuesto } from "@/features/puestos/usePuesto";
import { base64De, leerComoUrl } from "@/features/configuracion/logo";
import { useOrganizacion } from "@/stores/organizacion";
import { useRetornoFoco } from "@/lib/foco";
import SelectorCatalogo from "./SelectorCatalogo.vue";
import { useFicha } from "./useFicha";
import {
  camposGuardables,
  cambiosFicha,
  hayCambiosSinGuardar,
  normalizarFicha,
  validarFicha,
  validarFoto,
  type DatosFicha,
} from "./validar";

const { t, locale } = useI18n();
const org = useOrganizacion();
const ficha = useFicha();
const puesto = usePuesto();

type CampoCatalogo = "tipo_contrato_id" | "sede_id" | "jornada_id";
const CATALOGOS: { campo: CampoCatalogo; tabla: TablaCatalogo; etiqueta: string }[] = [
  { campo: "tipo_contrato_id", tabla: "tipos_contrato", etiqueta: "ficha.tipoContrato" },
  { campo: "sede_id", tabla: "sedes", etiqueta: "ficha.sede" },
  { campo: "jornada_id", tabla: "jornadas", etiqueta: "ficha.jornada" },
];

const vacio = (): Trabajador => ({
  id: "",
  nombre: "",
  correo: null,
  telefono: null,
  tipo_contrato_id: null,
  sede_id: null,
  jornada_id: null,
  foto_png: null,
  notas: null,
});
// Los campos de texto se editan como "" y se guardan como null (el nombre, obligatorio, solo se recorta).
const form = reactive({ ...vacio(), correo: "", telefono: "", notas: "" });
// "" = ficha nueva, todavía sin guardar.
const id = computed(() => form.id || null);
const verErrores = ref(false);
// Errores que devolvió la base, por campo del formulario (o "general"); se borran al editar ese campo.
const fallidos = ref<Record<string, string>>({});
const confirmando = ref(false);
const errorFoto = ref("");

watch(
  () => ficha.abierta.value,
  (a) => {
    if (!a) return;
    const w = a.id ? org.trabajadores.find((x) => x.id === a.id) : vacio();
    if (!w) return ficha.cerrar(); // la ficha ya no existe
    Object.assign(form, w, {
      correo: w.correo ?? "",
      telefono: w.telefono ?? "",
      notas: w.notas ?? "",
    });
    verErrores.value = false;
    fallidos.value = {};
    confirmando.value = false;
    errorFoto.value = "";
  },
  { immediate: true },
);

watch(
  () => ({ ...form }),
  (nuevo, viejo) => {
    for (const k of Object.keys(nuevo))
      if (nuevo[k as keyof typeof nuevo] !== viejo[k as keyof typeof viejo]) delete fallidos.value[k];
  },
);

const errores = computed<Record<string, string>>(() => {
  const otro = Object.entries(fallidos.value).find(([k]) => k !== "correo")?.[1];
  return {
    ...(verErrores.value ? validarFicha(form) : {}),
    ...(fallidos.value.correo ? { correo: fallidos.value.correo } : {}),
    ...(otro ? { general: otro } : {}),
  };
});
const describe = (campo: string) => (errores.value[campo] ? `ficha-error-${campo}` : undefined);

// Guardar: una ficha nueva se crea cuando sus campos obligatorios son válidos; una existente guarda cada campo
// válido por separado (un campo inválido no arrastra a los demás) y muestra los errores pendientes.
// Los guardados se encolan para que dos salidas de campo seguidas no creen la ficha dos veces.
let cola: Promise<void> = Promise.resolve();
const guardar = () => (cola = cola.then(guardarAhora));

async function guardarAhora() {
  if (!ficha.abierta.value) return;
  if (!id.value) {
    if (Object.keys(validarFicha(form)).length) {
      verErrores.value = true;
      return;
    }
    const r = await org.crearTrabajador(normalizarFicha(form));
    // El store ya traduce el error de la base; el del correo repetido va bajo su campo.
    if (r.ok) form.id = r.id!;
    else fallidos.value = { [r.mensaje === t("errores.correoDuplicado") ? "correo" : "general"]: r.mensaje };
    return;
  }
  const guardado = org.trabajadores.find((x) => x.id === id.value);
  if (!guardado) return;
  const cambios = cambiosFicha(form, guardado);
  // Un campo que la base ya rechazó espera a que lo editen.
  for (const k of Object.keys(fallidos.value)) delete cambios[k as keyof DatosFicha];
  const guardables = camposGuardables(cambios, validarFicha(form));
  if (Object.keys(guardables).length < Object.keys(cambios).length) verErrores.value = true;
  for (const [campo, valor] of Object.entries(guardables)) {
    const r = await org.editarTrabajador(id.value, { [campo]: valor });
    if (!r.ok) fallidos.value = { ...fallidos.value, [campo]: r.mensaje };
  }
}

async function hayCambios() {
  await cola; // que termine lo que se está guardando antes de decidir
  const base = id.value ? org.trabajadores.find((x) => x.id === id.value) : vacio();
  return !!base && hayCambiosSinGuardar(form, base);
}
// Quien quiera abrir otra ficha (p. ej. el diálogo de un puesto) pasa por esta misma comprobación.
ficha.registrarGuardia(hayCambios);

async function pedirCerrar() {
  if (!ficha.abierta.value) return;
  if (await hayCambios()) confirmando.value = true;
  else ficha.cerrar();
}

// Hay una ficha esperando: se pregunta lo mismo que al cerrar. Descartar la abre; Seguir editando la olvida.
watch(ficha.pendiente, (p) => p && (confirmando.value = true));
watch(confirmando, (c) => c || (ficha.pendiente.value = null));
function descartar() {
  const p = ficha.pendiente.value; // el diálogo ya se cerró, pero el watcher que la borra corre después
  if (p) ficha.abrir(p);
  else ficha.cerrar();
}

function alSalir() {
  verErrores.value = true;
  guardar();
}

function cambiar<K extends CampoCatalogo | "foto_png">(campo: K, valor: Trabajador[K]) {
  (form as Record<string, unknown>)[campo] = valor;
  guardar();
}

const inputFoto = ref<HTMLInputElement | null>(null);
async function elegirFoto(e: Event) {
  const input = e.target as HTMLInputElement;
  const archivo = input.files?.[0];
  input.value = ""; // permite volver a elegir el mismo archivo
  if (!archivo) return;
  errorFoto.value = validarFoto(archivo) ?? "";
  if (errorFoto.value) return;
  try {
    cambiar("foto_png", base64De(await leerComoUrl(archivo))); // solo el base64, como en NodoUnidad
  } catch {
    errorFoto.value = t("ficha.error.fotoLectura");
  }
}

// Unidades de las que es el jefe visible (titular o, si falta, reemplazo del puesto de jefatura).
const encabeza = computed(() => {
  if (!id.value) return [];
  const vigentes = vigentesPorPuesto(org.asignaciones);
  return org.unidades
    .filter((u) => jefeVisible(u, vigentes)?.trabajador_id === id.value)
    .map((u) => rutaTexto(org.unidades, u.id));
});

// Sus puestos (cargo y unidad son del puesto, no de la persona): vigentes e historial, solo lectura.
const misPuestos = computed(() =>
  id.value ? asignacionesDePersona(org.puestos, org.asignaciones, id.value) : { vigentes: [], cerradas: [] },
);
function textoPuesto({ asignacion: a, puesto: p }: FilaPersona) {
  const fecha = (iso: string) => formatearFecha(iso, locale.value);
  return t(a.hasta ? "ficha.puestoCerrado" : "ficha.puestoVigente", {
    cargo: org.catalogos.cargos.find((c) => c.id === p.cargo_id)?.nombre ?? "",
    unidad: rutaTexto(org.unidades, p.unidad_id),
    tipo: t(`puesto.tipo.${a.tipo}`),
    desde: fecha(a.desde),
    hasta: a.hasta ? fecha(a.hasta) : "",
  });
}

async function eliminar() {
  const r = await org.eliminarTrabajador(id.value!);
  if (!r.ok) return void toast.error(r.mensaje);
  ficha.cerrar();
  toast(t("ficha.eliminado"), {
    duration: 8000,
    action: {
      label: t("ficha.deshacer"),
      onClick: async () => {
        const d = await org.deshacer();
        if (!d.ok) toast.error(d.mensaje);
      },
    },
  });
}

const titulo = computed(() => t(id.value ? "ficha.tituloPersona" : "ficha.nuevaPersona"));
const retorno = useRetornoFoco();
const alAbrir = (e: Event) => {
  retorno.alAbrir();
  e.preventDefault();
  document.getElementById("ficha-nombre")?.focus();
};
</script>

<template>
  <Dialog :open="!!ficha.abierta.value" @update:open="(v) => !v && pedirCerrar()">
    <DialogContent
      class="max-h-[90vh] overflow-y-auto sm:max-w-2xl"
      :show-close-button="false"
      @open-auto-focus="alAbrir"
      @close-auto-focus="retorno.alCerrar"
    >
      <DialogHeader>
        <DialogTitle>{{ titulo }}</DialogTitle>
        <DialogDescription>{{ t("ficha.descripcion") }}</DialogDescription>
      </DialogHeader>

      <p v-if="errores.general" role="alert" class="text-sm text-destructive">{{ errores.general }}</p>

      <div class="grid gap-3 sm:grid-cols-2">
        <div class="grid gap-1.5">
          <Label for="ficha-nombre">{{ t("ficha.nombre") }}</Label>
          <Input
            id="ficha-nombre"
            v-model="form.nombre"
            autocomplete="off"
            :aria-invalid="!!errores.nombre"
            :aria-describedby="describe('nombre')"
            @blur="alSalir"
          />
          <p v-if="errores.nombre" id="ficha-error-nombre" role="alert" class="text-xs text-destructive">
            {{ errores.nombre }}
          </p>
        </div>

        <div v-for="c in CATALOGOS" :key="c.campo" class="grid gap-1.5">
          <Label :for="`ficha-${c.campo}`">{{ t(c.etiqueta) }}</Label>
          <SelectorCatalogo
            :id="`ficha-${c.campo}`"
            :tabla="c.tabla"
            :model-value="form[c.campo]"
            @update:model-value="cambiar(c.campo, $event)"
          />
        </div>

        <div class="grid gap-1.5">
          <Label for="ficha-correo">{{ t("ficha.correo") }}</Label>
          <Input
            id="ficha-correo"
            v-model="form.correo"
            type="email"
            autocomplete="off"
            :aria-invalid="!!errores.correo"
            :aria-describedby="describe('correo')"
            @input="delete fallidos.correo"
            @blur="alSalir"
          />
          <p v-if="errores.correo" id="ficha-error-correo" role="alert" class="text-xs text-destructive">
            {{ errores.correo }}
          </p>
        </div>

        <div class="grid gap-1.5">
          <Label for="ficha-telefono">{{ t("ficha.telefono") }}</Label>
          <Input id="ficha-telefono" v-model="form.telefono" type="tel" autocomplete="off" @blur="alSalir" />
        </div>

        <div v-if="id" class="grid gap-1 sm:col-span-2">
          <p class="text-sm font-medium">{{ t("ficha.encabeza") }}</p>
          <ul v-if="encabeza.length" class="list-inside list-disc text-sm">
            <li v-for="u in encabeza" :key="u">{{ u }}</li>
          </ul>
          <p v-else class="text-sm text-muted-foreground">{{ t("ficha.ninguna") }}</p>
        </div>

        <div v-if="id" class="grid gap-1 sm:col-span-2">
          <p class="text-sm font-medium">{{ t("ficha.puestos") }}</p>
          <ul v-if="misPuestos.vigentes.length" class="grid gap-0.5">
            <li v-for="f in misPuestos.vigentes" :key="f.asignacion.id">
              <button
                type="button"
                class="rounded text-left text-sm underline focus-visible:outline-2 focus-visible:outline-ring"
                @click="puesto.abrir(f.puesto.id)"
              >
                {{ textoPuesto(f) }}
              </button>
            </li>
          </ul>
          <p v-else class="text-sm text-muted-foreground">{{ t("ficha.sinPuestos") }}</p>
          <details v-if="misPuestos.cerradas.length" class="text-sm">
            <summary class="w-fit cursor-pointer rounded focus-visible:outline-2 focus-visible:outline-ring">
              {{ t("ficha.historialPuestos", { n: misPuestos.cerradas.length }) }}
            </summary>
            <ul class="mt-1 grid gap-0.5">
              <li v-for="f in misPuestos.cerradas" :key="f.asignacion.id">
                <button
                  type="button"
                  class="rounded text-left underline focus-visible:outline-2 focus-visible:outline-ring"
                  @click="puesto.abrir(f.puesto.id)"
                >
                  {{ textoPuesto(f) }}
                </button>
              </li>
            </ul>
          </details>
        </div>

        <div class="grid gap-1.5 sm:col-span-2">
          <Label for="ficha-notas">{{ t("ficha.notas") }}</Label>
          <Textarea id="ficha-notas" v-model="form.notas" @blur="alSalir" />
        </div>

        <div class="grid gap-1.5 sm:col-span-2">
          <p class="text-sm font-medium">{{ t("ficha.foto") }}</p>
          <div class="flex items-center gap-2">
            <img
              v-if="form.foto_png"
              :src="`data:image/png;base64,${form.foto_png}`"
              alt=""
              class="size-12 rounded-full object-cover"
            />
            <input
              ref="inputFoto"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              class="hidden"
              tabindex="-1"
              @change="elegirFoto"
            />
            <Button type="button" size="sm" variant="outline" @click="inputFoto?.click()">
              <ImagePlus aria-hidden="true" />
              {{ t("ficha.elegirFoto") }}
            </Button>
            <Button
              v-if="form.foto_png"
              type="button"
              size="sm"
              variant="outline"
              @click="cambiar('foto_png', null)"
            >
              <X aria-hidden="true" />
              {{ t("ficha.quitarFoto") }}
            </Button>
          </div>
          <p v-if="errorFoto" role="alert" class="text-xs text-destructive">{{ errorFoto }}</p>
        </div>
      </div>

      <DialogFooter>
        <Button v-if="id" type="button" variant="destructive" class="sm:mr-auto" @click="eliminar">
          <Trash2 aria-hidden="true" />
          {{ t("ficha.eliminar") }}
        </Button>
        <DialogClose as-child>
          <Button type="button" variant="outline">{{ t("ficha.cerrar") }}</Button>
        </DialogClose>
      </DialogFooter>
    </DialogContent>
  </Dialog>
  <AlertDialog v-model:open="confirmando">
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>{{ t("ficha.sinGuardarTitulo") }}</AlertDialogTitle>
        <AlertDialogDescription>{{ t("ficha.sinGuardarTexto") }}</AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>{{ t("ficha.seguirEditando") }}</AlertDialogCancel>
        <AlertDialogAction @click="descartar">{{ t("ficha.descartar") }}</AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</template>
