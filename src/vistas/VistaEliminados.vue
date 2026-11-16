<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { toast } from "vue-sonner";
import { ArrowLeft } from "@lucide/vue";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { consultar, leerMeta } from "@/db/cliente";
import {
  SQL_ELIMINADOS_PERSONAS,
  SQL_ELIMINADOS_PUESTOS,
  SQL_ELIMINADOS_UNIDADES,
} from "@/db/repos/eliminados";
import {
  armarEliminados,
  leerSuprimidas,
  type Eliminado,
  type FilaEliminado,
  type TipoEliminado,
} from "@/features/eliminados/eliminados";
import ListaEliminados from "@/features/eliminados/ListaEliminados.vue";
import DialogoSuprimir from "@/features/trabajadores/DialogoSuprimir.vue";
import { useOrganizacion } from "@/stores/organizacion";

const TIPOS: TipoEliminado[] = ["persona", "unidad", "puesto"];
const { t } = useI18n();
const org = useOrganizacion();
const pestana = ref<TipoEliminado>("persona");
const lista = ref<Eliminado[]>([]);
const deTipo = computed(() => (tipo: TipoEliminado) => lista.value.filter((e) => e.tipo === tipo));

async function cargar() {
  try {
    const [persona, unidad, puesto, meta] = await Promise.all([
      consultar<FilaEliminado>(SQL_ELIMINADOS_PERSONAS),
      consultar<FilaEliminado>(SQL_ELIMINADOS_UNIDADES),
      consultar<FilaEliminado>(SQL_ELIMINADOS_PUESTOS),
      leerMeta(),
    ]);
    lista.value = armarEliminados({ persona, unidad, puesto }, leerSuprimidas(meta));
  } catch (e) {
    console.error(e);
    toast.error(t("eliminados.errorCargar"));
  }
}

const porSuprimir = ref<Eliminado | null>(null);
const confirmando = computed({
  get: () => porSuprimir.value !== null,
  set: (v) => v || (porSuprimir.value = null),
});
async function suprimir() {
  const e = porSuprimir.value!;
  const r = await org.suprimirPersona(e.id);
  if (!r.ok) return void toast.error(r.mensaje);
  toast(t("suprimir.suprimida", { nombre: e.nombre }), { duration: 8000 });
  await cargar();
}

async function restaurar(e: Eliminado) {
  const r = await org.restaurarEliminado(e);
  if (!r.ok) {
    toast.error(r.codigo === "correo_en_uso" ? t("eliminados.correoEnUso", { nombre: e.nombre }) : r.mensaje);
    return;
  }
  toast(t("eliminados.restaurado", { nombre: e.nombre }));
  await cargar();
}

onMounted(cargar);
</script>

<template>
  <section class="mx-auto flex max-w-5xl flex-col gap-4 p-6">
    <RouterLink
      to="/configuracion"
      class="flex w-fit items-center gap-1 rounded-md text-sm text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
    >
      <ArrowLeft class="size-4" aria-hidden="true" />
      {{ t("mantenedores.volver") }}
    </RouterLink>
    <h1 class="text-lg font-semibold">{{ t("eliminados.titulo") }}</h1>
    <Tabs v-model="pestana">
      <TabsList :aria-label="t('eliminados.listas')">
        <TabsTrigger v-for="tipo in TIPOS" :key="tipo" :value="tipo">
          {{ t(`eliminados.tabs.${tipo}`) }}
        </TabsTrigger>
      </TabsList>
      <TabsContent v-for="tipo in TIPOS" :key="tipo" :value="tipo" class="pt-4">
        <ListaEliminados
          :filas="deTipo(tipo)"
          :solo-lectura="org.soloLectura"
          @restaurar="restaurar"
          @suprimir="porSuprimir = $event"
        />
      </TabsContent>
    </Tabs>
    <DialogoSuprimir v-model:open="confirmando" :nombre="porSuprimir?.nombre ?? ''" @confirmar="suprimir" />
  </section>
</template>
