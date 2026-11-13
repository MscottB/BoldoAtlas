<script setup lang="ts">
import { computed, nextTick, ref, useTemplateRef } from "vue";
import { useI18n } from "vue-i18n";
import { useRouter } from "vue-router";
import { toast } from "vue-sonner";
import BloquePlegable from "@/components/BloquePlegable.vue";
import { Label } from "@/components/ui/label";
import { formatearFecha } from "@/features/puestos/puestos";
import { usePuesto } from "@/features/puestos/usePuesto";
import { useFicha } from "@/features/trabajadores/useFicha";
import SelectorUnidad from "@/features/unidades/SelectorUnidad.vue";
import { useOrganizacion, type Resultado } from "@/stores/organizacion";
import DialogoBien from "./DialogoBien.vue";
import FilasRevision, { type Accion, type Fila } from "./FilasRevision.vue";
import { focoTras, type Foco } from "./foco";
import { desmarcar } from "./marcas";
import { ramaDe, revisar, type Aviso, type FilaValor, type TipoAviso } from "./revision";
import ResumenRevision from "./ResumenRevision.vue";
import { useAvisos } from "./useAvisos";

const { t, locale } = useI18n();
const router = useRouter();
const puesto = usePuesto();
const ficha = useFicha();
const org = useOrganizacion();
const estado = useAvisos();

const NINGUNA = new Set<string>();
const rama = ref<string | null>(null);
const revision = computed(() =>
  revisar(estado.value.avisos, estado.value.marcas, ramaDe(org.unidades, rama.value)),
);

const unir = (...partes: (string | null | undefined)[]) => partes.filter(Boolean).join(" · ") || undefined;
/** Muestra el error, si lo hay; true si salió bien. */
function avisar(r: Resultado) {
  if (!r.ok) toast.error(r.mensaje);
  return r.ok;
}
const deshacible = (texto: string, deshacer: () => Promise<Resultado>) =>
  toast(texto, {
    duration: 8000,
    action: { label: t("unidad.deshacer"), onClick: async () => avisar(await deshacer()) },
  });

async function eliminar(id: string) {
  if (!avisar(await org.eliminarUnidad(id))) return false;
  deshacible(t("revision.eliminada"), () => org.deshacer());
  return true;
}
async function desactivar({ tabla, id }: FilaValor) {
  const r = await (tabla === "leyendas" ? org.desactivarLeyenda(id) : org.desactivarValor(tabla, id));
  if (!avisar(r)) return false;
  deshacible(t("revision.desactivado"), () =>
    tabla === "leyendas" ? org.reactivarLeyenda(id) : org.reactivarValor(tabla, id),
  );
  return true;
}
// Todo el mapa: guardarMarcasRevision reemplaza el JSON entero.
const volver = async (clave: string) =>
  avisar(await org.guardarMarcasRevision(desmarcar(estado.value.marcas, clave, estado.value.vigentes)));

// Quitar una fila se lleva el botón con el foco: el foco pasa a la fila siguiente, al título de la sección, al de la
// siguiente o al h1. El destino se elige con las secciones de antes del cambio.
const h1 = useTemplateRef("h1");
const ordenSecciones = () =>
  [
    ...secciones.value.map((s) => ({ tipo: s.tipo as string, claves: s.claves })),
    { tipo: "reemplazos", claves: reemplazos.value.map((f) => f.clave) },
    { tipo: "marcados", claves: marcados.value.map((f) => f.clave) },
  ].filter((s) => s.claves.length);
function elementoDe(f: Foco): HTMLElement | null {
  const s = f && document.getElementById(`revision-${f.seccion}`);
  const fila = f?.fila && s?.querySelector<HTMLElement>(`[data-clave="${CSS.escape(f.fila)}"] button`);
  return fila || s?.querySelector("summary") || h1.value;
}
async function quitando(tipo: string, clave: string, hacer: () => Promise<boolean>) {
  const foco = focoTras(ordenSecciones(), tipo, clave);
  if (!(await hacer())) return;
  await nextTick();
  elementoDe(foco)?.focus();
}

const porMarcar = ref<{ clave: string; texto: string } | null>(null);
let focoDialogo: Foco = null;
const respaldoDialogo = () => elementoDe(focoDialogo);

