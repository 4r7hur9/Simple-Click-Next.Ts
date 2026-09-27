/**
 * Construtores de dados para teste (AC-038).
 *
 * O que este arquivo resolve é a dependência escondida entre testes. Suíte que
 * depende de carga compartilhada tem sempre os mesmos dois sintomas: um teste
 * passa sozinho e falha depois do vizinho, e ninguém consegue apagar um dado
 * "que não é de ninguém" sem quebrar três arquivos. A saída é cada teste montar
 * o próprio cenário, declarando SÓ o que importa para ele:
 *
 *     const loja = await criarLoja({ ramo: "lanchonete" });
 *     const produto = await criarProduto({ loja, precoCentavos: 1999 });
 *
 * Três decisões sustentam isso:
 *
 * - **Sobrescrita parcial.** Todo construtor aceita um pedaço do registro e
 *   completa o resto com valor válido. O teste que fala de preço escreve
 *   preço, e nada mais — quem lê o teste vê o que é relevante, e não doze
 *   campos de enchimento.
 * - **Valor único por CONTADOR, não por sorteio.** Dois cenários parecidos no
 *   mesmo banco não podem colidir em chave única, mas único por número
 *   aleatório transforma a suíte em loteria: o dia em que dois sorteios
 *   baterem, a falha não reproduz. O contador é por processo, e cada arquivo
 *   de teste tem processo e banco próprios (`db-test.ts`), então a sequência
 *   começa do zero e não atravessa arquivo nenhum.
 * - **O dado nasce no contexto certo.** Loja e identidade são registros de
 *   plataforma e entram pela credencial de administração; produto, membro e
 *   cliente são registros DE UMA LOJA e entram pela credencial da aplicação,
 *   dentro de uma transação com `app.store_id` gravado. Isso não é cerimônia:
 *   é o que faz um construtor que aponte para a loja errada ser RECUSADO pelo
 *   banco, em vez de plantar um dado que só quebra o teste de isolamento três
 *   tarefas adiante.
 *
 * Por que a transação com contexto é escrita aqui, e não reaproveitada de
 * `apps/api/src/core/db.ts`: a tabela de fronteiras (`.spec/design/arquitetura.md`)
 * não autoriza `packages/testing` a importar aplicação, e com razão — o apoio de
 * teste é usado também pelos testes de `packages/database`, que existem antes
 * de a API existir. O arranjo é o MESMO, item por item: uma transação, os
 * quatro parâmetros gravados sempre, e `is_local => true` para o valor morrer
 * no fim da transação em vez de grudar na conexão do agrupador.
 *
 * Segredo só por variável de ambiente (P-002); dinheiro em centavos (P-005).
 */

import { derivarUrlDePapel } from "@simpleclick/database";
import pg from "pg";

import { bancoDoArquivo } from "./db-test.ts";

// ---------------------------------------------------------------------------
// Erros
// ---------------------------------------------------------------------------

/** Falta ao ambiente algo sem o qual o construtor não tem como escrever. */
export class ErroDeConstrutorDeTeste extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = "ErroDeConstrutorDeTeste";
  }
}

// ---------------------------------------------------------------------------
// Unicidade: contador por processo
// ---------------------------------------------------------------------------

let sequencia = 0;

/**
 * O próximo número da sequência deste processo.
 *
 * É crescente e não reinicia: reiniciar seria reabrir a porta da colisão em
 * chave única, que é justamente o que ele existe para fechar.
 */
export function proximoNumeroDeTeste(): number {
  sequencia += 1;
  return sequencia;
}

/** O mesmo número, com largura fixa, para caber em nome, apelido e código. */
export function sufixoDeTeste(): string {
  return String(proximoNumeroDeTeste()).padStart(4, "0");
}

// ---------------------------------------------------------------------------
// Ramo de negócio
// ---------------------------------------------------------------------------

/**
 * Apelido em português de cada ramo, para o teste dizer "lanchonete" em vez de
 * "FOOD_SNACK".
 *
 * A tabela `app.vertical_presets` continua sendo a fonte da verdade: um teste
 * deste pacote confere que todo apelido daqui aponta para um código que existe
 * lá, e que nenhum ramo do banco ficou de fora. Duplicar sem conferência é que
 * seria o problema.
 */
export const RAMOS_DE_TESTE = {
  lanchonete: "FOOD_SNACK",
  restaurante: "FOOD_RESTAURANT",
  açaiteria: "FOOD_ACAI",
  loja: "RETAIL_GENERIC",
  roupas: "APPAREL",
  autopeças: "AUTO_PARTS",
  eletrônicos: "ELECTRONICS",
  bebidas: "BEVERAGES",
} as const;

/** Apelido do ramo, do jeito que o teste escreve. */
export type RamoDeTeste = keyof typeof RAMOS_DE_TESTE;

/** Código do ramo, do jeito que o banco guarda. */
export type CodigoDeRamo = (typeof RAMOS_DE_TESTE)[RamoDeTeste];

