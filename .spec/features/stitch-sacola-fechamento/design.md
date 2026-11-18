# Design: Sacola lateral, barra móvel e fechamento do pedido

> feature: stitch-sacola-fechamento · card #110 · 09/11/2026

Documento de planejamento. Nada aqui está aprovado para implementação: as
decisões do dono do produto estão nas perguntas Q-11001…Q-11013 da spec.
Caminhos relativos a `apps/web/src/` salvo indicação. Raiz real do código:
`/Users/stargrupo/Projetos/SC`.

## 1. Origem e limites

- Referência visual: `cat_logo_de_produtos_desktop_universokar` (sacola
  lateral), `cat_logo_de_produtos_tablet_universokar` (barra fixa com economia
  de atacado) e `cat_logo_de_produtos_universokar` (barra "Sacola ativa").
  Descritas no `kinetic_retail_dark/DESIGN.md`: lateral persistente acima de
  1024px; barra fixa com área segura (`env(safe-area-inset-bottom)`).
- A tela de fechamento não foi exportada: a composição da seção 6 é proposta
  própria.
- O export é referência, não dado: cupom `PRIMEIRACOMPRA`, "Entrega
  (Motoboy Express)", "Previsão: hoje até 18:00", "Compra Segura", "PIX ou
  Cartão", "Checar chassi" e os valores não são copiados (P-105, P-104). Cupom,
  fidelidade e parcelamento ficam ocultos (P-107, ASM-11002).
- Só especificação: nenhum código, banco ou API muda (ASM-11001).

## 2. Estado atual (evidência)

| Peça                      | Hoje                                                                                   | Arquivo                                                            |
| ------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Montagem                  | uma só, na tela do catálogo, com `prepararFechamentoDaJanela.bind(...)`                | `app/(loja)/loja/[slug]/cardapio/TelaDoCatalogo.tsx`               |
| Janela da sacola          | um `<dialog>` com passos `carrinho` e `fechamento`; ouve `sc:carrinho-mudou`           | `features/carrinho/CarrinhoFlutuante.tsx`                          |
| Botão da sacola           | redondo, arrastável, posição guardada em fração no `localStorage`                      | `features/carrinho/SacolaFlutuante.tsx`, `posicao-da-sacola.ts`    |
| Corpo da sacola           | cabeça, lista rolável, rodapé com subtotal, "Entrega: calculada no fechamento", total  | `features/carrinho/GavetaCarrinho.tsx`                             |
| Linha                     | −/+ (− desabilitado em 1), remover, preço riscado, avisos de atacado                   | `features/carrinho/LinhaCarrinho.tsx`, `atacado-na-linha.ts`       |
| Estados                   | carregando, pronto, vazio, erro (erro vence vazio)                                     | `features/carrinho/useCarrinho.ts`                                 |
| Porta de login            | abre a janela de acesso e tenta de novo depois                                         | `features/checkout/PassoDoFechamento.tsx`                          |
| Fechamento                | quem pede, forma de receber, endereço, pagamento, observação, resumo, pedido criado    | `features/checkout/FechamentoDaCompra.tsx`                         |
| Mudanças de preço/estoque | lista por item (preço sobe/cai, indisponível, saiu, sem preço); não cobre a taxa       | `features/checkout/AvisoDeMudanca.tsx`                             |
| Chave de repetição        | `novaChave()` com `Date.now` e `Math.random`, uma por montagem; vai no corpo           | `features/checkout/FechamentoDaCompra.tsx`                         |
| Cliente HTTP              | `criarPedido`, `conferirCarrinho`, eventos `sc:carrinho-mudou`; 401, 409, 422          | `lib/carrinho-do-navegador.ts`                                     |
| PIX e dados da conta      | só saem por `prepararFechamentoDaJanela`; configuração em cache de 15 s                | `app/(loja)/loja/[slug]/checkout/acoes.ts`, `server/fechamento.ts` |
| Servidor                  | conta obrigatória, busca por chave, revalida subtotal, taxa divergente só é registrada | `apps/api/src/modules/orders/pedidos.routes.ts`                    |
| Estilos                   | sacola e janela em `vitrine.css`; fechamento em `fechamento.css`                       | `packages/ui/styles/vitrine.css`, `fechamento.css`                 |

Fatos que moldam a proposta: o carrinho vive no banco, ligado ao cookie
`sc_carrinho` (não à conta); um carrinho aberto por loja e sessão; dinheiro em
centavos inteiros; o 409 devolve mensagem genérica, mas `criarPedido` consulta
a vitrine para dizer quando a loja abre.

