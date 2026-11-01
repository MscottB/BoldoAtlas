// Rust atiende los comandos de la base fuera del hilo principal y en paralelo. Aquí se guarda el orden: las escrituras van
// de a una y en el orden pedido, y ninguna se intercala entre las consultas de una carga completa, que si no mostraría una
// mezcla de antes y después. Las cargas sí pueden ir juntas: una lenta no detiene a otra más reciente.
let escrituras: Promise<unknown> = Promise.resolve();
let lecturas: Promise<unknown>[] = [];

/** Espera lo que ya se pidió y escribe. Si falla, quien lo pidió recibe el error y la cola sigue. */
export function escritura<T>(hacer: () => Promise<T>): Promise<T> {
  const hecho = Promise.allSettled([escrituras, ...lecturas]).then(hacer);
  escrituras = hecho.catch(() => undefined);
  return hecho;
}

/** Espera las escrituras ya pedidas y lee. Las que se pidan después esperan a que termine. */
export function lectura<T>(hacer: () => Promise<T>): Promise<T> {
  const hecho = escrituras.then(hacer);
  const fin: Promise<unknown> = hecho
    .catch(() => undefined)
    .then(() => {
      lecturas = lecturas.filter((l) => l !== fin);
    });
  lecturas.push(fin);
  return hecho;
}
