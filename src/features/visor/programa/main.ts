import type { DatosVisor } from "../datos";
import { montar } from "./interfaz";

const FALLO = { es: "No se pudo mostrar el organigrama.", en: "The org chart could not be shown." };

function mostrarError(d?: DatosVisor) {
  const p = document.createElement("p");
  p.setAttribute("role", "alert");
  p.setAttribute("data-visor", "error");
  p.textContent = d?.textos["visor.error"] ?? (document.documentElement.lang === "en" ? FALLO.en : FALLO.es);
  document.body.append(p);
}

let d: DatosVisor | undefined;
try {
  d = JSON.parse(document.getElementById("datos-visor")!.textContent!);
  montar(d!).catch(() => mostrarError(d));
} catch {
  mostrarError(d);
}
