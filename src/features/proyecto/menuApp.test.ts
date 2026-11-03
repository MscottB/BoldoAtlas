import { describe, expect, it } from "vitest";
import type { Organizacion } from "@/db/cliente";
import { entradasAbrirOtra } from "./menuApp";

const org = (id: string): Organizacion =>
  ({ id, nombre: `Org ${id}`, color: "#112233", abierta: "2026-11-03" }) as Organizacion;

describe("entradasAbrirOtra", () => {
  it("no ofrece la abierta y respeta el orden", () => {
    expect(entradasAbrirOtra([org("C"), org("A"), org("B")], "A")).toEqual([
      { id: "C", nombre: "Org C" },
      { id: "B", nombre: "Org B" },
    ]);
  });

  it("con solo la abierta no ofrece nada", () => {
    expect(entradasAbrirOtra([org("A")], "A")).toEqual([]);
  });
});
