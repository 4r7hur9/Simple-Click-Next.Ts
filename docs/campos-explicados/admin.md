# Campos explicados — administração da plataforma

Card #71. Regra geral em `apps/web/AGENTS.md`, seção "Campos explicados".
Área: `apps/web/src/features/admin`, `features/admin-dashboard` e
`app/(admin)` (rotas `/admin/...`).

Legenda da coluna **"i"**: ✅ tem "i" (texto ao lado) · — o rótulo basta.
"Antes" só aparece quando o rótulo ou a dica mudou.

Achados gerais corrigidos:

- **Enums em inglês na auditoria.** O papel de quem fez o ato saía cru:
  "Por Joi (OWNER)", "(ADMIN)". Agora sai "dono da loja", "administração",
  "equipe da loja", "sistema", "cliente" (`rotuloDoPapel`, em
  `features/admin/trilha-na-tela.ts`).
- **Atos sem nome.** 18 códigos que a API grava não tinham nome no contrato
  (`LIMITE_DO_DONO_ALTERADO`, `LIMITES_PADRAO_ALTERADOS`, `CONVITE_REENVIADO`,
  `CLIENTES_IMPORTADOS`, `COMENTARIO_*`, `ESPECIFICACAO_*`, `PASSWORD_CHANGED`,
  `LOGOUT`…). Ganharam nome em `NOMES_DOS_ATOS`, que também alimenta o filtro
  "Tipo de ato". Código novo que ainda não tem nome vira frase
  ("Limite do dono alterado"), nunca o código cru.
- **Campos de limite na trilha.** `staff → 5` virou "Máximo de pessoas na
  equipe: padrão da plataforma → 5" (o `null` é "volta ao padrão", não "—").
- **Nomes de campo crus na trilha.** A importação de clientes mostrava
  `foraDoLimite`, `repetidosComo`, `invalidos`… Agora: "Fora do limite de
  clientes", "O que fazer com repetidos", "Linhas com erro". Campo novo sem
  nome vira frase ("fora do limite"), nunca o caminho cru.
- **"Staff" no dashboard** virou "Pessoas na equipe".
- Os textos de todos os "i" moram em `features/admin/explicacoes.ts`.
- Nenhum campo da área nasce pré-preenchido com 0. Os limites nascem vazios
  (= padrão da plataforma), e o padrão aparece na dica.

## 1. Home da administração — dashboard (`/admin`)

Arquivos: `features/admin-dashboard/DashboardDoAdmin.tsx`, `CartaoDeNumero.tsx`.
Os números vêm de `GET /v1/admin/metricas` (`apps/api/src/modules/admin-metricas`).
"No período" = dias escolhidos no seletor, no fuso de Fortaleza.

