# Mundo 3D com Three.js

Leia depois da regra do peso, em `SKILL.md`. Three.js só entra nas landings, e
só quando o 3D É o argumento.

## O 3D nunca é o conteúdo

A página conta a história inteira sem ele. O mundo 3D é uma camada por cima:

```tsx
<div aria-hidden="true" className="mundo" ref={mundo} />
<section className="narrativa">{/* o texto que carrega o argumento */}</section>
```

Isso não é só acessibilidade. É o que faz a página funcionar para quem não tem
WebGL, para quem está num aparelho com aceleração desligada, para o robô do
Google e para quem entrou pela conexão do metrô.

## Carregar sob demanda, e só quando servir

```ts
const podeRodar3D =
  typeof WebGLRenderingContext !== "undefined" &&
  !window.matchMedia("(prefers-reduced-motion: reduce)").matches &&
  window.innerWidth >= 768 && // não no celular
  (navigator.hardwareConcurrency ?? 2) >= 4;

if (podeRodar3D) {
  const { montarMundo } = await import("./mundo.ts"); // só aqui o pacote baixa
  montarMundo(elemento);
}
```

Quatro condições, e cada uma tem motivo:

- **WebGL ausente** — o navegador não tem como desenhar, e tentar produz uma tela
  preta em vez de uma página.
- **Movimento reduzido** — quem pediu para parar de mexer não quer um mundo
  girando ao rolar.
- **Menos de 768px** — celular tem bateria, dado móvel e processador contados. A
  landing precisa converter ali sem 3D.
- **Menos de quatro núcleos** — aparelho de entrada trava, e a pessoa desiste da
  página antes de o mundo aparecer.

A importação dinâmica é o que faz o pacote de 150 KB não entrar no primeiro
carregamento de ninguém.

## Orçamento

| Recurso             | Teto             | Por quê                                        |
| ------------------- | ---------------- | ---------------------------------------------- |
| Chamadas de desenho | 100              | acima disso o celular médio sai dos 60 quadros |
| Triângulos          | 150 mil          | o aparelho de entrada é o que manda            |
| Texturas            | 2 de 1024px      | cada 2048px são 16 MB na memória de vídeo      |
| Peso do pacote      | 200 KB           | tudo comprimido, incluindo o modelo            |
| Modelos             | `.glb` com Draco | um `.gltf` solto multiplica as requisições     |

Meça, não estime: `renderer.info.render.calls` e `.triangles` dão os dois
primeiros números em tempo de execução.

## Amarrar à rolagem

```ts
ScrollTrigger.create({
  trigger: secao,
  start: "top bottom",
  end: "bottom top",
  scrub: 1,
  onUpdate: ({ progress }) => {
    camera.position.z = 10 - progress * 8;
    mundo.rotation.y = progress * Math.PI * 0.5;
  },
});
```

**Nunca desenhe dentro do `onUpdate`.** Ele dispara a cada evento de rolagem, que
pode ser mais frequente que o quadro. Atualize os valores ali e deixe o desenho
no laço próprio:

```ts
renderer.setAnimationLoop(() => renderer.render(cena, camera));
```

## Parar quando ninguém está vendo

Aba em segundo plano continua desenhando se ninguém mandar parar — e é onde a
bateria some sem explicação.

```ts
const observador = new IntersectionObserver(([entrada]) => {
  renderer.setAnimationLoop(entrada?.isIntersecting ? desenhar : null);
});
observador.observe(elemento);
```

## Descartar é obrigatório

O coletor de lixo do JavaScript não alcança memória de vídeo. Sem descarte
explícito, cinco navegações enchem a placa e a aba morre.

```ts
return () => {
  renderer.setAnimationLoop(null);
  cena.traverse((objeto) => {
    if (objeto instanceof THREE.Mesh) {
      objeto.geometry.dispose();
      const materiais = Array.isArray(objeto.material)
        ? objeto.material
        : [objeto.material];
      for (const material of materiais) {
        for (const valor of Object.values(material)) {
          if (valor instanceof THREE.Texture) valor.dispose();
        }
        material.dispose();
      }
    }
  });
  renderer.dispose();
  observador.disconnect();
};
```

## Densidade de pixel

```ts
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
```

O teto de 2 não é arbitrário: num aparelho com densidade 3, desenhar em resolução
cheia significa nove vezes mais pixels que em densidade 1 — e a diferença visual
entre 2 e 3 não é perceptível num mundo em movimento.
