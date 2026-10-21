# Campos explicados — pedidos, pedido manual e clientes do painel

Card #69. Regra geral em `apps/web/AGENTS.md`, seção "Campos explicados".

Legenda da coluna **"i"**: ✅ tem "i" (texto ao lado) · — rótulo basta.
"Antes" só aparece quando o rótulo mudou.

## 1. Quadro de pedidos (`/painel/pedidos`)

Arquivos: `features/painel-pedidos/QuadroKanban.tsx`, `SeletorDoDia.tsx`,
`AvisoSonoro.tsx`, `CartaoDoKanban.tsx`.

| Campo / controle | Rótulo visível | Antes | "i" |
| --- | --- | --- | --- |
| Seletor do dia | Dia anterior · calendário "Escolher o dia" · Próximo dia · Hoje | — | ✅ "Mostra os pedidos feitos neste dia, no fuso da loja. Pedido que ficou em aberto de um dia anterior continua aparecendo até ser concluído ou cancelado." |
| Visão | Quadro · Cancelados (N) | — | ✅ "Quadro: os pedidos em andamento e concluídos do dia, por etapa. Cancelados: os recusados e cancelados, com o motivo que o cliente leu." |
| Silenciar som | Silenciar som | — | — (botão com estado; a frase "Som desligado neste computador…" aparece quando ligado) |
| Etapa **Pedido gerado** (cabeçalho da coluna) | Pedido gerado | — | ✅ "O pedido acabou de chegar e ainda não foi aceito. Aceite para confirmar ao cliente, ou recuse com um motivo." Ex.: pedido do site às 19h12 esperando você. |
| Etapa **Confirmado** | Confirmado | — | ✅ "Você aceitou o pedido e o cliente já foi avisado. Próximo passo: começar a preparar." |
| Etapa **Em preparo** | Em preparo | — | ✅ "O pedido está sendo feito ou separado. Quando ficar pronto, vai para Retirada (se o cliente busca) ou Saiu para entrega." |
| Etapa **Retirada** | Retirada · nota "Só pedidos de retirada" | — | ✅ "Pronto e esperando o cliente buscar na loja. Só pedidos de retirada passam por aqui." |
| Etapa **Saiu para entrega** | Saiu para entrega · nota "Só pedidos de entrega" | — | ✅ "O entregador já levou o pedido. Só pedidos de entrega passam por aqui." |
| Etapa **Concluída** | Concluída | — | ✅ "O cliente recebeu. O pedido conta nas vendas do dia e no histórico do cliente." |
| Motivo da recusa / do cancelamento (janela) | Motivo da recusa (ou do cancelamento) (obrigatório, o cliente vê) + dica "De 3 a 500 letras. Aparece na página de acompanhamento do pedido." | Motivo (obrigatório) | ✅ "Explique em uma frase por que o pedido não vai sair. O cliente lê este texto na página do pedido." Ex.: acabou o queijo do pastel de queijo. |

Cartão do pedido: só leitura (número, hora, cliente, itens, total, como recebe,
como paga, tempo de espera, "Balcão"). Pagamento `OTHER` agora aparece como
"A combinar" (antes vazava `OTHER`).

### Onde ficam os "i" do quadro (layout do #65 preservado)

- O "i" de cada etapa fica no **cabeçalho da coluna** (`.sc-kanban__cabecalho`),
  FORA da lista que rola (`.sc-kanban__lista`). A rolagem vertical da coluna
  nunca o esconde.
- O balão do `Info` é `position: fixed` e abre **para cima** do "i" (só vira
  para baixo se não couber): não é cortado pelo `overflow-x` do quadro e não
  cobre os cartões, que ficam abaixo do cabeçalho.
- No celular (390px) o cabeçalho da coluna some (as abas dizem a etapa); o "i"
  vem numa linha "O que é “Pedido gerado”?" logo acima da lista, e o balão abre
  para cima, sobre as abas.
- O "i" do dia fica antes das setas do seletor; o de "O que mostrar" fica no fim
  do grupo Quadro/Cancelados.
- Nada no CSS do quadro (`quadro.css`) mudou.

## 2. Pedido aberto (`/painel/pedidos/[id]` e janela do quadro)

Arquivos: `DetalheDoPedido.tsx`, `AcoesDeStatus.tsx`.

| Campo | Rótulo visível | Antes | "i" |
| --- | --- | --- | --- |
| Como recebe | Como recebe: Retirada / Entrega | Receber | — |
| Pagamento | Pagamento: Pix / Dinheiro · troco para R$ X / Cartão na entrega / A combinar | (OTHER em inglês) | — |
| Origem do pedido | Origem do pedido: Balcão (lançado no painel) / Site da loja | Canal: Balcão / Site | ✅ "Balcão: você lançou o pedido aqui no painel (telefone, WhatsApp, loja física). Site da loja: o cliente fez o pedido sozinho pela sua vitrine." |
| Feito em | Feito em (dia e hora com segundos) | — | — |
| Motivo para recusar ou cancelar | Motivo para recusar ou cancelar (o cliente vê este texto) + dica "Só para recusar ou cancelar: de 3 a 500 letras…" | — | ✅ mesmo texto do quadro |
| Linha do tempo — autor | Dono da loja / Equipe da loja / Cliente / Sistema / Administração do SimpleClick | `ADMIN` cru | — |

