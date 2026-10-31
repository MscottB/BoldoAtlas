<script setup lang="ts">
import { computed, nextTick, ref, useId, useTemplateRef, watch } from "vue";
import { useI18n } from "vue-i18n";
import { useRouter } from "vue-router";
import { toast } from "vue-sonner";
import { useVirtualList } from "@vueuse/core";
import { ArrowLeft, Mail, SquareArrowOutUpRight, Table } from "@lucide/vue";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Unidad } from "@/db/tipos";
import { rutaTexto } from "@/features/arbol/jerarquia";
import { useLienzo } from "@/features/arbol/useLienzo";
import { formatearFecha, type FilaPersona } from "@/features/puestos/puestos";
import { useFicha } from "@/features/trabajadores/useFicha";
import { useRetornoFoco } from "@/lib/foco";
import { iniciales } from "@/lib/texto";
import { useOrganizacion } from "@/stores/organizacion";
import {
  correosUnicos,
  filtrarPersonasUnidad,
  personasDelAlcance,
  puestosDelAlcance,
  puestosDePersona,
  resumenPorCargo,
  type FilaPersonaUnidad,
  type OrdenPersonas,
} from "./personas";

// Pestaña Personas del panel: quién ocupa los puestos de la unidad (o de su rama), hoy o el día que muestra el lienzo.
const props = defineProps<{ unidad: Unidad }>();
const { t, locale } = useI18n();
const org = useOrganizacion();
const router = useRouter();
const ficha = useFicha();
const uid = useId();

// La dotación de la tarjeta es la de la rama: por eso la lista parte con las subunidades. Las caras de la tarjeta piden
// solo la unidad (ramaPersonas); otra unidad sin pedido vuelve a la rama.
const { ramaPersonas } = useLienzo();
const conRama = ref(true);
watch(
  [() => props.unidad.id, ramaPersonas],
  ([id, pedido], antes) => {
    if (pedido !== null) {
      conRama.value = pedido;
      ramaPersonas.value = null;
    } else if (id !== antes?.[0]) conRama.value = true;
  },
  { immediate: true },
);
const texto = ref("");
const orden = ref<OrdenPersonas>("nombre");

const alcance = computed(() =>
  puestosDelAlcance(org.enFecha.unidades, org.enFecha.puestos, props.unidad.id, conRama.value),
);
const todas = computed(() =>
  personasDelAlcance(
    alcance.value,
    org.enFecha.vigentes,
    org.enFecha.trabajadores,
    org.catalogos.cargos,
    org.enFecha.porId,
  ),
);
const filas = computed(() => filtrarPersonasUnidad(todas.value, texto.value, orden.value));
const resumen = computed(() => resumenPorCargo(alcance.value, org.enFecha.vigentes, org.catalogos.cargos));

// Con 10.000 personas en una rama raíz, solo las filas a la vista van al DOM (como en el directorio). Todas miden lo
// mismo (dos líneas truncadas): se mide la primera dibujada, que cambia con la escala.
const altoFila = ref(49);
const {
  list: ventana,
  containerProps,
  wrapperProps,
} = useVirtualList(filas, {
  itemHeight: () => altoFila.value,
  overscan: 10,
});
const lista = useTemplateRef<HTMLElement>("lista");
watch(
  ventana,
  () => {
    const fila = lista.value?.children[0];
    if (fila) altoFila.value = fila.getBoundingClientRect().height;
  },
  { flush: "post" },
);

async function copiarCorreos() {
  const correos = correosUnicos(filas.value);
  if (!correos.length) return void toast.info(t("personas.sinCorreos"));
  try {
    await navigator.clipboard.writeText(correos.join("; "));
    toast.success(t("personas.correosCopiados", correos.length));
  } catch (e) {
    toast.error(t("personas.errorCopiar", { detalle: String(e) }));
  }
}

// El directorio es de hoy: si la unidad ya no existe, no hay a dónde ir.
const enDirectorio = computed(() => org.porId.has(props.unidad.id));
const verEnDirectorio = () => router.push({ name: "directorio", query: { unidad: props.unidad.id } });

