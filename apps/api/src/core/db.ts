/**
 * O único caminho da API até o banco (P-004).
 *
 * É o arquivo mais importante da aplicação, porque é ele que faz o isolamento
 * do banco valer. O desenho segue, item por item, o arranjo obrigatório
 * registrado em `.spec/design/decisoes.md` (17/08/2026) — e cada item existe
 * por um modo de falha real, não por gosto:
 *
 * 1. **Uma transação interativa por requisição.** O contexto da loja é gravado
 *    com `set_config(..., is_local => true)`, cujo valor morre no fim da
 *    transação. Fora de transação — ou com `is_local => false` — o valor fica
 *    grudado na CONEXÃO, e o agrupador entrega essa mesma conexão para a
 *    próxima requisição, que passa a enxergar a loja da anterior. É esse o
 *    defeito que AC-011 cobra, e ele não aparece em log nem em revisão.
 * 2. **O cliente cru nunca sai daqui.** Nem o `PrismaClient`, nem o agrupador
 *    do `pg`. O que o domínio recebe é o punho da transação já com contexto
 *    aplicado. É isso que P-004 verifica mecanicamente nos módulos.
 * 3. **Duas cadeias de conexão distintas.** A da aplicação passa pelo
 *    agrupador e não usa instrução preparada; a de migração vai direta ao
 *    banco. Elas nunca são a mesma cadeia.
 * 4. **Credenciais separadas.** A credencial da aplicação não pode contornar o
 *    isolamento, e este módulo se recusa a abrir caminho se ela puder.
 * 5. **Migrações escritas à mão.** Não é assunto daqui: o esquema declarado
 *    serve para gerar tipos, e quem aplica migração é `packages/database`.
 * 6. **Conferência de linhas afetadas.** Alteração que atravessa loja devolve
 *    ZERO LINHAS SEM ERRO. Por isso toda alteração por identificador passa por
 *    `exigirUmaLinhaAfetada`, que transforma zero em "não encontrado".
 *
 * Se um dia o arranjo pesar, o ponto de troca é este arquivo e só ele.
 */

import pg from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, type Prisma } from "@simpleclick/database/cliente";

import {
  type ContextoDaRequisicao,
  ErroSemContexto,
  exigirContexto,
} from "./contexto.ts";

// ---------------------------------------------------------------------------
// Tipos de fronteira
// ---------------------------------------------------------------------------

/**
 * O que o domínio recebe: o punho da transação em curso, já com o contexto da
 * loja aplicado. Tem os modelos tipados e o SQL cru, e NÃO tem `$connect`,
 * `$disconnect` nem `$transaction` — quem controla a vida da conexão é este
 * módulo.
 */
export type TransacaoDoBanco = Prisma.TransactionClient;

/** De onde as cadeias de conexão são lidas — normalmente `process.env`. */
export type FonteDeAmbiente = Readonly<Record<string, string | undefined>>;

/** Ajustes de quem abre o acesso. Tudo tem padrão; teste sobrescreve o que precisa. */
export interface OpcoesDoAcesso {
  /** Cadeia de conexão da aplicação, pelo agrupador. */
  readonly urlDaAplicacao: string;
  /** Quantas conexões o agrupador mantém. */
  readonly maxDeConexoes?: number;
  /** Quanto uma transação pode esperar por conexão livre, em ms. */
  readonly esperaPorConexaoMs?: number;
  /** Quanto uma transação pode durar depois de aberta, em ms. */
  readonly duracaoMaximaMs?: number;
  /**
   * Confere, na primeira conexão, que a credencial não contorna o isolamento.
   * Só um teste que PRECISA de uma credencial privilegiada desliga isso.
   */
  readonly conferirCredencial?: boolean;
}

/**
 * O acesso ao banco, visto de fora: abre transação com contexto e encerra o
 * agrupador. Nada mais. O cliente cru fica fechado dentro do fecho.
 */
export interface AcessoAoBanco {
  emTransacao<T>(acao: (tx: TransacaoDoBanco) => Promise<T>): Promise<T>;
  encerrar(): Promise<void>;
}

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------