// Con soloLectura no se ofrece nada que cambie datos; ir a ver (ficha, puesto, unidad) sí.
const EDITAN = new Set<Accion["id"]>(["eliminar", "desactivar", "bien", "volver"]);
const accion = (id: Accion["id"], hacer: () => unknown, etiqueta = t(`revision.acciones.${id}`)): Accion => ({
  id,
  etiqueta,
  hacer: () => void hacer(),
});
const permitidas = (acciones: Accion[]) =>
  org.soloLectura ? acciones.filter((a) => !EDITAN.has(a.id)) : acciones;
const abrirFicha = (id: string) => accion("abrir", () => ficha.intentarAbrir(id));

function describir(av: Aviso): { texto: string; detalle?: string } {
  switch (av.tipo) {
    case "sinJefatura":
    case "vacias":
      return { texto: av.fila.nombre, detalle: unir(av.fila.ruta) };
    case "vacantesLargas":
    case "vacantesRecientes":
      return {
        texto: av.fila.cargo,
        detalle: unir(av.fila.unidad, av.fila.dias === null ? null : t("revision.dias", av.fila.dias)),
      };
    case "sinPuesto":
      return { texto: av.fila.nombre };
    case "correos":
      return { texto: av.fila.clave };
    case "nombres":
      return {
        texto: t("revision.nombresGrupo", av.fila.personas.length),
        detalle: av.fila.personas.map((p) => p.nombre).join(", "),
      };
    case "sinUso":
      return { texto: av.fila.nombre, detalle: t(`revision.tablas.${av.fila.tabla}`) };
  }
}

// Los grupos (correos, nombres) son la fila del grupo, con «Así está bien», y una fila por persona.
function filas(av: Aviso): Fila[] {
  const d = describir(av);
  const fila = (...propias: Accion[]): Fila => ({
    clave: av.clave,
    ...d,
    acciones: permitidas([
      ...propias,
      accion("bien", () => {
        focoDialogo = focoTras(ordenSecciones(), av.tipo, av.clave);
        porMarcar.value = { clave: av.clave, texto: unir(d.texto, d.detalle)! };
      }),
    ]),
  });
  switch (av.tipo) {
    case "sinJefatura": {
      const id = av.fila.unidadId;
      // La unidad se abre en el árbol completo, seleccionada y centrada, con su panel para elegir la jefatura.
      return [fila(accion("jefatura", () => router.push({ path: "/", query: { ver: id } })))];
    }
    case "vacias": {
      const id = av.fila.unidadId;
      return [fila(accion("eliminar", () => quitando(av.tipo, av.clave, () => eliminar(id))))];
    }
    case "vacantesLargas":
    case "vacantesRecientes": {
      const id = av.fila.puestoId;
      return [fila(accion("asignar", () => puesto.abrir(id)))];
    }
    case "sinPuesto":
      return [fila(abrirFicha(av.fila.personaId))];
    case "sinUso": {
      const valor = av.fila;
      return [fila(accion("desactivar", () => quitando(av.tipo, av.clave, () => desactivar(valor))))];
    }
    case "correos":
    case "nombres": {
      const conCorreo = av.tipo === "nombres";
      return [
        fila(),
        ...av.fila.personas.map((p) => ({
          clave: `${av.clave}:${p.id}`,
          texto: p.nombre,
          detalle: conCorreo ? (p.correo ?? undefined) : undefined,
          hija: true,
          acciones: [abrirFicha(p.id)],
        })),
      ];
    }
  }
}

// Una sección vacía no se muestra: el resumen ya dice que su nivel está en orden.
const secciones = computed(() =>
  revision.value.secciones
    .filter((s) => s.avisos.length)
    .map((s) => ({
      tipo: s.tipo,
      cuenta: s.avisos.length,
      claves: s.avisos.map((a) => a.clave),
      filas: s.avisos.flatMap(filas),
    })),
);
const reemplazos = computed<Fila[]>(() =>
  revision.value.reemplazos.map((r) => ({
    clave: `${r.puestoId}:${r.personaId}`,
    texto: r.persona,
    detalle: unir(r.cargo, r.unidad),
    acciones: [accion("abrir", () => puesto.abrir(r.puestoId), t("revision.acciones.verPuesto"))],
  })),
);
const marcados = computed<Fila[]>(() =>
  revision.value.marcados.map(({ aviso, marca }) => ({
    clave: aviso.clave,
    // Con su detalle, que distingue avisos de igual texto (dos vacantes del mismo cargo, varios grupos de nombres)
    // también en el aria-label del botón.
    texto: unir(describir(aviso).texto, describir(aviso).detalle)!,
    detalle: t("revision.marca", { motivo: marca.motivo, fecha: formatearFecha(marca.fecha, locale.value) }),
    acciones: permitidas([
      accion("volver", () => quitando("marcados", aviso.clave, () => volver(aviso.clave))),
    ]),
  })),
);

