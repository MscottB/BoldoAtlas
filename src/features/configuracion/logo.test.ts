import { describe, expect, it } from "vitest";
import { FOTO_MAX_BYTES as MAX_LOGO_BYTES } from "@/features/trabajadores/validar";
import { base64De, validarLogo } from "./logo";

describe("validarLogo", () => {
  it.each(["image/png", "image/jpeg", "image/webp"])("acepta %s hasta 1 MB", (type) => {
    expect(validarLogo({ type, size: MAX_LOGO_BYTES })).toBeNull();
  });
  it("rechaza otros tipos", () => {
    expect(validarLogo({ type: "image/gif", size: 10 })).toBe("tipo");
    expect(validarLogo({ type: "", size: 10 })).toBe("tipo");
  });
  it("rechaza lo que pasa de 1 MB", () => {
    expect(validarLogo({ type: "image/png", size: MAX_LOGO_BYTES + 1 })).toBe("tamano");
  });
  it("el tipo manda sobre el tamaño", () => {
    expect(validarLogo({ type: "text/plain", size: MAX_LOGO_BYTES + 1 })).toBe("tipo");
  });
});

describe("base64De", () => {
  it("quita el prefijo del data URL", () => {
    expect(base64De("data:image/png;base64,iVBORw0=")).toBe("iVBORw0=");
  });
});
