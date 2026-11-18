# Plano #114: validação visual e regressão do redesign Stitch (T-11401…T-11412)

## Contexto
Os cards #104–#113 e #127–#131 refizeram as telas no layout Stitch. Eles só conseguiam provar o que o CSS e o DOM declaram (vitest/jsdom) e deixaram para o #114 as provas em navegador real: larguras, axe, teclado, toque, estados, catálogo grande, jornada de compra, capturas e dados do Stitch.

A spec está em `.spec/features/stitch-validacao-visual/`. Ela é só leitura: este card não edita `.spec/` nem código de produção.

### Decisões do usuário e do gerente (17/11)
1. O #114 ajusta seletores e textos dos e2e antigos da compra, sem enfraquecer nenhuma asserção. O fechamento passa a exigir conta, com login de teste.
2. A loja segue o tema do aparelho. O card #131 já tirou o `data-tema="escuro"` de `TemaDaMarca` (conferido no arquivo). O teste deste card passa a provar que a loja muda entre claro e escuro, e um tema fixo volta a ser achado.
3. O catálogo grande tem 1.000 produtos. Reprova só o que é determinístico: não desenhar os 1.000 cartões e CLS < 0,1. Os tempos de 2,5 s e 200 ms vão só para o relatório.
4. Não existe mais cor por loja: só o verde #B7FF00, com texto escuro por cima. O AC-11411 vira "verde único legível em todas as lojas".
5. Capturas pelo Playwright no terminal ou no runner, nunca com as ferramentas `browser_*`.
6. No máximo 1 revisão por subagente (a de arquitetura já foi feita).

### Hipóteses adotadas (perguntas Q-114xx ainda abertas)
- Larguras: 344, 390, 768, 1024 e 1280, mais 640 como zoom de 200%.
- Sem baseline de pixels.
- A prova de navegador é evidência à parte do motor ONP.
- Painel e administração entram só com as propostas que #112 e #113 deixaram.

## Achados que viram relato no card_report (produção não é deste card)
Os e2e antigos quebram com o redesign:
- `.sc-produto__foto` não existe mais.
- O rótulo "Alguma observação?" mudou de texto.
- "Adicionado ao carrinho" virou o aviso `.sc-aviso-rapido`.
- O fechamento exige conta.
- O link "Ver catálogo" saiu do Sobre.
- `fazerPedidoNaVitrine` preenche o campo "Seu nome", que não existe mais.

Qualquer outro defeito de produto que os testes novos revelarem vai para o gerente, sem correção aqui.

## Arquitetura

### Fixtures novas, exclusivas do #114
- **`e2e/fixtures/redesign.ts`** (sem banco):
  - lista de telas (rota, card dono, pasta do Stitch ou "sem mockup");
  - larguras por projeto;
  - cookie `sc_consentimento`, no mesmo padrão de `navegacao-do-cliente.onp.spec.ts`;
  - `prepararPagina`: `fonts.ready` e movimento reduzido;
  - `rodarAxe`, com as regras que precisam ter rodado de fato;
  - `semEstouroLateral`.
- **`e2e/fixtures/redesign-lojas.ts`** (banco, idempotente, com trava, nunca apaga durante a suíte):
  - loja `e2e-jornada`, com variação, adicional obrigatório e atacado;
  - loja `e2e-vazia`;
  - `tokenDoCliente`, cópia do padrão de `tokenDoDono` com o papel CUSTOMER (`painel.ts` não é alterado);
  - `criarClienteDeTeste(nome)`: uma identidade nova por teste, com e-mail único, sem telefone e sem endereço, já com os aceites legais vigentes gravados. Sem os aceites, a `JanelaDeNovoAceite` cobriria a tela.
- **`e2e/fixtures/catalogo-grande.ts`**: monta a loja `e2e-catalogo-grande` com 1.000 produtos, só montagem.
- **`e2e/fixtures/diferencas-do-redesign.json`**: manifesto em JSON puro. O vitest só lê o arquivo, e o `tsc` do site não precisa atravessar para `e2e/`.

### Projetos do Playwright
Sem `test.skip`: cada teste roda nos dois projetos e escolhe as larguras por `testInfo.project.name`. Cada largura é um `test.step`, para a falha dizer qual largura reprovou.

