// A fita do mundo 3D da landing (AC-935): transforma os pontos de uma série numa malha
// com espessura, porque a linha do WebGL tem sempre um pixel.
import * as THREE from "three";

/**
 * Transforma uma sequência de pontos numa fita com espessura.
 *
 * PRECISA SER FITA, e não `THREE.Line`: `linewidth` existe na interface e é
 * ignorada em todo navegador de mesa, e um traço de um pixel some no fundo.
 */
export function construirFita(
  pontos: readonly THREE.Vector2[],
  espessura: number,
): THREE.BufferGeometry {
  const metade = espessura / 2;
  const vertices = new Float32Array(pontos.length * 2 * 3);
  const indices: number[] = [];

  for (let i = 0; i < pontos.length; i += 1) {
    const anterior = pontos[Math.max(i - 1, 0)]!;
    const proximo = pontos[Math.min(i + 1, pontos.length - 1)]!;
    const atual = pontos[i]!;

    // A normal sai da direção entre o vizinho de trás e o da frente: usar só o
    // segmento seguinte deixaria a quina com espessura diferente dos dois lados.
    const dx = proximo.x - anterior.x;
    const dy = proximo.y - anterior.y;
    const tamanho = Math.hypot(dx, dy) || 1;
    const nx = (-dy / tamanho) * metade;
    const ny = (dx / tamanho) * metade;

    const v = i * 6;
    vertices[v] = atual.x + nx;
    vertices[v + 1] = atual.y + ny;
    vertices[v + 2] = 0;
    vertices[v + 3] = atual.x - nx;
    vertices[v + 4] = atual.y - ny;
    vertices[v + 5] = 0;

    if (i < pontos.length - 1) {
      const a = i * 2;
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }

  const geometria = new THREE.BufferGeometry();
  geometria.setAttribute("position", new THREE.BufferAttribute(vertices, 3));
  geometria.setIndex(indices);
  return geometria;
}
