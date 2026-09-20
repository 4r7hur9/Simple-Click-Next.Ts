# Tasks: Landing da plataforma

> feature: landing-plataforma

## T-960 — A página que conta a história sem script [concluida]

- Refs: US-910, AC-933, AC-934, AC-937
- Arquivos: apps/web/src/app/page.tsx, apps/web/src/features/landing/HistoriaDaLanding.tsx, apps/web/tests/landing-historia.test.tsx, packages/ui/styles/landing.css, packages/ui/package.json
- Notas: a TIPOGRAFIA é da marca, e não do sistema — fonte de sistema é a de todo aplicativo do aparelho, e página feita com ela parece qualquer página. Baixada na construção e servida do próprio domínio: buscar de outro domínio em execução deixa o texto invisível até chegar, entrega o endereço de quem visita a um terceiro, e some em silêncio quando aquele domínio cai. Cada capítulo tem DESENHO próprio e composição alternada: quatro blocos iguais leem como formulário, e a pessoa para de olhar no terceiro. Os desenhos são vetoriais e herdam a cor escolhida — foto ficaria presa na cor de quem a tirou, e pesaria na rede de quem está no celular. Desenhada no servidor, legível com script desligado. As seções contam uma sequência, e cada uma tem caminho para começar sem voltar ao topo.
- Esforço: alto

## T-961 — A narrativa por rolagem [concluida]

- Refs: US-910, AC-936, AC-937, AC-938
- Arquivos: apps/web/src/features/landing/NarrativaDaLanding.tsx, apps/web/tests/landing-narrativa.test.tsx
- Notas: a LUZ de fundo é de CSS e chega a TODO aparelho, inclusive ao celular onde o mundo é barrado — é onde está a maioria de quem abre a página, e antes eles viam fundo liso. GSAP com ScrollTrigger. A âncora acompanha o número de seções visíveis; movimento reduzido entrega o estado final. Seção grudada só onde há altura para isso.
- Esforço: alto

## T-962 — O mundo em três dimensões, carregado sob condição [concluida]

- Refs: US-910, AC-935
- Arquivos: apps/web/src/features/landing/mundo.ts, apps/web/src/features/landing/podeRodar3D.ts, apps/web/tests/landing-mundo.test.ts, pnpm-workspace.yaml, apps/web/package.json
- Notas: o mundo é montado por `NarrativaDaLanding`, e não por um componente próprio — quem decide se ele existe é quem já decide o resto do movimento, e separar em dois faria a decisão morar longe de quem a toma. A decisão de carregar é tomada ANTES do download. Sem WebGL, no celular, com poucos núcleos ou com movimento reduzido, o pacote nem é baixado. Descarte explícito de geometria e textura ao sair. O que ele DESENHA é a receita subindo: três linhas que atravessam a tela crescendo da esquerda para a direita conforme a página rola, uma por ramo (loja de roupas, lanchonete, loja de peças), com legenda fixa à esquerda e uma bolinha da cor de cada linha. Em cada pico da linha verde nasce uma etiqueta de pedidos no estilo de resultado de operação — rótulo pequeno em cima, número grande embaixo, seta apontando para o marcador — que só aparece depois que a ponta passa por ela. Cinco versões foram descartadas antes: cubos (forma abstrata não fala com quem vende pastel); comandas de papel (perdiam a proporção em opacidade baixa e liam como quadrados); rotas de entrega (explicavam o MEIO — o dono não quer rota, quer faturamento); barras (ocupam área, e área atrás de texto exige um chão opaco que escondia o próprio gráfico); e a série vermelha CAINDO ao lado (o fundo de uma página que vende não é lugar para mostrar o negócio afundando). Aqui a cor é IDENTIDADE e não veredito — por isso o vermelho pode subir. A legenda é fixa e não viaja na ponta das linhas: viajou enquanto as três eram do mesmo verde, e atropelava o texto ao cruzar a coluna. As cores vêm da folha de estilo, e não do código: cada uma tem versão por tema, e fixar uma delas some em metade dos aparelhos.
- Esforço: alto

## T-964 — A prévia viva da loja, na própria landing [concluida]

- Refs: US-910, AC-939, AC-940
- Arquivos: apps/web/src/features/landing/PreviaDaLoja.tsx, apps/web/tests/landing-previa.test.tsx, apps/web/src/server/exemplo-da-landing.ts, apps/web/src/lib/iniciais.ts, apps/web/src/lib/iniciais.test.ts, apps/web/src/lib/texto-whatsapp.ts, apps/web/src/lib/texto-whatsapp.test.ts, apps/web/src/lib/cor-da-landing.ts, apps/web/src/lib/cor-da-landing.test.ts, packages/ui/src/tokens.ts, packages/ui/src/index.ts, packages/ui/styles/theme.css, packages/ui/styles/landing.css, apps/web/src/app/page.tsx, apps/web/src/app/layout.tsx, apps/web/src/features/landing/HistoriaDaLanding.tsx, apps/web/src/features/landing/desenhos.tsx, packages/ui/styles/narrativa.css
- Notas: a cor escolhida pinta a PÁGINA INTEIRA, e não só o celular da prévia — antes a pessoa escolhia vermelho e o fundo continuava azul, como se a escolha não valesse nada. A mensagem é desenhada como ela CHEGA, com negrito no lugar dos asteriscos: o dono abre o WhatsApp quarenta vezes por dia e sabe que mensagem nenhuma tem asterisco à vista. E ela tem teto com rolagem própria, porque vinte e sete linhas soltas dobram a altura da seção e empurram o resto da landing para fora da tela. O visitante digita o nome do negócio e escolhe a cor, e vê a própria loja tomando forma — com o ajuste de contraste de verdade, o mesmo que o produto faz. Os produtos do exemplo são fixos e a mensagem vem PRONTA do servidor, porque a tabela de fronteiras não autoriza a camada de telas a calcular preço (P-006) — e uma segunda conta escrita aqui divergiria da real no dia em que uma das duas mudasse.
- Esforço: alto

## T-963 — Teste de ponta a ponta da landing [concluida]

- Refs: US-910, AC-934, AC-938
- Arquivos: e2e/specs/landing.spec.ts
- Notas: cobre a página com script desligado e a régua de 344px de largura.
- Modelo: gpt-5.6-luna
- Esforço: medio