| Número / controle | Rótulo visível | Antes | "i" |
| --- | --- | --- | --- |
| Seletor de período | Período do painel · comparar com o período anterior | — | — (o texto do topo diz "Comparando … com o período anterior de mesmo tamanho") |
| Lojas ativas | Lojas ativas · "Na vitrine ao fim do período" | — | ✅ "Lojas aprovadas e no ar no último dia do período. Não conta pendentes, recusadas, desativadas nem excluídas." Ex.: 18 lojas abertas para pedido em 30/09. |
| Novas lojas | Novas lojas · "Cadastradas no período" | — | ✅ "Lojas criadas dentro do período, em qualquer situação: inclui as que ainda esperam aprovação." |
| Aguardando aprovação | Aguardando aprovação | — | ✅ "Lojas que o dono abriu e a administração ainda não aprovou nem recusou. É a fila de agora: não depende do período." |
| Pedidos | Pedidos · "Feitos no período, sem os cancelados" | detalhe "Sem os cancelados" | ✅ "Pedidos feitos no período que contam como venda, somando todas as lojas. Cancelados e recusados ficam de fora." |
| Faturamento | Faturamento (R$) · "Soma dos pedidos vendidos pelas lojas" | Faturamento (GMV) · "Total vendido pelas lojas" | ✅ "Soma do valor total dos pedidos do período que contam como venda, de todas as lojas. É o que as lojas venderam, não o que o SimpleClick recebe." Ex.: 120 pedidos de R$ 50 = R$ 6.000. |
| Ticket médio | Ticket médio (R$) · "Faturamento ÷ pedidos" | Ticket médio | ✅ "Valor médio de cada pedido: o faturamento do período dividido pelo número de pedidos." Ex.: R$ 6.000 em 120 pedidos = R$ 50. |
| Conversão | Conversão (%) · "Carrinhos que viraram pedido no período" | Carrinho → pedido | ✅ "Dos carrinhos abertos no período, quantos viraram pedido, em porcentagem. Sem carrinho no período aparece —." Ex.: 200 carrinhos e 50 pedidos = 25%. |
| Clientes cadastrados | Clientes cadastrados · "Contas de cliente ao fim do período" | — | ✅ "Contas de cliente que existiam no último dia do período. Não conta donos, equipe nem a administração." |
| Novos clientes | Novos clientes · "Cadastrados no período" | — | — (o detalhe basta) |
| Donos de loja | Donos de loja · "Contas de dono com acesso ativo" | detalhe "Com vínculo ativo" | ✅ "Pessoas que são donas de pelo menos uma loja e não perderam o acesso. Quem é dono de duas lojas conta uma vez." |
| Pessoas na equipe | Pessoas na equipe · "Contas de equipe com acesso ativo" | **Staff** · "Equipe das lojas" | ✅ "Pessoas da equipe das lojas (não donas) com acesso ativo ao painel. Quem trabalha em duas lojas conta uma vez." |
| Comparativo (seta) | "↑ 12%" · "antes: N" | — | — (o leitor de tela lê "Subiu: 12%") |
| Gráficos | Pedidos por dia · Faturamento por dia · Novas lojas por semana · Novos clientes por semana · Lojas por tipo de negócio · Pedidos por hora do dia · Lojas por faturamento · Lojas por pedidos · Lojas mais novas | — | — (a descrição de cada cartão diz o recorte: "Semanas começam na segunda-feira", "Horário de Fortaleza", "As cinco que mais venderam no período"…) |

## 2. Lista de lojas (`/admin/lojas`)

Arquivo: `features/admin/ListaLojas.tsx`.

| Campo / coluna | Rótulo visível | Antes | "i" |
| --- | --- | --- | --- |
| Filtro por situação (pílulas) | Todas · Pendentes de aprovação · Ativas · Inativas · Recusadas (com contagem) | — | — |
| Busca | Buscar por loja, dono, CPF/CNPJ ou código · exemplo "Pastel da Joi, marina@…, 11.222.333/0001-81 ou 0002" | — | — |
| Tipo de negócio | Tipo de negócio | — | — |
| Ordenar por | Ordenar por | — | — |
| Coluna "Tipo de negócio" | Tipo de negócio | Tipo | — |
| Coluna "Pedidos (total)" | Pedidos (total) | Pedidos | ✅ "Todos os pedidos da loja desde o cadastro, menos os cancelados." |
| Coluna "Faturamento total" | Faturamento total | Faturamento | ✅ "Soma, em reais, dos pedidos da loja que contam como venda, desde o cadastro." |
| Ações (pendentes) | Aprovar · Recusar | — | — (cada botão abre a janela que explica o ato) |

## 3. Cadastrar loja (`/admin/lojas/nova`)

Arquivos: `features/admin/FormularioNovaLoja.tsx`, `formulario-da-loja.ts`.

| Campo | Rótulo visível | Antes | "i" |
| --- | --- | --- | --- |
| Nome | Nome da loja ou razão social * | — | — |
| Razão social | Razão social (se diferente do nome) | — | — |
| Documento | CPF ou CNPJ * · "Pode digitar com ou sem pontos, barra e hífen." | — | ✅ "O CPF (pessoa física) ou o CNPJ (empresa) de quem responde pela loja. Os dígitos são conferidos antes de salvar." Ex.: 11.222.333/0001-81. |
| Tipo de negócio | Tipo de negócio * | — | ✅ "O ramo da loja. Ele decide o vocabulário das telas (cardápio, catálogo…), se a loja controla estoque e a capa padrão. Dá para trocar depois na ficha." Ex.: Pastelaria, Mercadinho, Autopeças. |
| Apelido | Endereço da loja na web (apelido) * · "simpleclick.app/loja/… — letras minúsculas, números e hífen." | Endereço da loja na web | ✅ "É o fim do link da vitrine, que o lojista divulga. Precisa ser único; se já existir, a tela sugere um livre." Ex.: pastel-da-joi → simpleclick.app/loja/pastel-da-joi. |
| Nome do responsável | Nome do responsável * | — | — |
| E-mail do responsável | E-mail do responsável * · "É para este e-mail que vai o convite para definir a senha." | — | — |
| Telefone | Telefone com DDD * · "Ex.: (85) 99999-0000." | sem dica | — |
| CEP | CEP * · "8 números. Ex.: 60115-000." | sem dica | — |
| Logradouro, Bairro, Cidade | iguais | — | — |
| Número | Número * · "Sem número? Escreva S/N." | sem dica | — |
| Complemento | Complemento | — | — |
| UF | Estado (UF) * | UF | — |