// ---------------------------------------------------------------------------
// Contexto de acesso
// ---------------------------------------------------------------------------

/**
 * Papel de acesso, do ponto de vista das políticas do banco. São os mesmos
 * nomes que `app.current_role_name()` compara; ausência vale `PUBLIC`, o menor
 * privilégio, nunca o maior.
 */
export const PAPEIS_DE_TESTE = [
  "PUBLIC",
  "CUSTOMER",
  "OWNER",
  "STAFF",
] as const;

export type PapelDeTeste = (typeof PAPEIS_DE_TESTE)[number];

/** Quem está pedindo, do jeito que as políticas de isolamento enxergam. */
export interface ContextoDeTeste {
  readonly lojaId?: string | undefined;
  readonly usuarioId?: string | undefined;
  readonly papel?: PapelDeTeste | undefined;
  readonly tokenDoPedido?: string | undefined;
}

/** A transação em curso, já com o contexto gravado. */
export type TransacaoDeTeste = pg.PoolClient;

// ---------------------------------------------------------------------------
// Conexões
// ---------------------------------------------------------------------------

/** Nenhum valor real mora aqui: a senha vem do ambiente e só dele (P-002). */
function senhaDoPapel(variavel: string): string {
  const valor = process.env[variavel]?.trim();
  if (valor === undefined || valor === "") {
    throw new ErroDeConstrutorDeTeste(
      [
        `${variavel} não está definida, e sem ela os construtores não têm como`,
        "escrever com a credencial certa — escrever com outra credencial provaria",
        "o contrário do que o teste quer provar.",
        "",
        "Suba o ambiente e preencha o arquivo de ambiente:",
        "  bash infra/scripts/up.sh core test",
        "  cp .env.example .env   # e complete as senhas dos papéis de banco",
      ].join("\n"),
    );
  }
  return valor;
}

let agrupadorDaAplicacao: pg.Pool | undefined;
let agrupadorDaAdministracao: pg.Pool | undefined;

/**
 * A credencial que atende requisição. NÃO contorna o isolamento por linha — é
 * essa limitação que dá valor ao que os construtores escrevem por ela.
 */
function aplicacao(): pg.Pool {
  agrupadorDaAplicacao ??= new pg.Pool({
    connectionString: derivarUrlDePapel(
      bancoDoArquivo().url,
      "sc_app",
      senhaDoPapel("SENHA_BANCO_APLICACAO"),
    ),
    max: 4,
  });
  return agrupadorDaAplicacao;
}

/**
 * A credencial de administração da plataforma. Enxerga todas as lojas por
 * política explícita, e é ela que cadastra loja e identidade — em produção
 * também: `INSERT` em `app.stores` é retirado de `sc_app`.
 */
function administracao(): pg.Pool {
  agrupadorDaAdministracao ??= new pg.Pool({
    connectionString: derivarUrlDePapel(
      bancoDoArquivo().url,
      "sc_admin",
      senhaDoPapel("SENHA_BANCO_ADMINISTRACAO"),
    ),
    max: 4,
  });
  return agrupadorDaAdministracao;
}

/**
 * Encerra os agrupadores abertos pelos construtores.
 *
 * Chamado pelo encerramento do arquivo de teste (`vitest-banco.ts`), antes de o
 * banco ser descartado: conexão viva depois do fim da suíte segura o processo
 * de pé e faz o Vitest parecer travado.
 */
export async function encerrarConstrutores(): Promise<void> {
  const abertos = [agrupadorDaAplicacao, agrupadorDaAdministracao];
  agrupadorDaAplicacao = undefined;
  agrupadorDaAdministracao = undefined;
  for (const agrupador of abertos) await agrupador?.end();
}

// ---------------------------------------------------------------------------
// Transação com contexto
// ---------------------------------------------------------------------------

/**
 * Abre uma transação no agrupador, grava nela o contexto e entrega o punho.
 *
 * Os quatro parâmetros são gravados SEMPRE, inclusive vazios: gravar só o que
 * existe é o que faz uma consulta sem loja herdar a loja da anterior quando o
 * agrupador reaproveita a conexão. E `is_local => true` é o que faz o valor
 * morrer no `COMMIT` em vez de ficar grudado na conexão.
 */
async function emTransacao<T>(
  agrupador: pg.Pool,
  contexto: ContextoDeTeste,
  acao: (tx: TransacaoDeTeste) => Promise<T>,
): Promise<T> {
  const cliente = await agrupador.connect();
  try {
    await cliente.query("BEGIN");
    await cliente.query(
      `SELECT set_config('app.store_id',    $1, true),
              set_config('app.user_id',     $2, true),
              set_config('app.role',        $3, true),
              set_config('app.order_token', $4, true)`,
      [
        contexto.lojaId ?? "",
        contexto.usuarioId ?? "",
        contexto.papel ?? "PUBLIC",
        contexto.tokenDoPedido ?? "",
      ],
    );
    const resultado = await acao(cliente);
    await cliente.query("COMMIT");
    return resultado;
  } catch (causa) {
    // O desfazimento é o melhor esforço: se a conexão já morreu, o erro que
    // interessa é o de cima, não o do ROLLBACK que não teve onde acontecer.
    await cliente.query("ROLLBACK").catch(() => undefined);
    throw causa;
  } finally {
    cliente.release();
  }
}

