/// <reference types="vite/client" />

declare module "*.vue" {
  import type { DefineComponent } from "vue";
  const component: DefineComponent;
  export default component;
}

// pdfmake no trae sus tipos: lo poco que usa el worker del PDF.
declare module "pdfmake/build/pdfmake" {
  const pdfMake: {
    addVirtualFileSystem(vfs: Record<string, string>): void;
    setUrlAccessPolicy(permitir: (url: string) => boolean): void;
    setProgressCallback(avance: (parte: number) => void): void;
    createPdf(documento: object): { getBuffer(): Promise<Uint8Array> };
  };
  export default pdfMake;
}
declare module "pdfmake/build/vfs_fonts" {
  const vfs: Record<string, string>;
  export default vfs;
}