/** Parâmetros de sessão que as políticas de isolamento leem. */
export const PARAMETROS_DE_CONTEXTO = [
  "app.store_id",
  "app.user_id",
  "app.role",
  "app.order_token",
  // A chave que o cliente repete quando tenta de novo. Entrou junto com a
  // migração 0010: sem ela, a segunda tentativa não ENXERGA o pedido que a
  // primeira criou, porque a única leitura que o cliente tem é por token de
  // acompanhamento — e o token da segunda tentativa é outro.
  "app.checkout_key",
  // Qual carrinho esta requisição alcança. Entrou com a migração 0012, que
  // consertou políticas de carrinho abertas a qualquer visitante da loja.
  "app.cart_session",
] as const;

const MAX_DE_CONEXOES_PADRAO = 10;
const ESPERA_POR_CONEXAO_PADRAO_MS = 5_000;
const DURACAO_MAXIMA_PADRAO_MS = 10_000;

// ---------------------------------------------------------------------------
// Erros
// ---------------------------------------------------------------------------

/** As duas cadeias de conexão precisam existir e ser diferentes uma da outra. */
export class ErroDeConexaoDoBanco extends Error {
  readonly variavel: string;

  constructor(variavel: string, motivo: string) {
    super(
      [
        `A conexão do banco não pode ser montada: ${variavel} ${motivo}.`,
        "",
        "A aplicação fala pelo agrupador, sem instrução preparada; a migração",
        "vai direta ao banco, com outra credencial. Uma cadeia só para as duas",
        "faz a aplicação herdar o poder de quem migra (decisão de 17/08).",
      ].join("\n"),
    );
    this.name = "ErroDeConexaoDoBanco";
    this.variavel = variavel;
  }
}

/**
 * A credencial que atende requisição consegue passar por cima do isolamento.
 *
 * Recusar é a única resposta segura: com `SUPERUSER` ou `BYPASSRLS`, TODA
 * política de isolamento vira decoração e o banco devolve alegremente o dado
 * de qualquer loja. A falha seria invisível — as consultas funcionam, só
 * devolvem demais.
 */
export class ErroDeCredencialPrivilegiada extends Error {
  readonly papel: string;

  constructor(
    papel: string,
    superusuario: boolean,
    contornaIsolamento: boolean,
  ) {
    const poderes = [
      superusuario ? "é superusuário" : "",
      contornaIsolamento ? "pode contornar o isolamento por linha" : "",
    ].filter((texto) => texto !== "");

    super(
      [
        `A conexão da aplicação autenticou como "${papel}", que ${poderes.join(" e ")}.`,
        "",
        "Com esse poder o isolamento por linha não é aplicado e uma loja passa a",
        "enxergar o dado de todas as outras — sem erro nenhum aparecer.",
        "A aplicação usa a credencial `sc_app`; `sc_migrator` é só de migração.",
      ].join("\n"),
    );
    this.name = "ErroDeCredencialPrivilegiada";
    this.papel = papel;
  }
}

/** Alvo de uma alteração por identificador, para a mensagem de "não encontrado". */
export interface AlvoDaAlteracao {
  readonly recurso: string;
  readonly id: string;
}

/**
 * Alteração por identificador que não achou linha nenhuma.
 *
 * É o coração da norma do repositório: quando a loja A tenta alterar algo da
 * loja B, o banco não levanta erro — ele simplesmente não encontra a linha e
 * responde "0 linhas afetadas". Sem esta conversão, o dono da outra loja
 * receberia sucesso e nada teria acontecido.
 */
export class ErroDeRecursoNaoEncontrado extends Error {
  readonly recurso: string;
  readonly id: string;

  constructor(alvo: AlvoDaAlteracao) {
    super(`${alvo.recurso} ${alvo.id} não encontrado.`);
    this.name = "ErroDeRecursoNaoEncontrado";
    this.recurso = alvo.recurso;
    this.id = alvo.id;
  }
}

/** Alteração por identificador que pegou mais de uma linha. */
export class ErroDeAlteracaoAmpla extends Error {
  readonly recurso: string;
  readonly id: string;
  readonly linhasAfetadas: number;