| Arquivo | `celular` | `publico` |
|---|---|---|
| jornada | 344 | 1280 |
| acessibilidade | 344 e 390 | 768, 1024, 1280 e zoom 640 |
| teclado | 390 (sacola em janela) | 1280 (sacola em coluna) |
| toque e contraste | 344 e 390 | 768 |
| estados | 390 | 1280 |
| painel e admin | 344 | 768 e 1280 |
| capturas | 344 e 390 | 768, 1024 e 1280 |
| catálogo grande | 390, rede lenta, abertura | 1280, busca e filtro |

### Evidências
- Durante a suíte, tudo vai para `testInfo.outputPath`, dentro de `test-results/`, que o git ignora, um fragmento por teste. Assim o portão não suja a árvore e não há dois escritores no mesmo arquivo.
- Só o T-13 consolida em `.rmcode/capturas/114/`: PNGs, `manifesto.json`, relatórios JSON e `matriz.md`. A matriz substitui a edição do `design.md`.

### Títulos dos testes
Seguem `[CA-n] @spec:AC-114xx …`. O teste de contraste e toque leva também `@principle:P-106`.

## Subtarefas (sequenciais)
- **T-0: orçamento.** Medir quanto a suíte e2e de hoje leva. Orçamento: cada arquivo novo cabe em até 90 s por projeto. Se o total passar do portão de 900 s, corta-se a matriz de axe para 344 e 1280 e o gerente é avisado.
- **T-1: base.** As quatro fixtures acima.
- **T-2 (T-11404): `jornada-de-compra.onp.spec.ts`**, cobrindo AC-11404 a AC-11407:
  - busca, tanto no explorar quanto no catálogo;
  - variação e adicional obrigatório no preço final, e o bloqueio sem a escolha obrigatória;
  - sacola com atacado, quantidade, remoção, recarregar a página e outra sessão;
  - fechamento logado, retirando no local, com o telefone pedido; pedido com código, acompanhamento e texto do WhatsApp (`interceptarWhatsApp`);
  - um caso pelo login real (`/entrar` com o código do e-mail);
  - duas contas sem vazamento, a proposta do #111.
- **T-3 (T-11405, AC-11408): e2e antigos.**
  - Arquivos: vitrine, produto-detalhe, produto-opcoes, carrinho, checkout, acompanhamento, a11y-vitrine, teclado-vitrine, desempenho-vitrine, sobre-da-loja e painel-pedidos.
  - Só mudam seletores e textos.
  - `fazerPedidoNaVitrine` em `pedido-operacao.ts` mantém a assinatura e passa a criar o cliente com o nome `nomeDoCliente` e pôr o cookie dele no contexto.
  - `apps/web/tests/regressao-e2e-antigos.onp.test.ts` trava:
    - uma contagem mínima de `expect(`, `expect.soft(` e `expect.poll(` por arquivo;
    - a lista de asserções-chave por texto;
    - a ausência de `.skip`, `.fixme`, `.only` e `expect(true)`.
- **T-4 (T-11406 e T-11409): `acessibilidade-redesign.onp.spec.ts`.**
  - axe com as regras mínimas (`color-contrast`, `target-size`, `landmark-one-main` e as demais), em cada tela, largura e tema.
  - A loja muda de verdade entre claro e escuro (fundo calculado diferente).
  - Sem estouro lateral em 344 e no zoom 640.
  - Com movimento reduzido, a interação é disparada antes da medida, e nenhuma animação passa de 200 ms nem se repete.
- **T-5 (T-11407): `teclado-redesign.onp.spec.ts`.**
  - Jornada só pelo teclado, com foco visível.
  - A janela do produto e a sacola em janela (AC-11024) prendem o foco, fecham com Esc e devolvem o foco.
  - A coluna da sacola recebe foco (AC-11028).
