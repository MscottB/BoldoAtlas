import { v7 } from "uuid";

export const nuevoId = (): string => v7();

export const ahora = (): string => new Date().toISOString();
