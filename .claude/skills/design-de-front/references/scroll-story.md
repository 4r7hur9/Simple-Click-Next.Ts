# Narrativa por rolagem, com GSAP e ScrollTrigger

Leia depois da regra do peso, em `SKILL.md`. O que está aqui vale para as
landings; para vitrine, carrinho e painel, quase nada disto se aplica.

## Instalação e registro

```ts
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);
```

O registro acontece UMA vez, num módulo de cliente. Registrar dentro de
componente que remonta acumula instâncias e faz a página ficar lenta depois de
alguns minutos de uso, sem erro nenhum aparecer.

## A limpeza é obrigatória, não é higiene

No Next com App Router o componente monta e desmonta a cada navegação. Um
`ScrollTrigger` que não é destruído continua escutando a rolagem de uma página
que já não existe, segurando na memória o elemento antigo. Depois de cinco
navegações a página engasga, e o culpado não aparece em lugar nenhum.

```ts
useEffect(() => {
  const contexto = gsap.context(() => {
    // toda animação aqui dentro
  }, raizDoComponente);

  return () => contexto.revert(); // desfaz tudo, inclusive os ScrollTrigger
}, []);
```

`gsap.context` com `revert` é o caminho. Guardar cada `ScrollTrigger` numa lista
e matar um por um funciona até alguém acrescentar uma animação e esquecer da
lista.

## Seção grudada

A seção fica parada enquanto o conteúdo dela avança. É o efeito que dá a sensação
de capítulo.

```ts
gsap
  .timeline({
    scrollTrigger: {
      trigger: secao,
      start: "top top",
      end: "+=100%", // a seção dura uma tela de rolagem
      pin: true,
      scrub: 1, // a animação segue o dedo, com um respiro
    },
  })
  .from(titulo, { opacity: 0, y: 30 })
  .from(imagem, { scale: 0.9 }, "<0.2");
```

**`scrub: 1` e não `scrub: true`.** Com `true` a animação cola no pixel da
rolagem e fica nervosa no celular, onde o dedo não é preciso. O número é o
retardo em segundos, e um segundo é o suficiente para o movimento parecer
intencional.

**`pin` cria um espaçador no documento.** Em telas baixas — o Fold fechado tem
882px de altura — uma seção grudada de `+=200%` prende a pessoa por três telas.
Meça em aparelho baixo antes de aumentar.

## Paralaxe

Camadas que andam em velocidades diferentes. O erro é aplicar em tudo: paralaxe
em cada elemento vira ruído e some o efeito.

```ts
gsap.to(fundo, {
  yPercent: -15, // porcentagem da PRÓPRIA altura, não pixel
  ease: "none",
  scrollTrigger: {
    trigger: secao,
    start: "top bottom",
    end: "bottom top",
    scrub: 1,
  },
});
```

`yPercent` em vez de `y` porque pixel fixo se comporta diferente em cada ponto de
quebra: 100px é metade de uma tela no Fold e um oitavo no monitor.

O elemento que faz paralaxe precisa de folga além da moldura, senão aparece borda
vazia no fim do movimento. Dê `scale: 1.2` e `overflow: hidden` no pai.

## Revelação em sequência

```ts
gsap.from(cartoes, {
  opacity: 0,
  y: 40,
  stagger: 0.08,
  scrollTrigger: { trigger: lista, start: "top 80%" },
});
```

`start: "top 80%"` dispara quando o topo da lista chega a 80% da altura da
janela — ou seja, um pouco antes de entrar. Esperar a entrada completa faz o
conteúdo aparecer depois de a pessoa já estar olhando para ele.

**Passo de 0,08s no máximo para listas longas.** Com 0,2s e doze cartões, o
último aparece dois segundos e meio depois do primeiro, e a pessoa já rolou.

## Barra de progresso da narrativa

```ts
gsap.to(barra, {
  scaleX: 1,
  ease: "none",
  transformOrigin: "left center",
  scrollTrigger: {
    trigger: document.body,
    start: "top top",
    end: "bottom bottom",
    scrub: 0.3,
  },
});
```

Anime `scaleX`, nunca `width`: largura recalcula o layout a cada quadro, e a
transformação não. É a diferença entre 60 quadros por segundo e uma barra que
engasga.

## O que faz a narrativa travar

**Âncora invisível.** `ScrollTrigger` com `trigger` de altura zero, ou dentro de
elemento com `display: none` no ponto de quebra atual, nunca dispara. Aparece
como seção que não anima em celular e anima no monitor.

**Medida tirada antes da imagem carregar.** O ScrollTrigger calcula posições na
montagem. Se a imagem sem altura reservada carrega depois, tudo desloca. Reserve
o espaço com `aspect-ratio` — o AC-416 já cobra isso — e chame
`ScrollTrigger.refresh()` depois de fonte ou imagem grande carregar.

**Ponto de quebra que muda o layout.** Girar o aparelho refaz as alturas.

```ts
ScrollTrigger.addEventListener("refreshInit", () =>
  gsap.set(alvos, { clearProps: "all" }),
);
```

**Seção grudada dentro de contêiner com `overflow: hidden`.** O `pin` usa posição
fixa; um ancestral com `overflow` ou `transform` cria um novo contexto e a seção
gruda no lugar errado. É o defeito mais difícil de achar deste arquivo.

## Teclado e leitor de tela

Seção grudada quebra a ordem de foco: a pessoa aperta Tab, o foco vai para um
elemento que está fora da tela, e o navegador rola para lá — cancelando a
narrativa. Duas saídas:

- Conteúdo que só existe como enfeite recebe `aria-hidden="true"` e
  `tabindex="-1"`.
- Conteúdo real dentro de seção grudada precisa ser alcançável na ordem em que
  aparece. Se não for, ele não devia estar ali dentro.

Um atalho para pular a narrativa inteira, como primeiro elemento focável, resolve
o caso de quem navega só por teclado.