## 4. Ficha da loja (`/admin/lojas/[id]`)

### 4.1 Cabeçalho e atos de aprovação

Arquivos: `CabecalhoDaFicha.tsx`, `AtosDeAprovacao.tsx`.

| Campo / ato | Rótulo visível | Antes | "i" |
| --- | --- | --- | --- |
| Situação (selo) | Ativa · Pendente de aprovação · Recusada · Inativa · Excluída | — | — (o aviso abaixo do título explica cada situação) |
| Aprovar / Aprovar mesmo assim | botão + janela com o que muda | — | — (a janela lista as consequências) |
| Motivo da recusa | Motivo da recusa (o dono vai ler) * · "De 3 a 500 caracteres. Ex.: o CNPJ informado não confere com a razão social." | sem dica, sem `*` | ✅ "O dono lê este texto no painel, na tela de cadastro em análise. Diga o que falta para aprovar." Ex.: envie o comprovante de endereço da loja. |
| Desativar loja | botão + janela | — | — |
| Motivo da desativação | Motivo da desativação (opcional) · "Até 500 caracteres. Se preencher, o dono lê no painel. Ex.: pedido do próprio dono." | sem dica | ✅ "Desativar tira a vitrine e o feed do ar na hora, sem apagar nada. Ativar de novo devolve a loja como estava." |
| Ativar loja | botão + janela | — | — |

### 4.2 Aba Resumo — números, equipe e limites

Arquivos: `MetricasDaLoja.tsx`, `EquipeDaLoja.tsx`, `LimitesDaLoja.tsx`.

| Campo / número | Rótulo visível | Antes | "i" |
| --- | --- | --- | --- |
| Período | Período do faturamento e dos pedidos: 7 dias · 30 dias · 90 dias · 1 ano | — | — |
| Faturamento total | Faturamento total · "N vendas desde o cadastro" | — | ✅ "Soma, em reais, dos pedidos que contam como venda desde o cadastro da loja. Cancelados ficam de fora." |
| Faturamento do período | Faturamento (30 dias) · "N vendas no período" | — | — (o rótulo diz o período) |
| Pedidos | Pedidos (total) · "N em 30 dias" | Pedidos | ✅ "Todos os pedidos que a loja recebeu desde o cadastro, menos os cancelados. Pedido recusado ou ainda não aceito entra aqui, mas não em vendas." |
| Ticket médio | Ticket médio · "Faturamento dividido pelas vendas" | — | — (o detalhe já explica a conta) |
| Clientes | Clientes cadastrados | Clientes | ✅ "Clientes que a loja tem na base: os que compraram, os cadastrados à mão e os importados de arquivo." |
| Produtos | Produtos cadastrados | Produtos | — |
| Categorias | Categorias cadastradas | Categorias | — |
| Último pedido | Último pedido | — | — |
| Dono e equipe | lista só de leitura | — | — |
| Limites (leitura) | Pessoas na equipe · Produtos · Categorias · Clientes — "N de M" + selo Padrão/Ajustado + barra de uso | — | ✅ no título "Limites da loja": "Quanto esta loja pode cadastrar. Padrão vem da plataforma; Ajustado foi mudado só para ela. Chegou no máximo, o painel do dono avisa e não deixa cadastrar mais." |
| Máximo de pessoas na equipe | Máximo de pessoas na equipe · "Número inteiro. Vazio usa o padrão: N." | Pessoas na equipe · "Vazio usa o padrão: N." | ✅ "Quantas pessoas da equipe (fora o dono) podem ter acesso ao painel desta loja." Ex.: 3 = dono + 3 atendentes. |
| Máximo de produtos | Máximo de produtos · idem | Produtos | ✅ "Quantos produtos a loja pode ter cadastrados, ativos ou não. Variações (tamanho, sabor) não contam como produto novo." Ex.: 500. |
| Máximo de categorias | Máximo de categorias · idem | Categorias | ✅ "Quantas categorias do cardápio ou catálogo a loja pode criar." Ex.: 30 (Pastéis, Bebidas…). |
| Máximo de clientes | Máximo de clientes · idem | Clientes | ✅ "Quantos clientes a loja pode ter na base, somando os que compraram, os cadastrados à mão e os importados." Ex.: 2000. |