/** Loja identificada pelo registro devolvido pelo construtor, ou pelo id. */
export type AlvoDeLoja = LojaDeTeste | string;

function idDaLoja(alvo: AlvoDeLoja): string {
  return typeof alvo === "string" ? alvo : alvo.id;
}

/**
 * O dono que `criarLoja` vinculou a cada loja, pelo identificador dela.
 *
 * É a memória que deixa `comoLoja` agir como o dono mesmo quando recebe só o
 * identificador da loja, sem ir ao banco perguntar quem é.
 */
const donosPorLoja = new Map<string, string>();

/**
 * Quem age pela loja quando o teste não disse: um membro ATIVO dela, com o
 * papel pedido.
 *
 * Desde a migração 0041 a equipe só alcança a loja de que é membro — a
 * política pergunta ao vínculo em `app.store_members`, e não mais ao papel da
 * sessão. Um construtor que escrevesse "como a loja" sem ser ninguém seria
 * recusado pelo banco, corretamente; por isso o dono que a loja recebeu ao
 * nascer é o ator padrão. Papel público ou de cliente não precisa de vínculo.
 */
async function membroQueAge(
  loja: AlvoDeLoja,
  papel: PapelDeTeste,
): Promise<string | undefined> {
  if (papel !== "OWNER" && papel !== "STAFF") return undefined;
  if (typeof loja !== "string" && papel === "OWNER") return loja.dono.id;

  const lojaId = idDaLoja(loja);
  const conhecido = papel === "OWNER" ? donosPorLoja.get(lojaId) : undefined;
  if (conhecido !== undefined) return conhecido;

  const achado = await comoAdministracao((tx) =>
    tx.query<{ identity_id: string }>(
      `SELECT identity_id
         FROM app.store_members
        WHERE store_id = $1 AND role = $2
          AND invite_accepted_at IS NOT NULL AND revoked_at IS NULL
        ORDER BY created_at
        LIMIT 1`,
      [lojaId, papel],
    ),
  );
  const identidadeId = achado.rows[0]?.identity_id;
  if (identidadeId === undefined) {
    throw new ErroDeConstrutorDeTeste(
      [
        `A loja ${lojaId} não tem membro ${papel} ativo, e agir como a loja exige`,
        "um vínculo em app.store_members (migração 0041, dívida 92).",
        "",
        "Crie a loja com `criarLoja` — ela nasce com dono — ou vincule alguém",
        "com `criarMembro` antes, ou informe `usuarioId` no contexto.",
      ].join("\n"),
    );
  }
  return identidadeId;
}

/**
 * Roda `acao` como a loja rodaria: credencial da aplicação, transação aberta,
 * `app.store_id` gravado nela e um MEMBRO da loja como quem age — o dono que
 * ela recebeu ao nascer, salvo quando o teste informa outro `usuarioId`.
 *
 * É por aqui que o teste LÊ o que montou. Ler pela credencial de administração
 * seria cômodo e mentiroso: ela enxerga todas as lojas, então o teste passaria
 * mesmo com o isolamento desligado.
 */
export async function comoLoja<T>(
  loja: AlvoDeLoja,
  acao: (tx: TransacaoDeTeste) => Promise<T>,
  opcoes: Omit<ContextoDeTeste, "lojaId"> = {},
): Promise<T> {
  const papel = opcoes.papel ?? "OWNER";
  const usuarioId = opcoes.usuarioId ?? (await membroQueAge(loja, papel));
  return emTransacao(
    aplicacao(),
    { ...opcoes, lojaId: idDaLoja(loja), papel, usuarioId },
    acao,
  );
}

/** Roda `acao` com a credencial de administração da plataforma. */
export function comoAdministracao<T>(
  acao: (tx: TransacaoDeTeste) => Promise<T>,
): Promise<T> {
  return emTransacao(administracao(), {}, acao);
}

// ---------------------------------------------------------------------------
// Identidade
// ---------------------------------------------------------------------------

/** Quem entra na plataforma. É global: uma conta para todas as lojas. */
export interface IdentidadeDeTeste {
  readonly id: string;
  readonly email: string;
  readonly nome: string;
  readonly telefone: string | null;
}

export interface SobrescritaDeIdentidade {
  readonly email?: string;
  readonly nome?: string;
  readonly telefone?: string | null;
  readonly emailVerificado?: boolean;
}