- **T-6 (T-11408): contraste e toque.**
  - `apps/web/tests/contraste-das-lojas.onp.test.ts`: em `apps/web/src` e no CSS das telas, nada redefine `--cor-primaria` (o `tema-loja.tsx` do pacote fica fora da varredura). `--cor-em-primaria` sobre o verde dá pelo menos 4,5 em cada bloco de tema.
  - `toque-e-contraste-redesign.onp.spec.ts`, num contexto criado com `hasTouch`:
    - alvos de pelo menos 48px, exceto link em texto corrido;
    - em cada loja da captura, o verde pintado é #B7FF00 e o texto sobre ele dá pelo menos 4,5.
- **T-7 (T-11409, declaração): `apps/web/tests/movimento-e-area-segura.onp.test.ts`.**
  - Todo CSS das telas do cliente com animação ou transição tem um bloco de movimento reduzido.
  - As barras fixas que o `barras-fixas.onp.test.ts` não cobre declaram `env(safe-area-inset-bottom)`.
- **T-8 (T-11410): `estados-redesign.onp.spec.ts`.**
  - Vazio, erro (`page.route` devolvendo 500 e 404, sem detalhe técnico na tela) e carregamento anunciado.
  - Foto ausente ou quebrada mostra o substituto.
  - CLS < 0,1, `alt` presente e `loading=lazy` fora da primeira dobra.
- **T-9 (propostas do #112 e do #113): `painel-e-admin-redesign.onp.spec.ts`.**
  - Sem estouro lateral e axe.
  - Os chips rolam na horizontal em 344.
  - A janela de confirmação fecha com Esc e devolve o foco.
  - As marcas dos gráficos têm contraste de pelo menos 3:1.
- **T-10 (T-11402): `capturas-redesign.onp.spec.ts`.**
  - Gera um PNG e um fragmento JSON por tela, largura e tema, e confere que existem e não estão vazios.
  - Lê o texto pintado de cada tela e procura os dados do Stitch (AC-11421).
- **T-11 (T-11403): manifesto de diferenças.**
  - O JSON é preenchido lendo cada captura ao lado do `screen.png` do Stitch.
  - `apps/web/tests/diferencas-do-redesign.onp.test.ts` confere só a forma: classe válida, motivo com código existente em `.spec/` e diferença pendente apontando para uma pergunta aberta.
- **T-12 (T-11411): `catalogo-grande.onp.spec.ts`.**
  - 5 aberturas; a mediana vai para o relatório.
  - Menos de 1.000 cartões no DOM.
  - CLS < 0,1, medido depois de a rede parar.
- **T-13 (T-11412 e T-11401):**
  - `apps/web/tests/dados-do-stitch.onp.test.ts` procura no código das telas o CNPJ fictício, `5511999999999`, `PRIMEIRACOMPRA`, "sem juros", Av. Paulista, `b2f800` e as CDNs.
  - Rodar `onp-spec verify` e `audit` (só leitura de `.spec/`).
  - Consolidar `.rmcode/capturas/114/` e montar `matriz.md`.
  - `card_report` com os achados.

## Ajustes da 2ª revisão (incluídos na v6, que o validador marcou como READY)
- As execuções filtradas e as medidas chamam o Playwright direto no pacote e2e, sem passar pelo turbo: `playwright test specs/<arquivo> --reporter=list,json` com `PLAYWRIGHT_JSON_OUTPUT_NAME`. A suíte inteira roda com `pnpm test:e2e --force`, porque o turbo pode repetir um resultado guardado em cache.
- O T-3 filtra pelo caminho exato de cada arquivo, nunca por pedaço do nome.
- `LOJAS_DA_CARGA_DEMO` mora em `redesign-lojas.ts`, criado no T-1. Assim o T-6 não depende do T-10.
- O T-13 roda `capturas-redesign` de novo logo antes de consolidar, porque cada execução do Playwright limpa `test-results/`.

## Verificação
- `pnpm --filter @simpleclick/e2e typecheck` e `pnpm exec eslint e2e apps/web/tests`.
- `pnpm exec vitest run --project web <arquivos .onp.test novos>`.
- `pnpm --filter @simpleclick/e2e exec playwright test <arquivos> --reporter=list,json`. Um teste pulado já reprova a rodada.
- As capturas usam lojas da carga demo, que precisa estar no banco de desenvolvimento. Sem ela, a fixture falha com uma mensagem clara, em vez de pular o teste.
- Sem commit, sem push e sem troca de branch.
