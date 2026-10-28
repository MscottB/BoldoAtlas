<script setup lang="ts">
import { computed, nextTick, reactive, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { toast } from "vue-sonner";
import { ImagePlus, Trash2, UserCheck, X } from "@lucide/vue";
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
import { rutaTexto } from "@/features/arbol/jerarquia";
import { useOrganizacion, type Resultado } from "@/stores/organizacion";
import SelectorCatalogo from "./SelectorCatalogo.vue";
import { useFicha } from "./useFicha";
import { validarFicha, validarFoto } from "./validar";

const { t } = useI18n();
const org = useOrganizacion();
const ficha = useFicha();

type CampoCatalogo = "cargo_id" | "tipo_contrato_id" | "sede_id" | "jornada_id";
const CATALOGOS: { campo: CampoCatalogo; tabla: TablaCatalogo; etiqueta: string }[] = [
  { campo: "cargo_id", tabla: "cargos", etiqueta: "ficha.cargo" },
  { campo: "tipo_contrato_id", tabla: "tipos_contrato", etiqueta: "ficha.tipoContrato" },
  { campo: "sede_id", tabla: "sedes", etiqueta: "ficha.sede" },
  { campo: "jornada_id", tabla: "jornadas", etiqueta: "ficha.jornada" },
];

const vacio = (unidad_id: string, estado: Trabajador["estado"]): Trabajador => ({
  id: "",
  estado,
  nombre: null,
  correo: null,
  telefono: null,
  cargo_id: null,
  tipo_contrato_id: null,
  sede_id: null,
  jornada_id: null,
  unidad_id,
  foto_png: null,
  notas: null,
});
// Los campos de texto se editan como "" y se guardan como null.
const form = reactive({ ...vacio("", "activo"), nombre: "", correo: "", telefono: "", notas: "" });
// "" = ficha nueva, todavía sin guardar.
const id = computed(() => form.id || null);
const verErrores = ref(false);
const erroresBd = ref<Record<string, string>>({});
const errorFoto = ref("");

watch(
  () => ficha.abierta.value,
  (a) => {
    if (!a) return;
    const w = a.id ? org.trabajadores.find((x) => x.id === a.id) : vacio(a.unidadId, a.estado);
    if (!w) return ficha.cerrar(); // la ficha ya no existe
    Object.assign(form, w, {
      nombre: w.nombre ?? "",
      correo: w.correo ?? "",
      telefono: w.telefono ?? "",
      notas: w.notas ?? "",
    });
    verErrores.value = false;
    erroresBd.value = {};
    errorFoto.value = "";
  },
  { immediate: true },
);

const errores = computed(() => ({ ...(verErrores.value ? validarFicha(form) : {}), ...erroresBd.value }));
const describe = (campo: string) => (errores.value[campo] ? `ficha-error-${campo}` : undefined);

// Guardar: una ficha nueva se crea al primer guardado válido; las existentes envían solo lo que cambió.
// Los guardados se encolan para que dos salidas de campo seguidas no creen la ficha dos veces.
let cola: Promise<void> = Promise.resolve();
const guardar = () => (cola = cola.then(guardarAhora));

async function guardarAhora() {
  if (!ficha.abierta.value || Object.keys(validarFicha(form)).length) return;
  erroresBd.value = {};
  const datos = {
    ...form,
    nombre: form.nombre.trim() || null,
    correo: form.correo.trim() || null,
    telefono: form.telefono.trim() || null,
    notas: form.notas.trim() || null,
  };
  let r: Resultado;
  if (!id.value) {
    r = await org.crearTrabajador(datos);
    if (r.ok) form.id = r.id!;
  } else {
    const guardado = org.trabajadores.find((x) => x.id === id.value);
    if (!guardado) return;
    const cambios = Object.fromEntries(
      Object.entries(datos).filter(([k, v]) => v !== guardado[k as keyof Trabajador]),
    );
    if (!Object.keys(cambios).length) return;
    r = await org.editarTrabajador(id.value, cambios);
  }
  if (r.ok) return;
  // El store ya traduce el error de la base; el del correo repetido va bajo su campo.
  erroresBd.value =
    r.mensaje === t("errores.correoDuplicado") ? { correo: r.mensaje } : { general: r.mensaje };
}

function alSalir() {
  verErrores.value = true;
  guardar();
}

function cambiar<K extends CampoCatalogo | "unidad_id" | "foto_png">(campo: K, valor: Trabajador[K]) {
  (form as Record<string, unknown>)[campo] = valor;
  guardar();
}

async function cambiarEstado(estado: Trabajador["estado"]) {
  if (form.estado === estado) return;
  form.estado = estado;
  if (estado === "vacante") verErrores.value = true;
  guardar();
  if (estado === "activo") {
    await nextTick();
    document.getElementById("ficha-nombre")?.focus();
  }
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
    const url = await new Promise<string>((ok, mal) => {
      const lector = new FileReader();
      lector.onload = () => ok(lector.result as string);
      lector.onerror = () => mal(lector.error);
      lector.readAsDataURL(archivo);
    });
    cambiar("foto_png", url.slice(url.indexOf(",") + 1)); // solo el base64, como en NodoUnidad
  } catch {
    errorFoto.value = t("ficha.error.fotoLectura");
  }
}

