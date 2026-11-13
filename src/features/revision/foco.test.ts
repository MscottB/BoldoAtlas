import { describe, expect, it } from "vitest";
import { focoTras } from "./foco";

const secciones = [
  { tipo: "sinJefatura", claves: ["a", "b", "c"] },
  { tipo: "vacias", claves: ["d"] },
  { tipo: "marcados", claves: ["e"] },
];

describe("focoTras", () => {
  it("va a la fila siguiente de la misma sección", () => {
    expect(focoTras(secciones, "sinJefatura", "b")).toEqual({ seccion: "sinJefatura", fila: "c" });
  });
  it("sin fila siguiente, al título de la sección si le quedan filas", () => {
    expect(focoTras(secciones, "sinJefatura", "c")).toEqual({ seccion: "sinJefatura" });
  });
  it("si la sección se queda vacía, al título de la siguiente", () => {
    expect(focoTras(secciones, "vacias", "d")).toEqual({ seccion: "marcados" });
  });
  it("si no hay siguiente (o no se conoce la sección), al h1", () => {
    expect(focoTras(secciones, "marcados", "e")).toBeNull();
    expect(focoTras(secciones, "otra", "x")).toBeNull();
  });
});
