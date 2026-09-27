# Mapa de telas — inventário auditável

> Existe porque "testes E2E validando **todas** as telas" só é verificável se a
> lista de telas for explícita. Cada linha é uma rota do Next que precisa de ao
> menos um teste de ponta a ponta com Playwright, e as telas com dados precisam
> dos quatro estados exigidos pelo princípio P-011 (carregando, vazio, erro,
> sucesso) e passar na verificação de acessibilidade do princípio P-012.
>
> Convenção de rota: `/l/{slug}` identifica a loja por caminho. O `{slug}` é o
> apelido da loja. A decisão caminho vs subdomínio está registrada como decisão
> pendente D1 em `decisoes-pendentes.md`.

## Legenda

- **Acesso**: `público` (sem sessão) · `CUSTOMER` · `OWNER` · `ADMIN_GERAL`
- **Estados**: `4E` = precisa dos quatro estados · `—` = tela sem carga de dados
- **E2E**: identificador do cenário de ponta a ponta que cobre a tela

## Público — loja e catálogo

| #   | Rota                       | Tela                           | Acesso  | Estados | E2E                   | Critérios                              |
| --- | -------------------------- | ------------------------------ | ------- | ------- | --------------------- | -------------------------------------- |
| 1   | `/l/{slug}`                | Página de apresentação da loja | público | 4E      | e2e-loja-lp           | AC-400, AC-401, AC-402, AC-403, AC-916 |
| 1a  | `/l/{slug}/sobre`          | Página institucional da loja   | público | 4E      | e2e-sobre-da-loja     | AC-421..AC-423                         |
| 2   | `/l/{slug}/catalogo`       | Vitrine / cardápio / catálogo  | público | 4E      | e2e-vitrine           | AC-404..AC-409, AC-415..AC-417, AC-420 |
| 2a  | `/l/{slug}/tv`             | Cardápio na TV da loja         | público | 4E      | e2e-cardapio-na-tv    | AC-925..AC-931                         |
| 3   | `/l/{slug}/produto/{id}`   | Detalhe do produto             | público | 4E      | e2e-produto-detalhe   | AC-410..AC-414, AC-328                 |
| 4   | `/l/{slug}/carrinho`       | Carrinho                       | público | 4E      | e2e-carrinho          | AC-500..AC-503                         |
| 5   | `/l/{slug}/checkout`       | Fechamento do pedido           | público | 4E      | e2e-checkout          | AC-504..AC-513, AC-905..AC-908         |
| 6   | `/l/{slug}/pedido/{token}` | Acompanhamento do pedido       | público | 4E      | e2e-acompanhamento    | AC-612..AC-615, AC-610                 |
| 7   | `/l/{slug}/indisponivel`   | Loja fechada ou suspensa       | público | —       | e2e-loja-indisponivel | AC-402, AC-209                         |

## Público — plataforma

| #   | Rota                       | Tela                                    | Acesso  | Estados | E2E                 | Critérios                      |
| --- | -------------------------- | --------------------------------------- | ------- | ------- | ------------------- | ------------------------------ |
| 8   | `/`                        | Página inicial da plataforma            | público | —       | e2e-home            | —                              |
| 9   | `/entrar`                  | Login (e-mail e senha)                  | público | 4E      | e2e-login           | AC-105, AC-108, AC-119, AC-120 |
| 10  | `/entrar/verificacao`      | Segundo fator (código ou aplicativo)    | público | 4E      | e2e-2fa             | AC-105..AC-107, AC-121..AC-124 |
| 11  | `/cadastrar`               | Cadastro de cliente final               | público | 4E      | e2e-cadastro        | AC-100..AC-102                 |
| 12  | `/verificar-email`         | Confirmação de e-mail por link          | público | 4E      | e2e-verificar-email | AC-103, AC-104                 |
| 13  | `/recuperar-senha`         | Pedido de recuperação                   | público | 4E      | e2e-recuperar-senha | AC-114                         |
| 14  | `/definir-senha`           | Nova senha (recuperação e convite)      | público | 4E      | e2e-definir-senha   | AC-115, AC-200                 |
| 15  | `/termos` e `/privacidade` | Termos de uso e política de privacidade | público | —       | e2e-legais          | ASM-704                        |
| 16  | `/nao-encontrado` e erro   | Página de erro e não encontrado         | público | —       | e2e-erro            | AC-024                         |