/**
 * Cria uma identidade.
 *
 * Pela credencial de administração porque `app.identities` não tem política de
 * inserção para o tempo de execução: cadastro e login precisam consultar por
 * e-mail ANTES de existir sessão, e isso é papel de função dedicada da feature
 * de identidade — não de uma política aberta a quem ainda não é ninguém.
 *
 * O domínio `.test` é reservado para teste (RFC 2606): endereço daqui não tem
 * como alcançar caixa de e-mail de gente.
 */
export async function criarIdentidade(
  sobrescrita: SobrescritaDeIdentidade = {},
): Promise<IdentidadeDeTeste> {
  const sufixo = sufixoDeTeste();
  const email = sobrescrita.email ?? `pessoa-${sufixo}@exemplo.test`;
  const nome = sobrescrita.nome ?? `Pessoa de teste ${sufixo}`;
  const telefone = sobrescrita.telefone ?? null;

  const id = await comoAdministracao(async (tx) => {
    const inserida = await tx.query<{ id: string }>(
      `INSERT INTO app.identities
         (email_norm, display_name, phone_e164, email_verified_at)
       VALUES (lower(btrim($1)), $2, $3, CASE WHEN $4 THEN now() ELSE NULL END)
       RETURNING id`,
      [email, nome, telefone, sobrescrita.emailVerificado ?? true],
    );
    return exigirLinha(inserida, "identidade").id;
  });

  return { id, email: email.toLowerCase().trim(), nome, telefone };
}

// ---------------------------------------------------------------------------
// Loja
// ---------------------------------------------------------------------------

/** A raiz do isolamento: tudo que é de loja pendura aqui. */
export interface LojaDeTeste {
  readonly id: string;
  readonly codigo: string;
  readonly nome: string;
  readonly apelido: string;
  readonly ramo: RamoDeTeste;
  readonly ramoCodigo: CodigoDeRamo;
  readonly status: string;
  readonly fusoHorario: string;
  /**
   * O dono com que a loja nasceu: membro OWNER ativo dela. É quem `comoLoja`
   * e os construtores da loja usam como ator, e é a identidade que um teste
   * assina no token quando quer "o dono desta loja".
   */
  readonly dono: IdentidadeDeTeste;
}

export interface SobrescritaDeLoja {
  readonly codigo?: string;
  readonly nome?: string;
  readonly apelido?: string;
  readonly ramo?: RamoDeTeste;
  readonly status?: "PENDING" | "ACTIVE" | "SUSPENDED" | "DELETED";
  readonly fusoHorario?: string;
  /** Uma identidade já existente como dona — a mesma pessoa com duas lojas. */
  readonly dono?: IdentidadeDeTeste;
}

/**
 * Cria uma loja, já com a linha de configuração que toda loja tem e com o
 * DONO dela vinculado.
 *
 * Pela credencial de administração porque é assim em produção: `INSERT` e
 * `DELETE` em `app.stores` são retirados de `sc_app` — criar e excluir loja é
 * ato da plataforma, não do lojista. O vínculo do dono nasce no mesmo ato,
 * como no cadastro da administração (T-200): loja sem dono é loja que ninguém
 * alcança, porque a equipe só entra na loja de que é membro (migração 0041).
 *
 * Nasce `ACTIVE` porque é o estado em que a loja é interessante para um teste;
 * quem quiser provar vitrine de loja suspensa passa `status`.
 */
