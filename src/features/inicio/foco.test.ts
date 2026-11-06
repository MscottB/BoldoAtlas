import { afterEach, describe, expect, it, vi } from "vitest";
import { ID_TITULO_INICIO, enfocarAlVolver, enfocarPrimero, volverAlTerminar } from "./foco";

const TITULO = ID_TITULO_INICIO;
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
    let els = pagina(["boton", TITULO]);
    volverAlTerminar("boton");
    enfocarAlVolver();
    expect(els.get("boton")!.focus).toHaveBeenCalledOnce();
    els = pagina(["boton", TITULO]);
    enfocarAlVolver();
    expect(els.get(TITULO)!.focus).toHaveBeenCalledOnce();
    expect(els.get("boton")!.focus).not.toHaveBeenCalled();
  });

  it("si lo recordado ya no está (la organización se eliminó), al título", () => {
    const els = pagina([TITULO]);
    volverAlTerminar("ya-no-esta");
    enfocarAlVolver();
    expect(els.get(TITULO)!.focus).toHaveBeenCalledOnce();
  });

  it("si salió bien, no se vuelve a lo recordado", () => {
    const els = pagina(["boton", TITULO]);
    volverAlTerminar("boton");
    volverAlTerminar(null);
    enfocarAlVolver();
    expect(els.get("boton")!.focus).not.toHaveBeenCalled();
  });

  it("si el foco ya está en algo, no lo mueve", () => {
    const els = pagina(["dialogo", TITULO], "dialogo");
    volverAlTerminar(TITULO);
    enfocarAlVolver();
    expect(els.get(TITULO)!.focus).not.toHaveBeenCalled();
  });
});

describe("enfocarPrimero", () => {
  it("de dos organizaciones a una: sin la entrada ni la lista, va al título", () => {
    const els = pagina([TITULO]);
    enfocarPrimero("inicio-org-b", "inicio-recientes");
    expect(els.get(TITULO)!.focus).toHaveBeenCalledOnce();
  });

  it("el primero que siga: la entrada, o si no la lista", () => {
    let els = pagina(["inicio-org-a", "inicio-recientes", TITULO]);
    enfocarPrimero("inicio-org-a", "inicio-recientes");
    expect(els.get("inicio-org-a")!.focus).toHaveBeenCalledOnce();
    els = pagina(["inicio-recientes", TITULO]);
    enfocarPrimero(null, "inicio-recientes");
    expect(els.get("inicio-recientes")!.focus).toHaveBeenCalledOnce();
    expect(els.get(TITULO)!.focus).not.toHaveBeenCalled();
  });
});
