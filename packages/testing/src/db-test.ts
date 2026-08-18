/**
 * Banco de teste separado e efêmero (AC-003).
 *
 * O problema que este arquivo resolve é de confiabilidade, não de conveniência:
 * teste que compartilha banco com outro teste mente. Ele passa quando roda
 * sozinho e falha quando roda depois do vizinho, e a pessoa aprende a
 * desconfiar da suíte em vez de desconfiar do código.
 *
 * O arranjo é este:
 *
 * - **Um banco por processo/arquivo de teste.** Cada arquivo recebe um banco
 *   com nome próprio. Dois arquivos rodando ao mesmo tempo não se enxergam, e a
 *   ordem de execução deixa de existir como variável.
 * - **Criado a partir de um MOLDE já migrado.** Aplicar seis migrações por
 *   arquivo de teste custa segundos; copiar um molde pronto custa
 *   milissegundos. O molde é construído uma vez por conteúdo de migração, e o
 *   nome dele carrega a impressão digital do conjunto — mudou uma migração,
 *   nasce outro molde, sem ninguém precisar lembrar de apagar o antigo.
 * - **Descartado ao final, inclusive quando o teste falha.** O descarte mora no
 *   encerramento do arquivo, que roda com teste vermelho também. Para o caso em
 *   que o processo morre sem encerrar (interrupção, falta de memória), o nome
 *   carrega o instante de criação e uma varredura apaga o que ficou para trás.
 * - **Longe do banco de desenvolvimento.** Duas guardas: a cadeia de conexão de
 *   teste é recusada se apontar para o mesmo banco do desenvolvimento, e criar
 *   ou apagar só é permitido em nome com o prefixo efêmero. Não existe caminho
 *   neste arquivo que consiga apagar `simpleclick_dev`.
 *
 * Segredo só por variável de ambiente (P-002): nenhuma senha aparece aqui, nem
 * em mensagem de erro.
 */

import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  aplicarMigracoes,
  lerMigracoes,
  type Migracao,
} from "@simpleclick/database";
import pg from "pg";

// ---------------------------------------------------------------------------
// Ambiente
// ---------------------------------------------------------------------------

/** Raiz do repositório, a partir deste arquivo. */
const RAIZ_DO_REPOSITORIO = fileURLToPath(
  new URL("../../../", import.meta.url),
);

// O arquivo de ambiente é opcional: quem já exporta as variáveis na sessão não
// precisa dele. O que estiver exportado vence o arquivo, então o portão de
// qualidade continua mandando no que roda.
const ARQUIVO_DE_AMBIENTE = join(RAIZ_DO_REPOSITORIO, ".env");
if (existsSync(ARQUIVO_DE_AMBIENTE)) process.loadEnvFile(ARQUIVO_DE_AMBIENTE);

/** Fonte de configuração: o ambiente do processo, ou um dublê nos testes. */
export type Ambiente = Readonly<Record<string, string | undefined>>;

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------

/** Todo banco efêmero começa assim. É o que autoriza criar e apagar. */
export const PREFIXO_DO_BANCO_DE_TESTE = "sc_teste_";

/** Todo molde começa assim. Molde sobrevive à suíte; banco de teste, não. */
export const PREFIXO_DO_MOLDE = "sc_molde_";

/**
 * Só estes nomes podem ser criados ou apagados por este arquivo. É a guarda que
 * torna impossível, e não improvável, apagar um banco de gente.
 */
const NOME_EFEMERO = new RegExp(
  `^(${PREFIXO_DO_BANCO_DE_TESTE}|${PREFIXO_DO_MOLDE})[a-z0-9_]{1,50}$`,
);

/** Trava entre processos na construção do molde. Qualquer inteiro serve. */
const CHAVE_DA_TRAVA_DO_MOLDE = 8_310_007;

/** Depois disso, um banco de teste que ainda existe é sobra de processo morto. */
const IDADE_DE_ABANDONO_MS = 30 * 60 * 1000;

/** Códigos do PostgreSQL para "o objeto está em uso agora". */
const OBJETO_EM_USO = new Set(["55006", "55P03"]);