## Cliente final

| #   | Rota                        | Tela                           | Acesso   | Estados | E2E                      | Critérios              |
| --- | --------------------------- | ------------------------------ | -------- | ------- | ------------------------ | ---------------------- |
| 17  | `/minha-conta`              | Meus dados                     | CUSTOMER | 4E      | e2e-conta-dados          | AC-509                 |
| 18  | `/minha-conta/pedidos`      | Meus pedidos (todas as lojas)  | CUSTOMER | 4E      | e2e-conta-pedidos        | AC-616                 |
| 19  | `/minha-conta/pedidos/{id}` | Detalhe do meu pedido          | CUSTOMER | 4E      | e2e-conta-pedido-detalhe | AC-616, AC-713         |
| 20  | `/minha-conta/enderecos`    | Meus endereços                 | CUSTOMER | 4E      | e2e-conta-enderecos      | AC-509                 |
| 21  | `/minha-conta/seguranca`    | Senha, segundo fator e sessões | CUSTOMER | 4E      | e2e-conta-seguranca      | AC-108, AC-112, AC-113 |

## Dono da loja — operação

| #   | Rota                   | Tela                                  | Acesso | Estados | E2E               | Critérios                      |
| --- | ---------------------- | ------------------------------------- | ------ | ------- | ----------------- | ------------------------------ |
| 22  | `/painel`              | Painel com métricas do dia            | OWNER  | 4E      | e2e-painel        | AC-800..AC-802, AC-814         |
| 23  | `/painel/metricas`     | Métricas por período                  | OWNER  | 4E      | e2e-metricas      | AC-803..AC-813, AC-815, AC-816 |
| 24  | `/painel/pedidos`      | Fila de pedidos ao vivo               | OWNER  | 4E      | e2e-fila-pedidos  | AC-600..AC-603, AC-609, AC-611 |
| 25  | `/painel/pedidos/{id}` | Detalhe do pedido e mudança de status | OWNER  | 4E      | e2e-pedido-status | AC-604..AC-608, AC-617..AC-621 |
| 26  | `/painel/pedidos/novo` | Lançar pedido manual                  | OWNER  | 4E      | e2e-pedido-manual | AC-707..AC-710                 |

## Dono da loja — catálogo

| #   | Rota                                     | Tela                                   | Acesso | Estados | E2E                 | Critérios                                                                      |
| --- | ---------------------------------------- | -------------------------------------- | ------ | ------- | ------------------- | ------------------------------------------------------------------------------ |
| 27  | `/painel/categorias`                     | Categorias (lista e ordenação)         | OWNER  | 4E      | e2e-categorias      | AC-300..AC-303                                                                 |
| 28  | `/painel/categorias/{id}/especificacoes` | Criador de especificações da categoria | OWNER  | 4E      | e2e-specs-categoria | AC-325..AC-330                                                                 |
| 29  | `/painel/produtos`                       | Produtos (lista, busca, estoque baixo) | OWNER  | 4E      | e2e-produtos-lista  | AC-307, AC-308, AC-321, AC-336                                                 |
| 30  | `/painel/produtos/novo` e `/{id}`        | Cadastro e edição de produto           | OWNER  | 4E      | e2e-produto-form    | AC-304..AC-306, AC-309..AC-312, AC-318, AC-319, AC-322, AC-324, AC-326, AC-327 |
| 31  | `/painel/produtos/{id}/opcoes`           | Grupos de escolha do produto           | OWNER  | 4E      | e2e-opcoes          | AC-313..AC-317                                                                 |
| 31a | `/painel/produtos/{id}/variacoes`        | Grade de variações do produto          | OWNER  | 4E      | e2e-variacoes       | AC-316                                                                         |
| 32  | `/painel/produtos/{id}/estoque`          | Estoque e movimentos da variação       | OWNER  | 4E      | e2e-estoque         | AC-331..AC-337                                                                 |

