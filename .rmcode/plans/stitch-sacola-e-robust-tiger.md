# Plano #110 — Stitch · Sacola e fechamento (v3)

## Contexto

Redesign Stitch da última etapa da compra. Hoje a sacola é um botão redondo
arrastável (`SacolaFlutuante`) que abre um `<dialog>` com dois passos, sacola e
fechamento (`CarrinhoFlutuante`). Pelo card, ela muda assim:

- **Computador:** uma **coluna lateral não modal**, a tela "Catálogo com sacola
  lateral".
- **Celular e tablet:** uma **barra fixa** que abre a sacola como diálogo modal.

O fechamento ganha o visual novo e fecha as lacunas da spec: total como
estimativa, nova revisão depois de um 409, envio único com chave forte e troca
de conta sem herdar dados da conta anterior.

Nada muda em banco, API, contratos, `lib/` ou `server/` (ASM-11001). A execução
é **sequencial** e só começa depois do #109, com o aval do gerente. A base são
as peças do #104: tokens, Plus Jakarta Sans, Gaveta, AvisoFlutuante,
BarraInferior, Chip e Abas. As funções "A decidir" seguem ocultas.

**Decisão do usuário (12/11):** "Sua sacola" e "Sua sacola está vazia" entram.
Nos testes antigos `carrinho-gaveta.test.tsx` e `fechamento-pagina.test.tsx`
troca-se só a string esperada. "Receber em casa" e "Retirar no local" ficam, e
`config-entrega`, `checkout-na-janela` e o e2e não mudam.

