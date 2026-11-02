<script lang="ts">
import { ref, shallowRef } from "vue";
import type { Candidata, Resultado } from "./optimizarFotos";

// A nivel de módulo: el trabajo sigue si se sale de Configuración, y al volver se ve cómo va.
type Etapa = "reposo" | "estimando" | "confirmar" | "respaldo" | "optimizando" | "compactando";
const etapa = ref<Etapa>("reposo");
const candidatas = shallowRef<Candidata[]>([]);
const estimacion = shallowRef<{ fotos: number; total: number; quedarian: number } | null>(null);
const hechas = ref(0);
const cancelando = ref(false);
const resultado = shallowRef<(Resultado & { ahorro: number }) | null>(null);
const sinNada = ref(false);
</script>

<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { toast } from "vue-sonner";
import { Images } from "@lucide/vue";
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
import { respaldarAntesDeReemplazar } from "@/db/cliente";
import { mensajeFallo } from "@/features/respaldos/respaldos";
import { tamano } from "@/lib/formato";
import { conTrabajo } from "@/lib/trabajos";
import { bytesEnFotos, compactar, estimar, leerCandidatas, optimizarTodas, PASOS } from "./optimizarFotos";

const { t, locale } = useI18n();

const ocupado = computed(() => etapa.value !== "reposo" && etapa.value !== "confirmar");
const confirmando = computed({
  get: () => etapa.value === "confirmar",
  set: (v) => {
    if (!v && etapa.value === "confirmar") etapa.value = "reposo";
  },
});

async function preparar() {
  resultado.value = null;
  sinNada.value = false;
  etapa.value = "estimando";
  try {
    candidatas.value = await leerCandidatas();
    if (!candidatas.value.length) {
      sinNada.value = true;
      etapa.value = "reposo";
      return;
    }
    estimacion.value = await estimar(candidatas.value, PASOS);
    etapa.value = "confirmar";
  } catch (e) {
    etapa.value = "reposo";
    toast.error(mensajeFallo(e));
  }
}

async function optimizar() {
  hechas.value = 0;
  cancelando.value = false;
  etapa.value = "respaldo";
  try {
    await conTrabajo(t("trabajos.optimizarFotos"), async () => {
      await respaldarAntesDeReemplazar(); // sin respaldo no se toca ninguna foto
      etapa.value = "optimizando";
      const antes = await bytesEnFotos();
      const r = await optimizarTodas(candidatas.value, PASOS, {
        cancelado: () => cancelando.value,
        alAvanzar: (n) => (hechas.value = n),
      });
      etapa.value = "compactando";
      if (r.optimizadas) await compactar();
      resultado.value = { ...r, ahorro: Math.max(0, antes - (await bytesEnFotos())) };
    });
  } catch (e) {
    toast.error(mensajeFallo(e));
  } finally {
    etapa.value = "reposo";
  }
}

const tam = (bytes: number) => tamano(bytes, locale.value);
</script>

<template>
  <section class="grid gap-2" aria-labelledby="cfg-fotos">
    <h2 id="cfg-fotos" class="font-medium">{{ t("config.fotos.titulo") }}</h2>
    <p class="text-sm text-muted-foreground">{{ t("config.fotos.ayuda") }}</p>
    <Button type="button" variant="outline" class="w-fit" :disabled="ocupado" @click="preparar">
      <Images aria-hidden="true" />
      {{ t("config.fotos.optimizar") }}
    </Button>

    <p v-if="etapa === 'estimando'" role="status" class="text-sm text-muted-foreground">
      {{ t("config.fotos.estimando") }}
    </p>
    <p v-if="sinNada" role="status" class="text-sm">{{ t("config.fotos.nadaQueHacer") }}</p>

    <div v-if="ocupado && etapa !== 'estimando'" class="grid gap-2">
      <progress
        class="h-2 w-full max-w-sm accent-primary"
        :max="candidatas.length"
        :value="hechas"
        :aria-label="t('config.fotos.avanceEtiqueta')"
      />
      <p role="status" class="text-sm text-muted-foreground">
        {{
          etapa === "optimizando"
            ? t("config.fotos.avance", { n: hechas, total: candidatas.length })
            : t(`config.fotos.${etapa}`)
        }}
      </p>
      <Button
        v-if="etapa === 'optimizando'"
        type="button"
        variant="outline"
        size="sm"
        class="w-fit"
        :disabled="cancelando"
        @click="cancelando = true"
      >
        {{ t("config.fotos.cancelar") }}
      </Button>
    </div>

    <div v-if="resultado" role="status" class="grid gap-1 text-sm">
      <p>
        {{
          t(resultado.cancelado ? "config.fotos.resultadoCancelado" : "config.fotos.resultado", {
            n: resultado.optimizadas,
            ahorro: tam(resultado.ahorro),
          })
        }}
      </p>
      <p v-if="resultado.sinGanancia" class="text-muted-foreground">
        {{ t("config.fotos.sinGanancia", { n: resultado.sinGanancia }, resultado.sinGanancia) }}
      </p>
      <div v-if="resultado.fallidas.length">
        <p>{{ t("config.fotos.fallidas", { n: resultado.fallidas.length }, resultado.fallidas.length) }}</p>
        <ul class="max-h-32 list-inside list-disc overflow-y-auto text-muted-foreground">
          <li v-for="(nombre, i) in resultado.fallidas" :key="i">{{ nombre }}</li>
        </ul>
      </div>
    </div>

    <AlertDialog v-model:open="confirmando">
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{{ t("config.fotos.confirmarTitulo") }}</AlertDialogTitle>
          <AlertDialogDescription v-if="estimacion">
            {{
              t(
                "config.fotos.confirmarTexto",
                {
                  n: estimacion.fotos,
                  total: tam(estimacion.total),
                  quedarian: tam(estimacion.quedarian),
                },
                estimacion.fotos,
              )
            }}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{{ t("config.fotos.volver") }}</AlertDialogCancel>
          <AlertDialogAction @click="optimizar">{{ t("config.fotos.confirmar") }}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </section>
</template>
