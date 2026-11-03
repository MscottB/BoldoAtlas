import { afterEach, describe, expect, it, vi } from "vitest";
import { toast } from "vue-sonner";
import { callarAvisosVacios } from "./avisos";

afterEach(() => vi.restoreAllMocks());

describe("callarAvisosVacios", () => {
  it.each(["error", "warning"] as const)("toast.%s sin texto no muestra nada; con texto, sí", (tipo) => {
    const original = vi.spyOn(toast, tipo).mockReturnValue(1);
    callarAvisosVacios();
    toast[tipo]("");
    expect(original).not.toHaveBeenCalled();
    toast[tipo]("algo pasó", { duration: 5 });
    expect(original).toHaveBeenCalledWith("algo pasó", { duration: 5 });
  });
});