// Desde el resumen: abre la sección (aunque el usuario la haya plegado) y lleva el foco a su título.
const destino = ref<TipoAviso | null>(null);
async function ir(tipo: TipoAviso) {
  destino.value = null; // si ya era el destino, que vuelva a abrirse
  await nextTick();
  destino.value = tipo;
  await nextTick();
  const seccion = document.getElementById(`revision-${tipo}`);
  seccion?.scrollIntoView({ block: "start" });
  seccion?.querySelector("summary")?.focus({ preventScroll: true });
}
</script>

<template>
  <section class="mx-auto flex max-w-4xl flex-col gap-3 p-6">
    <header class="flex flex-wrap items-center gap-2">
      <h1 ref="h1" tabindex="-1" class="text-lg font-semibold">{{ t("revision.titulo") }}</h1>
      <!-- Los de la rama elegida (sin rama, todos); el menú cuenta siempre toda la organización. -->
      <span class="text-sm text-muted-foreground" aria-live="polite">{{
        t("revision.avisos", revision.total - revision.fueraDeRama)
      }}</span>
      <div class="ml-auto flex items-center gap-2">
        <Label for="revision-rama">{{ t("revision.rama") }}</Label>
        <div class="w-56">
          <SelectorUnidad
            id="revision-rama"
            class="h-8"
            :excluidas="NINGUNA"
            :texto="(rama && org.porId.get(rama)?.nombre) || t('revision.todaLaOrganizacion')"
            :ninguna="t('revision.todaLaOrganizacion')"
            @elegir="rama = $event"
          />
        </div>
      </div>
    </header>

    <ResumenRevision :secciones="revision.secciones" @ir="ir" />

    <p v-if="revision.fueraDeRama" class="text-sm text-muted-foreground">
      {{ t("revision.fueraDeRama", revision.fueraDeRama) }}
    </p>

    <BloquePlegable
      v-for="s in secciones"
      :id="`revision-${s.tipo}`"
      :key="s.tipo"
      :data-tipo="s.tipo"
      :clave="`revision.${s.tipo}`"
      abierto-por-defecto
      :abrir="destino === s.tipo"
      class="rounded-lg border bg-card px-3 py-1"
    >
      <template #titulo>
        <h3>{{ t(`revision.${s.tipo}.titulo`) }}</h3>
        <span class="rounded-full bg-muted px-2 text-xs text-foreground">{{ s.cuenta }}</span>
      </template>
      <p class="pb-2 text-sm text-muted-foreground">{{ t(`revision.${s.tipo}.ayuda`) }}</p>
      <FilasRevision class="-mx-3" :filas="s.filas" />
    </BloquePlegable>

    <BloquePlegable
      v-if="reemplazos.length"
      id="revision-reemplazos"
      data-tipo="reemplazos"
      clave="revision.reemplazos"
      class="rounded-lg border bg-card px-3 py-1"
    >
      <template #titulo>
        <h3>{{ t("revision.reemplazos.titulo") }}</h3>
        <span class="rounded-full bg-muted px-2 text-xs text-foreground">{{ reemplazos.length }}</span>
      </template>
      <p class="pb-2 text-sm text-muted-foreground">{{ t("revision.reemplazos.ayuda") }}</p>
      <FilasRevision class="-mx-3" :filas="reemplazos" />
    </BloquePlegable>

    <BloquePlegable
      v-if="marcados.length"
      id="revision-marcados"
      data-tipo="marcados"
      clave="revision.marcados"
      class="rounded-lg border bg-card px-3 py-1"
    >
      <template #titulo>
        <h3>{{ t("revision.marcados") }} ({{ marcados.length }})</h3>
      </template>
      <FilasRevision class="-mx-3" :filas="marcados" />
    </BloquePlegable>

    <DialogoBien :aviso="porMarcar" :respaldo="respaldoDialogo" @cerrar="porMarcar = null" />
  </section>
</template>