## 3. Mapa Stitch → peça

| Bloco do Stitch                        | Telas  | Proposta                                                                | Critério                     |
| -------------------------------------- | ------ | ----------------------------------------------------------------------- | ---------------------------- |
| Sacola lateral fixa ("Sua sacola")     | CD     | coluna não modal à direita (`aside`), espaço reservado pelo #108        | AC-11001, AC-11003, AC-11028 |
| Itens com miniatura, remover, −/+      | CD     | `LinhaCarrinho` com o visual do Stitch                                  | AC-11007, AC-11008, AC-11009 |
| Campo de cupom                         | CD     | **não entra** (#119)                                                    | AC-11023                     |
| Subtotal, taxa, total                  | CD     | subtotal da conferência; taxa só no fechamento; total como estimativa   | AC-11014                     |
| "Previsão de entrega"                  | CD     | **não entra** (Q-11009)                                                 | AC-11023                     |
| "Fechar Pedido pelo WhatsApp"          | CD, CT | botão "Fechar pedido"; o WhatsApp vem depois do pedido criado (Q-11006) | AC-11022                     |
| Selos "Compra Segura", "PIX ou Cartão" | CD     | lista só das formas configuradas pela loja                              | AC-11012, AC-11023           |
| Barra fixa "Sacola ativa"              | CM, CT | barra com contagem, subtotal e "Ver sacola"                             | AC-11004, AC-11005           |
| "Economia de Atacado"                  | CT     | opcional (Q-11005)                                                      | Q-11005                      |
| "Checar chassi"                        | CT     | fora (P-104)                                                            | —                            |

## 4. Contrato único de teclado e foco (ASM-11012)

Origem: o #114 cruzou o critério dele (AC-11410) com esta spec e achou
divergência: "sacola lateral prende o foco, fecha com Esc" contra "coluna do
computador sem foco preso". Os dois textos falam de peças diferentes. Contrato
único, por tipo de superfície:

| Superfície                                   | Tipo               | Foco preso | Resto da página | Esc                                      | Foco ao fechar                                                                                        | Critério  |
| -------------------------------------------- | ------------------ | ---------- | --------------- | ---------------------------------------- | ----------------------------------------------------------------------------------------------------- | --------- |
| Gaveta da sacola no celular e no tablet      | diálogo modal      | sim        | inerte          | fecha                                    | volta ao botão que abriu                                                                              | AC-11024  |
| Janela do fechamento (todos os tamanhos)     | diálogo modal      | sim        | inerte          | fecha o diálogo inteiro, nos dois passos | volta ao botão que abriu; sem ele, ao título da página                                                | AC-11024  |
| Coluna lateral da sacola no computador       | região persistente | não        | utilizável      | não faz nada                             | ao ícone do topo, se a coluna fechar (Q-11002)                                                        | AC-11028  |
| Fechamento dentro da coluna (Q-11004)        | região persistente | não        | utilizável      | não faz nada                             | "Voltar à sacola" leva ao título da coluna                                                            | ASM-11012 |
| Ícone da sacola no topo (#105) no computador | gatilho            | —          | —               | —                                        | foco no título da coluna                                                                              | AC-11029  |
| Troca de largura com a sacola aberta         | transição          | —          | —               | —                                        | coluna que encolhe vira barra (foco em "Ver sacola"); diálogo que alarga vira coluna (foco no título) | AC-11030  |

A janela do fechamento e a gaveta da sacola são o mesmo `<dialog>` em dois
passos (`PassoDaJanela`, em `CarrinhoFlutuante.tsx`); por isso Esc fecha o
diálogo inteiro, como o Esc nativo faz hoje, e a sacola continua intacta.

Regras de implementação (proposta):

- Diálogo modal: `<dialog>` com `showModal()` (como o `CarrinhoFlutuante`
  atual) ou a `Gaveta` do #104 (`lado="baixo"`, peça que ainda não existe: dependência do #104); a nativa já prende o foco,
  fecha com Esc e devolve o foco quando o gatilho existe.
- Foco de reserva: nas rotas `/carrinho` e `/checkout` o diálogo abre por
  efeito, sem gatilho; ao esvaziar, o botão some; alguns navegadores não dão
  foco ao botão tocado. Nesses casos o foco vai ao título da página do
  catálogo (com `tabindex="-1"`), nunca ao corpo da página.
- Coluna: `<aside aria-labelledby>` com o título "Sua sacola" (com
  `tabindex="-1"` para receber o foco) e um atalho "Ir para a sacola" no
  primeiro Tab, porque a coluna vem depois dos produtos no HTML; nada de
  `role="dialog"`, `aria-modal` nem `inert` no resto da página.
- Com um diálogo aberto o topo fica inerte, então o pedido de abrir a sacola
  não chega; se vier por código, é ignorado (sem diálogo dentro de diálogo).
  A janela do produto (#109) segue o mesmo contrato modal; o #114 deve citá-la.
- Mudança de contagem e total: região `aria-live="polite"`, sem mover o foco
  (AC-11006).
- Se a Q-11001 escolher gaveta lateral no computador, a coluna vira modal e o
  AC-11028 passa a seguir o AC-11024. Nada mais muda no contrato.
- Pedido ao #114: o AC-11410 dele deve citar AC-11024 (modal) e AC-11028
  (coluna).

## 5. Celular, tablet e computador

**Computador (coluna lateral).** Alternativas:

| Alternativa                             | Prós                                           | Contras                                                     |
| --------------------------------------- | ---------------------------------------------- | ----------------------------------------------------------- |
| A. Coluna fixa não modal (recomendada)  | como no Stitch; compra sem sair do catálogo    | exige o espaço do #108 e contrato próprio de foco (seção 4) |
| B. `Gaveta lado="direita"` modal (#104) | uma peça só; foco simples; já prevista no #104 | esconde os produtos; foge do mockup do computador           |

O #104 prevê migrar `GavetaCarrinho` para a `Gaveta` (`lado` baixo/direita).
Esta proposta usa a `Gaveta` no celular e no tablet e a coluna no computador.
O #104 foi avisado (mensagem do board); a pergunta é Q-11001. O espaço da
coluna (12 colunas, 3/6/3, a partir de ~1280px) é proposta do #108 (ASM-11006).

**Celular e tablet (barra fixa).** A barra substitui o botão arrastável: ela
mostra contagem, subtotal e "Ver sacola", respeita a área segura, só existe com
itens e abre o diálogo modal (AC-11004). Se a decisão for manter o botão
arrastável (Q-11003), a posição guardada (`CHAVE_DA_POSICAO`) continua; se a
barra o substituir, essa chave deve ser apagada (tarefa T-11002).

**Empilhamento.** Uma barra fixa por vez embaixo (ASM-11007, AC-11005): no
catálogo com itens a barra da sacola ocupa o lugar da `BarraInferior` do #105,
que expõe a própria altura para a reserva de espaço; na página do produto a
barra convive com a barra de adicionar do #109 (`acimaDaAcao` já existe em
`CarrinhoFlutuante.tsx`).

**Evento de abrir.** O ícone do topo (#105) pede para abrir a sacola pelo
evento `sc:abrir-sacola`, ao lado de `AVISO_DE_CARRINHO_MUDOU`, ambos em
`lib/carrinho-do-navegador.ts`. Dono: #110; ouvinte: `CarrinhoFlutuante`
(AC-11029). Combinado com o #105 (AC-10509, AC-10510 e AC-10518 dele; tarefa T-10507); é só proposta.

## 6. Composição proposta do fechamento (sem mockup)

Ordem vertical, igual nos dois formatos de superfície; no celular e no tablet
em tela cheia, no computador numa janela ou dentro da coluna (Q-11004).

| Bloco             | Conteúdo                                                                        | Estados e critérios |
| ----------------- | ------------------------------------------------------------------------------- | ------------------- |
| Topo              | "Fechar pedido", voltar à sacola, nome da loja                                  | —                   |
| Avisos de mudança | lista por item; só segue depois de aceitar                                      | AC-11015            |
| Quem pede         | nome da conta e telefone (pede só se faltar)                                    | AC-11013, AC-11020  |
| Como receber      | Entrega ou Retirada conforme a loja; frase única se só uma; bloqueio se nenhuma | AC-11010            |
| Endereço          | endereços salvos como cartões e "novo endereço"                                 | AC-11011            |
| Pagamento         | só as formas da loja; PIX com chave copiável; troco no dinheiro                 | AC-11012            |
| Observação        | campo livre                                                                     | AC-11013            |
| Resumo            | itens, subtotal, taxa do bairro, total (estimativa até criar)                   | AC-11014            |
| Botão             | "Confirmar pedido", ocupado enquanto envia                                      | AC-11017            |
| Pedido criado     | número, valores gravados, WhatsApp ou link de acompanhamento                    | AC-11014, AC-11022  |

Estados já existentes que devem ser preservados: carregando, falha na
conferência, sacola vazia, loja sem entrega nem retirada, mudança a confirmar,
formulário, pedido criado, loja fechada com horário (AC-11021).

## 7. Regras preservadas e segurança

Resultado da revisão adversarial do plano (arquitetura e segurança), que
virou critério ou suposição:

| Tema                                    | Decisão proposta                                                                                                             | Critério / suposição         |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| Taxa de entrega diverge do servidor     | hoje só é registrada; total com taxa é "estimativa"; barrar seria mudança de API                                             | AC-11014, ASM-11003, Q-11007 |
| Subtotal visto é opcional no contrato   | o cliente sempre envia o subtotal e o total da última conferência                                                            | AC-11016                     |
| PIX, telefone e endereço                | só vêm no toque em "Fechar pedido"; coluna e barra nunca os mostram                                                          | AC-11002                     |
| Chave de repetição                      | `crypto.randomUUID()`; viva na tentativa; nova depois do sucesso, da troca de conta ou de loja; nunca em storage, URL ou log | AC-11018, AC-11027           |
| Resposta perdida e sacola já convertida | o 409 seguinte é genérico; avisar "seu pedido já foi criado" exigiria API                                                    | AC-11019, Q-11008            |
| Sessão expirada no meio                 | 401 abre a janela de acesso; depois, dados e chave refeitos para a conta nova                                                | AC-11020                     |
| Aparelho compartilhado                  | a sacola é da sessão, não da conta                                                                                           | ASM-11004, Q-11011           |
| SSR e cache                             | sacola e conta só pelo navegador, `no-store`; lateral nasce vazia; estado chaveado pelo apelido da loja                      | AC-11026                     |
| CSRF                                    | só `fetch` JSON com `credentials: "include"`; nada de POST nativo nem ação de servidor que grave                             | ASM-11005                    |
| Logs e eventos                          | sem endereço, telefone, PIX nem chave                                                                                        | AC-11027                     |
| Duas abas                               | o servidor já impede o segundo pedido; a spec exige só que a tela não crie outro                                             | AC-11019                     |

Nenhuma proposta muda banco, API ou contrato. Onde a melhoria exigiria API,
ela virou pergunta (Q-11007, Q-11008, Q-11011) para um card próprio.

## 8. Contratos com outros cards

| Card        | Combinado (por mensagem do board)                                                                                                                                                                 |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| #104        | peças `Gaveta`, `AvisoFlutuante` e `BarraInferior` são dele; divergência registrada: coluna não modal no computador (Q-11001)                                                                     |
| #105        | ícone do topo abre a mesma sacola pelo evento `sc:abrir-sacola` (dono #110); uma barra fixa por vez (Q-10502 do #105); barra da sacola substitui a inferior                                       |
| #108        | reserva a região `.sc-catalogo__sacola` (AC-10808 a AC-10810; proposta ≥1280px, 3/6/3; Q-10803 e Q-10804 dele) e a altura para a barra fixa; a ordem em `TelaDoCatalogo.tsx` é #108 → #109 → #110 |
| #109        | termina em "Adicionar à sacola"; `lib/produto.ts`, `server/produto.ts` e `lib/atacado-na-vitrine.ts` são dele; `atacado-na-linha.ts` é do #110                                                    |
| #114        | testes transversais: AC-11406, AC-11407, AC-11408, AC-11410 (teclado), AC-11414 (área segura); o #110 não os duplica                                                                              |
| #119 e #125 | cupom e fidelidade são donos do contrato de descontos em `packages/core/src/taxa-entrega.ts`; o #110 não os assume (AC-11023)                                                                     |

## 9. Donos de arquivo e fila (implementação futura)

| Arquivo ou pasta                                                                                                                    | Dono ou fila                                                    |
| ----------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `features/carrinho/*`, `features/checkout/*`, `packages/ui/styles/fechamento.css`                                                   | #110                                                            |
| `app/(loja)/loja/[slug]/cardapio/TelaDoCatalogo.tsx`                                                                                | #108 → #109 → #110                                              |
| `packages/ui/styles/vitrine.css` (classes `.sc-sacola*` e `.sc-carrinho-janela*`)                                                   | fila #107 → #108 → #111; o #110 não está nela: pedir ao gerente |
| `lib/carrinho-do-navegador.ts`, `server/fechamento.ts`, `server/conta-do-fechamento.ts`, `app/(loja)/loja/[slug]/checkout/acoes.ts` | sem dono na matriz do #103: proposta #110 (pedido ao gerente)   |
| `packages/ui/src/gaveta.tsx`, `aviso-flutuante.tsx`, `barra-inferior.tsx`                                                           | #104 cria; o #110 só usa                                        |

O estilo novo da sacola entra em `fechamento.css`; a remoção das classes
antigas de `vitrine.css` fica bloqueada até a fila incluir o #110 (T-11009).

## 10. Testes antigos: manter ou aposentar

Os testes antigos são rede de regressão (AC-11408 do #114): o seletor pode
mudar, a asserção não pode enfraquecer.

| Teste                                                                                                        | Destino                                                                        |
| ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| `apps/web/tests/carrinho-gaveta.test.tsx`, `checkout-na-janela.test.tsx`, `fechamento-pagina.test.tsx`       | manter; ajustar só seletores                                                   |
| `apps/web/tests/carrinho-atacado.test.tsx`, `fechamento-loja-fechada.test.ts`, `troco-no-fechamento.test.ts` | manter                                                                         |
| `apps/web/tests/sacola-e-banners.test.tsx` (arraste e posição da sacola)                                     | manter a parte dos banners; a do arraste só some se a Q-11003 escolher a barra |
| `apps/web/src/features/carrinho/useCarrinho.test.tsx`                                                        | manter                                                                         |
| `apps/api/tests/pedido-idempotente.test.ts`                                                                  | manter (prova do servidor, AC-516 legado)                                      |
| `e2e/specs/carrinho.spec.ts`, `checkout.spec.ts`, `teclado-vitrine.spec.ts`                                  | manter como regressão (#114)                                                   |

## 11. Matriz critério → prova futura

Testes novos em `apps/web/tests/*.onp.test.tsx`, título
`[CA-n] @spec:AC-110xx …` (README do #103). A prova e2e fica com o #114
(Q-11405 dele). Enquanto não houver implementação, o audit acusa "critério sem
teste" e isso é esperado.

| Critério                               | Prova futura                                                                                       |
| -------------------------------------- | -------------------------------------------------------------------------------------------------- |
| AC-11001, AC-11003                     | renderiza a coluna com e sem itens (jsdom); largura real no e2e do #114                            |
| AC-11002                               | espiona `prepararFechamentoDaJanela`: não é chamada antes do toque; coluna sem PIX nem endereço    |
| AC-11004, AC-11005                     | renderiza a barra; área segura e barra única são do AC-11414 do #114                               |
| AC-11006, AC-11024, AC-11028–11030     | foco, Esc e região (jsdom); teclado completo é o AC-11410 do #114                                  |
| AC-11007, AC-11008, AC-11009           | `LinhaCarrinho` com serviço simulado (padrão de `carrinho-gaveta.test.tsx`)                        |
| AC-11010, AC-11011, AC-11012, AC-11013 | `FechamentoDaCompra` com `preparo` simulado (padrão de `checkout-na-janela.test.tsx`)              |
| AC-11014, AC-11015, AC-11016           | `criarPedido` simulado: corpo com subtotal e total vistos; `AvisoDeMudanca` antes de enviar        |
| AC-11017, AC-11018                     | duplo toque envia uma vez; chave nova depois do sucesso e da troca de conta; sem `storage` nem URL |
| AC-11019                               | prova de servidor já existente (`pedido-idempotente.test.ts`); no cliente, o 409 não cria outro    |
| AC-11020, AC-11021, AC-11022           | 401 e loja fechada simulados; sacola preservada; pedido criado esvazia a sacola                    |
| AC-11023                               | busca no DOM renderizado por cupom, desconto, parcela, previsão e "compra segura": nenhum          |
| AC-11025                               | rotas `/carrinho` e `/checkout` abrem a sacola/fechamento; caminho sem script (link)               |
| AC-11026, AC-11027                     | HTML do servidor sem itens nem dados; espiões de `console` sem dado pessoal                        |

## 12. Critérios de prova desta fase

| Critério    | Como se prova agora                                                                 |
| ----------- | ----------------------------------------------------------------------------------- |
| Toda a spec | revisão do dono do produto sobre as perguntas Q-11001…Q-11013                       |
| IDs         | `grep` do prefixo 110 e de cabeçalhos duplicados (README do #103)                   |
| Estrutura   | filtro do `audit --json` do README: "sem erro estrutural" (`AC_SEM_TESTE` esperado) |