// Vista previa: tapa la lista (que queda inerte y conserva su desplazamiento) hasta que se vuelve.
const previa = ref<FilaPersonaUnidad | null>(null);
const persona = computed(() => org.enFecha.trabajadores.find((w) => w.id === previa.value?.personaId));
const susPuestos = computed(() =>
  previa.value
    ? puestosDePersona(
        org.enFecha.puestos,
        org.enFecha.asignaciones,
        previa.value.personaId,
        org.fechaVista ?? undefined,
      )
    : { vigentes: [], cerradas: [] },
);
// A una fecha, un puesto que terminó después se lee como vigente ese día.
function textoPuesto({ asignacion: a, puesto: p }: FilaPersona, cerrado: boolean) {
  const fecha = (iso: string) => formatearFecha(iso, locale.value);
  return t(cerrado ? "ficha.puestoCerrado" : "ficha.puestoVigente", {
    cargo: org.catalogos.cargos.find((c) => c.id === p.cargo_id)?.nombre ?? "",
    unidad: rutaTexto(org.enFecha.unidades, p.unidad_id),
    tipo: t(`puesto.tipo.${a.tipo}`),
    desde: fecha(a.desde),
    hasta: a.hasta ? fecha(a.hasta) : "",
  });
}

const retorno = useRetornoFoco();
const titulo = useTemplateRef<HTMLElement>("titulo");
const buscador = useTemplateRef<InstanceType<typeof Input>>("buscador");
async function abrirPrevia(f: FilaPersonaUnidad) {
  retorno.alAbrir(); // la fila pulsada
  previa.value = f;
  await nextTick();
  titulo.value?.focus();
}
async function volver() {
  previa.value = null;
  await nextTick(); // la lista deja de estar inerte
  retorno.restaurar((buscador.value?.$el as HTMLElement | undefined) ?? null);
}
// Otra unidad o la persona ya no está (otra fecha, eliminada): de vuelta a la lista.
watch(
  () => props.unidad.id,
  () => previa.value && void volver(),
);
watch(persona, (w) => previa.value && !w && void volver());
</script>