**Contrato do #108 (mensagem de 12/11):** `<div class="sc-catalogo__sacola"
data-regiao-da-sacola="">`, vazia, é o último filho de `main.sc-catalogo`.

- A partir de 1280px é a zona da direita (grade 3/6/3).
- Vazia (`:empty`), não ocupa espaço.
- Abaixo de 1280px fica com `display:none`.
- A lista reserva `max(7rem, --altura-da-barra-inferior)` mais a área segura.

## Fatos-chave (evidência)

- **Montagem:** a sacola é montada uma vez, no fim de `TelaDoCatalogo`
  (`:380`). A prévia da Aparência também renderiza essa tela.
- **Estado em duas fontes:** `useCarrinho` só roda com o diálogo aberto
  (`CarrinhoFlutuante.tsx:208,355`) e não ouve `AVISO_DE_CARRINHO_MUDOU`. A
  contagem e o total vêm de outra busca (`:263-277`).
- **Falha de quantidade:** uma falha em `mudarQuantidade` põe a sacola em erro, e
  a `GavetaCarrinho` troca a lista pela tela de erro (`:140`). O teste antigo
  exige `situacao === "erro"` com os itens mantidos.
- **Foto:** a conferência não traz foto. Ela vem de `ProdutoNaTela.imagens`, pelo
  `carregarProduto`.
- **Chave e envio:** a chave é `Date.now` + `Math.random`. A trava de envio lê o
  estado do React, e não um ref.
- **Falha de rede:** a reconferência roda depois de qualquer falha. Numa falha de
  rede com o pedido já criado, o formulário some.
- **Pedido já criado:** o servidor procura o pedido pela chave **antes** de ler o
  carrinho (`pedidos.routes.ts:331`), então reenviar a mesma chave devolve o
  pedido.
- **Conta:** depois do 401, o acesso abre sem `aoEntrar`. `ContaDoComprador`
  não tem id.
- **Taxa:** a taxa de entrega é única por loja; não existe taxa por bairro.
- **Classes antigas em uso fora dos arquivos do #110:**

  | Onde | Classe | Para quê |
  | --- | --- | --- |
  | `passos.ts:185` | `.sc-sacola` | passo do tutorial |
  | `legal.css:45,52` | `.sc-sacola__area` | recuo do aviso de cookies |
  | `usuario.css:449` | `.sc-sacola__area` | recuo da lateral do usuário |
  | `produto.css:960` | `sc-flutuante__gaveta` | trava de rolagem com o diálogo aberto |

## Hipóteses (perguntas abertas que não bloqueiam)

| Pergunta | Hipótese adotada |
| --- | --- |
| Q-11001 | Coluna fixa e não modal no computador |
| Q-11003 | A barra substitui o botão arrastável; a posição guardada é apagada (`posicao-da-sacola.ts` e o teste dele ficam) |
| Q-11002 | A coluna não tem X |
| Q-11004 | O fechamento é um diálogo modal em todos os tamanhos; no computador, o voltar fecha o diálogo e põe o foco no título da coluna |
| Q-11005 | Sem economia de atacado |
| Q-11006 | O botão diz sempre "Fechar pedido" |
| Q-11013 | No computador, a coluna atualiza e há um anúncio só para leitor de tela; no celular e no tablet, `AvisoFlutuante` |
| Q-11012 | Alvo de toque com o token do #104 |
| AC-11011 | Taxa única da loja |
| AC-11030 | O diálogo que alarga só fecha no passo da sacola |

## Decisões

- **D-1 — Uma ilha só.** `CarrinhoFlutuante` fica no fim de `TelaDoCatalogo`,
  com `key={loja.apelido}`. Um `useCarrinho` no topo alimenta a coluna, a barra,
  o diálogo, a contagem e o total.
  - A coluna vai por `createPortal` para `[data-regiao-da-sacola]`.
  - A forma (coluna ou barra) vem de `useSyncExternalStore` + `matchMedia`: no
    servidor, ou sem `matchMedia`, vale "barra".
  - Um ref ignora o aviso que a própria ilha disparou.
- **D-2 — Diálogo.** Usar a Gaveta do #104 se ela tiver: abertura controlada,
  título trocável, Esc chamando `aoFechar` e Esc cancelável. Se não tiver, fica o
  `<dialog>` nativo com os tokens do #104.
  - A classe `sc-flutuante__gaveta` continua no diálogo.
  - Um contador `tentativa`, que sobe ao fechar e no sucesso, amarra o conteúdo.
- **D-3 — Classes.** Ficam as que testes e outros cards usam. Entram os blocos
  novos `sc-sacola-coluna` e `sc-sacola-barra`, mais a classe gancho `sc-sacola`
  para o tutorial. Todo o CSS da sacola vai para `fechamento.css`.
- **D-4 — Evento `sc:abrir-sacola`.** Reaproveitar a constante do #105. Se ela
  não existir, a T-11003 espera o gerente. O ouvinte ignora o `detail`, abre só a
  sacola e nunca chama `preparar`.
- **D-5 — Chave.** `chave-do-fechamento.ts` usa `randomUUID`, ou um UUID v4 feito
  com `getRandomValues`.
  - Sem nenhum dos dois, devolve null e o envio é recusado.
  - A chave fica só em `useState`. É refeita a cada montagem (tentativa, geração
    da conta, loja) e mantida depois de falha de rede.
  - Um ref síncrono trava o envio duplo.
- **D-6 — Falha de quantidade.** Novo `falhaAoMudar`, mais `tentarDeNovo()`;
  `situacao` e `erro` não mudam. A Gaveta e a Coluna olham `falhaAoMudar` antes.
- **D-7 — Só leitura.** `acoes.ts`, `server/*`, `lib/produto.ts`,
  `lib/atacado-na-vitrine.ts` e `lib/carrinho-do-navegador.ts` (salvo o D-4).
- **D-8 — Montagem dos itens.** `ver-pela-conferencia.ts` chama a conferência
  primeiro; com a sacola vazia, para aí. Depois vêm os itens e os produtos, com
  cache por id num ref. A foto é `imagens[0]`.
- **D-9 — 401 e troca de conta.** O envio trava depois do 401. Ao entrar, o
  fechamento é preparado de novo sem a tela de "preparando".
  - Mesma conta (e-mail comparado só em memória): destrava.
  - Outra conta: `geracaoDaConta` sobe e o formulário e a chave são refeitos.
  - Falha: continua travado, com o botão Entrar.
- **D-10 — Textos.** "Sua sacola", "Sua sacola está vazia", "Fechar pedido" e
  "Ver sacola". A estimativa entra como nota separada; o rótulo "Total" não muda.

## Tarefas (em sequência)

1. **T-11009 — CSS para `fechamento.css`.** Mover `.sc-sacola*`,
   `.sc-flutuante*` e `.sc-carrinho-janela*` de `vitrine.css` para
   `fechamento.css`, sem mudança visual. Só depois que #107 e #108 terminarem.
   Teste: `sacola-estilos.onp.test.ts` (CA-31).
2. **T-11004 — Linha da sacola.** Foto, atacado e falha reversível; criar
   `ver-pela-conferencia.ts`. Teste: `sacola-linha.onp.test.tsx` (AC-11007 a
   AC-11009).
3. **T-11001 — Coluna.** Criar `forma-da-sacola.ts` e `ColunaDaSacola.tsx`;
   portal; atalho "Ir para a sacola"; `useCarrinho` no topo; `key` por loja;
   strings dos 2 testes antigos. Teste: `sacola-lateral.onp.test.tsx` (AC-11001
   a AC-11003, AC-11028).
4. **T-11002 — Barra e diálogo.** Criar `BarraDaSacola.tsx`; sai
   `SacolaFlutuante.tsx`; diálogo do D-2; troca de forma; foco de reserva no h1;
   área segura e cookies. Teste: `sacola-barra.onp.test.tsx` (AC-11004,
   AC-11005, AC-11024, AC-11030).
5. **T-11003 — Anúncio e abertura.** Anúncio sem roubar o foco e
   `sc:abrir-sacola`. Teste: `sacola-abrir.onp.test.tsx` (AC-11006, AC-11029).
6. **T-11005 — Receber e pagar.** Visual do Stitch; os rótulos de receber
   ficam. Teste: `fechamento-receber-pagar.onp.test.tsx` (AC-11010 a AC-11013).
7. **T-11006 — Total e envio único.** Estimativa, nova revisão depois do 409,
   UUID, trava por ref, mesma chave depois de falha de rede; voltar, X e Esc
   bloqueados durante o envio. Teste: `fechamento-total-idempotencia.onp.test.tsx`
   (AC-11014 a AC-11019).
8. **T-11007 — Conta, loja fechada e pedido criado.** O D-9, a loja fechada e o
   pedido criado com os valores gravados. Teste:
   `fechamento-conta-loja.onp.test.tsx` (AC-11020 a AC-11022).
9. **T-11008 — Privacidade, rotas e "A decidir".** Teste:
   `sacola-privacidade.onp.test.tsx` (AC-11023, AC-11025 a AC-11027).

## Ajustes da 2ª revisão (valem por cima das decisões acima)

- **D-1:** o serviço é memorizado só pelo apelido, com `carregarProduto` num
  ref.
  - Com a barra e o diálogo fechado, busca só a conferência (contagem e total).
  - Os detalhes (itens, produtos e foto) só com a coluna visível ou o diálogo
    aberto.
  - O ref de autoignorar vale só para o `mudarQuantidade` da própria ilha. O
    aviso do pedido criado continua sendo ouvido.
- **D-2:** `tentativa` sobe só quando o diálogo fecha, nunca durante a tela do
  pedido criado.
- **D-5, tentativa pendente:** chave, corpo enviado e conta normalizada ficam
  num ref da ilha, por loja.
  - Sobrevive a fechar, voltar e Esc (o Chrome fecha o diálogo no 2º Esc).
  - Depois de falha de rede, a edição trava. "Tentar de novo" reconfere e
    prepara de novo antes:
    - carrinho com itens → o pedido não saiu: tentativa descartada, chave nova;
    - carrinho vazio → reenvio exato, com a mesma chave e o mesmo corpo;
    - conta diferente → tentativa descartada, sem reenviar.
  - A tentativa só é descartada com uma resposta definitiva (criado, 409, 422)
    ou com troca de conta.
  - Ao reabrir com uma tentativa pendente, a tela recupera o pedido antes de
    mostrar o formulário.
- **D-6:** `falhaAoMudar?` e `tentarDeNovo?` são **opcionais**, para não quebrar
  o `usoCom` do teste antigo.
- **D-9:** o e-mail é comparado com `trim().toLowerCase()`; na dúvida, conta
  como outra conta. Além do `aoEntrar`, ouvir `EVENTO_ACESSO_CONCLUIDO`.
- **D-10:** o passo do fechamento passa a se chamar "Fechar pedido" (nenhum
  teste depende de "Finalizar pedido"). A nota de estimativa fica fora do
  `<dl>`, e o alerta do motivo continua só com o motivo.
- **T-11002:** `SacolaFlutuante.tsx` **não** é apagada.
  `(dev)/ui/catalogo/SacolaDeExemplo.tsx` ainda a importa, então a remoção só
  sai com o aval do gerente.
- **Ponto de troca:** a constante única `PONTO_DA_COLUNA` (1280px) e um teste
  que confere essa constante contra a media query do #108.
- **CLS:** risco aceito e medido. Acima de 0,1, o caso vai ao gerente.
- **AC-11017 e AC-11019:** o teste do cliente prova só o lado do cliente. O
  lado do servidor já é provado por `apps/api/tests/pedido-idempotente.test.ts`.

## Avisos a mandar na execução

- **Gerente:** D-4; o `tasks.md` lista arquivos que o D-7 não toca;
  referências mortas em `legal.css`.
- **#111:** a regra `.sc-sacola__area` de `usuario.css`.
- **#114:** a string de `e2e/specs/carrinho.spec.ts:54`.
- **#105:** os alvos de `passos.ts` (a classe gancho mantém o passo
  funcionando).

## Verificação

- **Por tarefa:** o `vitest` do teste novo mais os testes antigos da sacola e
  do fechamento listados no plano estruturado; `pnpm typecheck`;
  `eslint` nas pastas `features/carrinho` e `features/checkout`.
- **Gate:** `pnpm typecheck`, `pnpm lint`, `pnpm test:unit` e
  `pnpm format:check`. O arquivo `.spec/verification/sinais.json` é a
  pendência que o README já aponta.
- **Auditoria ONP:** o filtro de `stitch-sacola-fechamento` sem erro estrutural.
- **Manual:** no navegador, em 390, 768 e 1440px, claro e escuro.
  - Coluna, barra, diálogo, Esc e foco.
  - O fechamento até o pedido criado.
  - `/carrinho`, `/checkout` e a prévia.
  - CLS no carregamento.
