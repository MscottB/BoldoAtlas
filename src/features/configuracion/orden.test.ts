import { describe, expect, it } from "vitest";
import { moverEn } from "./orden";

describe("moverEn", () => {
  it("sube y baja un lugar", () => {
    expect(moverEn(["a", "b", "c"], "b", -1)).toEqual(["b", "a", "c"]);
    expect(moverEn(["a", "b", "c"], "b", 1)).toEqual(["a", "c", "b"]);
  });
  it("en los extremos no cambia nada", () => {
    expect(moverEn(["a", "b"], "a", -1)).toEqual(["a", "b"]);
    expect(moverEn(["a", "b"], "b", 1)).toEqual(["a", "b"]);
  });
  it("no muta la lista original", () => {
    const ids = ["a", "b"];
    moverEn(ids, "a", 1);
    expect(ids).toEqual(["a", "b"]);
  });
});
