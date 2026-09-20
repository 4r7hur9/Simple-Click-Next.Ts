/**
 * O mundo 3D da apresentação da loja.
 *
 * Não é conteúdo e não compete com o nome, o estado ou o botão da loja: é uma
 * órbita leve de pontos e linhas, com a cor que o dono escolheu. O módulo só é
 * importado depois da decisão de aparelho em `MundoDaLoja.tsx`.
 */
import * as THREE from "three";
import { PALETA_CLARA } from "@simpleclick/ui";

const DENSIDADE_MAXIMA = 2;
const QUANTIDADE_DE_PONTOS = 96;
const QUANTIDADE_DE_ONDAS = 3;

export type DesmontarMundoDaLoja = () => void;

function corDaLoja(): string {
  const declarada = getComputedStyle(document.documentElement)
    .getPropertyValue("--cor-primaria")
    .trim();
  return declarada || PALETA_CLARA.primaria;
}

function criarPontos(cor: string): {
  objeto: THREE.Points;
  geometria: THREE.BufferGeometry;
  material: THREE.PointsMaterial;
} {
  const posicoes = new Float32Array(QUANTIDADE_DE_PONTOS * 3);

  for (let indice = 0; indice < QUANTIDADE_DE_PONTOS; indice += 1) {
    // A espiral determinística evita que cada carregamento pareça um ruído
    // diferente e deixa a composição estável para a identidade da loja.
    const angulo = indice * 2.399963;
    const raio = 1.15 + (indice % 12) * 0.12;
    const base = indice * 3;
    posicoes[base] = Math.cos(angulo) * raio;
    posicoes[base + 1] = Math.sin(angulo) * raio * 0.52;
    posicoes[base + 2] = ((indice % 9) - 4) * 0.08;
  }

  const geometria = new THREE.BufferGeometry();
  geometria.setAttribute("position", new THREE.BufferAttribute(posicoes, 3));

  const material = new THREE.PointsMaterial({
    color: new THREE.Color(cor),
    size: 0.11,
    transparent: true,
    opacity: 0.86,
    sizeAttenuation: true,
  });

  return { objeto: new THREE.Points(geometria, material), geometria, material };
}

function criarOndas(cor: string): {
  objetos: THREE.Line[];
  geometrias: THREE.BufferGeometry[];
  materiais: THREE.LineBasicMaterial[];
} {
  const objetos: THREE.Line[] = [];
  const geometrias: THREE.BufferGeometry[] = [];
  const materiais: THREE.LineBasicMaterial[] = [];

  for (let onda = 0; onda < QUANTIDADE_DE_ONDAS; onda += 1) {
    const pontos: THREE.Vector3[] = [];
    for (let indice = 0; indice <= 64; indice += 1) {
      const x = -4 + (indice / 64) * 8;
      const y =
        Math.sin(indice * 0.22 + onda * 1.4) * (0.13 + onda * 0.035) +
        (onda - 1) * 0.28;
      pontos.push(new THREE.Vector3(x, y, -0.4 - onda * 0.05));
    }

    const geometria = new THREE.BufferGeometry().setFromPoints(pontos);
    const material = new THREE.LineBasicMaterial({
      color: new THREE.Color(cor),
      transparent: true,
      opacity: 0.42 - onda * 0.05,
    });
    const objeto = new THREE.Line(geometria, material);

    objetos.push(objeto);
    geometrias.push(geometria);
    materiais.push(material);
  }

  return { objetos, geometrias, materiais };
}

/** Monta a camada WebGL e devolve a limpeza completa da placa de vídeo. */
export function montarMundoDaLoja(elemento: HTMLElement): DesmontarMundoDaLoja {
  const cena = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
  camera.position.z = 7;

  const renderizador = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
    powerPreference: "low-power",
  });
  renderizador.setPixelRatio(
    Math.min(window.devicePixelRatio, DENSIDADE_MAXIMA),
  );
  renderizador.domElement.className = "sc-loja__mundo-canvas";
  elemento.append(renderizador.domElement);

  const cor = corDaLoja();
  const grupo = new THREE.Group();
  const pontos = criarPontos(cor);
  const ondas = criarOndas(cor);
  const haloGeometria = new THREE.TorusGeometry(2.2, 0.035, 8, 128);
  const haloMaterial = new THREE.MeshBasicMaterial({
    color: new THREE.Color(cor),
    transparent: true,
    opacity: 0.42,
  });
  const halo = new THREE.Mesh(haloGeometria, haloMaterial);
  halo.rotation.x = Math.PI * 0.38;

  grupo.add(pontos.objeto, halo, ...ondas.objetos);
  cena.add(grupo);

  const ajustar = (): void => {
    const largura = Math.max(elemento.clientWidth, 1);
    const altura = Math.max(elemento.clientHeight, 1);
    camera.aspect = largura / altura;
    camera.updateProjectionMatrix();
    renderizador.setSize(largura, altura, false);
  };

  ajustar();
  window.addEventListener("resize", ajustar, { passive: true });

  const desenhar = (tempoEmMilissegundos: number): void => {
    const tempo = tempoEmMilissegundos * 0.001;
    grupo.rotation.y = tempo * 0.045;
    grupo.rotation.z = Math.sin(tempo * 0.16) * 0.035;
    halo.rotation.z = tempo * 0.08;
    pontos.objeto.rotation.x = Math.sin(tempo * 0.12) * 0.04;
    renderizador.render(cena, camera);
  };

  const observador = new IntersectionObserver(([entrada]) => {
    renderizador.setAnimationLoop(entrada?.isIntersecting ? desenhar : null);
  });
  observador.observe(elemento);

  return () => {
    renderizador.setAnimationLoop(null);
    observador.disconnect();
    window.removeEventListener("resize", ajustar);

    pontos.geometria.dispose();
    pontos.material.dispose();
    haloGeometria.dispose();
    haloMaterial.dispose();
    for (const geometria of ondas.geometrias) geometria.dispose();
    for (const material of ondas.materiais) material.dispose();

    renderizador.dispose();
    renderizador.domElement.remove();
  };
}