  constructor(alvo: AlvoDaAlteracao, linhasAfetadas: number) {
    super(
      `A alteração de ${alvo.recurso} ${alvo.id} afetou ${linhasAfetadas} linhas, e alteração por identificador afeta no máximo uma. A transação foi desfeita.`,
    );
    this.name = "ErroDeAlteracaoAmpla";
    this.recurso = alvo.recurso;
    this.id = alvo.id;
    this.linhasAfetadas = linhasAfetadas;
  }
}

// ---------------------------------------------------------------------------
// Regra 3 — duas cadeias de conexão distintas
// ---------------------------------------------------------------------------

/** Valor da variável já sem espaços, ou `undefined` quando não veio. */
function valorDe(fonte: FonteDeAmbiente, variavel: string): string | undefined {
  const bruto = fonte[variavel]?.trim();
  return bruto === undefined || bruto === "" ? undefined : bruto;
}

/**
 * A cadeia da aplicação: pelo agrupador, em modo transação.
 *
 * Não recebe ajuste de texto para desligar instrução preparada porque, neste
 * arranjo, desligar é o padrão: o adaptador do Prisma só usa instrução
 * preparada quando recebe um gerador de nomes, e este módulo não passa nenhum
 * (ver `criarAcessoAoBanco`). O que sobra para conferir aqui é o que um ajuste
 * de texto não conferiria: que a cadeia da aplicação não é a de migração.
 */
export function conexaoDaAplicacao(fonte: FonteDeAmbiente): string {
  const url = valorDe(fonte, "DATABASE_URL");
  if (url === undefined) {
    throw new ErroDeConexaoDoBanco("DATABASE_URL", "não está definida");
  }
  if (url === valorDe(fonte, "DATABASE_URL_DIRETA")) {
    throw new ErroDeConexaoDoBanco(
      "DATABASE_URL",
      "é idêntica a DATABASE_URL_DIRETA, e as duas precisam ser cadeias diferentes",
    );
  }
  return url;
}

/**
 * A cadeia de migração: direta, sem agrupador, com a credencial dona do
 * esquema. Mora aqui para deixar explícito que existe e que NUNCA atende
 * requisição — nada neste módulo abre conexão com ela.
 */
export function conexaoDeMigracao(fonte: FonteDeAmbiente): string {
  const url = valorDe(fonte, "DATABASE_URL_DIRETA");
  if (url === undefined) {
    throw new ErroDeConexaoDoBanco("DATABASE_URL_DIRETA", "não está definida");
  }
  return url;
}

// ---------------------------------------------------------------------------
// Regra 1 — o contexto vive na transação
// ---------------------------------------------------------------------------

/**
 * Grava o contexto da requisição na transação.
 *
 * Duas decisões carregam o isolamento inteiro, e as duas são deliberadas:
 *
 * - **`is_local => true`** (o terceiro argumento). O valor vale até o fim
 *   DESTA transação e desaparece no `COMMIT`. Com `false`, ele fica na conexão
 *   e vaza para a próxima requisição que a reaproveitar.
 * - **Os quatro parâmetros são gravados SEMPRE**, mesmo vazios. A tentação é
 *   gravar só o que existe ("se tem loja, define a loja") — e é justamente
 *   isso que faz uma requisição sem loja herdar a loja da requisição anterior.
 *   Gravar vazio é gravar "nenhuma", e o banco trata nenhuma como negação.
 */
async function aplicarContextoNaTransacao(
  tx: TransacaoDoBanco,
  contexto: ContextoDaRequisicao,
): Promise<void> {
  await tx.$executeRaw`
    SELECT set_config('app.store_id',    ${contexto.lojaId ?? ""},       true),
           set_config('app.user_id',     ${contexto.usuarioId ?? ""},    true),
           set_config('app.role',        ${contexto.papel},              true),
           set_config('app.order_token', ${contexto.tokenDoPedido ?? ""}, true),
           set_config('app.checkout_key', ${contexto.chaveDoFechamento ?? ""}, true),
           set_config('app.cart_session', ${contexto.sessaoDoCarrinho ?? ""}, true)`;
}

// ---------------------------------------------------------------------------
// Regra 4 — a credencial da aplicação não contorna o isolamento
// ---------------------------------------------------------------------------