### 4.3 Aba Cadastro — dados, endereço na web, tipo de negócio, exclusão

Arquivos: `DadosDaLoja.tsx`, `FichaLoja.tsx`, `EnderecoDaLoja.tsx`,
`SeletorVertical.tsx`, `AcoesLoja.tsx`.

| Campo | Rótulo visível | Antes | "i" |
| --- | --- | --- | --- |
| Nome, Razão social, CPF ou CNPJ | iguais ao cadastro (seção 3) | — | ✅ só no CPF ou CNPJ (mesmo texto da seção 3) |
| E-mail | E-mail de contato da loja | E-mail | — |
| Telefone | Telefone com DDD · "Ex.: (85) 99999-0000." | sem dica | — |
| CEP | CEP · "8 números. Ex.: 60115-000." | sem dica | — |
| UF | Estado (UF) | UF | — |
| Novo endereço na web | Novo endereço na web · "Só letras minúsculas, números e hífen. Ex.: pastel-da-joi vira /loja/pastel-da-joi. O endereço antigo continua funcionando e leva ao novo." | dica sem formato nem exemplo | ✅ "Troca o fim do link da vitrine. Quem abrir o link antigo é levado ao novo, então nada que o lojista já divulgou quebra." |
| Novo tipo de negócio | Novo tipo de negócio | — | ✅ "Trocar o ramo muda o vocabulário das telas, a capa padrão e se a loja controla estoque. Produtos e pedidos continuam. A tela mostra o que muda antes de confirmar." Ex.: de Lanchonete para Pastelaria. |
| Excluir loja (confirmação) | Para confirmar, digite o nome da loja · "Digite exatamente: {nome}" | — | ✅ "Excluir tira a loja do ar e das listas na hora. Os dados ficam guardados por 30 dias e dá para restaurar; depois disso a remoção é definitiva e não volta." |
| Motivo da suspensão | Motivo da suspensão · "De 3 a 500 caracteres. O dono lê…" | sem o tamanho | — (formulário só existe no componente; a ficha usa Desativar, seção 4.1) |

### 4.4 Aba Documentos

Arquivos: `DocumentosDaLoja.tsx`, `documentos-da-loja.ts`.

| Campo | Rótulo visível | Antes | "i" |
| --- | --- | --- | --- |
| Tipo do documento | Tipo do documento: Contrato assinado · Documento do responsável · Comprovante de endereço | — | ✅ "Contrato: o termo assinado com o SimpleClick. Documento do responsável: RG ou CNH de quem responde pela loja. Comprovante de endereço: conta de luz, água ou similar." |
| Arquivo | Arquivo do documento · "Só PDF, até 10 MB…" / "PDF até 10 MB, ou foto PNG ou JPEG até 5 MB…" | Arquivo | — (a dica traz formato e tamanho) |
| Lista | nome do arquivo, tipo, tamanho (KB/MB), data e quem enviou · "Abrir" | — | — (o link é temporário e cada abertura fica na auditoria) |

### 4.5 Aba Funcionalidades

Arquivo: `FuncionalidadesDaLoja.tsx`.

