<script setup lang="ts">
import { computed, nextTick, onMounted, ref, useId, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useI18n } from "vue-i18n";
import { ArrowLeftRight } from "@lucide/vue";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { FilaComparada, Presencia } from "@/db/cliente";
import BarraAvance from "@/features/intercambio/BarraAvance.vue";
import { nombreColumna, useAvance } from "@/features/intercambio/intercambio";
import { rutaComparar } from "@/features/proyecto/menuApp";
import { useOrganizaciones } from "@/stores/organizaciones";
import DetalleComparado from "./DetalleComparado.vue";
import { POR_PAGINA, textoPresencia, useComparar } from "./comparar";

// La abierta con la de `?con=`: cuántas unidades, personas y puestos están solo en una o difieren, y cuáles son.
const { t, locale } = useI18n();
const route = useRoute();
const router = useRouter();
const organizaciones = useOrganizaciones();
const comparacion = useComparar();
const { resumen, pagina, detalle, cargando, vencida } = comparacion;
const avance = useAvance(() => comparacion.trabajo.value);
const idLista = useId();

const con = computed(() => (typeof route.query.con === "string" ? route.query.con : ""));
// Con la otra ya abierta no hay nada que comparar: ni se muestra dos veces arriba ni se ofrece comparar de nuevo.
const alla = computed(
  () => organizaciones.lista.find((o) => o.id === con.value && o.id !== organizaciones.idAbierta) ?? null,
);
const puedeDeNuevo = computed(() => !!alla.value);
const nombreAqui = computed(() => organizaciones.nombreAbierta || t("barra.sinNombre"));
const nombreAlla = computed(() => alla.value?.nombre || t("barra.sinNombre"));
const presencia = (p: Presencia) => textoPresencia(p, nombreAqui.value, nombreAlla.value);

const COLUMNAS = [
  { presencia: "solo_aqui", campo: "soloAqui" },
  { presencia: "solo_alla", campo: "soloAlla" },
  { presencia: "difieren", campo: "difieren" },
] as const;
const sinDiferencias = computed(
  () => !!resumen.value?.grupos.every((g) => g.soloAqui + g.soloAlla + g.difieren === 0),
);
const n = (x: number) => x.toLocaleString(locale.value);

const error = ref("");
// Cancelar es una decisión, no un fallo, y sin `?con=` solo falta elegir: se dice sin alarma.
const sinAlarma = ref(false);
const aviso = computed(() => (vencida.value ? t("respaldos.error.comparacion_vencida") : error.value));

const filtro = ref<{ tabla: string | null; presencia: Presencia | null }>({ tabla: null, presencia: null });
const desde = ref(0);
const total = computed(() => pagina.value?.total ?? 0);
const fin = computed(() => Math.min(desde.value + POR_PAGINA, total.value));
const activo = (tabla: string, p: Presencia) => filtro.value.tabla === tabla && filtro.value.presencia === p;
const tituloLista = computed(() => {
  const { tabla, presencia: p } = filtro.value;
  return tabla && p ? `${t(`intercambio.tablas.${tabla}`)} · ${presencia(p)}` : t("comparar.todas");
});
const columnas = (f: FilaComparada) =>
  f.columnas.map((c) => (c === "puestos" ? t("intercambio.tablas.puestos") : nombreColumna(c))).join(", ");

async function cargarPagina() {
  const r = await comparacion.verPagina({ ...filtro.value, desde: desde.value, cuantos: POR_PAGINA });
  error.value = r.ok || vencida.value ? "" : r.mensaje;
}
// Pulsar el número que ya filtra vuelve a la lista completa.
function filtrar(tabla: string | null, p: Presencia | null) {
  filtro.value = tabla && p && !activo(tabla, p) ? { tabla, presencia: p } : { tabla: null, presencia: null };
  desde.value = 0;
  void cargarPagina();
}
function ir(delta: number) {
  desde.value = Math.max(0, desde.value + delta);
  void cargarPagina();
}

