---
name: design-de-front
description: Como construir tela no SimpleClick — narrativa por rolagem com GSAP e ScrollTrigger nas landings, mundo 3D com Three.js onde ele se paga, e o que NÃO animar no fluxo de pedido. Use ao criar ou revisar qualquer página, componente ou animação do site.
---

# Design de front-end do SimpleClick

Este projeto tem duas plateias com pressas opostas, e tratá-las igual estraga as
duas.

**Quem decide assinar** chega à landing sem pressa, disposto a rolar, curioso
para ver do que o produto é capaz. Ali a rolagem é narrativa: cada seção revela
uma parte do argumento, e o peso do que carrega se paga em confiança.

**Quem está com fome** abre a vitrine no celular, na fila do ônibus, com uma
barra de sinal. Ele quer o cardápio. Qualquer coisa entre ele e o preço da
marmita é atrito — e atrito, aqui, é venda perdida do dono da loja.

A regra que decorre disso é a primeira deste documento, e a única inegociável.

## A regra do peso

| Superfície                             | Quem está ali           | O que é permitido                                            |
| -------------------------------------- | ----------------------- | ------------------------------------------------------------ |
| Landing da plataforma                  | avaliando assinar       | narrativa completa: GSAP, ScrollTrigger, Three.js            |
| Apresentação da loja                   | antes de ver o cardápio | GSAP e ScrollTrigger; 3D só depois do conteúdo               |
| Vitrine, produto, carrinho, fechamento | comprando               | transição curta e micro-interação. Nada que segure a rolagem |
| Painel do dono                         | cozinha atolada         | o mais sóbrio de todos                                       |

**Por que isso não é gosto.** O critério AC-415 exige que a vitrine mostre o
conteúdo principal em menos de dois segundos e meio em rede móvel comum, e que a
página **não dependa de script para mostrar produto**. Three.js não desenha nada
sem script e custa cerca de 150 KB comprimido; GSAP com ScrollTrigger soma outros
70 KB. Na landing isso é investimento. Na vitrine é o critério reprovando.

E o P-012 cobra mobile-first sem violação séria de acessibilidade — verificado
por máquina, no portão. Rolagem sequestrada é uma das formas mais rápidas de
produzir uma.

## Movimento que respeita quem não quer movimento

Toda animação nasce dentro desta guarda. Não é opção, não é fallback: é a
condição para a animação existir.

```ts
const querParado = window.matchMedia(
  "(prefers-reduced-motion: reduce)",
).matches;
```

Quem pediu menos movimento recebe **o estado final**, não a ausência de conteúdo.
O erro comum é embrulhar a animação inteira no `if` e deixar o elemento no estado
inicial — invisível, deslocado, com opacidade zero. A pessoa fica sem o conteúdo,
não sem a animação.

```ts
if (querParado) {
  gsap.set(alvo, { opacity: 1, y: 0 }); // o destino, imediatamente
} else {
  gsap.from(alvo, { opacity: 0, y: 40, scrollTrigger: { trigger: alvo } });
}
```

A folha `packages/ui/styles/componentes.css` já tem o bloco
`@media (prefers-reduced-motion: reduce)`. Animação em CSS entra lá; animação em
script confere a consulta de mídia.

## Os pontos de quebra

A régua sai dos aparelhos que o DevTools traz, e não de números redondos. O piso
é **344px** — o Galaxy Z Fold fechado, que é o menor aparelho da lista e o que o
P-012 chama de "menor breakpoint suportado".

| Nome             | A partir de | Aparelho que manda           |
| ---------------- | ----------- | ---------------------------- |
| `dobravel`       | 344px       | Galaxy Z Fold 5 fechado      |
| `celular`        | 360px       | Galaxy S8+, Android comum    |
| `celular-medio`  | 390px       | iPhone 12/13/14              |
| `celular-grande` | 430px       | iPhone 14 Pro Max            |
| `duo`            | 540px       | Surface Duo, dobrável aberto |
| `tablet`         | 768px       | iPad Mini retrato            |
| `tablet-largo`   | 1024px      | iPad Pro retrato, Nest Hub   |
| `desktop`        | 1280px      | Nest Hub Max, notebook       |
| `desktop-largo`  | 1536px      | monitor                      |

### Altura também é ponto de quebra

Largura sozinha não descreve uma tela. Um iPad em retrato e um Nest Hub têm a
mesma largura de 1024px e alturas de 1366 e 600 — a mesma regra serve mal aos
dois.

| Nome                | A partir de | Aparelho que manda           |
| ------------------- | ----------- | ---------------------------- |
| `altura-baixa`      | 600px       | Nest Hub, celular deitado    |
| `altura-media`      | 840px       | Fold aberto em pé, iPad Mini |
| `altura-alta`       | 1100px      | iPad Air em pé               |
| `altura-muito-alta` | 1700px      | TV em pé, monitor vertical   |

**Tela alta mostra MAIS seções, não uma esticada.** A partir de 1100px cabem
duas; de 1700px, três. `--altura-da-secao` já faz a divisão:

```css
.secao {
  block-size: var(--altura-da-secao);
}
```

A medida é `svh` e não `vh`. No celular, `vh` conta a tela COM a barra de
endereço escondida: a seção nasce mais alta que o espaço visível e o rodapé fica
cortado até a pessoa rolar.

**Tela baixa e deitada tem o problema oposto.** Abaixo de 600px de altura a
seção deixa de ter altura fixa e passa a ter altura MÍNIMA, crescendo com o
conteúdo em vez de espremê-lo.

