# Design: Continuidade visual de favoritos, pedidos e perfil do cliente

> feature: stitch-area-do-cliente · card #111 · 09/11/2026

Documento de proposta. Nada aqui está aprovado: as decisões do dono do
produto estão nas perguntas Q-11101…Q-11112 da spec. Caminhos relativos a
`apps/web/src/` salvo indicação. **Fato** = lido no código; **inferência** =
deduzido sem rodar; **não confirmado** = precisa de verificação.

## 1. Estado atual (evidências)

### 1.1 Rotas e componentes

| Rota                                    | Página                                           | Componente principal                                            |
| --------------------------------------- | ------------------------------------------------ | --------------------------------------------------------------- |
| `/conta`                                | `app/(conta)/conta/page.tsx`                     | `features/conta/VisaoGeralDaConta.tsx`                          |
| `/conta/pedidos`                        | `app/(conta)/conta/pedidos/page.tsx`             | `MeusPedidos.tsx`, `FiltrosDePedidos.tsx`                       |
| `/conta/pedidos/[id]`                   | `app/(conta)/conta/pedidos/[id]/page.tsx`        | `features/pedido/AcompanhamentoDoPedido.tsx`                    |
| `/conta/favoritos`                      | `app/(conta)/conta/favoritos/page.tsx`           | `LojasDaConta.tsx` (`ListaDeLojas`, `ListaDeProdutosFavoritos`) |
| `/conta/dados`                          | `app/(conta)/conta/dados/page.tsx`               | `DadosDaConta.tsx`                                              |
| `/conta/enderecos`                      | `app/(conta)/conta/enderecos/page.tsx`           | `EnderecosSalvos.tsx`                                           |
| `/conta/seguranca`                      | `app/(conta)/conta/seguranca/page.tsx`           | `SegurancaDaConta.tsx`, `PrivacidadeDaConta.tsx`                |
| `/conta/seguranca/aplicativo`           | `.../seguranca/aplicativo/page.tsx`              | `AtivacaoDoAplicativo.tsx`                                      |
| `/loja/[slug]/pedido/[token]` (público) | `app/(loja)/loja/[slug]/pedido/[token]/page.tsx` | `AcompanhamentoDoPedido` (sem sessão)                           |