const unidades = computed(() =>
  // shortcut: arma la ruta de cada unidad con rutaTexto (O(n²)); si una org de miles de unidades se siente lenta, calcularla con porId.
  org.unidades
    .map((u) => ({ id: u.id, texto: rutaTexto(org.unidades, u.id) }))
    .sort((a, b) => a.texto.localeCompare(b.texto, "es")),
);
const rutaUnidad = computed(() => (form.unidad_id ? rutaTexto(org.unidades, form.unidad_id) : ""));
// jefe_id puede apuntar a alguien eliminado: ya no está en org.trabajadores y cuenta como sin jefe.
const jefe = computed(() => org.trabajadores.find((x) => x.id === org.porId.get(form.unidad_id)?.jefe_id));
const esJefe = computed(() => !!id.value && jefe.value?.id === id.value);
const encabeza = computed(() =>
  id.value
    ? org.unidades.filter((u) => u.jefe_id === id.value).map((u) => rutaTexto(org.unidades, u.id))
    : [],
);
async function alternarJefe(e: Event) {
  const r = await org.asignarJefe(form.unidad_id, (e.target as HTMLInputElement).checked ? id.value : null);
  if (!r.ok) toast.error(r.mensaje);
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

const titulo = computed(() => {
  const clave = form.estado === "vacante" ? "Vacante" : "Persona";
  return t(id.value ? `ficha.titulo${clave}` : `ficha.nueva${clave}`);
});
const alAbrir = (e: Event) => {
  e.preventDefault();
  document.getElementById(form.estado === "activo" ? "ficha-nombre" : "ficha-cargo_id")?.focus();
};
</script>

<template>
  <Dialog :open="!!ficha.abierta.value" @update:open="(v) => !v && ficha.cerrar()">
    <DialogContent
      class="max-h-[90vh] overflow-y-auto sm:max-w-2xl"
      :show-close-button="false"
      @open-auto-focus="alAbrir"
    >
      <DialogHeader>
        <DialogTitle>{{ titulo }}</DialogTitle>
        <DialogDescription>{{ t("ficha.descripcion") }}</DialogDescription>
      </DialogHeader>

      <div class="flex flex-wrap items-center gap-2">
        <div role="group" :aria-label="t('ficha.tipoFicha')" class="flex gap-1">
          <Button
            v-for="e in ['activo', 'vacante'] as const"
            :key="e"
            type="button"
            size="sm"
            :variant="form.estado === e ? 'default' : 'outline'"
            :aria-pressed="form.estado === e"
            @click="cambiarEstado(e)"
          >
            {{ t(e === "activo" ? "ficha.persona" : "ficha.vacante") }}
          </Button>
        </div>
        <Button
          v-if="form.estado === 'vacante' && id"
          type="button"
          size="sm"
          variant="outline"
          @click="cambiarEstado('activo')"
        >
          <UserCheck aria-hidden="true" />
          {{ t("ficha.cubrir") }}
        </Button>
      </div>

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
            :aria-invalid="c.campo === 'cargo_id' && !!errores.cargo"
            :aria-describedby="c.campo === 'cargo_id' ? describe('cargo') : undefined"
            @update:model-value="cambiar(c.campo, $event)"
          />
          <p
            v-if="c.campo === 'cargo_id' && errores.cargo"
            id="ficha-error-cargo"
            role="alert"
            class="text-xs text-destructive"
          >
            {{ errores.cargo }}
          </p>
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
            @input="delete erroresBd.correo"
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

        <div class="grid gap-1.5 sm:col-span-2">
          <Label for="ficha-unidad">{{ t("ficha.unidad") }}</Label>
          <select
            id="ficha-unidad"
            class="h-8 rounded-lg border bg-background px-2 text-sm"
            :value="form.unidad_id"
            @change="cambiar('unidad_id', ($event.target as HTMLSelectElement).value)"
          >
            <option v-for="u in unidades" :key="u.id" :value="u.id">{{ u.texto }}</option>
          </select>
          <p class="text-xs text-muted-foreground">{{ rutaUnidad }}</p>
        </div>

        <div v-if="form.estado === 'activo'" class="grid gap-1.5 sm:col-span-2">
          <label class="flex items-center gap-2 text-sm">
            <input type="checkbox" :checked="esJefe" :disabled="!id" class="size-4" @change="alternarJefe" />
            {{ t("ficha.esJefe") }}
          </label>
          <p v-if="jefe && !esJefe" class="text-xs text-muted-foreground">
            {{ t("ficha.jefeUnidad", { nombre: jefe.nombre }) }}
          </p>
        </div>

        <div v-if="id" class="grid gap-1 sm:col-span-2">
          <p class="text-sm font-medium">{{ t("ficha.encabeza") }}</p>
          <ul v-if="encabeza.length" class="list-inside list-disc text-sm">
            <li v-for="u in encabeza" :key="u">{{ u }}</li>
          </ul>
          <p v-else class="text-sm text-muted-foreground">{{ t("ficha.ninguna") }}</p>
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
</template>