export async function criarLoja(
  sobrescrita: SobrescritaDeLoja = {},
): Promise<LojaDeTeste> {
  const sufixo = sufixoDeTeste();
  const ramo = sobrescrita.ramo ?? "lanchonete";
  const loja = {
    codigo: sobrescrita.codigo ?? `T${sufixo}`,
    nome: sobrescrita.nome ?? `Loja de teste ${sufixo}`,
    apelido: sobrescrita.apelido ?? `loja-de-teste-${sufixo}`,
    ramo,
    ramoCodigo: RAMOS_DE_TESTE[ramo],
    status: sobrescrita.status ?? "ACTIVE",
    fusoHorario: sobrescrita.fusoHorario ?? "America/Sao_Paulo",
  };
  const dono =
    sobrescrita.dono ??
    (await criarIdentidade({ nome: `Dono da loja de teste ${sufixo}` }));

  const id = await comoAdministracao(async (tx) => {
    const inserida = await tx.query<{ id: string }>(
      `INSERT INTO app.stores
         (code, name, slug, status, vertical_code, timezone)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [
        loja.codigo,
        loja.nome,
        loja.apelido,
        loja.status,
        loja.ramoCodigo,
        loja.fusoHorario,
      ],
    );
    const idDaNova = exigirLinha(inserida, "loja").id;
    // Loja sem linha de configuração é loja pela metade: toda leitura de tema,
    // entrega e pagamento passa por ela.
    await tx.query(`INSERT INTO app.store_settings (store_id) VALUES ($1)`, [
      idDaNova,
    ]);
    // O dono entra pela administração, como no cadastro real: é o primeiro
    // vínculo da loja, e antes dele não há ninguém que pudesse convidá-lo.
    await tx.query(
      `INSERT INTO app.store_members
         (store_id, identity_id, role, invite_accepted_at)
       VALUES ($1, $2, 'OWNER', now())`,
      [idDaNova, dono.id],
    );
    return idDaNova;
  });

  donosPorLoja.set(id, dono.id);
  return { id, ...loja, dono };
}

// ---------------------------------------------------------------------------
// Membro
// ---------------------------------------------------------------------------

/** Quem opera a loja: separa 'quem sou' de 'o que posso naquela loja'. */
export interface MembroDeTeste {
  readonly id: string;
  readonly lojaId: string;
  readonly identidade: IdentidadeDeTeste;
  readonly papel: "OWNER" | "STAFF";
}

export interface DadosDeMembro {
  /** Obrigatória: não existe membro sem a loja de que ele é membro. */
  readonly loja: AlvoDeLoja;
  /** Quando ausente, uma identidade nova é criada para ele. */
  readonly identidade?: IdentidadeDeTeste;
  readonly papel?: "OWNER" | "STAFF";
}

/**
 * Vincula uma identidade a uma loja.
 *
 * Escreve pela credencial da aplicação, dentro do contexto da loja e como o
 * DONO dela: é o mesmo caminho que o dono usa para convidar alguém, e por isso
 * a política `members_staff_insert` é de fato exercida — vincular na loja
 * errada seria recusado pelo banco, não aceito em silêncio. O membro criado é
 * mais um: a loja já nasceu com o dono dela (`loja.dono`).
 */
export async function criarMembro(
  dados: DadosDeMembro,
): Promise<MembroDeTeste> {
  const identidade = dados.identidade ?? (await criarIdentidade());
  const papel = dados.papel ?? "OWNER";
  const lojaId = idDaLoja(dados.loja);

  const id = await comoLoja(dados.loja, async (tx) => {
    const inserido = await tx.query<{ id: string }>(
      `INSERT INTO app.store_members
         (store_id, identity_id, role, invite_accepted_at)
       VALUES ($1, $2, $3, now())
       RETURNING id`,
      [lojaId, identidade.id, papel],
    );
    return exigirLinha(inserido, "membro").id;
  });

  return { id, lojaId, identidade, papel };
}

// ---------------------------------------------------------------------------
// Produto
// ---------------------------------------------------------------------------

/** O item do catálogo. Uma tabela só serve comida, roupa, peça e eletrônico. */
export interface ProdutoDeTeste {
  readonly id: string;
  readonly lojaId: string;
  readonly nome: string;
  readonly apelido: string;
  readonly precoCentavos: number;
  readonly status: string;
  readonly disponivel: boolean;
}

export interface DadosDeProduto {
  /** Obrigatória: produto é dado DE UMA LOJA, e o construtor cobra isso. */
  readonly loja: LojaDeTeste;
  readonly nome?: string;
  readonly apelido?: string;
  readonly descricao?: string | null;
  /** Dinheiro é inteiro em centavos, sempre (P-005). */
  readonly precoCentavos?: number;
  readonly status?: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  readonly disponivel?: boolean;
  readonly destaque?: boolean;
  readonly ordem?: number;
}

/** Preço padrão: R$ 10,00, em centavos inteiros (P-005). */
const PRECO_PADRAO_CENTAVOS = 1_000;

/**
 * Cria um produto na loja informada.
 *
 * Recebe a LOJA, e não o identificador dela, por dois motivos: o ramo do
 * produto é copiado do ramo da loja no cadastro — como em produção, para que
 * trocar o tipo de negócio não invalide o que já existe —, e porque exigir o
 * objeto torna impossível chamar o construtor sem ter montado a loja antes.
 */
export async function criarProduto(
  dados: DadosDeProduto,
): Promise<ProdutoDeTeste> {
  const sufixo = sufixoDeTeste();
  const produto = {
    nome: dados.nome ?? `Produto de teste ${sufixo}`,
    apelido: dados.apelido ?? `produto-de-teste-${sufixo}`,
    precoCentavos: dados.precoCentavos ?? PRECO_PADRAO_CENTAVOS,
    status: dados.status ?? "PUBLISHED",
    disponivel: dados.disponivel ?? true,
  };

  const id = await comoLoja(dados.loja, async (tx) => {
    const inserido = await tx.query<{ id: string }>(
      `INSERT INTO app.products
         (store_id, name, slug, description, vertical_code, status,
          is_available, is_featured, sort_order,
          display_price_cents, price_min_cents, price_max_cents)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $10, $10)
       RETURNING id`,
      [
        dados.loja.id,
        produto.nome,
        produto.apelido,
        dados.descricao ?? null,
        dados.loja.ramoCodigo,
        produto.status,
        produto.disponivel,
        dados.destaque ?? false,
        dados.ordem ?? 0,
        produto.precoCentavos,
      ],
    );
    return exigirLinha(inserido, "produto").id;
  });

  return { id, lojaId: dados.loja.id, ...produto };
}

// ---------------------------------------------------------------------------
// Cliente da loja
// ---------------------------------------------------------------------------

/**
 * O comprador visto pela loja: projeção por loja da identidade global. Aqui
 * mora só o que o dono precisa para entregar o pedido.
 */
export interface ClienteDeTeste {
  readonly id: string;
  readonly lojaId: string;
  readonly nome: string;
  readonly telefone: string;
  readonly identidade: IdentidadeDeTeste | null;
}

export interface DadosDeCliente {
  /** Obrigatória: cliente é dado DE UMA LOJA. */
  readonly loja: AlvoDeLoja;
  readonly nome?: string;
  readonly telefone?: string;
  readonly email?: string | null;
  readonly observacoes?: string | null;
  /**
   * Vínculo com a conta da plataforma. Ausente de propósito por padrão: comprar
   * sem conta é a maioria dos pedidos reais do público-alvo.
   */
  readonly identidade?: IdentidadeDeTeste;
}

/**
 * Cria um cliente da loja.
 *
 * O telefone é fictício e derivado do contador — nada de dado de gente em
 * repositório (P-009). O prefixo `+5511` mantém o formato E.164 plausível, que
 * é o que as regras de formatação e de mensagem esperam.
 */
export async function criarCliente(
  dados: DadosDeCliente,
): Promise<ClienteDeTeste> {
  const sufixo = sufixoDeTeste();
  const lojaId = idDaLoja(dados.loja);
  const cliente = {
    nome: dados.nome ?? `Cliente de teste ${sufixo}`,
    telefone: dados.telefone ?? `+55119${sufixo}0000`,
    identidade: dados.identidade ?? null,
  };

  const id = await comoLoja(dados.loja, async (tx) => {
    const inserido = await tx.query<{ id: string }>(
      `INSERT INTO app.store_customers
         (store_id, identity_id, display_name, phone_e164, email, notes)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [
        lojaId,
        cliente.identidade?.id ?? null,
        cliente.nome,
        cliente.telefone,
        dados.email ?? null,
        dados.observacoes ?? null,
      ],
    );
    return exigirLinha(inserido, "cliente").id;
  });

  return { id, lojaId, ...cliente };
}

