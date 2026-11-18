# Design: Buscar produto lendo o código pela câmera (a decidir)

> feature: decidir-busca-por-camera

<!--
  Card #123 — bloco 12301 a 12399. Documento de PROPOSTA para revisão do dono
  do produto. Nenhuma decisão aqui está aprovada (ver Perguntas em aberto em
  spec.md). Caminhos relativos à raiz /Users/stargrupo/Projetos/SC.
  Levantamento feito em 05/11/2026, com revisão adversarial de arquitetura e
  de segurança.
-->

## 1. Origem no Stitch

- Celular: `cat_logo_de_produtos_universokar/code.html`, linhas 38 e 39. É um
  botão com o rótulo "Escanear código" e o ícone `barcode_scanner` do Material
  Symbols, à direita do campo de busca.
- Tablet: `cat_logo_de_produtos_tablet_universokar/code.html`, linha 49, com o
  mesmo ícone.
- Computador (`cat_logo_de_produtos_desktop_universokar`): não tem o botão.
- O ícone do Material Symbols não entra no produto (P-103). O ícone viria do
  lucide (`ScanBarcode`, presente no lucide-react instalado), exposto por
  `packages/ui/src/icones.ts`. Esse arquivo é do #104.

Matriz do #103: `.spec/features/stitch-planejamento/design.md`, §4.4 (linha
"Ler código de barras pela câmera", situação AD) e §4.7.

## 2. Estado atual

### 2.1 Fatos (com evidência)

| Fato                                                                                                                                                           | Evidência                                                                                                                            |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| A busca da loja é um formulário GET com campo `busca`, `role="search"`, que funciona sem JavaScript                                                            | `apps/web/src/features/vitrine/BuscaProduto.tsx` (`BuscaProduto`)                                                                    |
| O nome do parâmetro é `busca`                                                                                                                                  | `apps/web/src/lib/catalogo.ts` (`PARAMETRO_DA_BUSCA`, linha 180)                                                                     |
| A busca aparece duas vezes na página: na barra e no painel do celular (`popover="auto"`, id `busca-no-painel`)                                                 | `apps/web/src/features/vitrine/BarraDeCatalogo.tsx` (linhas 174 e 254–280)                                                           |
| O resultado vazio mostra o termo e "Limpar a busca"; é componente de servidor                                                                                  | `SemResultado` em `BuscaProduto.tsx`; uso em `apps/web/src/app/(loja)/loja/[slug]/cardapio/TelaDoCatalogo.tsx`                       |
| O link "Limpar a busca" é montado no servidor                                                                                                                  | `apps/web/src/server/catalogo-na-tela.ts` (`linkSemBusca`)                                                                           |
| O código de barras é da variação (`ProductVariant.barcode`), opcional, separado do SKU                                                                         | `packages/database/prisma/schema.prisma`; `packages/database/migrations/0007_catalogo_completo.sql`                                  |
| O cadastro aceita até 100 caracteres, sem regra de formato e sem unicidade                                                                                     | `apps/api/src/modules/catalog/variacoes.routes.ts` (`codigoDeBarras`, linha 46)                                                      |
| O lojista edita o código em "Código de barras (opcional)"                                                                                                      | `apps/web/src/features/painel-catalogo/GradeDeVariacoes.tsx`                                                                         |
| O texto buscável do produto inclui o SKU e o código de barras das variações, mantido por gatilhos                                                              | `packages/database/migrations/0071_busca_tolerante.sql` (`texto_buscavel_do_produto`)                                                |
| A busca compara cada palavra pelo começo, aceita até 60 caracteres e 8 palavras e troca pontuação por espaço                                                   | `apps/api/src/modules/storefront/busca.usecase.ts` (`prepararTermo`, `palavrasDaBusca`, `produtosQueCasam`)                          |
| O contrato público aceita `busca` com até 60 caracteres                                                                                                        | `packages/contracts/src/vitrine.ts` (`esquemaDaBuscaDoCatalogo`)                                                                     |
| A busca devolve produtos, não variações                                                                                                                        | função `app.buscar_produtos_da_vitrine` em `0071_busca_tolerante.sql`                                                                |
| A busca do /explorar não procura por código de barras nem SKU                                                                                                  | `apps/web/src/features/feed/BarraDoFeed.tsx`; `packages/database/migrations/0065_feed_filtro_atacado.sql`                            |
| A câmera já é usada nos stories, com funções puras testáveis                                                                                                   | `apps/web/src/features/stories/captura.ts` (`situacaoDaCamera`, `classificarErroDaCamera`, `pararCamera`)                            |
| O hook da câmera desliga só quando `ativa` vira falso e ao desmontar; não trata a troca de aba e chama `enumerateDevices`                                      | `apps/web/src/features/stories/useCamera.ts` (`useCamera`)                                                                           |
| Os textos de erro da câmera falam de story, galeria e painel                                                                                                   | `explicarProblemaDaCamera` em `captura.ts`                                                                                           |
| Não há ícone de leitor; existem `IconeCamera` e `IconeBuscar`                                                                                                  | `packages/ui/src/icones.ts`                                                                                                          |
| O Traefik define `frameDeny` e cabeçalhos seguros, mas nenhuma Permissions-Policy nem CSP; o middleware `limite-de-borda` existe, mas nenhum roteador o usa    | `infra/traefik/dynamic/middlewares.yml`; `infra/compose/docker-compose.yml`                                                          |
| A API não limita requisições na vitrine (o limitador é só de login)                                                                                            | `apps/api/src/app.ts`; `apps/api/src/core/limite.ts`                                                                                 |
| O verify do ONP roda só os projetos `web` e `unit` do vitest                                                                                                   | `onpspec.config.json` (`testCommand`); `vitest.config.ts`                                                                            |
| Já existem testes da busca da vitrine, das telas do feed, das funções da câmera e da busca no servidor (por SKU e referência, sem um caso de código de barras) | `apps/web/tests/vitrine-busca.test.tsx`; `apps/web/tests/stories-editor-captura.test.ts`; `apps/api/tests/busca-vitrine.int.test.ts` |