/** Como o banco descreve o papel autenticado pela conexão da aplicação. */
interface PapelAutenticado {
  readonly papel: string;
  readonly superusuario: boolean;
  readonly contornaIsolamento: boolean;
}

/** Recusa a conexão cujo papel passa por cima do isolamento por linha. */
async function exigirCredencialSemPrivilegio(
  consultar: () => Promise<PapelAutenticado[]>,
): Promise<void> {
  const [papel] = await consultar();
  if (papel === undefined) return;
  if (papel.superusuario || papel.contornaIsolamento) {
    throw new ErroDeCredencialPrivilegiada(
      papel.papel,
      papel.superusuario,
      papel.contornaIsolamento,
    );
  }
}

// ---------------------------------------------------------------------------
// Regra 2 — o cliente cru nunca sai daqui
// ---------------------------------------------------------------------------

/**
 * Monta o acesso ao banco.
 *
 * O `PrismaClient` e o agrupador do `pg` nascem dentro desta função e ficam
 * presos ao fecho dela: não são devolvidos, não viram propriedade do objeto e
 * não existem em nenhum outro lugar do código da API. Quem quiser falar com o
 * banco pede uma transação, e a transação já vem com o contexto aplicado.
 */
export function criarAcessoAoBanco(opcoes: OpcoesDoAcesso): AcessoAoBanco {
  const agrupador = new pg.Pool({
    connectionString: opcoes.urlDaAplicacao,
    max: opcoes.maxDeConexoes ?? MAX_DE_CONEXOES_PADRAO,
  });

  // Sem gerador de nomes de instrução: o adaptador só prepara e guarda
  // instrução no servidor quando recebe um, e instrução preparada não
  // sobrevive a um agrupador em modo transação — a consulta quebra de forma
  // intermitente, só sob carga, que é onde ninguém procura o defeito.
  const adaptador = new PrismaPg(agrupador);
  const cliente = new PrismaClient({ adapter: adaptador });

  const esperaPorConexaoMs =
    opcoes.esperaPorConexaoMs ?? ESPERA_POR_CONEXAO_PADRAO_MS;
  const duracaoMaximaMs = opcoes.duracaoMaximaMs ?? DURACAO_MAXIMA_PADRAO_MS;
  const conferirCredencial = opcoes.conferirCredencial ?? true;

  // A conferência acontece uma vez, na primeira transação: no arranque o banco
  // pode nem estar de pé, e recusar a API inteira por isso trocaria um defeito
  // silencioso por uma indisponibilidade barulhenta.
  let credencialConferida: Promise<void> | undefined;

  async function garantirCredencial(): Promise<void> {
    if (!conferirCredencial) return;
    credencialConferida ??= exigirCredencialSemPrivilegio(async () => {
      return cliente.$queryRaw<PapelAutenticado[]>`
        SELECT rolname                AS papel,
               rolsuper               AS superusuario,
               rolbypassrls           AS "contornaIsolamento"
          FROM pg_roles WHERE rolname = current_user`;
    }).catch((erro: unknown) => {
      // Falha aqui não é veredito sobre a credencial: com o banco fora do ar a
      // consulta nem chega a acontecer. Guardar a promessa recusada faria a API
      // nunca mais tentar, e a verificação de PRONTO continuaria dizendo "não"
      // depois de o banco voltar — o oposto do que AC-023 pede.
      credencialConferida = undefined;
      throw erro;
    });
    await credencialConferida;
  }

  return {
    /**
     * Abre UMA transação, grava nela o contexto da requisição e entrega o
     * punho ao domínio.
     *
     * Exige contexto de propósito: sem ele não há como saber de qual loja e de
     * qual papel é a requisição, e uma consulta sem essa resposta é uma
     * consulta que o banco deveria recusar — melhor recusar aqui, onde o erro
     * aponta para a causa.
     */
    async emTransacao<T>(
      acao: (tx: TransacaoDoBanco) => Promise<T>,
    ): Promise<T> {
      const contexto = exigirContexto();

      // Uma transação por requisição, e não uma por chamada: quem já está
      // dentro da transação da requisição continua nela. Abrir uma segunda
      // tomaria outra conexão do agrupador enquanto a primeira ainda a segura
      // — impasse na hora em que o agrupador estiver cheio — e ainda partiria
      // o trabalho da requisição em dois registros independentes, em que o
      // primeiro sobrevive à falha do segundo.
      const emCurso = contexto.transacao;
      if (emCurso !== undefined) return acao(emCurso as TransacaoDoBanco);

      await garantirCredencial();

      return cliente.$transaction(
        async (tx) => {
          await aplicarContextoNaTransacao(tx, contexto);
          // A transação também vai para o contexto, para que o repositório
          // lá embaixo a alcance sem que doze assinaturas a carreguem.
          contexto.transacao = tx;
          try {
            return await acao(tx);
          } finally {
            contexto.transacao = undefined;
          }
        },
        { maxWait: esperaPorConexaoMs, timeout: duracaoMaximaMs },
      );
    },

    async encerrar(): Promise<void> {
      await cliente.$disconnect();
      await agrupador.end();
    },
  };
}