## 3. Pedido manual (`/painel/pedidos/novo`)

Arquivos: `MontarPedido.tsx`, `EscolherCliente.tsx`.

| Campo | Rótulo visível | Antes | "i" |
| --- | --- | --- | --- |
| Tipo de cliente | Cliente cadastrado · Cliente novo | — | ✅ "Cliente cadastrado: alguém que já está na sua lista; o pedido entra no histórico dele. Cliente novo: quem pede pela primeira vez; basta nome e telefone." |
| Buscar cliente | Buscar cliente (nome ou telefone) · placeholder "Ex.: Ana ou 99999" | Buscar cliente · "Nome ou telefone" | — |
| Nome de quem pede | Nome de quem pede * · "Ex.: Ana Ribeiro" | Nome | — |
| Telefone com DDD | Telefone com DDD * · "Ex.: (85) 99999-1234" | Telefone | — |
| Guardar na lista de clientes da loja | (caixa de marcar) | — | ✅ "Marcado: a pessoa entra na sua lista de clientes, com origem 'Cadastrado pelo dono', e no próximo pedido é só buscar pelo nome. Desmarcado: o pedido sai só com nome e telefone, sem ficha." |
| Adicionar produto ao pedido | Adicionar produto ao pedido | Acrescentar produto | — |
| Variação | Variação (tamanho, sabor…) | Variação | — |
| Escolhas do produto (grupos) | nome do grupo + regra ("escolha até 2") | — | — (a regra já está escrita ao lado) |
| Quantidade | Quantidade (unidades) | Quantidade | — |
| Forma de entrega | **Forma de entrega** (agora visível): Retirada na loja / Entrega no endereço | legenda escondida; "Entrega" | ✅ "Retirada na loja: o cliente busca; o pedido passa pela etapa Retirada. Entrega no endereço: a loja leva; o pedido passa por Saiu para entrega." |
| Rua da entrega | Rua da entrega * (ou "(opcional)" quando o pedido nasce da ficha) · "Ex.: Rua das Flores" | Rua | — (na ficha: frase "Deixe a rua em branco para entregar no endereço da ficha") |
| Número | Número (opcional) · "Ex.: 123 ou s/n" | Número | — |
| Bairro | Bairro (opcional) · "Ex.: Aldeota" | Bairro | — |
| Forma de pagamento | Forma de pagamento: Pix / Dinheiro / Cartão na entrega / A combinar com o cliente | Pagamento: PIX / … / Outro | ✅ "Como o cliente vai pagar quando receber. Sai no pedido e no cupom impresso, para quem entrega cobrar certo. 'A combinar' quando ainda não decidiram." |
| **Troco para quanto? (R$, opcional)** | NOVO, só com Dinheiro · "Ex.: 50,00" · dica "Em branco: o cliente paga o valor certo, sem troco." | não existia (o contrato já aceitava `trocoParaCentavos`) | ✅ "Com quanto o cliente vai pagar em dinheiro, para o entregador levar o troco. Precisa ser maior que o total." Ex.: pedido de R$ 37,00 e o cliente paga com R$ 50,00. |
| Observação do pedido | Observação do pedido (opcional) · "Ex.: sem cebola; tocar o interfone 2" · máx. 500 | Observação (opcional), sem limite na tela | ✅ "Recado sobre o pedido inteiro. Aparece no pedido aberto e no cupom impresso." |
| Subtotal estimado | Subtotal estimado + "A loja confere os preços de agora ao confirmar." | — | — |

Troco: recusado na tela quando não é número ("Escreva só o valor em reais…")
ou quando não é maior que o subtotal; a API confere de novo com o total final.

## 4. Lista de clientes (`/painel/clientes`)

Arquivo: `ListaClientes.tsx`.

| Campo | Rótulo visível | Antes | "i" |
| --- | --- | --- | --- |
| Buscar cliente | Buscar cliente (nome ou telefone) — visível · "Ex.: Ana ou 99999" | rótulo só para leitor de tela | — |
| Ordenar por | Comprou por último / Quem mais gastou / Mais pedidos / Nome (A a Z) | — | — |
| Selo de conta | Tem conta no SimpleClick | Tem conta | — |
| Coluna Total gasto | Total gasto | — | — (o título da `Tabela` só aceita texto; a ficha explica "Sem contar cancelados") |

## 5. Cadastro / correção do cliente (`FormularioCliente.tsx`)