/** Tentativas de criação antes de desistir, com espera crescente entre elas. */
const TENTATIVAS_DE_CRIACAO = 6;

// ---------------------------------------------------------------------------
// Erros
// ---------------------------------------------------------------------------

/** Falta configuração para falar com o servidor de teste. */
export class ErroDeAmbienteDeTeste extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = "ErroDeAmbienteDeTeste";
  }
}

/**
 * Alguém pediu para tratar como descartável um banco que não é descartável.
 *
 * É o erro mais importante deste arquivo: ele é o que separa "os testes usam um
 * banco próprio" de "os testes apagaram o banco de desenvolvimento".
 */
export class ErroDeBancoProtegido extends Error {
  readonly alvo: string;

  constructor(alvo: string, motivo: string) {
    super(
      [
        `Recusado: ${alvo} ${motivo}.`,
        "",
        "Banco de teste é separado e descartável (AC-003). Confira DATABASE_URL_TEST",
        "— ela precisa apontar para o servidor de teste, nunca para o de desenvolvimento.",
      ].join("\n"),
    );
    this.name = "ErroDeBancoProtegido";
    this.alvo = alvo;
  }
}

// ---------------------------------------------------------------------------
// Identidade de uma cadeia de conexão
// ---------------------------------------------------------------------------

/** Máquina, porta e nome do banco — o que decide se duas cadeias são o mesmo
 *  banco. Usuário e senha ficam de fora de propósito: trocar de credencial não
 *  transforma o banco de desenvolvimento em outro banco. */