A moldura é `app/(conta)/conta/layout.tsx` (`LateralDaSessao` + `RodapeLegal`).
O menu é `features/usuario/LateralDoUsuario.tsx`, que força `data-tema="escuro"`;
os itens vêm de `itensDoUsuario` e `itemAtivo` em `lib/quem-esta-logado.ts`
(dono #105). Estilos: `packages/ui/styles/conta.css` e `usuario.css`.

### 1.2 Quem garante a posse dos dados (fato)

| Dado                   | Garantia                                                                                                                                                                                                                                       |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pedidos da conta       | `apps/api/src/modules/orders/meus-pedidos.usecase.ts` (`exigirClienteDaConta`, `listarMeusPedidos`, `localizarMeuPedido`) e a função SQL `app.meus_pedidos`, filtrada por `app.current_user_id()`. Pedido alheio e inexistente dão o mesmo 404 |
| Favoritos e recentes   | `apps/api/src/modules/feed/feed.usecase.ts`, filtro `identity_id = app.current_user_id()`                                                                                                                                                      |
| Endereços              | `apps/api/src/modules/customers/enderecos.usecase.ts`                                                                                                                                                                                          |
| Dados, senha, sessões  | `apps/api/src/modules/conta/conta.routes.ts`; a conexão de outra pessoa só é barrada pela política `sessions_self_update` do banco (migração 0044), sem filtro explícito no SQL                                                                |
| Acompanhamento público | `packages/contracts/src/acompanhamento.ts` (`esquemaDoAcompanhamento`, `strictObject`): telefone mascarado, `historico.motivo` é texto livre da loja                                                                                           |

### 1.3 Lacunas lidas no código (entram na US-11107)

1. **Remover produto favorito aparenta falhar** (fato por leitura, não
   executado). `LojasDaConta.tsx` chama `DELETE favoritos/produtos/<id>`, e o
   `PERMITIDOS` de `app/api/conta/[...resto]/route.ts` aceita só
   `favoritos/[a-z0-9-]+`, sem segunda barra. Esperado: 404 e o aviso "Não foi
   possível remover agora". Nenhum teste cobre o caminho.
2. **CSRF depende só do cookie SameSite=Lax.** `server/encaminhar-a-loja.ts`
   escreve o `Origin` com a origem da própria requisição, então a conferência da
   API nunca recusa nada; a rota da conta não confere origem nem tipo de
   conteúdo. Em produção o cookie fica em domínio compartilhado.
3. **Retorno perdido.** Há oito `redirect("/entrar")` fixos nas páginas da
   conta (sem cookie e com 401). O retorno com `comDestino` e `destinoSeguro` é
   do #105; esta spec só guarda o critério do laço (AC-11127).
4. **Sair mantém a sessão se a revogação falhar** (`server/actions/auth.ts`,
   `sairDaConta`): a pessoa fica logada e é levada a `/conta/seguranca?estado=erro`.
5. **Troca de senha**: as outras conexões caem no banco, mas o token de acesso
   (15 minutos) continua válido até vencer; por isso a promessa é "em até 15
   minutos".
6. **Defeito de teste**: não há teste para `DadosDaConta`, `SegurancaDaConta`,
   `PrivacidadeDaConta`, `LojasDaConta` nem para o filtro `PERMITIDOS` (não
   confirmado para `PATCH dados`, `POST senha` e `DELETE sessoes`).

## 2. Propostas das telas

Todas as propostas são **neutras em relação ao tema** (Q-10402, Q-11104):
descrevem regiões, ordem e estados, não cores. Larguras de referência: 390
(celular) e 1280 (computador). Cada tela traz uma **conferência** para o #114
comparar a captura item por item (AC-11403 do #114).

Convenções: `[ ]` botão, `( )` chip, `★` favoritar (#104), `▸` link.

### 2.1 Navegação interna da conta (Q-11103)

```
Computador                          Celular (/conta = "Perfil")
┌─ topo do site (#105) ──────────┐  ┌─ topo (#105) ─────────────┐
├─ SEÇÕES ──┬─ CONTEÚDO ─────────┤  │ Olá, <nome>                │
│ Visão ger.│ título da seção     │  │ ▸ Visão geral             │
│ Pedidos   │ ...                 │  │ ▸ Pedidos                 │
│ Favoritos │                     │  │ ▸ Favoritos               │
│ Dados     │                     │  │ ▸ Dados  ▸ Endereços      │
│ Endereços │                     │  │ ▸ Segurança   [ Sair ]    │
│ Segurança │                     │  ├─ barra inferior (#104) ───┤
└───────────┴─────────────────────┘  └───────────────────────────┘
```

Conferência: seção atual marcada e anunciada como página atual; seis seções
na mesma ordem (Visão geral, Pedidos, Favoritos, Dados, Endereços, Segurança);
"Sair" na lista, longe das ações de dados; "Voltar à loja" só quando há loja
de origem; nada de "Entrar" para quem está logado.

### 2.2 Favoritos (`/conta/favoritos`)

```
Favoritos
(Produtos) (Lojas)                       ← abas (#104) ou blocos empilhados
┌ cartão de produto ───────────────┐
│ [foto 4:5]  nome do produto      │
│ R$ preço    loja ▸               │
│ ★ Tirar dos favoritos            │
└──────────────────────────────────┘
Lojas favoritas            ← lista com logo, nome, segmento, ★
Visitadas nos últimos 30 dias   ← lista, sem ★ de ação obrigatória
```

Conferência: blocos na ordem produtos, lojas favoritas, recentes; cada produto
com foto, nome, preço, loja e link; ação "Tirar dos favoritos" com nome
acessível e estado anunciado; falha de remoção mantém o item e mostra aviso;
nunca aparece contagem pública de favoritos, nota, cupom nem selo (P-107).
Vazio, erro e carregamento: #114.

### 2.3 Lista de pedidos (`/conta/pedidos`)

```
Pedidos
( Situação ▾ ) ( Período ▾ ) ( Loja ▾ )      ← vão para o endereço
┌ cartão ──────────────────────────────────┐
│ Loja X · #código · 12/11  ( Em preparo ) │
│ 3 itens · R$ total          ▸ Ver pedido │
└──────────────────────────────────────────┘
```

Conferência: um cartão por pedido com loja, código, data, estado em texto do
cliente, total e link; o chip de estado nunca é só cor; cancelado com aparência
própria; filtros com o valor atual visível; nenhum dado pessoal no endereço.

### 2.4 Detalhe e acompanhamento (`/conta/pedidos/[id]` e link público)

```
◂ Pedidos                                       (só na conta)
Pedido #código · Loja X            ( Em preparo )
Linha do tempo: ○ Recebido ● Aceito ◉ Em preparo ○ Pronto ○ Concluído
   texto explicativo da etapa atual (explicacaoDoStatus)
Itens: nome · variação · qtd · opções · total
Forma de receber · Forma de pagar · Total
Cliente: nome · telefone mascarado
[ Falar com a loja no WhatsApp ]                (se a loja tem WhatsApp)
```

Conferência: etapa atual marcada e anunciada; etapas anteriores listadas;
cancelado mostra o motivo só se a loja informou (texto livre: nunca
interpretado como HTML); campos exatamente os de `esquemaDoAcompanhamento`; no
link público não há CPF, e-mail, endereço salvo nem telefone completo; sem
"voltar" no link público.

### 2.5 Dados e endereços

```
Dados                                    Endereços
Nome        [______]                     ┌ Casa (padrão) ───────────┐
Telefone    [______]                     │ rua, nº, bairro, cidade  │
CPF         [______]                     │ [ Editar ] [ Apagar ]    │
E-mail      fulano@…   (não muda aqui)   └──────────────────────────┘
(  ) Quero receber ofertas               [ + Novo endereço ]
[ Salvar ]
```

Conferência: e-mail fixo com a explicação; um único endereço padrão; salvar
mostra pendente e erro com saída; confirmação antes de apagar; CPF e telefone
conforme a Q-11110.

### 2.6 Segurança e privacidade

```
Segurança
Senha        [ Trocar senha ]   ← diz: "outras conexões caem em até 15 min"
Aplicativo autenticador  [ Ativar ] / [ Desativar ]
Conexões abertas   lista com aparelho, local, data  [ Encerrar ]
Privacidade        aceites (histórico) · [ Exportar meus dados ]
Zona de risco      [ Excluir minha conta ]   ← senha + palavra EXCLUIR
```

Conferência: "Excluir" separado do resto e com a confirmação forte; respostas
de erro específicas (senha incorreta, tem loja, administração, limite); chave
e códigos do aplicativo mostrados uma vez e fora de endereço e armazenamento.

## 3. Peças do #104 usadas

Estrela (`IconeEstrela`), `Chip`, `Abas`, `AvisoFlutuante`, `Gaveta` e
`BarraInferior`, mais os tokens `--cor-*` e `--cor-primaria` (#B7FF00, P-102).
Em `/conta` **não há** `TemaDaMarca`: a cor é a da plataforma, não a de uma
loja. Nenhuma peça nova é criada aqui; se faltar uma, ela entra numa rodada do
#104 antes (P-108).

## 4. Alternativas e recomendação

### D-1. Pasta e bloco

Pasta `stitch-area-do-cliente` e bloco 11101–11199, conforme o README do #103
(o brief citava `stitch-conta`). Sem impacto técnico.

### D-2. Navegação da conta (Q-11103)

| Alternativa                                                  | Ganha                                    | Perde                                           |
| ------------------------------------------------------------ | ---------------------------------------- | ----------------------------------------------- |
| A. Manter a `LateralDoUsuario` e acrescentar a barra do #105 | menor mudança                            | dois menus no celular                           |
| B. Substituir a lateral por seções internas da conta         | um só menu; combina com a barra inferior | refazer testes de `lateral-do-usuario.test.tsx` |
| C. Tudo no menu do avatar                                    | só o #105                                | seções escondidas atrás de um clique            |

Recomendo **B**: a barra e o topo (#105) levam a `/conta`, Favoritos e
Pedidos; as seções internas ficam em `/conta`. Não duplica o menu do #105.

### D-3. Lacunas e defeitos

Registrar como US-11107 condicionada às Q-11105 e Q-11106, sem presumir a
correção. Recomendo corrigir o favorito no próprio redesign (o botão que o
redesign mostra não pode falhar) e tratar a proteção de origem num card de
segurança. É a decisão do dono.

### D-4. Camada de prova

Teste de tela com `fetch` simulado não prova isolamento entre pessoas. Cada
critério declara a camada na spec. Os testes atuais de `apps/api/tests`
continuam como regressão sem mudança. O motor ONP só lê `apps/web`,
`apps/*/src` e `packages/*`, então a prova de isolamento via `onp-spec verify`
exige aceitar teste legado ou um e2e do #114 (Q-11111).

### D-5. Formato da proposta visual (Q-11102)

Recomendo **wireframe textual (esta seção 2)** agora, e protótipo na vitrine
de peças só depois da primeira onda aprovada. Imagens geradas ficam fora (P-103).

### D-6. Atualização da lista de pedidos (Q-11107)

Hoje só o detalhe atualiza a cada 5 segundos. Recomendo manter assim e deixar
a lista com atualização ao voltar à aba, porque a lista cobre várias lojas e
multiplica as chamadas. É decisão do dono.

## 5. Proxy da conta: o que é permitido (proposta, só se Q-11105 e Q-11106 aprovarem)

| Caminho                     | Métodos      | Observação              |
| --------------------------- | ------------ | ----------------------- |
| `dados`                     | GET, PATCH   | PATCH não aceita e-mail |
| `senha`                     | POST         | pede a senha atual      |
| `sessoes`                   | GET          |                         |
| `sessoes/<uuid>`            | DELETE       | uuid de 36 caracteres   |
| `aplicativo/desativar`      | POST         | pede a senha            |
| `excluir`                   | POST         | senha e palavra EXCLUIR |
| `aceites`                   | GET, POST    |                         |
| `privacidade/exportar`      | POST         | pede a senha            |
| `favoritos`, `recentes`     | GET          |                         |
| `favoritos/<apelido>`       | POST, DELETE | apelido da loja         |
| `favoritos/produtos/<uuid>` | POST, DELETE | **novo**; nunca `.+`    |
| `tutorial`                  | GET, POST    |                         |

Testes negativos: `favoritos/produtos/x/y`, segmento com `%2F` ou `..`,
`feed/favoritos`, `metricas` e `GET excluir`; origem de fora recebe 403 e
corpo que não seja JSON recebe 415. `favoritos/produtos` sem id hoje casa com
`favoritos/[a-z0-9-]+` e chega à API como se fosse o apelido de uma loja: o
padrão novo corrige isso.

## 6. Estratégia de testes

| Camada                | Onde                                                                                                                                                                                                      | Prova                                                                            |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Tela e ação           | `apps/web/tests/area-do-cliente-*.onp.test.tsx` (a criar)                                                                                                                                                 | AC-11102 a AC-11104, AC-11106, AC-11107, AC-11109 a AC-11111, AC-11122, AC-11130 |
| Proxy                 | `apps/web/tests/area-do-cliente-proxy.onp.test.ts` (a criar)                                                                                                                                              | AC-11125, AC-11126 (só após as Q)                                                |
| API com banco (atual) | `apps/api/tests/meus-pedidos.test.ts`, `favoritos-e-recentes.test.ts`, `enderecos-do-cliente.int.test.ts`, `rotas-da-conta-segura.test.ts`, `lgpd-conta.test.ts`, `acompanhamento-nao-enumeravel.test.ts` | AC-11101, AC-11105, AC-11108, AC-11112 a AC-11118                                |
| e2e com duas contas   | #114 (não conta no `onp-spec verify`, Q-11405 do #114)                                                                                                                                                    | AC-11101, AC-11105, AC-11108, AC-11120, AC-11124                                 |
| Revisão do dono       | capturas do #114 contra a seção 2                                                                                                                                                                         | AC-11128, AC-11129                                                               |

Lacuna a fechar na implementação: testes que faltam hoje para `PATCH dados`,
`POST senha`, `DELETE sessoes` (inclusive a conexão de outra pessoa),
`DadosDaConta`, `SegurancaDaConta` e `PrivacidadeDaConta`.

## 7. Donos de arquivo e ordem

| Arquivo ou pasta                                               | Dono ou fila                                 |
| -------------------------------------------------------------- | -------------------------------------------- |
| `packages/ui/styles/conta.css`, `usuario.css`                  | #111                                         |
| `features/conta/*`, `app/(conta)/conta/*` (visual)             | #111                                         |
| páginas protegidas de `app/(conta)/conta/*` (guarda e retorno) | #105 → #111                                  |
| `app/_usuario/sessao.tsx`, `lib/quem-esta-logado.ts`           | #105 → #111                                  |
| `features/usuario/LateralDoUsuario.tsx`                        | #111 (decisão Q-11103 com o #105)            |
| `packages/ui/styles/pedidos.css`                               | #112 → #111                                  |
| `packages/ui/styles/vitrine.css`                               | #107 → #108 → #111                           |
| `features/feed/BotaoFavoritar.tsx`                             | #106 (uso, sem edição)                       |
| `app/(loja)/loja/[slug]/layout.tsx`                            | #105                                         |
| `features/pedido/*`, `app/(loja)/loja/[slug]/pedido/[token]/*` | #111                                         |
| `app/(conta)/conta/layout.tsx`                                 | #111 (também citado pela spec de fidelidade) |

Execução futura: uma tarefa após a outra (T-11101 a T-11110), na pasta
principal, sem worktree e sem o executor paralelo do motor.

## 8. Riscos

| Risco                                                               | Mitigação                                                    | Detecção                        |
| ------------------------------------------------------------------- | ------------------------------------------------------------ | ------------------------------- |
| Vazar dado de uma pessoa para outra ao reaproveitar cache ou estado | AC-11120 e e2e com duas contas                               | e2e do #114                     |
| Quebrar o isolamento ao reescrever as telas                         | não tocar `apps/api`; testes de API atuais rodam sem mudança | suíte de `apps/api/tests`       |
| Teste da web "provar" isolamento que só a API garante               | camada de prova explícita (D-4)                              | revisão da seção 6              |
| Ampliar o `PERMITIDOS` demais                                       | padrão exato e testes negativos (seção 5)                    | teste do proxy                  |
| Conflito de arquivo com #105, #106 e #112                           | tabela de donos e `board_message` antes de editar            | `board_peers`                   |
| Spec parecer decisão tomada                                         | todas as perguntas ficam `aberta`; tarefas bloqueadas        | tabela de bloqueios do tasks.md |
| Conteúdo do Stitch virar dado real                                  | AC-11129 e varredura de texto                                | revisão do dono                 |

## 9. Rastreio: critério → tarefa

| Tarefa  | Critérios                                                                    |
| ------- | ---------------------------------------------------------------------------- |
| T-11101 | AC-11122, AC-11123, AC-11124                                                 |
| T-11102 | AC-11101 a AC-11104, AC-11130                                                |
| T-11103 | AC-11105 a AC-11107, AC-11130                                                |
| T-11104 | AC-11108 a AC-11110                                                          |
| T-11105 | AC-11111, AC-11112                                                           |
| T-11106 | AC-11113, AC-11114, AC-11130                                                 |
| T-11107 | AC-11115 a AC-11118, AC-11121, AC-11130                                      |
| T-11108 | AC-11119, AC-11120, AC-11127                                                 |
| T-11109 | AC-11125, AC-11126 (bloqueada por Q-11105 e Q-11106)                         |
| T-11110 | AC-11128, AC-11129 e as provas onp de AC-11101, AC-11105, AC-11113, AC-11130 |
