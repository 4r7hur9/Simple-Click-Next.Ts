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
 * Roda `acao` como a loja rodaria: credencial da aplicação, transação aberta e
 * `app.store_id` gravado nela.
 *
 * É por aqui que o teste LÊ o que montou. Ler pela credencial de administração
 * seria cômodo e mentiroso: ela enxerga todas as lojas, então o teste passaria
 * mesmo com o isolamento desligado.
 */
export function comoLoja<T>(
  loja: AlvoDeLoja,
  acao: (tx: TransacaoDeTeste) => Promise<T>,
  opcoes: Omit<ContextoDeTeste, "lojaId"> = {},
): Promise<T> {
  return emTransacao(
    aplicacao(),
    { ...opcoes, lojaId: idDaLoja(loja), papel: opcoes.papel ?? "OWNER" },
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
}

export interface SobrescritaDeLoja {
  readonly codigo?: string;
  readonly nome?: string;
  readonly apelido?: string;
  readonly ramo?: RamoDeTeste;
  readonly status?: "PENDING" | "ACTIVE" | "SUSPENDED" | "DELETED";
  readonly fusoHorario?: string;
}

/**
 * Cria uma loja, já com a linha de configuração que toda loja tem.
 *
 * Pela credencial de administração porque é assim em produção: `INSERT` e
 * `DELETE` em `app.stores` são retirados de `sc_app` — criar e excluir loja é
 * ato da plataforma, não do lojista.
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
    return idDaNova;
  });

  return { id, ...loja };
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
 * Escreve pela credencial da aplicação, dentro do contexto da loja: é o mesmo
 * caminho que o dono usa para convidar alguém, e por isso a política
 * `members_staff_insert` é de fato exercida — vincular na loja errada seria
 * recusado pelo banco, não aceito em silêncio.
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