## Dono da loja — clientes e configuração

| #   | Rota                       | Tela                                       | Acesso | Estados | E2E                  | Critérios                      |
| --- | -------------------------- | ------------------------------------------ | ------ | ------- | -------------------- | ------------------------------ |
| 33  | `/painel/clientes`         | Clientes da loja                           | OWNER  | 4E      | e2e-clientes-lista   | AC-700..AC-702                 |
| 34  | `/painel/clientes/{id}`    | Ficha e histórico do cliente               | OWNER  | 4E      | e2e-cliente-ficha    | AC-703..AC-706, AC-711..AC-713 |
| 35  | `/painel/config/pagamento` | Chave PIX e formas de pagamento            | OWNER  | 4E      | e2e-config-pagamento | AC-900..AC-904, AC-512         |
| 36  | `/painel/config/entrega`   | Entrega, retirada, taxa e mínimo           | OWNER  | 4E      | e2e-config-entrega   | AC-905..AC-908                 |
| 37  | `/painel/config/horarios`  | Horário, fechar agora e exceções           | OWNER  | 4E      | e2e-config-horarios  | AC-909..AC-912                 |
| 38  | `/painel/config/contato`   | WhatsApp e texto da mensagem               | OWNER  | 4E      | e2e-config-contato   | AC-913..AC-915                 |
| 39  | `/painel/config/aparencia` | Apresentação, logo, capa e cor             | OWNER  | 4E      | e2e-config-aparencia | AC-916..AC-918, AC-015         |
| 40  | `/painel/config/impressao` | Papel, conteúdo do cupom e modo automático | OWNER  | 4E      | e2e-config-impressao | AC-622, AC-626, AC-919, AC-920 |

## Administração da plataforma

| #   | Rota                                | Tela                                    | Acesso      | Estados | E2E                  | Critérios              |
| --- | ----------------------------------- | --------------------------------------- | ----------- | ------- | -------------------- | ---------------------- |
| 41  | `/admin`                            | Visão geral da plataforma               | ADMIN_GERAL | 4E      | e2e-admin-home       | Q-802                  |
| 42  | `/admin/lojas`                      | Lojas (lista e busca)                   | ADMIN_GERAL | 4E      | e2e-admin-lojas      | AC-206                 |
| 43  | `/admin/lojas/nova`                 | Cadastro de loja                        | ADMIN_GERAL | 4E      | e2e-admin-loja-nova  | AC-200..AC-202         |
| 44  | `/admin/lojas/{id}`                 | Ficha da loja, tipo de negócio e status | ADMIN_GERAL | 4E      | e2e-admin-loja-ficha | AC-207..AC-211, AC-214 |
| 45  | `/admin/lojas/{id}/documentos`      | Contrato e documentos                   | ADMIN_GERAL | 4E      | e2e-admin-documentos | AC-203..AC-205         |
| 46  | `/admin/lojas/{id}/funcionalidades` | Funcionalidades liberadas               | ADMIN_GERAL | 4E      | e2e-admin-features   | AC-212, AC-213         |
| 47  | `/admin/auditoria`                  | Histórico de auditoria                  | ADMIN_GERAL | 4E      | e2e-admin-auditoria  | AC-118, AC-922         |

## Contagem e regra de cobertura

- **50 telas** no inventário: as 47 da primeira versão, mais `1a` (Sobre da
  loja, T-410), `31a` (grade de variações, T-306) e `2a` (cardápio na TV,
  T-950), acrescentadas sem renumerar. 46 exigem os quatro estados.
- Cada cenário de ponta a ponta roda em três perfis de sessão (visitante, dono e
  administração), reaproveitando sessão salva para não repetir login.
- Cada tela do inventário tem verificação de acessibilidade automatizada e
  verificação de ausência de rolagem horizontal na menor largura suportada.
- Uma tela nova só entra no produto junto da linha correspondente nesta tabela —
  é isso que mantém "todas as telas" verificável em vez de aspiracional.