export function identidadeDoBanco(url: string): string {
  const destino = new URL(url);
  const porta = destino.port === "" ? "5432" : destino.port;
  const nome = decodeURIComponent(destino.pathname.replace(/^\//, ""));
  return `${destino.hostname.toLowerCase()}:${porta}/${nome}`;
}

/** Duas cadeias de conexão apontam para o mesmo banco? */
export function apontamParaOMesmoBanco(uma: string, outra: string): boolean {
  return identidadeDoBanco(uma) === identidadeDoBanco(outra);
}

/** A mesma cadeia de conexão, apontando para outro banco do mesmo servidor. */
export function urlDoBanco(urlDoServidor: string, nome: string): string {
  const destino = new URL(urlDoServidor);
  destino.pathname = `/${nome}`;
  return destino.toString();
}

/**
 * Recusa uma cadeia de conexão que aponte para o banco de desenvolvimento.
 *
 * Sem isto, um `.env` com uma linha trocada faria a suíte inteira rodar em cima
 * dos dados de quem está desenvolvendo — e a suíte apaga o que cria.
 */
export function recusarBancoDeDesenvolvimento(
  url: string,
  ambiente: Ambiente = process.env,
): void {
  for (const variavel of ["DATABASE_URL", "DATABASE_URL_DIRETA"]) {
    const desenvolvimento = ambiente[variavel]?.trim();
    if (desenvolvimento === undefined || desenvolvimento === "") continue;
    if (apontamParaOMesmoBanco(url, desenvolvimento)) {
      throw new ErroDeBancoProtegido(
        identidadeDoBanco(url),
        `é o mesmo banco de ${variavel}, o de desenvolvimento`,
      );
    }
  }
}

/** Recusa qualquer nome que não seja de banco efêmero deste arranjo. */
export function exigirNomeEfemero(nome: string): string {
  if (!NOME_EFEMERO.test(nome)) {
    throw new ErroDeBancoProtegido(
      nome,
      `não é um banco efêmero (o nome precisaria começar com ${PREFIXO_DO_BANCO_DE_TESTE} ou ${PREFIXO_DO_MOLDE})`,
    );
  }
  return nome;
}

/**
 * Cadeia de conexão administrativa do servidor de teste, já conferida.
 *
 * É a única porta de entrada: quem quiser um banco descartável passa por aqui,
 * e por isso a guarda contra o banco de desenvolvimento não tem como ser
 * esquecida em algum caminho novo.
 */
export function urlDoServidorDeTeste(ambiente: Ambiente = process.env): string {
  const url = ambiente.DATABASE_URL_TEST?.trim();
  if (url === undefined || url === "") {
    throw new ErroDeAmbienteDeTeste(
      [
        "DATABASE_URL_TEST não está definida, e sem ela não há banco de teste para criar.",
        "Suba o ambiente e preencha o arquivo de ambiente:",
        "  bash infra/scripts/up.sh core test",
        "  cp .env.example .env   # e complete os valores",
      ].join("\n"),
    );
  }
  recusarBancoDeDesenvolvimento(url, ambiente);
  return url;
}

// ---------------------------------------------------------------------------
// Conexões
// ---------------------------------------------------------------------------

/** Conecta e devolve o cliente aberto. Quem chama encerra. */
export async function conectar(url: string): Promise<pg.Client> {
  const cliente = new pg.Client({ connectionString: url });
  await cliente.connect();
  return cliente;
}

/**
 * Executa algo com uma conexão ao banco administrativo do servidor de teste.
 *
 * Criar e apagar banco não pode acontecer de dentro do próprio banco, então
 * este é o ponto de apoio de todo o resto.
 */
async function comClienteAdministrativo<T>(
  acao: (cliente: pg.Client) => Promise<T>,
): Promise<T> {
  const cliente = await conectar(urlDoServidorDeTeste());
  try {
    return await acao(cliente);
  } finally {
    await cliente.end();
  }
}

/** O banco existe no servidor de teste? */
async function bancoExiste(cliente: pg.Client, nome: string): Promise<boolean> {
  const achado = await cliente.query(
    "SELECT 1 FROM pg_database WHERE datname = $1",
    [nome],
  );
  return achado.rowCount === 1;
}

// ---------------------------------------------------------------------------
// Molde
// ---------------------------------------------------------------------------

/**
 * Nome do molde para um conjunto de migrações.
 *
 * A impressão digital entra no nome de propósito: mudou qualquer migração, o
 * molde antigo deixa de ser encontrado e um novo é construído. Ninguém precisa
 * lembrar de invalidar cache — a memória fica no nome.
 */
export function nomeDoMolde(migracoes: readonly Migracao[]): string {
  const resumo = createHash("sha256");
  for (const migracao of migracoes) {
    resumo.update(`${migracao.nome}:${migracao.sha256}\n`);
  }
  return `${PREFIXO_DO_MOLDE}${resumo.digest("hex").slice(0, 16)}`;
}

/** Uma única construção por processo, mesmo com vários arquivos pedindo. */
let moldeEmPreparo: Promise<string> | undefined;

/**
 * Garante o molde migrado e devolve o nome dele.
 *
 * Entre processos, a trava do PostgreSQL serializa a construção: o segundo
 * processo espera o primeiro terminar e encontra o molde pronto, em vez de os
 * dois aplicarem as migrações no mesmo banco pela metade.
 */
export function garantirMolde(): Promise<string> {
  moldeEmPreparo ??= prepararMolde();
  return moldeEmPreparo;
}

async function prepararMolde(): Promise<string> {
  const migracoes = lerMigracoes();
  const molde = exigirNomeEfemero(nomeDoMolde(migracoes));
  const servidor = urlDoServidorDeTeste();

  // Caminho rápido: na imensa maioria das execuções o molde já existe e nada
  // além desta consulta acontece.
  const pronto = await comClienteAdministrativo((cliente) =>
    bancoExiste(cliente, molde),
  );
  if (pronto) return molde;

  await comClienteAdministrativo(async (cliente) => {
    await cliente.query("SELECT pg_advisory_lock($1)", [
      CHAVE_DA_TRAVA_DO_MOLDE,
    ]);
    try {
      if (await bancoExiste(cliente, molde)) return;

      // Sobra de uma construção que morreu no meio: o molde só vale inteiro.
      await cliente.query(`DROP DATABASE IF EXISTS ${molde} WITH (FORCE)`);
      await cliente.query(`CREATE DATABASE ${molde} TEMPLATE template0`);

      try {
        await migrarMolde(urlDoBanco(servidor, molde));
        await impedirConexoesNoMolde(cliente, molde);
      } catch (causa) {
        await cliente.query(`DROP DATABASE IF EXISTS ${molde} WITH (FORCE)`);
        throw causa;
      }
    } finally {
      await cliente.query("SELECT pg_advisory_unlock($1)", [
        CHAVE_DA_TRAVA_DO_MOLDE,
      ]);
    }
  });

  // Sobra de execução anterior interrompida. É melhor esforço: falhar aqui
  // seria transformar faxina em reprovação de teste.
  await varrerBancosAbandonados().catch(() => []);

  return molde;
}

/** Aplica as migrações no molde recém-criado e fecha a conexão. */
async function migrarMolde(url: string): Promise<void> {
  const cliente = await conectar(url);
  try {
    await aplicarMigracoes({ cliente, segredos: process.env });
  } finally {
    await cliente.end();
  }
}

/**
 * Fecha o molde para conexões.
 *
 * `CREATE DATABASE ... TEMPLATE m` falha enquanto alguém estiver conectado em
 * `m`. Fechando o molde, essa falha deixa de ser possível — nem uma janela de
 * inspeção aberta por engano derruba a suíte. Para abrir de novo:
 * `ALTER DATABASE <molde> ALLOW_CONNECTIONS true`.
 *
 * Tolera falta de privilégio: sem isso o arranjo ainda funciona, só fica
 * sujeito à repetição na criação.
 */
async function impedirConexoesNoMolde(
  cliente: pg.Client,
  molde: string,
): Promise<void> {
  try {
    await cliente.query(`ALTER DATABASE ${molde} ALLOW_CONNECTIONS false`);
  } catch {
    // Sem privilégio para isto; a criação com repetição cobre o caso.
  }
}

// ---------------------------------------------------------------------------
// Banco de teste
// ---------------------------------------------------------------------------

/** Um banco descartável, com o que é preciso para usá-lo e para largá-lo. */
export interface BancoDeTeste {
  readonly nome: string;
  readonly url: string;
  /** Apaga o banco. Chamar duas vezes não é erro. */
  descartar(): Promise<void>;
}

export interface OpcoesDeBancoDeTeste {
  /** Aparece no nome do banco e só serve para dar pista em investigação. */
  readonly rotulo?: string;
}

/**
 * Monta o nome de um banco de teste.
 *
 * O instante de criação entra em base 36 no nome porque o PostgreSQL não guarda
 * data de criação de banco: sem isso, não haveria como distinguir sobra de
 * processo morto de banco em uso por outro arquivo rodando agora.
 */
export function nomeNovoDeBancoDeTeste(
  rotulo = "",
  agora: number = Date.now(),
): string {
  const limpo = rotulo
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 20);
  const sorteio = Math.random().toString(36).slice(2, 10);
  return `${PREFIXO_DO_BANCO_DE_TESTE}${agora.toString(36)}_${limpo === "" ? "x" : limpo}_${sorteio}`;
}

/** Lê do nome o instante em que o banco foi criado, ou `null` se não der. */
export function instanteDoNome(nome: string): number | null {
  if (!nome.startsWith(PREFIXO_DO_BANCO_DE_TESTE)) return null;
  const [carimbo] = nome.slice(PREFIXO_DO_BANCO_DE_TESTE.length).split("_");
  if (carimbo === undefined) return null;
  const instante = Number.parseInt(carimbo, 36);
  return Number.isFinite(instante) && instante > 0 ? instante : null;
}

/**
 * Cria um banco de teste a partir do molde já migrado.
 *
 * A repetição existe porque o PostgreSQL recusa copiar um molde enquanto ele
 * estiver em uso; é uma janela curta e concorrente, não um erro de uso.
 */
export async function criarBancoDeTeste(
  opcoes: OpcoesDeBancoDeTeste = {},
): Promise<BancoDeTeste> {
  const molde = await garantirMolde();
  const nome = exigirNomeEfemero(nomeNovoDeBancoDeTeste(opcoes.rotulo));

  await comClienteAdministrativo(async (cliente) => {
    for (let tentativa = 1; ; tentativa += 1) {
      try {
        await cliente.query(`CREATE DATABASE ${nome} TEMPLATE ${molde}`);
        return;
      } catch (causa) {
        const codigo = (causa as { code?: string }).code ?? "";
        if (!OBJETO_EM_USO.has(codigo) || tentativa >= TENTATIVAS_DE_CRIACAO) {
          throw causa;
        }
        await esperar(50 * tentativa);
      }
    }
  });

  let apagado = false;
  return {
    nome,
    url: urlDoBanco(urlDoServidorDeTeste(), nome),
    descartar: async () => {
      if (apagado) return;
      apagado = true;
      await apagarBanco(nome);
    },
  };
}

/** Apaga um banco efêmero. Recusa qualquer nome que não seja efêmero. */
export async function apagarBanco(nome: string): Promise<void> {
  exigirNomeEfemero(nome);
  await comClienteAdministrativo((cliente) =>
    // `WITH (FORCE)` derruba conexão esquecida: teste que estourou o tempo pode
    // ter deixado uma para trás, e o descarte não pode depender de boa sorte.
    cliente.query(`DROP DATABASE IF EXISTS ${nome} WITH (FORCE)`),
  );
}

/**
 * Cria, entrega e descarta — mesmo quando a ação lança.
 *
 * É a forma de usar um banco descartável fora do Vitest: script de apoio,
 * investigação, prova de conceito.
 */
export async function comBancoDeTeste<T>(
  acao: (banco: BancoDeTeste) => Promise<T>,
): Promise<T> {
  const banco = await criarBancoDeTeste();
  try {
    return await acao(banco);
  } finally {
    await banco.descartar();
  }
}

/**
 * Apaga bancos de teste que sobraram de processos que morreram sem encerrar.
 *
 * A idade mínima é o que impede a faxina de atropelar arquivos de teste rodando
 * em paralelo neste exato momento.
 */
export async function varrerBancosAbandonados(
  idadeMinimaMs: number = IDADE_DE_ABANDONO_MS,
  agora: number = Date.now(),
): Promise<string[]> {
  return comClienteAdministrativo(async (cliente) => {
    const achados = await cliente.query(
      "SELECT datname FROM pg_database WHERE datname LIKE $1",
      [`${PREFIXO_DO_BANCO_DE_TESTE}%`],
    );

    const apagados: string[] = [];
    for (const linha of achados.rows) {
      const nome = String((linha as { datname: unknown }).datname);
      const instante = instanteDoNome(nome);
      if (instante === null || agora - instante < idadeMinimaMs) continue;
      exigirNomeEfemero(nome);
      await cliente.query(`DROP DATABASE IF EXISTS ${nome} WITH (FORCE)`);
      apagados.push(nome);
    }
    return apagados;
  });
}

function esperar(ms: number): Promise<void> {
  return new Promise((resolver) => setTimeout(resolver, ms));
}

// ---------------------------------------------------------------------------
// O banco do arquivo de teste em execução
// ---------------------------------------------------------------------------

/**
 * Aqui mora o banco deste arquivo de teste.
 *
 * O Vitest dá a cada arquivo um registro de módulos próprio, então esta
 * variável é privada do arquivo em execução — é justamente isso que faz "um
 * banco por arquivo" ser verdade sem nenhum acordo entre os testes.
 */
let bancoDesteArquivo: BancoDeTeste | undefined;

/** Chamado pela preparação do Vitest, não pelo teste. */
export function registrarBancoDoArquivo(banco: BancoDeTeste): void {
  bancoDesteArquivo = banco;
}

/** Chamado pelo encerramento do Vitest, não pelo teste. */
export function esquecerBancoDoArquivo(): void {
  bancoDesteArquivo = undefined;
}

/** O banco descartável deste arquivo de teste. */
export function bancoDoArquivo(): BancoDeTeste {
  if (bancoDesteArquivo === undefined) {
    throw new ErroDeAmbienteDeTeste(
      [
        "Este arquivo de teste não recebeu banco próprio.",
        "Ele precisa estar num projeto do Vitest que carregue a preparação de banco",
        "(projetos `api-int` e `db-rls` em vitest.config.ts).",
      ].join("\n"),
    );
  }
  return bancoDesteArquivo;
}

/** Conexão nova no banco deste arquivo de teste. Quem chama encerra. */
export function conectarNoBancoDoArquivo(): Promise<pg.Client> {
  return conectar(bancoDoArquivo().url);
}