// ---------------------------------------------------------------------------
// Apoio
// ---------------------------------------------------------------------------

/**
 * A inserção precisa ter devolvido a linha.
 *
 * Zero linhas aqui não é "não achou": é política de isolamento recusando o que
 * foi escrito, e devolver `undefined` faria isso aparecer como um erro de tipo
 * dez linhas adiante, longe da causa.
 */
function exigirLinha<T extends pg.QueryResultRow>(
  resultado: pg.QueryResult<T>,
  oQue: string,
): T {
  const linha = resultado.rows[0];
  if (linha === undefined) {
    throw new ErroDeConstrutorDeTeste(
      [
        `O construtor de ${oQue} não recebeu linha de volta.`,
        "",
        "Inserção que não devolve linha, com o isolamento ligado, quer dizer que a",
        "política recusou o registro — confira a loja e o papel do contexto.",
      ].join("\n"),
    );
  }
  return linha;
}

// ---------------------------------------------------------------------------
// Categorias
// ---------------------------------------------------------------------------

export interface CategoriaDeTeste {
  readonly id: string;
  readonly lojaId: string;
  readonly nome: string;
  readonly apelido: string;
  readonly visivel: boolean;
  readonly ordem: number;
}

export interface DadosDeCategoria {
  /** Obrigatória: categoria é dado DE UMA LOJA, e o construtor cobra isso. */
  readonly loja: LojaDeTeste;
  readonly nome?: string;
  readonly apelido?: string;
  /** Oculta não some da gestão do dono — some da vitrine. */
  readonly visivel?: boolean;
  readonly ordem?: number;
}

/**
 * Cria uma categoria da loja.
 *
 * ROTINA COM O PAPEL DE DONO, e não com o de administração da plataforma: é
 * assim que ela nasce na vida real, e é o que faz o teste passar pelas mesmas
 * políticas que o produto usa. Construtor que contorna o isolamento produz
 * dado que a aplicação não conseguiria criar.
 */
