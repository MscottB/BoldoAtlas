import { ref } from "vue";
import { defineStore } from "pinia";
import { invoke } from "@tauri-apps/api/core";
import { i18n } from "@/i18n";
import type { Resultado } from "@/stores/organizacion";

// Inicio con el sistema (Configuración): el estado siempre viene del sistema (src-tauri/src/inicio.rs), también si
// se cambió en el instalador o en el Administrador de tareas. La portable no lo ofrece.
interface Estado {
  disponible: boolean;
  activo: boolean;
}

export const useInicioSistema = defineStore("inicioSistema", () => {
  const disponible = ref(false);
  const activo = ref(false);
  const aplicar = (e: Estado) => {
    disponible.value = e.disponible;
    activo.value = e.activo;
  };

  async function cargar(): Promise<Resultado> {
    try {
      aplicar(await invoke<Estado>("inicio_sistema"));
      return { ok: true };
    } catch (e) {
      return { ok: false, mensaje: i18n.global.t("config.inicio.error", { detalle: String(e) }) };
    }
  }

  async function cambiar(valor: boolean): Promise<Resultado> {
    try {
      aplicar(await invoke<Estado>("cambiar_inicio_sistema", { activo: valor }));
      return { ok: true };
    } catch (e) {
      return { ok: false, mensaje: i18n.global.t("config.inicio.error", { detalle: String(e) }) };
    }
  }

  return { disponible, activo, cargar, cambiar };
});