<template>
  <div class="relative flex min-h-0 flex-1 flex-col pt-2">
    <div :inert="!!previa" class="flex min-h-0 flex-1 flex-col gap-2">
      <div class="flex flex-wrap items-center gap-2" role="search" :aria-label="t('personas.filtros')">
        <Input
          ref="buscador"
          v-model="texto"
          type="search"
          class="h-8 min-w-32 flex-1"
          :aria-label="t('personas.buscar')"
          :placeholder="t('personas.buscar')"
        />
        <select
          v-model="orden"
          class="h-8 rounded-lg border bg-background px-2 text-sm focus-visible:outline-2 focus-visible:outline-ring"
          :aria-label="t('personas.ordenar')"
        >
          <option v-for="o in ['nombre', 'cargo', 'unidad'] as const" :key="o" :value="o">
            {{ t(`personas.orden.${o}`) }}
          </option>
        </select>
      </div>
      <div class="flex flex-wrap items-center gap-x-3 gap-y-2">
        <label class="flex items-center gap-2 text-sm">
          <input v-model="conRama" type="checkbox" class="size-4 accent-primary" />
          {{ t("personas.incluirSubunidades") }}
        </label>
        <Button type="button" variant="outline" size="sm" @click="copiarCorreos">
          <Mail aria-hidden="true" />
          {{ t("personas.copiarCorreos") }}
        </Button>
        <Button v-if="enDirectorio" type="button" variant="outline" size="sm" @click="verEnDirectorio">
          <Table aria-hidden="true" />
          {{ t("personas.verEnDirectorio") }}
        </Button>
      </div>

      <details v-if="resumen.length" class="text-sm">
        <summary class="w-fit cursor-pointer rounded focus-visible:outline-2 focus-visible:outline-ring">
          {{ t("personas.resumenCargo") }}
        </summary>
        <ul class="mt-1 grid gap-0.5">
          <li v-for="r in resumen" :key="r.cargoId" class="flex justify-between gap-2">
            <span class="truncate">{{ r.cargo }}</span>
            <span class="shrink-0 text-muted-foreground">
              {{ t("personas.nPuestos", r.puestos) }}
              <template v-if="r.vacantes">
                ·
                <span class="text-amber-800 dark:text-amber-400">{{
                  t("personas.nVacantes", r.vacantes)
                }}</span>
                <template v-if="r.cubiertas"> ({{ t("personas.nCubiertas", r.cubiertas) }})</template>
              </template>
            </span>
          </li>
        </ul>
      </details>

      <p class="text-xs text-muted-foreground" aria-live="polite">
        {{ t("personas.cantidad", filas.length) }}
      </p>
      <p v-if="!filas.length" class="text-sm text-muted-foreground">
        {{ todas.length ? t("personas.sinResultados") : t("personas.vacia") }}
      </p>
      <div v-else v-bind="containerProps" class="min-h-40 flex-1 overflow-auto rounded-lg border">
        <ul ref="lista" v-bind="wrapperProps" :aria-label="t('personas.lista')">
          <li
            v-for="{ data: f, index } in ventana"
            :key="f.clave"
            :aria-setsize="filas.length"
            :aria-posinset="index + 1"
            class="border-b last:border-b-0"
          >
            <button
              type="button"
              class="flex w-full items-center gap-2 px-2 py-1.5 text-left hover:bg-accent focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
              @click="abrirPrevia(f)"
            >
              <img
                v-if="f.foto"
                :src="`data:image/png;base64,${f.foto}`"
                alt=""
                class="size-8 shrink-0 rounded-full object-cover"
              />
              <span
                v-else
                class="grid size-8 shrink-0 place-items-center rounded-full bg-muted text-xs"
                aria-hidden="true"
              >
                {{ iniciales(f.nombre) }}
              </span>
              <span class="grid min-w-0 flex-1">
                <span class="truncate font-medium">{{ f.nombre }}</span>
                <span class="truncate text-xs text-muted-foreground">
                  {{ f.cargo }} · {{ t(`puesto.tipo.${f.tipo}`) }} · {{ f.unidad }}
                </span>
              </span>
            </button>
          </li>
        </ul>
      </div>
    </div>

    <section
      v-if="previa"
      class="absolute inset-0 grid content-start gap-3 overflow-y-auto bg-background pt-2"
      :aria-labelledby="`${uid}-previa`"
      @keydown.esc.stop="volver"
    >
      <Button type="button" variant="ghost" size="sm" class="justify-self-start" @click="volver">
        <ArrowLeft aria-hidden="true" />
        {{ t("personas.volver") }}
      </Button>
      <div class="flex items-center gap-3">
        <img
          v-if="persona?.foto_png"
          :src="`data:image/png;base64,${persona.foto_png}`"
          alt=""
          class="size-14 shrink-0 rounded-full object-cover"
        />
        <span
          v-else
          class="grid size-14 shrink-0 place-items-center rounded-full bg-muted text-lg"
          aria-hidden="true"
        >
          {{ iniciales(previa.nombre) }}
        </span>
        <h3
          :id="`${uid}-previa`"
          ref="titulo"
          tabindex="-1"
          class="min-w-0 rounded text-base font-semibold break-words focus-visible:outline-2 focus-visible:outline-ring"
        >
          {{ persona?.nombre ?? previa.nombre }}
        </h3>
      </div>
      <dl class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
        <dt class="text-muted-foreground">{{ t("ficha.correo") }}</dt>
        <dd class="break-all">{{ persona?.correo || "—" }}</dd>
        <dt class="text-muted-foreground">{{ t("ficha.telefono") }}</dt>
        <dd>{{ persona?.telefono || "—" }}</dd>
      </dl>
      <div class="grid gap-1 text-sm">
        <h4 class="font-medium">{{ t("ficha.puestos") }}</h4>
        <ul v-if="susPuestos.vigentes.length" class="grid gap-0.5">
          <li v-for="f in susPuestos.vigentes" :key="f.asignacion.id">{{ textoPuesto(f, false) }}</li>
        </ul>
        <p v-else class="text-muted-foreground">{{ t("ficha.sinPuestos") }}</p>
        <details v-if="susPuestos.cerradas.length">
          <summary class="w-fit cursor-pointer rounded focus-visible:outline-2 focus-visible:outline-ring">
            {{ t("ficha.historialPuestos", { n: susPuestos.cerradas.length }) }}
          </summary>
          <ul class="mt-1 grid gap-0.5">
            <li v-for="f in susPuestos.cerradas" :key="f.asignacion.id">{{ textoPuesto(f, true) }}</li>
          </ul>
        </details>
      </div>
      <Button
        type="button"
        size="sm"
        class="justify-self-start"
        @click="ficha.intentarAbrir(previa.personaId)"
      >
        <SquareArrowOutUpRight aria-hidden="true" />
        {{ t("personas.abrirFicha") }}
      </Button>
    </section>
  </div>
</template>
