# Políticas de isolamento por linha

As políticas **não moram neste diretório**: elas moram na migração que cria a
tabela, em `../migrations`. Separá-las das tabelas criaria a possibilidade de
existir tabela sem política — que é exatamente o defeito que este projeto
existe para impedir.

O que mora aqui é o **padrão canônico**: a forma que toda tabela de loja segue,
e a razão de cada linha dela. Quem escrever uma migração nova copia daqui.

## O modelo em uma frase

Três credenciais de banco com agrupadores separados, esquema único, coluna de
loja em toda tabela de negócio, contexto definido por transação, e negação por
omissão. Um erro de programação que esqueça o filtro não vaza dado, porque o
banco nega por padrão.

## As três credenciais

| Papel         | Para que serve                          | Contorna o isolamento | Dono do esquema |
| ------------- | --------------------------------------- | --------------------- | --------------- |
| `sc_migrator` | aplicar migrações, conexão **direta**   | sim                   | sim             |
| `sc_app`      | execução: dono de loja, equipe, cliente | **não**               | não             |
| `sc_admin`    | execução: administração da plataforma   | **não**               | não             |

Três razões para a separação, e nenhuma delas é organizacional:

1. **Contornar o isolamento vence forçá-lo.** Foi medido: um papel com esse
   privilégio ignora `FORCE ROW LEVEL SECURITY`. Por isso ele existe em uma
   credencial só, e ela nunca atende requisição.
2. **Dono de tabela passa por cima do isolamento quando ele não está forçado.**
   Por isso nenhum papel de execução é dono de nada no esquema `app`.
3. **Visão global é credencial, não marcação de sessão.** Se enxergar todas as
   lojas dependesse de um parâmetro de sessão, uma falha de injeção numa rota de
   lojista escalaria para visão global mudando um valor. Dependendo de outra
   senha, não escala: a conexão errada simplesmente não existe naquele
   agrupador.

As senhas chegam por variável de ambiente (`SENHA_BANCO_MIGRADOR`,
`SENHA_BANCO_APLICACAO`, `SENHA_BANCO_ADMINISTRACAO`) e são substituídas pelo
aplicador antes de o SQL ser enviado (P-002). A primeira aplicação em um banco
vazio precisa de uma credencial de arranque com direito de criar papel e gatilho
de evento; a partir daí, `sc_migrator` se basta.

## Funções de contexto

```sql
app.current_store_id()    -- uuid  · nulo quando não há contexto
app.current_user_id()     -- uuid
app.current_role_name()   -- text  · 'PUBLIC' quando não há papel
app.is_store_staff()      -- bool  · papel em ('OWNER','STAFF')
app.current_order_token() -- text  · acompanhamento sem login
```

Todas são **estáveis** e **seguras para paralelismo**, para que o planejador as
avalie uma vez por consulta e não uma vez por linha. E todas toleram cadeia
vazia: depois de um `COMMIT` o parâmetro da sessão continua definido com cadeia
vazia — não volta a ser nulo —, e converter cadeia vazia para identificador
levanta erro. Sem `nullif`, a política quebraria de forma intermitente
justamente nas conexões reaproveitadas do agrupador, que é onde ninguém procura
o defeito.

## O bloco canônico

Para toda tabela com `store_id`:

```sql
ALTER TABLE app.<tabela> ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.<tabela> FORCE  ROW LEVEL SECURITY;

-- uma política POR COMANDO, nunca uma FOR ALL que esconde a diferença
CREATE POLICY <t>_staff_select ON app.<tabela> FOR SELECT TO sc_app
  USING (store_id = (SELECT app.current_store_id()) AND (SELECT app.is_store_staff()));
CREATE POLICY <t>_staff_insert ON app.<tabela> FOR INSERT TO sc_app
  WITH CHECK (store_id = (SELECT app.current_store_id()) AND (SELECT app.is_store_staff()));
CREATE POLICY <t>_staff_update ON app.<tabela> FOR UPDATE TO sc_app
  USING      (store_id = (SELECT app.current_store_id()) AND (SELECT app.is_store_staff()))
  WITH CHECK (store_id = (SELECT app.current_store_id()) AND (SELECT app.is_store_staff()));
CREATE POLICY <t>_staff_delete ON app.<tabela> FOR DELETE TO sc_app
  USING (store_id = (SELECT app.current_store_id()) AND (SELECT app.is_store_staff()));

-- sem contexto, nada. Ausência de contexto é NEGAÇÃO, nunca permissão.
CREATE POLICY <t>_require_ctx ON app.<tabela> AS RESTRICTIVE FOR ALL TO sc_app
  USING      ((SELECT app.current_store_id()) IS NOT NULL)
  WITH CHECK ((SELECT app.current_store_id()) IS NOT NULL);

-- administração enxerga tudo por política explícita e auditável
CREATE POLICY <t>_admin_all ON app.<tabela> FOR ALL TO sc_admin
  USING (true) WITH CHECK (true);
```

Sete regras que o bloco carrega, cada uma por um modo de falha real:

1. **Ligado E forçado.** Um sem o outro não protege. É o que a verificação
   estrutural confere (AC-008), e é por isso que ela reprova as duas metades.
2. **Uma política por comando.** `FOR ALL` esconde que ler, inserir, alterar e
   remover têm regras diferentes — e é assim que uma tabela ganha, sem ninguém
   perceber, permissão de remoção que ninguém quis dar.
3. **Verificação de escrita explícita no `UPDATE`.** É ela que impede MOVER uma
   linha para outra loja. Sem ela, trocar `store_id` passa.