// ---------------------------------------------------------------------------
// O acesso da aplicação
// ---------------------------------------------------------------------------

let acessoDaAplicacao: AcessoAoBanco | undefined;

/**
 * O acesso que a API usa em execução, montado uma vez a partir do ambiente.
 *
 * Preguiçoso porque a validação do ambiente é da partida (`core/env.ts`) e
 * porque importar este módulo — o que todo teste de unidade faz — não pode
 * abrir conexão com banco nenhum.
 */
export function banco(fonte: FonteDeAmbiente = process.env): AcessoAoBanco {
  acessoDaAplicacao ??= criarAcessoAoBanco({
    urlDaAplicacao: conexaoDaAplicacao(fonte),
  });
  return acessoDaAplicacao;
}

/** Encerra o acesso da aplicação. Serve ao desligamento ordenado da API. */
export async function encerrarBanco(): Promise<void> {
  const acesso = acessoDaAplicacao;
  acessoDaAplicacao = undefined;
  await acesso?.encerrar();
}

/** Atalho: abre a transação da requisição em curso no acesso da aplicação. */
export function emTransacao<T>(
  acao: (tx: TransacaoDoBanco) => Promise<T>,
): Promise<T> {
  return banco().emTransacao(acao);
}

/**
 * A transação da requisição em curso, já tipada.
 *
 * É por aqui que o repositório alcança a transação sem recebê-la como
 * parâmetro em toda a descida. A conversão de tipo acontece só neste ponto:
 * `core/contexto.ts` guarda o valor opaco de propósito, para não passar a
 * conhecer a camada de dados.
 */
export function transacaoAtual(): TransacaoDoBanco {
  const contexto = exigirContexto();
  if (contexto.transacao === undefined) {
    throw new ErroSemContexto("Tentativa de usar a transação do banco");
  }
  return contexto.transacao as TransacaoDoBanco;
}

// ---------------------------------------------------------------------------
// Regra 6 — norma do repositório: zero linhas é "não encontrado"
// ---------------------------------------------------------------------------

/**
 * Confere quantas linhas a alteração por identificador afetou e converte zero
 * em "não encontrado".
 *
 * Toda alteração e toda remoção por identificador passa por aqui, sem exceção.
 * O motivo é medido: a política de isolamento não levanta erro quando o alvo é
 * de outra loja — ela apenas não enxerga a linha, e o `UPDATE` responde "0".
 * Sem esta conversão o dono de outra loja recebe 200, o registro fica limpo, a
 * revisão de código não vê nada, e o dado simplesmente não muda.
 */
export async function exigirUmaLinhaAfetada(
  alvo: AlvoDaAlteracao,
  executar: () => Promise<number>,
): Promise<void> {
  const linhasAfetadas = await executar();

  if (linhasAfetadas === 0) throw new ErroDeRecursoNaoEncontrado(alvo);
  // Mais de uma linha por identificador só acontece com predicado errado — e
  // aí desfazer é a resposta certa, não seguir em frente.
  if (linhasAfetadas > 1) {
    throw new ErroDeAlteracaoAmpla(alvo, linhasAfetadas);
  }
}
