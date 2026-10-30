<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { useRouter } from "vue-router";
import { usePuesto } from "@/features/puestos/usePuesto";
import { useFicha } from "@/features/trabajadores/useFicha";
import type { PersonaRef } from "./revision";
import { useAvisos } from "./useAvisos";

const { t } = useI18n();
const router = useRouter();
const puesto = usePuesto();
const ficha = useFicha();
const resumen = useAvisos();

// Fila plana: los grupos (correos, nombres) son una fila de encabezado y una por persona.
interface Fila {
  clave: string;
  texto: string;
  detalle?: string;
  /** Sin `abrir` la fila es solo texto (los valores sin uso no tienen adónde llevar todavía). */
  abrir?: () => void;
  hija?: boolean;
}

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
</script>

<template>
  <section class="mx-auto flex max-w-4xl flex-col gap-3 p-6">
    <header class="flex flex-wrap items-baseline gap-2">
      <h1 class="text-lg font-semibold">{{ t("revision.titulo") }}</h1>
      <span class="text-sm text-muted-foreground" aria-live="polite">{{ t("revision.avisos", resumen.total) }}</span>
    </header>

    <details v-for="s in secciones" :key="s.clave" open class="rounded-lg border">
      <summary
        class="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 font-medium focus-visible:outline-2 focus-visible:outline-ring"
      >
        {{ t(`revision.${s.clave}.titulo`) }}
        <span class="rounded-full bg-muted px-2 text-xs text-muted-foreground">{{ s.cuenta }}</span>
      </summary>
      <p class="px-3 pb-2 text-sm text-muted-foreground">{{ t(`revision.${s.clave}.ayuda`) }}</p>
      <p v-if="!s.filas.length" class="border-t px-3 py-2 text-sm">{{ t("revision.todoEnOrden") }}</p>
      <ul v-else class="border-t">
        <li v-for="f in s.filas" :key="f.clave" class="text-sm" :class="f.hija && 'pl-6'">
          <component
            :is="f.abrir ? 'button' : 'div'"
            v-bind="f.abrir ? { type: 'button', onClick: f.abrir } : {}"
            class="flex w-full items-baseline gap-2 px-3 py-1.5 text-left"
            :class="
              f.abrir
                ? 'hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring'
                : !f.hija && 'font-medium'
            "
          >
            <span>{{ f.texto }}</span>
            <span v-if="f.detalle" class="text-muted-foreground">{{ f.detalle }}</span>
          </component>
        </li>
      </ul>
    </details>
  </section>
</template>