export async function criarCategoria(
  dados: DadosDeCategoria,
): Promise<CategoriaDeTeste> {
  const sufixo = sufixoDeTeste();
  const categoria = {
    nome: dados.nome ?? `Categoria de teste ${sufixo}`,
    apelido: dados.apelido ?? `categoria-de-teste-${sufixo}`,
    visivel: dados.visivel ?? true,
    ordem: dados.ordem ?? 0,
  };

  const id = await comoLoja(dados.loja, async (tx) => {
    const inserido = await tx.query<{ id: string }>(
      `INSERT INTO app.categories (store_id, name, slug, is_visible, sort_order)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [
        dados.loja.id,
        categoria.nome,
        categoria.apelido,
        categoria.visivel,
        categoria.ordem,
      ],
    );
    return exigirLinha(inserido, "categoria").id;
  });

  return { id, lojaId: dados.loja.id, ...categoria };
}

/**
 * Põe um produto dentro de uma categoria.
 *
 * A ORDEM É DO VÍNCULO, e não do produto: o mesmo item é o primeiro em
 * "Promoções" e o quinto em "Lanches", e é por isso que ela não pode morar na
 * linha do produto.
 */
export async function porProdutoNaCategoria(opcoes: {
  readonly loja: LojaDeTeste;
  readonly produto: ProdutoDeTeste;
  readonly categoria: CategoriaDeTeste;
  readonly ordem?: number;
  readonly principal?: boolean;
}): Promise<void> {
  await comoLoja(opcoes.loja, async (tx) => {
    await tx.query(
      `INSERT INTO app.product_categories
         (store_id, product_id, category_id, sort_order, is_primary)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        opcoes.loja.id,
        opcoes.produto.id,
        opcoes.categoria.id,
        opcoes.ordem ?? 0,
        opcoes.principal ?? false,
      ],
    );
  });
}

// ---------------------------------------------------------------------------
// Escolhas e variações (T-405)
// ---------------------------------------------------------------------------

export interface GrupoDeTeste {
  readonly id: string;
  readonly lojaId: string;
  readonly nome: string;
  readonly minimo: number;
  readonly maximo: number | null;
}

export interface DadosDeGrupo {
  readonly loja: LojaDeTeste;
  readonly nome?: string;
  /** Obrigatoriedade é DERIVADA daqui, como no banco. */
  readonly minimo?: number;
  readonly maximo?: number | null;
  readonly permiteRepetir?: boolean;
  readonly eixoDeVariacao?: boolean;
  readonly ativo?: boolean;
  readonly ordem?: number;
  /** Marca o grupo como apagado, para provar que a política o esconde. */
  readonly apagado?: boolean;
}

/** Cria um grupo de escolha da loja (biblioteca, sem produto fixo). */
export async function criarGrupoDeEscolha(
  dados: DadosDeGrupo,
): Promise<GrupoDeTeste> {
  const sufixo = sufixoDeTeste();
  const grupo = {
    nome: dados.nome ?? `Grupo de teste ${sufixo}`,
    minimo: dados.minimo ?? 0,
    maximo: dados.maximo ?? null,
  };

  const id = await comoLoja(dados.loja, async (tx) => {
    const inserido = await tx.query<{ id: string }>(
      `INSERT INTO app.option_groups
         (store_id, name, kind, min_select, max_select, allow_repeat,
          is_variant_axis, is_active, sort_order, deleted_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id`,
      [
        dados.loja.id,
        grupo.nome,
        dados.eixoDeVariacao ? "VARIATION" : "ADDON",
        grupo.minimo,
        grupo.maximo,
        dados.permiteRepetir ?? false,
        dados.eixoDeVariacao ?? false,
        dados.ativo ?? true,
        dados.ordem ?? 0,
        dados.apagado === true ? new Date() : null,
      ],
    );
    return exigirLinha(inserido, "grupo de escolha").id;
  });

  return { id, lojaId: dados.loja.id, ...grupo };
}

export interface OpcaoDeTeste {
  readonly id: string;
  readonly grupoId: string;
  readonly nome: string;
  readonly acrescimoCentavos: number;
}

export interface DadosDeOpcao {
  readonly loja: LojaDeTeste;
  readonly grupo: GrupoDeTeste;
  readonly nome?: string;
  /** Pode ser NEGATIVO: remover algo pode dar desconto. */
  readonly acrescimoCentavos?: number;
  readonly marcadaPorPadrao?: boolean;
  readonly disponivel?: boolean;
  readonly ordem?: number;
  readonly apagada?: boolean;
}

/** Cria uma opção dentro de um grupo. */
export async function criarOpcao(dados: DadosDeOpcao): Promise<OpcaoDeTeste> {
  const sufixo = sufixoDeTeste();
  const opcao = {
    nome: dados.nome ?? `Opção de teste ${sufixo}`,
    acrescimoCentavos: dados.acrescimoCentavos ?? 0,
  };

  const id = await comoLoja(dados.loja, async (tx) => {
    const inserido = await tx.query<{ id: string }>(
      `INSERT INTO app.option_items
         (store_id, group_id, name, price_delta_cents, is_default_selected,
          is_available, sort_order, deleted_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id`,
      [
        dados.loja.id,
        dados.grupo.id,
        opcao.nome,
        opcao.acrescimoCentavos,
        dados.marcadaPorPadrao ?? false,
        dados.disponivel ?? true,
        dados.ordem ?? 0,
        dados.apagada === true ? new Date() : null,
      ],
    );
    return exigirLinha(inserido, "opção").id;
  });

  return { id, grupoId: dados.grupo.id, ...opcao };
}

