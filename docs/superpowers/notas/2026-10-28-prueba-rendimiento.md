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