| Campo | Rótulo visível | Antes | "i" |
| --- | --- | --- | --- |
| Situação | Ligada · Desligada para esta loja | — | — |
| Desligar / Religar | botão com o nome da funcionalidade | — | — (o passo de confirmação diz o que muda) |
| Motivo da alteração | Motivo da alteração * · "De 3 a 500 caracteres. Fica no histórico da loja, com o seu nome. Ex.: pedido do dono por telefone." | Motivo · "Fica no histórico da loja, com o seu nome." | ✅ "Desligar tira a área do menu do dono e bloqueia as rotas dela. Nada é apagado: religar devolve tudo como estava." |

### 4.6 Aba Histórico

Arquivos: `HistoricoDaLoja.tsx`, `ListaDaTrilha.tsx`, `trilha-na-tela.ts`.
Só leitura: ato, quando, "Por {nome} ({papel})" e cada campo "antes → depois".
Papel e atos agora em português (ver "Achados gerais").

## 5. Contas (`/admin/contas` e `/admin/contas/[id]`)

Arquivos: `ListaDeContas.tsx`, `FichaDaConta.tsx`.

| Campo | Rótulo visível | Antes | "i" |
| --- | --- | --- | --- |
| Tipo de conta (pílulas) | Donos de loja · Equipe das lojas | — | — |
| Busca | Buscar por nome, e-mail ou telefone · exemplo "Marina, marina@… ou 11 91111-0001" | — | — |
| Coluna Lojas / limite | "N de M" | — | — |
| Máximo de lojas desta conta | Máximo de lojas desta conta · "Número inteiro de lojas. Vazio usa o padrão da plataforma: N." | dica sem a unidade | ✅ "Quantas lojas este dono pode ter ao mesmo tempo, contando as que esperam aprovação. Vale só para esta conta." Ex.: 3 para uma rede com três unidades. |

## 6. Auditoria (`/admin/auditoria`)

Arquivo: `HistoricoDeAuditoria.tsx`.

| Campo | Rótulo visível | Antes | "i" |
| --- | --- | --- | --- |
| Tipo de ato | Tipo de ato (todos os atos com nome em português) | Ato (só os atos do contrato) | ✅ "Cada mudança feita por administração, dono ou equipe vira um ato, com quem fez, quando e o valor de antes e de depois." |
| Data inicial | Data inicial | De | — |
| Data final | Data final | Até | — |
| Só desta loja | botão por ato · selo "Só a loja …" | — | — |

## Onde ficam os "i" (nada fica por cima)

- Campos com `Campo`: o "i" vem pela prop `info`, na linha do rótulo. Com
  `Seletor` (tipo de negócio, tipo do documento, tipo de ato), o controle
  recebe `aria-describedby` de `descritoresDoCampo(id, { info: true })`.
- Cartões de número do dashboard (`CartaoDeNumero`, prop nova `info`) e da
  ficha (`Indicador`): o "i" fica no título, ao lado do rótulo. **Correção de
  sobreposição:** em 390 px o desenho decorativo do cartão do dashboard ficava
  por cima do "i" quando o rótulo quebrava em duas linhas ("Aguardando
  aprovação", "Faturamento (R$)"). Agora o desenho só aparece a partir de
  540 px e o rótulo quebra junto com o "i".
- Lista de lojas: o `Tabela` só aceita texto no cabeçalho da coluna, então o
  "i" dos totais fica numa linha visível acima da tabela ("Pedidos e
  faturamento contam desde o cadastro de cada loja.").
- Limites da loja: um "i" em cada linha de uso (leitura) e em cada campo de
  "Máximo de…" (edição).
- Janelas de confirmação (recusar, desativar): o "i" do motivo fica dentro da
  janela e o balão abre por cima dela, inteiro na tela.

### Conferência (Playwright headless, 1400 × 900 e 390 × 844)

Script: `/tmp/sc71-script/prints.mjs` (fora do repositório). Prints em
`/tmp/sc71/` (108 arquivos): página de cada tela e cada "i" aberto, inclusive
os estados com formulário aberto (Editar limites, Excluir loja, janela de
Recusar e de Desativar, Desligar funcionalidade).

Resultado nas 13 telas × 2 larguras: nenhum "i" coberto por outro elemento
(depois da correção acima), nenhum balão fora da tela, Esc fecha todos.
Observação para o #66/#72: com o balão ABERTO, ele fica por cima do campo de
cima (abre para cima do "i", como o componente define); fecha com Esc,
clique fora ou rolagem.