let pedida = 0;
async function comparar() {
  const propia = ++pedida;
  error.value = "";
  sinAlarma.value = false;
  filtro.value = { tabla: null, presencia: null };
  desde.value = 0;
  detalleAbierto.value = false;
  const r = await comparacion.comparar(con.value, route.query.de);
  if (propia !== pedida) return; // se pidió otra: esta ya no se muestra
  if (r.ok) return void cargarPagina();
  sinAlarma.value = r.codigo === "cancelado" || r.codigo === "sin_con";
  error.value = r.codigo === "cancelado" ? t("comparar.cancelada") : r.mensaje;
}
onMounted(comparar);
// Contra la que está abierta ahora: la ruta lo anota, para que volver a esta pestaña no la dé por vencida. Compara el watch.
async function compararDeNuevo() {
  await router.replace(rutaComparar(con.value, organizaciones.idAbierta));
}
// Cada navegación a la vista abierta compara: la paleta puede pedir otra, o la misma otra vez (`rutaComparar` fuerza la
// navegación aunque la ruta sea igual, y trae una `query` nueva). Al salir de la vista la `query` también cambia: eso no compara.
watch(
  () => route.query,
  () => {
    if (route.name === "comparar") void comparar();
  },
);

// Al terminar o cancelar, la barra de avance (con su botón) desaparece: el foco no se pierde, va al título.
const titulo = ref<HTMLElement | null>(null);
watch(cargando, async (v) => {
  if (v) return;
  await nextTick();
  if (!document.activeElement || document.activeElement === document.body) titulo.value?.focus();
});

const fila = ref<FilaComparada | null>(null);
const detalleAbierto = ref(false);
const errorDetalle = ref("");
async function abrirDetalle(f: FilaComparada) {
  fila.value = f;
  errorDetalle.value = "";
  detalleAbierto.value = true;
  const r = await comparacion.verDetalle(f.tabla, f.id);
  if (!r.ok) errorDetalle.value = r.mensaje;
}
</script>

