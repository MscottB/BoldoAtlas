<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { toast } from "vue-sonner";
import { Pencil, Plus, SquareDashed, Trash2 } from "@lucide/vue";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { Zona } from "@/db/tipos";
import { useOrganizacion, type Resultado } from "@/stores/organizacion";

// Zonas desde la selección múltiple: cada zona con cuántas de las seleccionadas tiene, agregar y quitar; editar y crear se abren a pedido.
const props = defineProps<{ ids: string[] }>();
const { t } = useI18n();
const org = useOrganizacion();
const avisar = (r: Resultado) => !r.ok && toast.error(r.mensaje);

const abierto = ref(false);
const filas = computed(() =>
  org.zonas.map((zona) => {
    const dentro = new Set(org.zonaUnidades.filter((x) => x.zona_id === zona.id).map((x) => x.unidad_id));
    return { zona, estan: props.ids.filter((id) => dentro.has(id)).length };
  }),
);

// Colores que se distinguen entre sí, para proponer uno que no se esté usando; se puede cambiar en el formulario.
const COLORES = ["#0f766e", "#b45309", "#7c3aed", "#be123c", "#2563eb", "#4d7c0f"];
// El formulario de una zona: `id` null es una nueva.
const formulario = ref<{ id: string | null; nombre: string; color: string } | null>(null);
const nueva = () =>
  (formulario.value = {
    id: null,
    nombre: "",
    color: COLORES.find((c) => !org.zonas.some((z) => z.color === c)) ?? COLORES[0],
  });
// Sin ninguna zona todavía, lo único que hay que hacer es crear la primera.
watch(abierto, (si) => (si && !org.zonas.length ? nueva() : (formulario.value = null)));

async function guardar() {
  const f = formulario.value;
  if (!f) return;
  if (f.id) {
    const r = await org.editarZona(f.id, { nombre: f.nombre, color: f.color });
    if (!r.ok) return void toast.error(r.mensaje);
  } else {
    const r = await org.crearZona(f.nombre, f.color, props.ids);
    if (!r.ok && !r.existente) return void toast.error(r.mensaje);
    if (!r.ok && r.existente) {
      // Ya hay una con ese nombre: se usa esa, sin duplicar.
      toast.info(t("ficha.selector.yaExistia", { nombre: org.zonas.find((x) => x.id === r.existente)?.nombre }));
      avisar(await org.agregarAZona(props.ids, r.existente));
    }
  }
  formulario.value = null;
}

async function eliminar(zona: Zona) {
  const r = await org.eliminarZona(zona.id);
  if (!r.ok) return void toast.error(r.mensaje);
  formulario.value = null;
  toast(t("zonas.eliminada", { nombre: zona.nombre }), {
    duration: 8000,
    action: { label: t("unidad.deshacer"), onClick: async () => avisar(await org.deshacer()) },
  });
}
</script>

<template>
  <Popover v-model:open="abierto">
    <PopoverTrigger as-child>
      <Button type="button" variant="outline" size="sm">
        <SquareDashed aria-hidden="true" />
        {{ t("zonas.boton") }}
      </Button>
    </PopoverTrigger>
    <PopoverContent align="start" class="grid max-h-[70vh] w-96 gap-2 overflow-y-auto p-3 text-sm">
      <ul v-if="filas.length" class="grid gap-1" :aria-label="t('zonas.titulo')">
        <li v-for="{ zona, estan } in filas" :key="zona.id" class="flex items-center gap-1.5">
          <span class="size-3 shrink-0 rounded-sm border" :style="{ background: zona.color }" aria-hidden="true" />
          <span class="min-w-0 flex-1 truncate" :title="zona.nombre">{{ zona.nombre }}</span>
          <span class="shrink-0 text-xs text-muted-foreground">
            {{ t("zonas.cuantas", { n: estan, total: ids.length }) }}
          </span>
          <Button
            v-if="estan < ids.length"
            type="button"
            variant="outline"
            size="xs"
            :aria-label="t('zonas.agregarA', { nombre: zona.nombre })"
            @click="async () => avisar(await org.agregarAZona(ids, zona.id))"
          >
            {{ t("zonas.agregar") }}
          </Button>
          <Button
            v-if="estan"
            type="button"
            variant="outline"
            size="xs"
            :aria-label="t('zonas.quitarDe', { nombre: zona.nombre })"
            @click="async () => avisar(await org.quitarDeZona(ids, zona.id))"
          >
            {{ t("zonas.quitar") }}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            :aria-label="t('zonas.editar', { nombre: zona.nombre })"
            :title="t('zonas.editar', { nombre: zona.nombre })"
            @click="formulario = { id: zona.id, nombre: zona.nombre, color: zona.color }"
          >
            <Pencil aria-hidden="true" />
          </Button>
        </li>
      </ul>
      <form
        v-if="formulario"
        class="flex flex-wrap items-center gap-2 border-t pt-2 first:border-t-0 first:pt-0"
        @submit.prevent="guardar"
        @keydown.esc.stop="formulario = null"
      >
        <Input
          v-model="formulario.nombre"
          class="h-8 min-w-32 flex-1"
          autocomplete="off"
          :aria-label="t('zonas.nombre')"
          :placeholder="t('zonas.nombre')"
        />
        <input
          v-model="formulario.color"
          type="color"
          class="h-8 w-12 cursor-pointer rounded-lg border bg-transparent p-0.5 focus-visible:outline-2 focus-visible:outline-ring"
          :aria-label="t('zonas.color')"
        />
        <Button type="submit" size="sm" :disabled="!formulario.nombre.trim()">
          {{ formulario.id ? t("zonas.guardar") : t("zonas.crear") }}
        </Button>
        <Button
          v-if="formulario.id"
          type="button"
          variant="destructive"
          size="sm"
          @click="eliminar(org.zonas.find((x) => x.id === formulario!.id)!)"
        >
          <Trash2 aria-hidden="true" />
          {{ t("zonas.eliminar") }}
        </Button>
      </form>
      <Button v-else type="button" variant="outline" size="sm" class="justify-self-start" @click="nueva">
        <Plus aria-hidden="true" />
        {{ t("zonas.nueva") }}
      </Button>
    </PopoverContent>
  </Popover>
</template>