**Escreva de baixo para cima.** O estilo base atende o dobrável fechado, e cada
`min-width` acrescenta. O contrário obriga a desfazer regra em cada quebra, e é
onde nasce o estouro horizontal que o portão reprova.

Detalhe que só aparece em aparelho de verdade: **o Fold fechado tem 344px de
largura e 882px de altura**. É estreito e comprido ao mesmo tempo, então layout
que só foi pensado em largura quebra ali. Confira também `min-height` e o recorte
de área segura (`env(safe-area-inset-*)`).

## Narrativa por rolagem

Uma narrativa por rolagem tem começo, meio e fim — e um argumento. Se as seções
podem ser embaralhadas sem perda, não é narrativa: é uma lista com animação.

O detalhe de como montar cada peça — seção grudada, paralaxe, revelação em
sequência, barra de progresso — está em
[scroll-story.md](references/scroll-story.md).

Três regras que valem antes de abrir aquele arquivo:

1. **A rolagem continua sendo do usuário.** Grudar uma seção enquanto a animação
   corre é aceitável; impedir a pessoa de sair dela não é. Nada de rolagem
   suavizada que atrase o dedo.
2. **O conteúdo existe sem o script.** A página renderiza legível com JavaScript
   desligado; a animação melhora o que já está lá. É o que o AC-415 exige da
   vitrine e o que torna a landing indexável.
3. **Cada âncora tem alvo visível.** Animação disparada por elemento de altura
   zero, ou por elemento que só existe depois de outra animação, é a origem mais
   comum de narrativa que trava no meio.

## Mundo 3D

Three.js entra quando o 3D **é o argumento**, e não quando ele é enfeite. Na
landing da plataforma isso se justifica: mostrar a loja de um pequeno
empreendedor tomando forma conforme a pessoa rola é o produto se explicando.

As regras de carregamento sob demanda, orçamento de polígonos, descarte de
recursos e o caminho alternativo para quem não tem WebGL estão em
[mundo-3d.md](references/mundo-3d.md).

O que nunca muda: **o mundo 3D é decoração para o leitor de tela**
(`aria-hidden="true"`), e a página precisa contar a mesma história sem ele.

## Telas compridas

Duas seções visíveis ao mesmo tempo mudam a narrativa, e não só o tamanho. Quem
não ajustar mais nada acaba com uma história que se conta sozinha antes de a
pessoa chegar nela.

**A âncora passa a ser a vaga, não a janela.** Com uma seção por tela,
`start: "top 80%"` significa "quando esta seção vai entrar". Com duas, a segunda
já está na tela desde o começo — e dispara junto com a primeira. Tudo anima de
uma vez, e o efeito de revelação some.

```ts
// Uma seção por tela: a janela é a vaga.
start: "top 80%";

// Duas por tela: a vaga é metade da janela.
start: () => `top ${80 / secoesVisiveis()}%`;
```

**Grude uma, deixe a outra andar.** Numa tela comprida, prender as duas ao mesmo
tempo desperdiça a altura que a tela tem de sobra. O padrão que funciona é o de
página dupla: a de cima fica parada com o argumento, a de baixo passa com os
exemplos.

**Não cresça o tipo com a tela.** É a tentação óbvia e o erro mais comum. A
medida confortável de leitura continua sendo cerca de 65 caracteres por linha,
numa TV de 2 metros ou num tablet. Altura sobrando vira mais respiro e mais
conteúdo — nunca letra maior.

**Ponha um teto no bloco de conteúdo.** Numa vertical de 4K, metade da tela ainda
são 2160px. Um cartão esticado até lá não fica imponente, fica quebrado.

```css
.secao__conteudo {
  max-block-size: 900px;
  margin-block: auto; /* centra na vaga, com o respiro sobrando nas pontas */
}
```

**TV em pé na loja não é tela comprida: é outro produto.** Se a intenção for o
cardápio na parede da lanchonete, ninguém está rolando — a tela avança sozinha,
fica ligada o dia inteiro e é vista de três metros de distância. Isso é modo de
apresentação, com avanço por tempo e corpo de texto grande, e não um ponto de
quebra da vitrine. Vale construir; não vale confundir com este documento.

Medir em três alturas cobre o assunto: **1366px** (iPad Pro em pé), **1920px**
(TV vertical em Full HD) e **2560px** (monitor vertical grande).

## Antes de dar por pronta

- [ ] Roda em 344px sem estouro horizontal
- [ ] Roda em 1366px e 1920px de altura sem seção esticada nem vazio no meio
- [ ] `prefers-reduced-motion` entrega o estado final, não a ausência
- [ ] O conteúdo está legível com script desligado
- [ ] Nenhum `ScrollTrigger` sem `trigger` visível
- [ ] Nos dois temas, claro e escuro
- [ ] Navegável por teclado, com foco visível — inclusive nas seções grudadas
- [ ] `pnpm vitest run --project web` passa, incluindo a verificação do axe
- [ ] O peso novo respeita a tabela da regra do peso

## O que este projeto já tem, e você não deve reinventar

- **Componentes base** em `packages/ui/src`: botão, campo, cartão, aviso,
  diálogo, lista, e os quatro estados de tela. Use-os.
- **Valores declarados** em `packages/ui/styles/theme.css`: cor, espaçamento,
  raio, tipografia. Cor escrita direto no componente é reprovada pelo ESLint
  (AC-014).
- **Tema da loja** em `packages/ui/src/tema-loja.tsx`, com ajuste automático de
  contraste — o dono escolhe a cor, o sistema garante que dá para ler.