<template>
  <section class="mx-auto flex max-w-4xl flex-col gap-6 p-6">
    <header class="grid gap-3">
      <div>
        <h1 ref="titulo" tabindex="-1" class="text-lg font-semibold outline-none">
          {{ t("comparar.titulo") }}
        </h1>
        <p class="text-sm text-muted-foreground">{{ t("comparar.ayuda") }}</p>
      </div>
      <div class="flex flex-wrap items-center gap-2 text-sm">
        <span class="flex min-w-0 items-center gap-2 rounded-lg border px-3 py-1.5">
          <span
            class="size-3 shrink-0 rounded-full"
            :style="{ backgroundColor: organizaciones.abierta?.color }"
            aria-hidden="true"
          />
          <span class="truncate font-medium">{{ nombreAqui }}</span>
          <Badge variant="outline">{{ t("organizaciones.seccion.abierta") }}</Badge>
        </span>
        <template v-if="alla">
          <ArrowLeftRight class="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span class="flex min-w-0 items-center gap-2 rounded-lg border px-3 py-1.5">
            <span
              class="size-3 shrink-0 rounded-full"
              :style="{ backgroundColor: alla.color }"
              aria-hidden="true"
            />
            <span class="truncate font-medium">{{ nombreAlla }}</span>
          </span>
        </template>
      </div>
    </header>

    <BarraAvance
      v-if="cargando"
      :avance="avance"
      cancelable
      :texto="t('comparar.comparando', { nombre: nombreAlla })"
      @cancelar="comparacion.cancelar"
    />

    <div
      v-if="aviso"
      :role="sinAlarma ? 'status' : 'alert'"
      class="grid gap-2 rounded-lg border p-3 text-sm"
      :class="!sinAlarma && 'border-destructive'"
    >
      <p>{{ aviso }}</p>
      <div v-if="puedeDeNuevo">
        <Button type="button" size="sm" @click="compararDeNuevo">{{ t("comparar.compararDeNuevo") }}</Button>
      </div>
    </div>

    <template v-if="resumen && !cargando">
      <!-- Se puede editar la abierta sin salir de la vista (la paleta abre fichas encima): los números envejecen. -->
      <div v-if="puedeDeNuevo && !aviso">
        <Button type="button" variant="outline" size="sm" @click="compararDeNuevo">
          {{ t("comparar.compararDeNuevo") }}
        </Button>
      </div>
      <div v-if="resumen.aproximada" class="grid gap-1 rounded-lg border p-3 text-sm">
        <Badge variant="secondary">{{ t("comparar.aproximada") }}</Badge>
        <p class="text-muted-foreground">
          {{ t("comparar.aproximadaTexto") }} {{ t("comparar.sinCorreo", resumen.sinCorreo) }}
        </p>
      </div>

      <p v-if="sinDiferencias" class="text-sm">{{ t("comparar.sinDiferencias") }}</p>
      <div v-else class="overflow-x-auto rounded-lg border">
        <table class="w-full text-left text-sm">
          <caption class="sr-only">
            {{
              t("comparar.resumen")
            }}
          </caption>
          <thead>
            <tr class="border-b text-xs text-muted-foreground">
              <th scope="col" class="px-3 py-2 font-medium">
                <span class="sr-only">{{ t("comparar.tipo") }}</span>
              </th>
              <th
                v-for="col in COLUMNAS"
                :key="col.presencia"
                scope="col"
                class="px-3 py-2 text-right font-medium"
              >
                {{ presencia(col.presencia) }}
              </th>
            </tr>
          </thead>
          <tbody class="divide-y">
            <tr v-for="g in resumen.grupos" :key="g.tabla">
              <th scope="row" class="px-3 py-1 font-normal">{{ t(`intercambio.tablas.${g.tabla}`) }}</th>
              <td v-for="col in COLUMNAS" :key="col.presencia" class="px-3 py-1 text-right">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  class="tabular-nums aria-pressed:bg-muted aria-pressed:font-semibold"
                  :disabled="!g[col.campo]"
                  :aria-pressed="activo(g.tabla, col.presencia)"
                  @click="filtrar(g.tabla, col.presencia)"
                >
                  {{ n(g[col.campo]) }}
                </Button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p class="text-sm text-muted-foreground">{{ t("comparar.iguales", { n: n(resumen.iguales) }) }}</p>

      <section v-if="!sinDiferencias" :aria-labelledby="idLista" class="grid gap-2">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <h2 :id="idLista" class="text-base font-semibold">{{ tituloLista }}</h2>
          <Button v-if="filtro.tabla" type="button" variant="ghost" size="sm" @click="filtrar(null, null)">
            {{ t("comparar.verTodas") }}
          </Button>
        </div>
        <p v-if="pagina && !pagina.filas.length" class="text-sm text-muted-foreground">
          {{ t("intercambio.revisar.sinFilas") }}
        </p>
        <ul class="grid gap-1">
          <li v-for="f in pagina?.filas ?? []" :key="`${f.tabla}:${f.id}`">
            <button
              type="button"
              aria-haspopup="dialog"
              class="flex w-full flex-wrap items-center gap-x-3 gap-y-1 rounded-md border px-3 py-2 text-left text-sm hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"
              @click="abrirDetalle(f)"
            >
              <span class="min-w-0 font-medium break-words">{{
                f.nombre || t("intercambio.revisar.sinNombre")
              }}</span>
              <span class="text-xs text-muted-foreground">{{ t(`intercambio.tablas.${f.tabla}`) }}</span>
              <Badge variant="outline">{{ presencia(f.presencia) }}</Badge>
              <Badge v-if="f.aproximada" variant="secondary">{{ t("comparar.aproximada") }}</Badge>
              <span v-if="f.columnas.length" class="text-xs text-muted-foreground">{{ columnas(f) }}</span>
            </button>
          </li>
        </ul>
        <nav
          v-if="total > POR_PAGINA"
          class="flex flex-wrap items-center gap-2 text-sm"
          :aria-label="t('intercambio.revisar.paginas')"
        >
          <Button type="button" variant="outline" size="sm" :disabled="desde === 0" @click="ir(-POR_PAGINA)">
            {{ t("intercambio.revisar.anterior") }}
          </Button>
          <Button type="button" variant="outline" size="sm" :disabled="fin >= total" @click="ir(POR_PAGINA)">
            {{ t("intercambio.revisar.siguiente") }}
          </Button>
          <span aria-live="polite" class="text-muted-foreground tabular-nums">
            {{ t("intercambio.revisar.rango", { desde: n(desde + 1), hasta: n(fin), total: n(total) }) }}
          </span>
        </nav>
      </section>
    </template>

    <DetalleComparado
      v-model:open="detalleAbierto"
      :fila="fila"
      :detalle="detalle"
      :error="errorDetalle"
      :nombre-aqui="nombreAqui"
      :nombre-alla="nombreAlla"
    />
  </section>
</template>
