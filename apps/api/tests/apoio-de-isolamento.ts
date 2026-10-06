/**
 * Apoio comum às provas de isolamento entre lojas (AC-010, AC-011, P-003).
 *
 * Existe porque as duas provas — a varredura por catálogo e a de concorrência —
 * precisam exatamente do mesmo arranque: a credencial `sc_app` derivada do
 * banco descartável do arquivo, o acesso montado por `core/db.ts` e a forma de
 * rodar algo COMO SE FOSSE UMA REQUISIÇÃO. Repetir esse arranque nos dois
 * arquivos convidaria os dois a divergirem, e uma prova de isolamento que roda
 * por um caminho diferente do da API não prova o que interessa.
 *
 * Nada aqui contém segredo: a senha da aplicação vem de variável de ambiente
 * (P-002), e a ausência dela vira recusa que diz o que fazer — nunca teste
 * pulado, porque teste pulado não é prova.
 */

import {
  criarContexto,
  type DadosDoContexto,
  executarNoContexto,
} from "../src/core/contexto.ts";
import {
  type AcessoAoBanco,
  criarAcessoAoBanco,
  type TransacaoDoBanco,
} from "../src/core/db.ts";

// ---------------------------------------------------------------------------
// Ambiente
// ---------------------------------------------------------------------------

/**
 * Variável obrigatória, com recusa que ensina o caminho de volta.
 *
 * Recusar em vez de pular é decisão do projeto: um teste de isolamento que se
 * pula sozinho por falta de ambiente vira um "tudo certo" que ninguém pediu, e
 * isso já custou caro aqui.
 */
export function exigirVariavel(nome: string): string {
  const valor = process.env[nome]?.trim();
  if (valor === undefined || valor === "") {
    throw new Error(
      [
        `${nome} não está definida, e sem ela não há como provar o isolamento contra um banco real.`,
        "Este teste NÃO pode ser pulado — prova que não roda não é prova.",
        "Suba o ambiente e preencha o arquivo de ambiente:",
        "  bash infra/scripts/up.sh core test",
        "  cp .env.example .env   # e complete as senhas dos papéis de banco",
      ].join("\n"),
    );
  }
  return valor;
}

/** Senha do papel `sc_app` — o único que atende requisição. */
export const SENHA_DA_APLICACAO = exigirVariavel("SENHA_BANCO_APLICACAO");

/** Espera generosa: o primeiro arquivo do dia ainda constrói o molde. */
export const ESPERA_LONGA = 120_000;

/** Código do PostgreSQL para recusa de permissão — inclui violação de política. */
export const RECUSA_DE_PERMISSAO = "42501";

// ---------------------------------------------------------------------------
// O caminho único, do jeito que a API o usa
// ---------------------------------------------------------------------------

/**
 * Roda `acao` como uma requisição da API: contexto montado, transação aberta
 * por `core/db.ts` e contexto gravado nela.
 *
 * É de propósito que a prova passe por aqui e não por uma conexão solta: o que
 * precisa ser provado é o caminho que a API realmente usa (P-004). Uma prova
 * feita com `pg` cru provaria o PostgreSQL, não o SimpleClick.
 */
export function comoRequisicao<T>(
  acesso: AcessoAoBanco,
  dados: DadosDoContexto,
  acao: (tx: TransacaoDoBanco) => Promise<T>,
): Promise<T> {
  return executarNoContexto(criarContexto(dados), () =>
    acesso.emTransacao(acao),
  );
}

/** Quantas conexões o agrupador de uma prova mantém, e quanto ela pode esperar. */
export interface OpcoesDoAgrupador {
  readonly maxDeConexoes: number;
  readonly esperaMs?: number;
}

/**
 * Abre o acesso da aplicação sobre o banco descartável do arquivo de teste.
 *
 * A credencial é derivada, e não lida do ambiente: `DATABASE_URL` aponta para o
 * banco de desenvolvimento, e a prova roda no banco efêmero deste arquivo. O
 * papel é sempre `sc_app` — o mesmo que atende requisição em produção, sem
 * poder de contornar o isolamento.
 */
export function abrirAcessoDaAplicacao(
  urlDoBancoDeTeste: string,
  opcoes: OpcoesDoAgrupador,
): AcessoAoBanco {
  const espera = opcoes.esperaMs ?? 60_000;
  return criarAcessoAoBanco({
    urlDaAplicacao: urlDaAplicacaoNoBanco(urlDoBancoDeTeste),
    maxDeConexoes: opcoes.maxDeConexoes,
    esperaPorConexaoMs: espera,
    duracaoMaximaMs: espera,
  });
}