### 2.2 Inferências

- Um EAN-13 só de dígitos, igual ao cadastrado, é achado hoje pela busca
  digitada. Ler pela câmera e preencher `busca` basta para os casos simples,
  sem mudar API nem banco.
- Não há biblioteca de leitura de código no repositório: a busca por
  BarcodeDetector, zxing, quagga e html5-qrcode não achou nada.
- Sem Permissions-Policy, a câmera não é bloqueada pelo cabeçalho. Mesmo assim
  exige HTTPS (a nota em `captura.ts` diz o mesmo).

### 2.3 Desconhecidos

- Se o Safari do iPhone, na versão em uso pelos clientes, oferece o leitor
  nativo (`BarcodeDetector`). Hoje se supõe que não.
- Como a produção é publicada: o único arquivo de infra versionado é rotulado
  "rotas locais".

## 3. Proposta (não aprovada)

### 3.1 Fluxo

1. O catálogo mostra a busca como hoje. Quando há câmera segura **e** leitor
   disponível, aparece um botão de leitor ao lado da lupa.
2. Ao tocar, antes de pedir a permissão, aparece um aviso curto: "Aponte para o
   código de barras. A imagem não sai do seu aparelho."
3. A câmera traseira liga dentro do próprio painel de busca. No celular, o painel
   continua aberto.
4. Na primeira leitura válida, o laço de leitura para, a câmera desliga, o campo
   `busca` do formulário é preenchido e o formulário é enviado uma vez
   (`requestSubmit`).
5. O catálogo responde como em qualquer busca. Sem acerto, `SemResultado`
   mostra o código e "Ler de novo".

### 3.2 Peças propostas

