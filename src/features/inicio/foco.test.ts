import { afterEach, describe, expect, it, vi } from "vitest";
import { enfocarAlVolver, volverAlTerminar } from "./foco";

const elemento = (id: string) => ({ id, focus: vi.fn() });

function pagina(ids: string[], activo: "body" | string = "body") {
  const body = {};
  const els = new Map(ids.map((id) => [id, elemento(id)]));
  vi.stubGlobal("document", {
    body,
    activeElement: activo === "body" ? body : els.get(activo),
    getElementById: (id: string) => els.get(id) ?? null,
  });
  return els;
}

afterEach(() => vi.unstubAllGlobals());

describe("el foco al volver a Inicio", () => {
  it("va a lo recordado, una sola vez", () => {
    let els = pagina(["boton", "titulo"]);
    volverAlTerminar("boton");
    enfocarAlVolver("titulo");
    expect(els.get("boton")!.focus).toHaveBeenCalledOnce();
    els = pagina(["boton", "titulo"]);
    enfocarAlVolver("titulo");
    expect(els.get("titulo")!.focus).toHaveBeenCalledOnce();
    expect(els.get("boton")!.focus).not.toHaveBeenCalled();
  });

  it("si lo recordado ya no está (la organización se eliminó), al respaldo", () => {
    const els = pagina(["titulo"]);
    volverAlTerminar("ya-no-esta");
    enfocarAlVolver("titulo");
    expect(els.get("titulo")!.focus).toHaveBeenCalledOnce();
  });

  it("si el foco ya está en algo, no lo mueve", () => {
    const els = pagina(["dialogo", "titulo"], "dialogo");
    volverAlTerminar("titulo");
    enfocarAlVolver("titulo");
    expect(els.get("titulo")!.focus).not.toHaveBeenCalled();
  });
});