/** A mesma cadeia do banco de teste, autenticando como `sc_app`. */
function urlDaAplicacaoNoBanco(url: string): string {
  const destino = new URL(url);
  destino.username = "sc_app";
  destino.password = SENHA_DA_APLICACAO;
  return destino.toString();
}

/**
 * Abre o acesso da ADMINISTRAÇÃO (`sc_admin`) sobre o banco descartável do
 * arquivo, pelo mesmo `core/db.ts` que a API usa.
 *
 * A senha é lida aqui, e não no carregamento do módulo: a maioria das provas
 * de isolamento nunca fala como administração, e não pode reprovar por falta
 * de uma variável de que não precisa.
 */
export function abrirAcessoDaAdministracaoNoBanco(
  urlDoBancoDeTeste: string,
  opcoes: OpcoesDoAgrupador,
): AcessoAoBanco {
  const destino = new URL(urlDoBancoDeTeste);
  destino.username = "sc_admin";
  destino.password = exigirVariavel("SENHA_BANCO_ADMINISTRACAO");
  const espera = opcoes.esperaMs ?? 60_000;
  return criarAcessoAoBanco({
    urlDaAplicacao: destino.toString(),
    maxDeConexoes: opcoes.maxDeConexoes,
    esperaPorConexaoMs: espera,
    duracaoMaximaMs: espera,
  });
}

// ---------------------------------------------------------------------------
// SQL montado a partir do catálogo
// ---------------------------------------------------------------------------

/** Valores que uma linha de teste carrega. */
export type Registro = Record<string, string | number | null>;

/** Nome de tabela ou coluna aceitável para entrar em comando montado. */
const IDENTIFICADOR_SIMPLES = /^[a-z_][a-z0-9_]*$/;

/**
 * Confere o identificador antes de ele virar texto de comando.
 *
 * Os nomes vêm do catálogo do PostgreSQL, não de entrada de usuário — mas a
 * varredura monta comando por concatenação, e concatenação sem conferência é
 * um hábito que uma hora encontra um nome vindo de outro lugar.
 */
export function exigirIdentificador(nome: string): string {
  if (!IDENTIFICADOR_SIMPLES.test(nome)) {
    throw new Error(
      `"${nome}" não é um identificador simples do esquema app, e a varredura só monta comando com nome vindo do catálogo.`,
    );
  }
  return nome;
}

/** Comando de inserção com marcadores posicionais, mais os valores na ordem. */
export function comandoDeInsercao(
  tabela: string,
  colunas: Registro,
): { sql: string; valores: (string | number | null)[] } {
  const nomes = Object.keys(colunas).map(exigirIdentificador);
  const valores = Object.values(colunas);
  const marcadores = nomes.map((_, indice) => `$${indice + 1}`);

  return {
    sql: `INSERT INTO app.${exigirIdentificador(tabela)} (${nomes.join(", ")}) VALUES (${marcadores.join(", ")})`,
    valores,
  };
}

// ---------------------------------------------------------------------------
// Leitura do erro que o banco devolveu
// ---------------------------------------------------------------------------

interface ErroEmbrulhadoPeloPrisma {
  readonly message?: string;
  readonly meta?: {
    readonly driverAdapterError?: {
      readonly cause?: { readonly code?: unknown };
    };
  };
}

/**
 * O código do PostgreSQL que está dentro do erro embrulhado pelo Prisma.
 *
 * Importa porque "a escrita falhou" não é prova de isolamento: falhar por
 * chave duplicada (23505) ou por chave estrangeira (23503) seria um acidente
 * com cara de proteção. Só `42501` — política recusou ou privilégio não existe
 * — prova que quem barrou foi o isolamento.
 */
export function codigoDoPostgres(erro: unknown): string | undefined {
  const embrulhado = erro as ErroEmbrulhadoPeloPrisma;
  const doAdaptador = embrulhado?.meta?.driverAdapterError?.cause?.code;
  if (typeof doAdaptador === "string") return doAdaptador;

  const naMensagem = /Code: `([0-9A-Za-z]+)`/.exec(
    String(embrulhado?.message ?? ""),
  );
  return naMensagem?.[1];
}

/** Uma linha só de mensagem, para caber no relato da falha. */
export function resumoDoErro(erro: unknown): string {
  return String((erro as Error)?.message ?? erro)
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);
}
