# Spec: Landing da plataforma

> feature: landing-plataforma
> status: rascunho

<!--
  Como ler este arquivo (o formato é verificado por `onp-spec audit`):
  - US-xxx = história de usuário · AC-xxx = critério de aceite
    ASM-xxx = suposição · Q-xxx = pergunta em aberto
  - Toda história de usuário precisa de pelo menos um critério de aceite.
  - Todo critério de aceite precisa de Dado/Quando/Então completos.
  - Os códigos são únicos no projeto inteiro (nunca reutilize um número).
-->

## Contexto

O dono de uma lanchonete não procura "SaaS multi-tenant de catálogo". Ele
procura um jeito de parar de anotar pedido no papel e de responder o mesmo
"quanto é o pastel?" quarenta vezes por dia no WhatsApp.

Esta é a única página do projeto onde a pessoa chega SEM PRESSA. Ela está
decidindo se confia, e disposta a rolar para ver do que o produto é capaz. É por
isso que aqui — e só aqui — o peso de uma narrativa por rolagem com mundo em três
dimensões se paga: mostrar a loja de um pequeno empreendedor tomando forma
conforme a pessoa rola é o produto se explicando sozinho.

A regra do peso da skill `design-de-front` autoriza este tratamento aqui, e o
proíbe na vitrine, no carrinho e no painel. A diferença não é gosto: quem está
comprando tem fome e rede ruim.

## Histórias

### US-910 — Dono de negócio entende o produto sem ler documentação

Como dono de um negócio pequeno, quero entender em segundos o que o SimpleClick
faz por mim, para que eu decida se vale meu tempo antes de me cadastrar.

#### AC-933 — A promessa aparece antes de qualquer rolagem

- **Dado** que abro a landing pela primeira vez
- **Quando** a página carrega
- **Então** vejo, sem rolar nada, o que o produto faz na linguagem de quem tem loja — pedido organizado e cardápio online, não termo técnico —, e um caminho evidente para começar

#### AC-934 — A página conta a história sem depender de script

- **Dado** um navegador com script bloqueado, ou uma conexão que caiu no meio do carregamento
- **Quando** abro a landing
- **Então** todo o texto, todos os links e o caminho para começar continuam presentes e utilizáveis — a narrativa por rolagem e o mundo em três dimensões são camadas por cima, e a ausência deles não tira conteúdo nenhum

#### AC-935 — O mundo em três dimensões não roda onde atrapalharia

- **Dado** um celular, um aparelho sem aceleração de vídeo, ou alguém que pediu menos movimento no sistema
- **Quando** a landing carrega
- **Então** o pacote do mundo em três dimensões nem é baixado, a página continua completa e a narrativa acontece sem ele — porque a decisão de carregá-lo é tomada antes de o download começar, e não depois

#### AC-936 — Quem pediu menos movimento recebe a página inteira, parada

- **Dado** que configurei o sistema para reduzir movimento
- **Quando** abro a landing e rolo até o fim
- **Então** vejo todo o conteúdo em seu estado final, sem animação nenhuma e sem elemento invisível ou deslocado — a preferência tira o movimento, nunca o conteúdo

#### AC-937 — A narrativa tem argumento, e não é uma lista animada

- **Dado** a landing aberta
- **Quando** rolo do começo ao fim
- **Então** as seções contam uma sequência com começo, meio e fim — o problema de quem anota pedido no papel, o produto resolvendo, e o convite para começar —, e cada seção tem um caminho para começar sem precisar voltar ao topo

#### AC-938 — Cabe em qualquer aparelho, do dobrável fechado à TV

- **Dado** a landing aberta em 344px de largura e em telas de 1366px e 1920px de altura
- **Quando** percorro a página inteira
- **Então** não há estouro horizontal em nenhum ponto, nenhuma seção fica esticada com vazio no meio nas telas altas, e o caminho para começar continua alcançável sem rolagem extra

## Suposições

- **ASM-033** — A landing mora na raiz do site (`/`), e a vitrine de cada loja
  continua em `/l/{apelido}`. Domínio próprio de marketing entra depois.
  _status: aberta_
- **ASM-034** — O caminho para começar leva ao cadastro do dono, que ainda não
  existe: até ele existir, o botão aponta para a página de entrada.
  _status: aberta_

## Perguntas em aberto

- **Q-037** — O mundo em três dimensões mostra a loja tomando forma, ou o pedido
  atravessando do celular do cliente até a cozinha? A primeira explica o produto;
  a segunda explica o benefício. _status: aberta_
- **Q-038** — A landing fala de preço? A versão 1 é inteiramente gratuita, e
  dizer isso converte — mas também cria expectativa quando os planos chegarem.
  _status: aberta_
