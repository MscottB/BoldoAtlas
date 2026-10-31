<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { useRouter } from "vue-router";
import { usePuesto } from "@/features/puestos/usePuesto";
import { useFicha } from "@/features/trabajadores/useFicha";
import type { PersonaRef } from "./revision";
import { useAvisos } from "./useAvisos";
import BloquePlegable from "@/components/BloquePlegable.vue";
import FilasRevision, { type Fila } from "./FilasRevision.vue";

const { t } = useI18n();
const router = useRouter();
const puesto = usePuesto();
const ficha = useFicha();
const resumen = useAvisos();

const unir = (...partes: (string | null | undefined)[]) => partes.filter(Boolean).join(" · ");
// La unidad se abre en el árbol completo, seleccionada y centrada (con su panel).
const verUnidad = (id: string) => router.push({ path: "/", query: { ver: id } });
const filaPersona = (clave: string, p: PersonaRef, detalle?: string): Fila => ({
  clave: `${clave}:${p.id}`,
  texto: p.nombre,
  detalle,
  abrir: () => void ficha.intentarAbrir(p.id),
  hija: true,
});

const secciones = computed<{ clave: string; cuenta: number; filas: Fila[] }[]>(() => {
  const a = resumen.value.avisos;
  const unidad = (f: { unidadId: string; nombre: string; ruta: string }): Fila => ({
    clave: f.unidadId,
    texto: f.nombre,
    detalle: f.ruta,
    abrir: () => void verUnidad(f.unidadId),
  });
  return [
    { clave: "sinJefatura", cuenta: a.sinJefatura.length, filas: a.sinJefatura.map(unidad) },
    {
      clave: "vacantes",
      cuenta: a.vacantes.length,
      filas: a.vacantes.map((f) => ({
        clave: f.puestoId,
        texto: f.cargo,
        detalle: unir(f.unidad, f.dias === null ? null : t("revision.dias", f.dias)),
        abrir: () => puesto.abrir(f.puestoId),
      })),
    },
    {
      clave: "reemplazos",
      cuenta: a.reemplazos.length,
      filas: a.reemplazos.map((f) => ({
        clave: `${f.puestoId}:${f.personaId}`,
        texto: f.persona,
        detalle: unir(f.cargo, f.unidad),
        abrir: () => puesto.abrir(f.puestoId),
      })),
    },
    {
      clave: "sinPuesto",
      cuenta: a.sinPuesto.length,
      filas: a.sinPuesto.map((f) => ({
        clave: f.personaId,
        texto: f.nombre,
        abrir: () => void ficha.intentarAbrir(f.personaId),
      })),
    },
    {
      clave: "correos",
      cuenta: a.correos.length,
      filas: a.correos.flatMap((g) => [
        { clave: g.clave, texto: g.clave },
        ...g.personas.map((p) => filaPersona(g.clave, p)),
      ]),
    },
    {
      clave: "nombres",
      cuenta: a.nombres.length,
      filas: a.nombres.flatMap((g) => [
        { clave: g.clave, texto: t("revision.nombresGrupo", g.personas.length) },
        ...g.personas.map((p) => filaPersona(g.clave, p, p.correo ?? undefined)),
      ]),
    },
    { clave: "vacias", cuenta: a.vacias.length, filas: a.vacias.map(unidad) },
    {
      clave: "sinUso",
      cuenta: a.sinUso.length,
      filas: a.sinUso.map((f) => ({
        clave: `${f.tabla}:${f.id}`,
        texto: f.nombre,
        detalle: t(`revision.tablas.${f.tabla}`),
      })),
    },
  ];
});
// Primero lo que tiene avisos (en su orden de siempre); lo que está en orden, agrupado al final.
const conAvisos = computed(() => secciones.value.filter((s) => s.filas.length));
const enOrden = computed(() => secciones.value.filter((s) => !s.filas.length));
</script>

<template>
  <section class="mx-auto flex max-w-4xl flex-col gap-3 p-6">
    <header class="flex flex-wrap items-baseline gap-2">
      <h1 class="text-lg font-semibold">{{ t("revision.titulo") }}</h1>
      <span class="text-sm text-muted-foreground" aria-live="polite">{{
        t("revision.avisos", resumen.total)
      }}</span>
    </header>

    <details v-for="s in conAvisos" :key="s.clave" open class="rounded-lg border bg-card">
      <summary
        class="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 font-medium focus-visible:outline-2 focus-visible:outline-ring"
      >
        {{ t(`revision.${s.clave}.titulo`) }}
        <span class="rounded-full bg-muted px-2 text-xs text-foreground">{{ s.cuenta }}</span>
      </summary>
      <p class="px-3 pb-2 text-sm text-muted-foreground">{{ t(`revision.${s.clave}.ayuda`) }}</p>
      <FilasRevision :filas="s.filas" />
    </details>

    <!-- Lo que está en orden va junto al final, en una línea que se despliega. -->
    <BloquePlegable
      v-if="enOrden.length"
      clave="revision.enOrden"
      class="rounded-lg border bg-card px-3 py-1"
    >
      <template #titulo>
        <span class="min-w-0">
          {{ t("revision.sinAvisos") }}
          <span class="text-sm font-normal text-muted-foreground">{{
            enOrden.map((s) => t(`revision.${s.clave}.titulo`)).join(" · ")
          }}</span>
        </span>
      </template>
      <ul class="grid gap-2 pb-2 pl-5 text-sm">
        <li v-for="s in enOrden" :key="s.clave">
          <span class="font-medium">{{ t(`revision.${s.clave}.titulo`) }}</span>
          · {{ t("revision.todoEnOrden") }}
          <p class="text-muted-foreground">{{ t(`revision.${s.clave}.ayuda`) }}</p>
        </li>
      </ul>
    </BloquePlegable>
  </section>
</template>
