import type { DatosVisor } from "../datos";
import { dibujar } from "./dibujo";

const d: DatosVisor = JSON.parse(document.getElementById("datos-visor")!.textContent!);
const dibujo = document.querySelector<HTMLElement>('main[data-visor="dibujo"]')!;
// El SVG sale de dibujarSvg, que ya escapa todos los textos.
void dibujar(d, new Set(d.plegadas)).then((r) => (dibujo.innerHTML = r.svg));
