import { ref } from "vue";
import { defineStore } from "pinia";
import { invoke } from "@tauri-apps/api/core";
import { i18n } from "@/i18n";
import type { Resultado } from "@/stores/organizacion";

// Inicio con el sistema (Configuración): el estado siempre viene del sistema (src-tauri/src/inicio.rs), también si
// se cambió en el instalador o en el Administrador de tareas. Solo en Windows y no en la portable.
export type MotivoNoDisponible = "portable" | "sistema";
interface Estado {
  activo: boolean;
  noDisponible: MotivoNoDisponible | null;
}

export const useInicioSistema = defineStore("inicioSistema", () => {
  const activo = ref(false);
  const noDisponible = ref<MotivoNoDisponible | null>(null);

  async function pedir(comando: string, args?: Record<string, unknown>): Promise<Resultado> {
    try {
      const e = await invoke<Estado>(comando, args);
      activo.value = e.activo;
      noDisponible.value = e.noDisponible;
      return { ok: true };
    } catch (e) {
      return { ok: false, mensaje: i18n.global.t("config.inicio.error", { detalle: String(e) }) };
    }
  }

  const cargar = () => pedir("inicio_sistema");
  const cambiar = (valor: boolean) => pedir("cambiar_inicio_sistema", { activo: valor });

  return { activo, noDisponible, cargar, cambiar };
});