| Peça                   | Papel                                                                                                                                                                                 | Arquivo (a criar ou alterar)                                                     |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `normalizarCodigoLido` | Função pura. Aceita só dígitos com 8, 12 ou 13 caracteres e dígito verificador correto; devolve o código ou um motivo de recusa. Nunca devolve URL nem texto livre                    | `apps/web/src/lib/leitura-de-codigo.ts` (criar)                                  |
| Situação do leitor     | Função pura que decide se o botão aparece (câmera segura, leitor disponível, formatos suportados), no estilo de `situacaoDaCamera`                                                    | `apps/web/src/lib/leitura-de-codigo.ts` (criar)                                  |
| Textos do leitor       | Mensagens para o cliente (negada, ocupada, sem suporte, código recusado), sem falar de story nem de painel                                                                            | `apps/web/src/lib/leitura-de-codigo.ts` (criar)                                  |
| `LeitorDeCodigo`       | Ilha cliente. Recebe o decodificador e o acesso à câmera por injeção (para os testes), acha o formulário por `closest("form")`, controla um único leitor ativo e desliga tudo ao sair | `apps/web/src/features/vitrine/LeitorDeCodigo.tsx` (criar)                       |
| Encaixe na busca       | `BuscaProduto` ganha o leitor ao lado da lupa, sem mudar o formulário GET                                                                                                             | `apps/web/src/features/vitrine/BuscaProduto.tsx` (alterar, fila do #108)         |
| "Ler de novo"          | Um marcador no endereço indica que a busca veio do leitor; a tela vazia mostra a ação                                                                                                 | `TelaDoCatalogo.tsx` e `apps/web/src/server/catalogo-na-tela.ts` (alterar, fila) |
| Ícone                  | `IconeLerCodigo` (lucide `ScanBarcode`) exposto pelo pacote de ícones                                                                                                                 | `packages/ui/src/icones.ts`, `packages/ui/src/index.ts` (alterar, #104)          |
| Estilo                 | Botão de 48×48px, vídeo dentro do painel, texto escuro sobre o verde da marca                                                                                                         | `packages/ui/styles/vitrine.css` (alterar, fila #107 → #108 → #111)              |

O leitor reaproveita `restricoesDaCamera`, `classificarErroDaCamera` e
`pararCamera` de `captura.ts`. Ele não usa `useCamera` como está: o hook não
trata a troca de aba e chama `enumerateDevices`, que não é preciso aqui. A
proposta é um efeito próprio, mais curto, que liga a câmera traseira, escuta
`visibilitychange` e chama `pararCamera` ao sair.

### 3.3 Decodificador (depende da Q-12304)

| Alternativa                                                   | A favor                                                      | Contra                                                                                                                                                                                                                        |
| ------------------------------------------------------------- | ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A. Só o leitor nativo (`BarcodeDetector`)                     | Nenhuma dependência e nenhum peso no carregamento da vitrine | Não existe no iPhone nem no Firefox; nesses aparelhos o botão não aparece                                                                                                                                                     |
| B. Nativo e, sem ele, biblioteca servida pelo próprio domínio | Funciona também no iPhone                                    | Dependência nova (licença, atualização, supply chain). WASM de algumas centenas de KB, que precisa ser carregado só ao tocar no botão para não pesar no catálogo (regra de leveza da vitrine da spec arquivada, critério 415) |
| C. Serviço externo de leitura                                 | —                                                            | Envia a imagem para terceiros (LGPD), tem custo e contraria ASM-12301. Não recomendado                                                                                                                                        |

Na alternativa B, regras mínimas:

- o arquivo WASM é servido pelo próprio SimpleClick, nunca por CDN;
- versão fixada no lockfile e licença conferida;
- carregamento sob demanda;
- formatos restritos aos aceitos.

A P-103 só proíbe os recursos do export do Stitch. Se a regra "nenhum recurso
de CDN" entra na constituição é decisão do usuário (Q-12304).

### 3.4 Alternativas descartadas ou em aberto

- **Endpoint novo de busca exata por código**: desnecessário para os casos
  simples (ASM-12302). Volta a ser opção se a Q-12307 pedir normalização e
  acerto exato.
- **Abrir o produto direto**: depende da Q-12305. Se aprovado, o identificador
  do produto vem do servidor e nunca é montado a partir do texto lido.
- **Busca global no /explorar**: depende da Q-12303. Exige que a função do feed
  passe a procurar por código, o que é mudança de banco.

## 4. Segurança e privacidade

| Risco                                     | Tratamento proposto                                                                                                                                                                    |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Imagem da câmera (rosto, documento, casa) | Leitura só local. Nada é guardado em canvas, localStorage ou cache; nenhum quadro vai para a rede (prova no AC-12303). Aviso antes de pedir a permissão. Sem `enumerateDevices`        |
| QR com link ou golpe                      | `normalizarCodigoLido` aceita só dígitos de varejo com dígito verificador (AC-12302). O valor lido nunca vai para `window.location`, `href`, `innerHTML` nem `dangerouslySetInnerHTML` |
| XSS pelo termo exibido                    | O termo aparece por JSX, que escapa o texto (`SemResultado`); a busca não chega aos dados estruturados                                                                                 |
| Redirecionamento aberto                   | O formulário só envia para o catálogo da própria loja (`acao` vem do servidor)                                                                                                         |
| Envio em rajada                           | Um envio por leitura (AC-12301), com o laço parado após a primeira leitura válida. A busca pública não tem limite de requisições hoje; ligar o `limite-de-borda` fica para a Q-12308   |
| Iframe de terceiros usando a câmera       | O `frameDeny` já impede embutir o site. `Permissions-Policy: camera=(self)` fica para a Q-12308                                                                                        |
| Enumeração do catálogo por prefixo        | Risco que já existe para quem digita; o leitor só automatiza. Variação inativa, mas não apagada, entra no texto buscável: avaliar na Q-12307                                           |
| Termo em logs                             | O termo não vai para analytics nem telemetria. A API registra só a rota; o access log do Traefik grava a URL com `?busca=` nas respostas de erro                                       |
| Biblioteca de terceiros                   | Só na alternativa B, com as regras de 3.3                                                                                                                                              |

## 5. Compatibilidade e acessibilidade

- A câmera exige HTTPS. Fora dele, o botão não aparece (AC-12305).
- iPhone: sem leitor nativo (alternativa A não funciona). O vídeo precisa de
  `playsInline`, e o Safari pode pedir a permissão de novo a cada carregamento.
- Botão com nome acessível ("Ler código de barras"), alvo de 48×48px (P-106) e
  foco devolvido ao campo ao fechar ou ao negar (AC-12304). Mensagens por região
  `aria-live`.
- Com `prefers-reduced-motion`, sem animação de "linha de leitura".

## 6. Donos de arquivo na implementação futura

Segue `.spec/features/stitch-planejamento/design.md` §7. A execução é uma
tarefa após a outra, na pasta principal, só depois da Q-12301 respondida.

| Arquivo                                                                        | Dono ou fila                     |
| ------------------------------------------------------------------------------ | -------------------------------- |
| `apps/web/src/lib/leitura-de-codigo.ts`, `features/vitrine/LeitorDeCodigo.tsx` | #123 (arquivos novos)            |
| `apps/web/src/features/vitrine/BuscaProduto.tsx`, `BarraDeCatalogo.tsx`        | #108; o #123 pede a vez          |
| `apps/web/src/app/(loja)/loja/[slug]/cardapio/TelaDoCatalogo.tsx`              | fila #108 → #109 → #110          |
| `apps/web/src/server/catalogo-na-tela.ts`                                      | sem dono no §7; pedir ao gerente |
| `packages/ui/src/icones.ts`, `packages/ui/src/index.ts`                        | #104                             |
| `packages/ui/styles/vitrine.css`                                               | fila #107 → #108 → #111          |
| `apps/web/src/features/stories/*` (só reaproveitamento, sem alteração)         | sem dono no §7; não alterar      |
| `infra/traefik/dynamic/middlewares.yml`, `infra/compose/docker-compose.yml`    | sem dono; depende da Q-12308     |

## 7. Estratégia de testes (quando autorizada)

- Arquivos `*.onp.test.ts(x)`. Títulos com as duas convenções, por exemplo
  `it("[CA-1] @spec:AC-12301 …")`.
- O jsdom não tem `getUserMedia`, `BarcodeDetector` nem `HTMLMediaElement.play`.
  O leitor recebe o decodificador e o acesso à câmera por injeção, como as
  funções de `captura.ts` já recebem o ambiente.

| Critério | Teste proposto                                                                                                                          | Projeto    |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| AC-12301 | Decodificador falso devolve um EAN-13 válido duas vezes: o campo fica preenchido, o evento `submit` dispara uma vez e o laço para       | web        |
| AC-12302 | `normalizarCodigoLido` recusa URL, texto, QR de pagamento e dígito verificador errado; o componente mostra a mensagem e não envia       | unit e web |
| AC-12303 | `track.stop()` chamado ao ler, fechar, `visibilitychange` e desmontar; `fetch` e `sendBeacon` espionados sem chamadas durante a leitura | web        |
| AC-12304 | `getUserMedia` rejeita com `NotAllowedError`: aparece a mensagem e o foco vai para o campo                                              | web        |
| AC-12305 | Sem `mediaDevices` ou sem decodificador, o botão não é renderizado; o formulário continua com `method="get"` e `name="busca"`           | web        |
| AC-12306 | Tela vazia com o marcador de leitura mostra o código, "Limpar a busca" e "Ler de novo"                                                  | web        |
| AC-12307 | Duas buscas na página: abrir o segundo leitor fecha o primeiro; o painel do celular não recebe pedido de fechar                         | web        |
| AC-12308 | Variação com código de barras cadastrado: `/catalogo/produtos?busca=<código>` traz o produto e não traz produto de outra loja           | api-int    |

O AC-12308 roda no projeto `api-int`, fora do verify do ONP. Ele fica como
critério sem prova automática (ASM-12308) até o #114 propor um segundo comando
de prova. O envio real com `?busca=` no endereço fica para um e2e
`e2e/**/*.onp.spec.ts`, também a cargo do #114.