| Campo | Rótulo visível | Antes | "i" |
| --- | --- | --- | --- |
| Nome do cliente | Nome do cliente * · "Ex.: Ana Ribeiro" | Nome | — |
| Telefone com DDD | Telefone com DDD * · "Ex.: (85) 99999-1234" · dica "Com o código de área. A pontuação não importa." | Telefone | — |
| E-mail | E-mail (opcional) · "Ex.: ana@email.com" | — | — |
| Rua | Rua * (quando o endereço está aberto) | Rua | — |
| Número / Complemento / Bairro / Cidade | "(opcional)" + exemplo em cada um | sem "(opcional)" | — |
| Estado | Estado (UF, opcional) · "Ex.: CE" | UF | — |
| Observação | Observação (opcional) · "Ex.: portão azul; prefere troco em notas" | — | ✅ "Anotação interna sobre o cliente, para quem atende. Só a loja vê; o cliente não." Ex.: portão azul; prefere troco em notas. |

## 6. Ficha do cliente (`/painel/clientes/[id]`)

Arquivos: `FichaCliente.tsx`, `HistoricoCliente.tsx` (só leitura).

| Campo | Rótulo | "i" |
| --- | --- | --- |
| Total gasto | Total gasto · "Sem contar cancelados" | — (apoio já explica) |
| Pedidos | Pedidos · "N cancelados fora da conta" | — |
| Ticket médio | Ticket médio · "Por pedido" | ✅ "Quanto este cliente gasta, em média, em cada pedido: o total gasto dividido pelo número de pedidos (sem cancelados)." Ex.: 4 pedidos somando R$ 160,00 dão R$ 40,00. |
| Último pedido | Último pedido · "Cliente desde …" | — |
| **Origem** | Tem conta no SimpleClick / Comprou sem conta / Cadastrado pelo dono | ✅ "Tem conta no SimpleClick: a pessoa criou login e pode acompanhar os pedidos e corrigir os próprios dados. Comprou sem conta: comprou pela vitrine sem criar login. Cadastrado pelo dono: você (ou a equipe) cadastrou aqui no painel, por pedido manual ou importação." |

## 7. Importador de clientes (`/painel/clientes/importar`)

Arquivos: `importacao/PassoDoArquivo.tsx`, `PassoDoMapeamento.tsx`,
`PassoDaRevisao.tsx`, `PassoDoResultado.tsx`.

| Campo | Rótulo visível | "i" |
| --- | --- | --- |
| Arquivo | Escolher arquivo · limites "Aceita .csv, .tsv, .xlsx e .json · até 5 MB e 5.000 clientes" | — |
| Mapeamento (cabeçalho) | Coluna do arquivo · Exemplos · Vai para o campo | ✅ em "Vai para o campo": "Diga em qual campo do SimpleClick entra cada coluna da sua planilha. 'Não importar' deixa a coluna de fora. Nome e telefone são obrigatórios." Ex.: a coluna "Celular" vai para Telefone. |
| Seletor por coluna | Não importar / Nome (obrigatório) / Telefone (obrigatório) / … | — |
| Contagem Repetidos | Repetidos · "N já na loja · N no próprio arquivo" | ✅ "Linhas com telefone ou e-mail de alguém que já está na sua lista, ou que aparece duas vezes no arquivo. Não viram cliente novo." |
| Contagem Inválidos | Inválidos · "ficam de fora" | ✅ "Linhas sem nome ou com telefone ou e-mail que não dá para usar. Ficam de fora e vão para o relatório de erros." |
| **O que fazer com quem já é cliente?** | Ignorar repetidos / Completar campos vazios (cada um com frase) | ✅ na legenda: "Ignorar: a ficha de quem já é cliente fica exatamente como está. Completar campos vazios: só preenche o que está em branco na ficha (e-mail, endereço, observação); nada que você já anotou é trocado." Ex.: a ficha da Ana não tem e-mail e a planilha tem: com "Completar", o e-mail entra. |
| Resultado | Criados / Completados / Repetidos / Inválidos / Fora do limite | — (cada um com frase de apoio) |

## Enums que vazavam em inglês (corrigidos)

| Onde | Antes | Agora |
| --- | --- | --- |
| Pagamento no cartão e no pedido aberto | `OTHER` | A combinar |
| Pagamento no pedido manual | PIX / Outro | Pix / A combinar com o cliente |
| Autor na linha do tempo | `ADMIN` | Administração do SimpleClick |

## Conferência visual

Roteiro em `/tmp/sc69/verificar.mjs` (Playwright headless, conta
`wellington@moto-pecas-fortal.test`, 1400×900 e 390×844). Abre cada "i" das
telas acima, tira print (`/tmp/sc69/prints/`) e mede: o ícone não cruza
controle nem texto, o balão fica inteiro na tela, não cobre cartão do quadro
nem o controle do próprio campo, e o Esc fecha.

Resultado: 51 "i" abertos, sem problema real. Os 4 alertas do roteiro eram
falso alarme: na janela de recusa, cartões contados atrás do fundo da janela; no
celular, ícone medido embaixo da barra fixa do topo ou do rodapé logo depois de
rolar. E um caso esperado: o campo no topo da tela faz o balão abrir para baixo,
que é a regra do `Info`.