/** Liga um grupo a um produto. A ordem é do VÍNCULO, não do grupo. */
export async function porGrupoNoProduto(opcoes: {
  readonly loja: LojaDeTeste;
  readonly produto: ProdutoDeTeste;
  readonly grupo: GrupoDeTeste;
  readonly ordem?: number;
}): Promise<void> {
  await comoLoja(opcoes.loja, async (tx) => {
    await tx.query(
      `INSERT INTO app.product_option_groups
         (store_id, product_id, group_id, sort_order)
       VALUES ($1, $2, $3, $4)`,
      [opcoes.loja.id, opcoes.produto.id, opcoes.grupo.id, opcoes.ordem ?? 0],
    );
  });
}

export interface VariacaoDeTeste {
  readonly id: string;
  readonly produtoId: string;
  readonly nome: string;
}

export interface DadosDeVariacao {
  readonly loja: LojaDeTeste;
  readonly produto: ProdutoDeTeste;
  readonly nome?: string;
  /** Preço BASE da variante, em centavos. Sem ele, a variante nasce sem preço. */
  readonly precoCentavos?: number;
  /** Preço promocional valendo agora. */
  readonly precoPromocionalCentavos?: number;
  /** Nulo é "não controla estoque"; zero é "controla e acabou". */
  readonly estoque?: number | null;
  readonly disponivel?: boolean;
  readonly padrao?: boolean;
  readonly ordem?: number;
  readonly apagada?: boolean;
}

/** Cria uma variante do produto, com o preço dela. */
export async function criarVariacao(
  dados: DadosDeVariacao,
): Promise<VariacaoDeTeste> {
  const sufixo = sufixoDeTeste();
  const nome = dados.nome ?? `Variação de teste ${sufixo}`;

  const id = await comoLoja(dados.loja, async (tx) => {
    const inserido = await tx.query<{ id: string }>(
      `INSERT INTO app.product_variants
         (store_id, product_id, name, stock_quantity, is_available,
          is_default, sort_order, deleted_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id`,
      [
        dados.loja.id,
        dados.produto.id,
        nome,
        dados.estoque === undefined ? null : dados.estoque,
        dados.disponivel ?? true,
        dados.padrao ?? false,
        dados.ordem ?? 0,
        dados.apagada === true ? new Date() : null,
      ],
    );
    const variacaoId = exigirLinha(inserido, "variação").id;

    if (dados.precoCentavos !== undefined) {
      await tx.query(
        `INSERT INTO app.product_prices
           (store_id, product_id, variant_id, kind, amount_cents, min_quantity)
         VALUES ($1, $2, $3, 'BASE', $4, 1)`,
        [dados.loja.id, dados.produto.id, variacaoId, dados.precoCentavos],
      );
    }

    if (dados.precoPromocionalCentavos !== undefined) {
      await tx.query(
        `INSERT INTO app.product_prices
           (store_id, product_id, variant_id, kind, amount_cents, min_quantity)
         VALUES ($1, $2, $3, 'PROMO', $4, 1)`,
        [
          dados.loja.id,
          dados.produto.id,
          variacaoId,
          dados.precoPromocionalCentavos,
        ],
      );
    }

    return variacaoId;
  });

  return { id, produtoId: dados.produto.id, nome };
}

/** Diz qual opção de um eixo identifica uma variante — "P" em Tamanho. */
export async function ligarVariacaoAoEixo(opcoes: {
  readonly loja: LojaDeTeste;
  readonly variacao: VariacaoDeTeste;
  readonly grupo: GrupoDeTeste;
  readonly opcao: OpcaoDeTeste;
}): Promise<void> {
  await comoLoja(opcoes.loja, async (tx) => {
    await tx.query(
      `INSERT INTO app.variant_option_values
         (store_id, variant_id, group_id, option_item_id)
       VALUES ($1, $2, $3, $4)`,
      [opcoes.loja.id, opcoes.variacao.id, opcoes.grupo.id, opcoes.opcao.id],
    );
  });
}

// ---------------------------------------------------------------------------
// Administração da plataforma (admin-lojas)
// ---------------------------------------------------------------------------

/**
 * Cria uma identidade e a torna administradora da plataforma.
 *
 * Pela credencial de administração porque `platform_admins` não tem política
 * nenhuma para a credencial das lojas: promover alguém a administrador nunca
 * pode ser alcançável por uma rota de lojista.
 */
export async function criarAdministradorDaPlataforma(
  sobrescrita: SobrescritaDeIdentidade = {},
): Promise<IdentidadeDeTeste> {
  const identidade = await criarIdentidade({
    nome: sobrescrita.nome ?? `Administração ${sufixoDeTeste()}`,
    ...sobrescrita,
  });
  await comoAdministracao((tx) =>
    tx.query(`INSERT INTO app.platform_admins (identity_id) VALUES ($1)`, [
      identidade.id,
    ]),
  );
  return identidade;
}