4. **A restritiva com destinatário explícito.** Política restritiva sem `TO`
   valeria para todos e alcançaria também a credencial de administração, que
   precisa enxergar todas as lojas.
5. **Toda política permissiva cita `store_id`.** Achado medido, e o de maior
   impacto do esquema: com 300 mil pedidos, **uma única** política permissiva sem
   esse conjunto impediu o planejador de fatorar `store_id`, virou `BitmapOr` e
   destruiu o acesso ordenado — 6,357 ms e 5.123 blocos contra 0,213 ms e 23
   blocos. O que atravessa lojas por natureza (histórico do comprador, "minhas
   lojas") sai do conjunto de políticas e vira função com direitos de quem a
   definiu. Isso vira guarda de integração na T-005.
6. **Porteiro de papel nos dois eixos.** Onde existem duas políticas permissivas
   — a do dono e a do próprio cliente —, as duas precisam de porteiro, porque
   políticas permissivas se combinam por OU. Sem o porteiro em um dos lados, a
   compradora que navega no catálogo vê os clientes da loja; sem no outro, o dono
   que também é cliente de outra loja vê a própria linha de lá na listagem dele.
7. **Índice liderado por `store_id`.** Sob isolamento, o conjunto de colunas de
   um índice cobridor é a união das colunas da consulta com as colunas das
   políticas daquela tabela.

## As exceções, e por que existem

| Tabela             | Exceção                                | Razão                                                                                                                         |
| ------------------ | -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `stores`           | sem a restritiva de contexto           | descobrir a loja acontece **antes** de haver contexto; a resolução passa por `app.resolve_store`, com lista fechada de campos |
| `stores`           | sem inserção nem remoção para `sc_app` | criar, suspender e excluir loja é da administração                                                                            |
| `stores`           | alteração por coluna                   | o tipo de negócio e o estado da loja são da administração, e isolamento por linha protege a linha, não a coluna               |
| `identities`       | sem coluna de loja                     | identidade é global: uma pessoa, uma conta na plataforma inteira                                                              |
| `platform_admins`  | nenhuma política para `sc_app`         | quem administra a plataforma não é legível pelo agrupador das lojas                                                           |
| `vertical_presets` | leitura liberada                       | catálogo de plataforma, sem dado de loja nenhuma                                                                              |
| `audit_log`        | sem alteração nem remoção              | só acrescenta, em três camadas: ausência de política, retirada de privilégio e gatilho                                        |

## Uniques globais permitidas

Toda chave única de tabela de loja começa por `store_id`. Unicidade global em
tabela de loja é canal encoberto — o erro de chave duplicada revela a existência
de linha invisível de outra loja — e ainda quebra a inserção com conflito. As
exceções são fechadas, revisadas e justificadas uma a uma:

| Índice                  | Por quê                                                           |
| ----------------------- | ----------------------------------------------------------------- |
| `stores_slug_uk`        | apelido é chave de roteamento público                             |
| `stores_code_uk`        | código é a busca da administração                                 |
| `identities_email_uk`   | única chave única global de dado pessoal, enumerável por desenho  |

A guarda `g3_unica_por_loja.sql` carrega esta lista, e mais
`orders_public_token_uk`, que nasce com o domínio de pedido. Qualquer índice
único global fora dela reprova o portão — o que obriga a próxima exceção a ser
uma decisão escrita, e não um esquecimento.

## As guardas estruturais

`../guards/` tem nove consultas ao catálogo do PostgreSQL. Cada uma devolve uma
linha por problema; qualquer linha reprova. Elas conferem no BANCO o que este
documento descreve em prosa — porque ler a migração provaria que alguém
escreveu a política, não que ela está lá.

| Guarda | Recusa                                                                    |
| ------ | ------------------------------------------------------------------------- |
| G1     | tabela de loja sem o isolamento ligado **e** forçado                      |
| G2     | tabela sem política para algum dos quatro comandos                        |
| G3     | chave única global onde deveria ser única por loja                        |
| G4     | política permissiva de tabela quente sem citar `store_id` (achado medido) |
| G5     | índice cobridor sem as colunas que as políticas citam                     |
| G6     | visão materializada sobre tabela de loja                                  |
| G7     | visão de loja sem `security_invoker = true`                               |
| G8     | tabela de pedido com política de alteração ou remoção                     |
| G9     | trilha de auditoria que aceite alteração ou remoção                       |

Uma exceção revisada em G4: `sc_self_select`, o segundo eixo de
`store_customers`. Ele é ancorado na identidade, e não na loja — o comprador vê
a própria linha, que por definição pode estar em outra loja —, e é o porteiro de
papel que o segura. Está registrado como decisão de modelagem, não como
esquecimento.

Rodam pelo portão (`bash infra/scripts/db-guards.sh`) contra um banco de prova
efêmero, migrado na hora: assim elas falam sobre o repositório, e não sobre o
que a máquina de quem chamou tem hoje.

## O que ainda não existe

As migrações 0001–0006 criam a fundação estrutural mais o núcleo de que as
tarefas seguintes dependem: extensões, papéis, funções de contexto, gatilho de
evento, identidade, loja, configuração, endereços, membros, produto, comprador
por loja e trilha de auditoria.

Cada migração diz, no próprio cabeçalho, o que ficou para as tarefas seguintes.
Em resumo: o restante do catálogo (categorias, variações, preços, grupos de
opção, imagens, atributos tipados, movimento de estoque), o domínio de pedido
(pedido, contato, itens, histórico, pagamento, carrinho, sequência, cupom) e a
fila de impressão.
