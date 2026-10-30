# Prueba de rendimiento del lienzo — 2026-10-28

**Cómo se midió:** `npm run dev` → `/rendimiento.html` en el navegador Chromium integrado (mismo motor que WebView2), viewport 1280×800, pestaña visible. Árbol falso `generarArbolFalso(n, 6, 1)`, layout elkjs `layered`/`DOWN` en el hilo principal, Vue Flow con aristas `smoothstep`. FPS = recorrido circular de la vista alrededor de la raíz a zoom 0,6 durante 3 s (equivale a arrastrar el lienzo). Línea base de `requestAnimationFrame` sin carga: 61 FPS.

| Nodos | Layout | FPS con `only-render-visible-elements` | FPS dibujando todo |
|---|---|---|---|
| 2.000 | 1.007–1.063 ms | 9 | 31 |
| 5.000 | 1.275 ms | — | 13 |

**Veredicto:** el criterio del plan (2.000 nodos: layout < 2.000 ms y ≥ 30 FPS) se cumple **con poco margen** y **sin** `only-render-visible-elements`: esa opción empeora el arrastre porque monta y desmonta nodos en cada cuadro. Con 5.000 nodos visibles a la vez no es fluido.

**Consecuencias para la Fase 2 (antes de construir el árbol real):**
- No usar `only-render-visible-elements`.
- Ramas colapsadas por defecto (la spec ya pide colapsar/expandir): el lienzo dibuja solo los niveles abiertos, así rara vez hay miles de nodos a la vez.
- Nodos livianos (sin sombras ni transiciones por nodo) y probar aristas `default`/`straight` contra `smoothstep`.
- Repetir esta medición con el nodo real de la Fase 2; si con 2.000 nodos abiertos cae bajo 30 FPS, evaluar Cytoscape.js (canvas) para la vista completa.

# Segunda medición: app real de la Fase 2 — 2026-10-30

**Cómo se midió:** release 0.0.1-dev.72 (787d32c) compilado como build de verificación (mismo código; solo `additionalBrowserArgs` con `--remote-debugging-port` y sin `CalculateNativeWinOcclusion`, para que la ventana tapada no deje de dibujar), copia **portable** con su propio `datos/` y perfil de WebView2 aparte. Base sembrada con `node scripts/sembrar-grande.mjs <copia>/datos/boldo.db`: 2.000 unidades (raíz → 12 gerencias → 84 áreas → 504 subáreas → 1.399 «Otra»), 3.000 puestos, 10.000 personas, 5.182 asignaciones (2.770 titulares vigentes, 151 reemplazos, 2.261 en el historial), 4 leyendas, marcas en las gerencias y cuatro vistas guardadas «Medición: …» (una vista con `colapsados: []` abre todas las ramas). WebView2 156, i7-1360P, 16 GB, ventana 1280×800 (DPR 1,25), `requestAnimationFrame` en reposo: 60,6 FPS. Medido por CDP desde la ventana real: clic en la vista guardada → todas las tarjetas dibujadas y medidas; arrastre = eventos de mouse reales (`Input.dispatchMouseEvent`) en círculo durante 3 s sobre el fondo; FPS = cuadros de rAF. elk solo = mismo grafo y opciones con elkjs en Node. Cada caso, con la app recién abierta (3–5 corridas: se da el rango).

| Caso | Tarjetas | elk solo | Clic → dibujado | Tarea más larga | FPS arrastre (encuadrado, zoom 0,05) | FPS arrastre (zoom 0,6) |
|---|---|---|---|---|---|---|
| (a) Todo abierto, vertical normal | 2.000 | 0,92–1,67 s | 3,9–13,0 s | 1,7–6,1 s | 6,6–15,7 | 7,7–11,6 |
| (b) Todo abierto, horizontal compacta | 2.000 | 0,45–1,20 s | 3,6–3,9 s | 1,7 s | 14,4–19,8 | 17,9–25,2 |
| (c) «Ver puestos», ramas por defecto | 30 | — | < 0,1 s | — | 60 | 60 |
| (c) «Ver puestos», todo abierto | 5.000 | 1,44–2,32 s | 12,3 s | 6,8 s | 8,5 | 5,7 |

Otros datos: abrir la app con la base grande, 0,6–1,3 s hasta el lienzo. Con (a) dibujado hay 56.850 elementos en el DOM y 225 MB de heap; con (c) todo abierto, 102.001 y 649 MB. Volver a aplicar la vista con todo ya abierto (un layout más) bloquea 5,0–9,7 s en una sola tarea.

**Diagnóstico del arrastre (a):** moviendo solo el `transform` del lienzo (sin eventos de mouse) se logran 30,6 FPS a zoom 0,6 y 27,4 encuadrado: lo mismo que la primera medición. Con eventos reales cae a 7–16 FPS: el perfil de 2 s de arrastre tiene ~0,4 s de JavaScript y el resto es trabajo del navegador por cada evento (HitTest 709 ms, despacho de eventos 383 ms, estilos 193 ms, pintado 193 ms). Ocultar el minimapa y las aristas duplica el arrastre (6,8 → 14,2 FPS), sin llegar a 30.

**Búsquedas con 10.000 personas:** Ctrl+K abre en 138 ms y busca («rojas») en 35 ms. Directorio: abrir 1,0 s (10.079 filas, todas en el DOM), filtrar «munoz» 245 ms, borrar el filtro 477 ms. Revisión: 326 ms (16.682 botones).

**Escala de la interfaz:** a 90, 100, 110 y 125 % las tarjetas no se solapan (su tamaño es fijo en px), pero a 125 % el nombre de la unidad en la tarjeta normal queda en 5 px de alto (ilegible; 20 px a 100 %). En la compacta el nombre se recorta con «…».

**Veredicto:** **no cumple** el criterio del plan con el nodo real. elk solo queda bajo 2 s con 2.000 unidades, pero el usuario espera 3,9–13 s entre el clic y el árbol dibujado, y el arrastre con todo abierto va a 7–16 FPS (≥ 30 pedido); en horizontal compacta, 14–25 FPS. Con las ramas plegadas por defecto (lo normal al abrir) el lienzo va a 60 FPS. Queda para decisión del autor (alternativas de esta nota: canvas para la vista completa, menos DOM por tarjeta, sin minimapa/aristas SVG con miles de nodos); no se optimizó nada en esta tarea.
