<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { toast } from "vue-sonner";
import { Trash2 } from "@lucide/vue";
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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { Asignacion } from "@/db/tipos";
import { rutaPorTipo, vigentesPorPuesto } from "@/features/arbol/jerarquia";
import SelectorCatalogo from "@/features/trabajadores/SelectorCatalogo.vue";
import { useFicha } from "@/features/trabajadores/useFicha";
import { useOrganizacion } from "@/stores/organizacion";
import EstiloPuesto from "./EstiloPuesto.vue";
import FormAsignacion from "./FormAsignacion.vue";
import { descripcionPorGuardar, formatearFecha, hayPuestoNuevoPendiente, historialPuesto } from "./puestos";
import { usePuesto } from "./usePuesto";

const { t, locale } = useI18n();
const org = useOrganizacion();
const ficha = useFicha();
const ctl = usePuesto();

// null = puesto nuevo, aún sin crear.
const puesto = computed(() =>
  ctl.abierta.value?.id ? org.puestos.find((p) => p.id === ctl.abierta.value!.id) : undefined,
);
// Un puesto que ya no existe (borrado) no ofrece acciones: el diálogo se cierra.
watch([ctl.abierta, puesto], ([a, p]) => a?.id && !p && ctl.cerrar());

const unidad = computed(() => org.porId.get(puesto.value?.unidad_id ?? ctl.abierta.value?.unidadId ?? ""));
const ubicacion = computed(
  () =>
    rutaPorTipo(org.unidades, org.catalogos.tipos_unidad, unidad.value?.id ?? "")
      .map((r) => `${r.tipo.nombre}: ${r.unidad.nombre}`)
      .join(" · ") || unidad.value?.nombre,
);
const cargo = computed(() => org.catalogos.cargos.find((c) => c.id === puesto.value?.cargo_id)?.nombre);
const titulo = computed(() => cargo.value ?? t("puesto.nuevo"));

const personas = computed(() => new Map(org.trabajadores.map((w) => [w.id, w.nombre])));
const nombre = (id: string) => personas.value.get(id) ?? "";
const vigentes = computed(() =>
  puesto.value ? vigentesPorPuesto(org.asignaciones).get(puesto.value.id) : undefined,
);
const historial = computed(() => (puesto.value ? historialPuesto(org.asignaciones, puesto.value.id) : []));
const esJefatura = computed(() => !!puesto.value && unidad.value?.jefe_puesto_id === puesto.value.id);
const fecha = (iso: string) => formatearFecha(iso, locale.value);

const TIPOS = ["titular", "reemplazo"] as const;
const descripcion = ref("");
const cargoNuevo = ref<string | null>(null);
const errorNuevo = ref("");
const accion = ref<{ tipo: "titular" | "reemplazo" | "terminar"; asignacion?: Asignacion } | null>(null);
let origenForm: HTMLElement | null = null; // para devolver el foco al botón que abrió el formulario

watch(
  ctl.abierta,
  (a) => {
    if (!a) return;
    descripcion.value = puesto.value?.descripcion ?? "";
    cargoNuevo.value = null;
    errorNuevo.value = "";
    accion.value = null;
  },
  { immediate: true },
);

function abrirForm(tipo: "titular" | "reemplazo" | "terminar", asignacion?: Asignacion) {
  origenForm = document.activeElement as HTMLElement | null;
  accion.value = { tipo, asignacion };
}
function cerrarForm() {
  accion.value = null;
  void nextTick(() => origenForm?.focus());
}

async function crear() {
  errorNuevo.value = "";
  if (!cargoNuevo.value || !unidad.value) return void (errorNuevo.value = t("puesto.error.cargo"));
  const r = await org.crearPuesto({
    unidad_id: unidad.value.id,
    cargo_id: cargoNuevo.value,
    descripcion: descripcion.value.trim() || null,
  });
  if (r.ok) ctl.abrir(r.id!);
  else errorNuevo.value = r.mensaje;
}

async function cambiarCargo(id: string | null) {
  if (!puesto.value || !id || id === puesto.value.cargo_id) return;
  const r = await org.editarPuesto(puesto.value.id, { cargo_id: id });
  if (!r.ok) toast.error(r.mensaje);
}

/** Guarda la descripción si cambió. Toma el puesto antes de esperar: así sirve también al cerrar. false = falló. */
async function guardarDescripcion(): Promise<boolean> {
  const p = puesto.value;
  const nueva = p ? descripcionPorGuardar(p.descripcion, descripcion.value) : undefined;
  if (!p || nueva === undefined) return true;
  const r = await org.editarPuesto(p.id, { descripcion: nueva });
  if (!r.ok) toast.error(r.mensaje);
  return r.ok;
}

// Esc, clic fuera y "Cerrar" pasan por aquí: no se pierde lo escrito (un puesto nuevo pregunta antes de descartar).
const confirmando = ref(false);
async function pedirCerrar() {
  if (!puesto.value) {
    if (hayPuestoNuevoPendiente(cargoNuevo.value, descripcion.value)) confirmando.value = true;
    else ctl.cerrar();
  } else if (await guardarDescripcion()) ctl.cerrar();
}

async function alternarJefatura(e: Event) {
  const input = e.target as HTMLInputElement;
  const r = await org.asignarJefe(unidad.value!.id, input.checked ? puesto.value!.id : null);
  if (!r.ok) {
    input.checked = !input.checked;
    toast.error(r.mensaje);
  }
}

async function eliminar() {
  const r = await org.eliminarPuesto(puesto.value!.id);
  if (!r.ok) return void toast.error(r.mensaje);
  ctl.cerrar();
  toast(t("puesto.eliminado"), {
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

// Dos diálogos apilados no se pueden intercambiar: se cierra este y se abre la ficha (con su aviso si tiene cambios sin guardar).
async function verPersona(id: string) {
  if (!(await guardarDescripcion())) return;
  ctl.cerrar();
  void ficha.intentarAbrir(id);
}
</script>

<template>
  <Dialog :open="!!ctl.abierta.value" @update:open="(v) => !v && pedirCerrar()">
    <DialogContent class="max-h-[90vh] overflow-y-auto sm:max-w-2xl" :show-close-button="false">
      <DialogHeader>
        <DialogTitle>{{ titulo }}</DialogTitle>
        <DialogDescription>{{ ubicacion }}</DialogDescription>
      </DialogHeader>

      <div class="grid gap-3">
        <div class="grid gap-1.5">
          <Label for="puesto-cargo">{{ t("puesto.cargo") }}</Label>
          <SelectorCatalogo
            v-if="puesto"
            id="puesto-cargo"
            tabla="cargos"
            requerido
            :model-value="puesto.cargo_id"
            @update:model-value="cambiarCargo"
          />
          <SelectorCatalogo v-else id="puesto-cargo" v-model="cargoNuevo" tabla="cargos" requerido />
        </div>
        <div class="grid gap-1.5">
          <Label for="puesto-descripcion">{{ t("puesto.descripcion") }}</Label>
          <Textarea id="puesto-descripcion" v-model="descripcion" @blur="puesto && guardarDescripcion()" />
        </div>

        <template v-if="puesto">
          <EstiloPuesto :puesto="puesto" />

          <label class="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              class="size-4 accent-primary"
              :checked="esJefatura"
              @change="alternarJefatura"
            />
            {{ t("puesto.esJefatura") }}
          </label>

          <section class="grid gap-2 sm:grid-cols-2" :aria-label="t('puesto.vigentes')">
            <div v-for="tipo in TIPOS" :key="tipo" class="grid content-start gap-1 rounded-lg border p-3">
              <h3 class="text-sm font-medium">{{ t(`puesto.tipo.${tipo}`) }}</h3>
              <template v-if="vigentes?.[tipo]">
                <button
                  type="button"
                  class="w-fit rounded text-left text-sm underline focus-visible:outline-2 focus-visible:outline-ring"
                  @click="verPersona(vigentes[tipo]!.trabajador_id)"
                >
                  {{ nombre(vigentes[tipo]!.trabajador_id) }}
                </button>
                <p class="text-xs text-muted-foreground">
                  {{ t("puesto.desdeFecha", { fecha: fecha(vigentes[tipo]!.desde) }) }}
                </p>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  class="w-fit"
                  :aria-label="t('puesto.terminarDe', { nombre: nombre(vigentes[tipo]!.trabajador_id) })"
                  @click="abrirForm('terminar', vigentes[tipo])"
                >
                  {{ t("puesto.accion.terminar") }}
                </Button>
              </template>
              <p v-else-if="tipo === 'titular'" class="text-sm text-amber-700 dark:text-amber-400">
                {{ t("puesto.vacante") }}
              </p>
              <p v-else class="text-sm text-muted-foreground">{{ t("puesto.sinReemplazo") }}</p>
            </div>
          </section>

          <div class="flex flex-wrap gap-2">
            <Button type="button" size="sm" @click="abrirForm('titular')">{{
              t("puesto.accion.titular")
            }}</Button>
            <Button type="button" size="sm" variant="outline" @click="abrirForm('reemplazo')">
              {{ t("puesto.accion.reemplazo") }}
            </Button>
          </div>
          <FormAsignacion
            v-if="accion"
            :key="`${accion.tipo}-${accion.asignacion?.id}`"
            :puesto-id="puesto.id"
            :tipo="accion.tipo"
            :asignacion="accion.asignacion"
            @listo="cerrarForm"
            @cancelar="cerrarForm"
          />

          <section class="grid gap-1.5">
            <h3 class="text-sm font-medium">{{ t("puesto.historial") }}</h3>
            <p v-if="!historial.length" class="text-sm text-muted-foreground">
              {{ t("puesto.sinHistorial") }}
            </p>
            <table v-else class="w-full text-left text-sm">
              <caption class="sr-only">
                {{
                  t("puesto.historial")
                }}
              </caption>
              <thead class="text-xs text-muted-foreground">
                <tr>
                  <th scope="col" class="py-1 pr-2 font-medium">{{ t("puesto.col.tipo") }}</th>
                  <th scope="col" class="py-1 pr-2 font-medium">{{ t("puesto.col.persona") }}</th>
                  <th scope="col" class="py-1 pr-2 font-medium">{{ t("puesto.desde") }}</th>
                  <th scope="col" class="py-1 pr-2 font-medium">{{ t("puesto.hasta") }}</th>
                  <th scope="col" class="py-1 font-medium">{{ t("puesto.motivo") }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="a in historial" :key="a.id" class="border-t">
                  <td class="py-1 pr-2">{{ t(`puesto.tipo.${a.tipo}`) }}</td>
                  <td class="py-1 pr-2">
                    <button
                      type="button"
                      class="rounded underline focus-visible:outline-2 focus-visible:outline-ring"
                      @click="verPersona(a.trabajador_id)"
                    >
                      {{ nombre(a.trabajador_id) }}
                    </button>
                  </td>
                  <td class="py-1 pr-2">{{ fecha(a.desde) }}</td>
                  <td class="py-1 pr-2">{{ a.hasta ? fecha(a.hasta) : t("puesto.vigente") }}</td>
                  <td class="py-1">{{ a.motivo }}</td>
                </tr>
              </tbody>
            </table>
          </section>
        </template>
        <p v-if="errorNuevo" role="alert" class="text-sm text-destructive">{{ errorNuevo }}</p>
      </div>

      <DialogFooter>
        <Button v-if="puesto" type="button" variant="destructive" class="sm:mr-auto" @click="eliminar">
          <Trash2 aria-hidden="true" />
          {{ t("puesto.eliminar") }}
        </Button>
        <Button v-else type="button" @click="crear">{{ t("puesto.crear") }}</Button>
        <DialogClose as-child>
          <Button type="button" variant="outline">{{ t("ficha.cerrar") }}</Button>
        </DialogClose>
      </DialogFooter>
    </DialogContent>
  </Dialog>
  <AlertDialog v-model:open="confirmando">
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>{{ t("puesto.sinGuardarTitulo") }}</AlertDialogTitle>
        <AlertDialogDescription>{{ t("puesto.sinGuardarTexto") }}</AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>{{ t("ficha.seguirEditando") }}</AlertDialogCancel>
        <AlertDialogAction @click="ctl.cerrar()">{{ t("ficha.descartar") }}</AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</template>
