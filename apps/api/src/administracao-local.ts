/**
 * Administração da plataforma no banco LOCAL, pela linha de comando (#163, T-3).
 *
 * Torna a conta informada a ÚNICA administração ativa do banco desta máquina:
 *
 *   pnpm --filter @simpleclick/api administracao:local -- \
 *     --email <e-mail> --banco <nome do banco> --node-env-do-preview <valor> \
 *     [--verificar | --aplicar]
 *
 * - `--verificar`: só lê. Mostra contagens, administrações ativas e a situação
 *   da conta; não pede senha.
 * - sem modo: SIMULAÇÃO. Faz tudo numa transação e desfaz no fim (ROLLBACK).
 * - `--aplicar`: a mesma transação, gravada.
 *
 * O que a transação faz, sob `LOCK TABLE app.platform_admins`:
 * conta existente recebe a senha nova (se mudou), e-mail verificado e destrava;
 * conta inexistente nasce por INSERT direto em `app.identities`, como em
 * `primeira-administracao.ts` (a função de cadastro não é executável por
 * `sc_admin`). A conta fica com grant ativo; os demais grants são revogados
 * (`revoked_at`, nunca DELETE); as sessões ativas da conta caem com
 * PASSWORD_CHANGED quando a senha muda, e as sessões ADMIN de qualquer outra
 * conta caem com ADMIN_REVOKED. Nenhum aceite legal é gravado (D-8): a pessoa
 * aceita pelo fluxo normal no primeiro login.
 *
 * Travas, todas antes de gravar: NODE_ENV deste processo diferente de
 * production, nenhum marcador de provedor de hospedagem, host do banco local,
 * `current_database()` igual a `--banco` e, para simular ou aplicar, banco que
 * não seja de teste. Sem aplicativo autenticador confirmado na conta, só segue
 * se o preview declarou `development` (lá o login de administração dispensa o
 * segundo fator); fora disso aborta ANTES de revogar quem quer que seja.
 *
 * A senha entra SÓ pelo terminal, sem eco: argumento `--senha`, variável de
 * ambiente com a senha e entrada sem terminal são recusados. Nem a senha nem o
 * resumo dela aparecem na saída, inclusive em erro. Nenhum e-mail mora aqui.
 *
 * Fica fora do build (`tsconfig.build.json`): não existe na imagem da API.
 * Saída: 0 pronto, 1 recusa ou falha, 2 entrada ou ambiente inválidos.
 */

import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

import pg from "pg";
import { z } from "zod";

import {
  conexaoDaAdministracao,
  ErroDeConexaoDoBanco,
  type FonteDeAmbiente,
} from "./core/db.ts";
import {
  avaliarPoliticaDeSenha,
  derivarSenha,
  senhaConfere,
} from "./modules/auth/senha.ts";

// ---------------------------------------------------------------------------
// Tipos de fronteira
// ---------------------------------------------------------------------------

/** O mínimo de banco de que o script precisa: o `pg.Client` serve. */
export interface ConexaoLocal {
  query(
    texto: string,
    valores?: unknown[],
  ): Promise<{ rows: Record<string, unknown>[] }>;
  end(): Promise<void>;
}

export type ModoDaAdministracaoLocal = "verificar" | "simular" | "aplicar";

export interface PedidoDaAdministracaoLocal {
  readonly email: string;
  readonly banco: string;
  readonly nodeEnvDoPreview: string;
  readonly modo: ModoDaAdministracaoLocal;
}

export interface OpcoesDaAdministracaoLocal {
  /** Os argumentos depois do nome do script (`process.argv.slice(2)`). */
  readonly argv: readonly string[];
  readonly ambiente: FonteDeAmbiente;
  /** Uma linha da saída de quem opera. */
  readonly escrever: (linha: string) => void;
  /** Pede uma linha ao terminal, sem eco, mostrando `rotulo`. */
  readonly lerSenha: (rotulo: string) => Promise<string>;
  /** Se a entrada padrão é um terminal de verdade. */
  readonly terminalInterativo: boolean;
  readonly conectar: (url: string) => Promise<ConexaoLocal>;
  /**
   * Só a prova liga: aceita simular e aplicar num banco de teste descartável.
   * Não há argumento nem variável que chegue aqui.
   */
  readonly aceitarBancoDeTeste?: boolean;
}

/** Recusa com código de saída. A mensagem nunca traz senha nem resumo. */
export class ErroDaAdministracaoLocal extends Error {
  readonly codigoDeSaida: number;

  constructor(mensagem: string, codigoDeSaida = 1) {
    super(mensagem);
    this.name = "ErroDaAdministracaoLocal";
    this.codigoDeSaida = codigoDeSaida;
  }
}

// ---------------------------------------------------------------------------
// Entrada
// ---------------------------------------------------------------------------

const esquemaDoEmail = z.string().trim().toLowerCase().max(254).pipe(z.email());
const NOME_DE_BANCO = /^[A-Za-z_][A-Za-z0-9_]{0,62}$/;
const VALOR_DE_NODE_ENV = /^[A-Za-z][A-Za-z0-9_-]{0,31}$/;

/** Argumento que tentaria trazer a senha pela linha de comando. */
const ARGUMENTO_DE_SENHA = /^--?(senha|password|pass|pwd)\b/i;

/**
 * Lê os argumentos. Erro de argumento nunca repete o que foi digitado: um
 * valor solto na linha de comando pode ser justamente a senha.
 */
export function lerArgumentos(
  argv: readonly string[],
): PedidoDaAdministracaoLocal {
  // `pnpm run x -- --email ...` repassa o `--` em algumas versões.
  const argumentos = argv.filter((argumento) => argumento !== "--");
  if (argumentos.some((argumento) => ARGUMENTO_DE_SENHA.test(argumento))) {
    throw new ErroDaAdministracaoLocal(
      "a senha não é aceita na linha de comando (fica no histórico do terminal); ela é pedida no terminal, sem eco",
      2,
    );
  }

  let lidos;
  try {
    lidos = parseArgs({
      args: argumentos,
      options: {
        email: { type: "string" },
        banco: { type: "string" },
        "node-env-do-preview": { type: "string" },
        verificar: { type: "boolean" },
        aplicar: { type: "boolean" },
      },
      strict: true,
      allowPositionals: false,
    }).values;
  } catch {
    throw new ErroDaAdministracaoLocal(
      "argumento não reconhecido. Uso: --email <e-mail> --banco <nome> --node-env-do-preview <valor> [--verificar | --aplicar]",
      2,
    );
  }

  if (lidos.verificar === true && lidos.aplicar === true) {
    throw new ErroDaAdministracaoLocal(
      "--verificar e --aplicar não andam juntos: escolha um (sem nenhum, é simulação)",
      2,
    );
  }
  const email = esquemaDoEmail.safeParse(lidos.email ?? "");
  if (!email.success) {
    throw new ErroDaAdministracaoLocal("--email ausente ou inválido", 2);
  }
  const banco = lidos.banco?.trim() ?? "";
  if (!NOME_DE_BANCO.test(banco)) {
    throw new ErroDaAdministracaoLocal(
      "--banco ausente ou inválido: informe o nome do banco local (ex.: simpleclick_dev)",
      2,
    );
  }
  const nodeEnvDoPreview = lidos["node-env-do-preview"]?.trim() ?? "";
  if (!VALOR_DE_NODE_ENV.test(nodeEnvDoPreview)) {
    throw new ErroDaAdministracaoLocal(
      "--node-env-do-preview ausente ou inválido: informe o NODE_ENV lido do serviço do preview",
      2,
    );
  }

  return {
    email: email.data,
    banco,
    nodeEnvDoPreview,
    modo:
      lidos.verificar === true
        ? "verificar"
        : lidos.aplicar === true
          ? "aplicar"
          : "simular",
  };
}

/**
 * Variável que parece carregar a senha da conta. As senhas dos PAPÉIS do
 * banco (`SENHA_BANCO_*`, `PGPASSWORD`) são outra coisa e seguem aceitas.
 */
export function variavelDeSenhaDaConta(nome: string): boolean {
  const maiusculo = nome.toUpperCase();
  if (maiusculo.startsWith("SENHA_BANCO_")) return false;
  if (!/SENHA|PASSWORD|PASSWD/.test(maiusculo)) return false;
  return (
    maiusculo === "SENHA" ||
    maiusculo === "PASSWORD" ||
    /ADMIN|CONTA/.test(maiusculo)
  );
}

/** Recusa senha da conta vinda do ambiente. Cita o NOME, nunca o valor. */
export function recusarSenhaNoAmbiente(ambiente: FonteDeAmbiente): void {
  for (const [nome, valor] of Object.entries(ambiente)) {
    if (valor !== undefined && valor !== "" && variavelDeSenhaDaConta(nome)) {
      throw new ErroDaAdministracaoLocal(
        `${nome} está definida: a senha da conta não é aceita por variável de ambiente; apague-a e digite a senha no terminal`,
        2,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Travas de destino
// ---------------------------------------------------------------------------

/** Variáveis que só existem quando o processo roda num provedor de hospedagem. */
export const MARCADORES_DE_HOSPEDAGEM = [
  "RAILWAY_ENVIRONMENT",
  "RAILWAY_ENVIRONMENT_NAME",
  "RAILWAY_PROJECT_ID",
  "RAILWAY_SERVICE_ID",
  "VERCEL",
  "VERCEL_ENV",
  "RENDER",
  "FLY_APP_NAME",
  "HEROKU_APP_NAME",
] as const;

/** Máquinas aceitas como "esta máquina" na cadeia do banco. */
const HOSTS_LOCAIS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

/**
 * Recusa tudo que não seja ESTA máquina fora de produção. A recusa nunca
 * repete a cadeia de conexão, que leva usuário e senha.
 */
export function exigirDestinoLocal(
  ambiente: FonteDeAmbiente,
  urlDoBanco: string,
): void {
  if (ambiente.NODE_ENV?.trim().toLowerCase() === "production") {
    throw new ErroDaAdministracaoLocal(
      "NODE_ENV=production: este script só roda no banco local de desenvolvimento",
      2,
    );
  }
  for (const marcador of MARCADORES_DE_HOSPEDAGEM) {
    if (ambiente[marcador]?.trim()) {
      throw new ErroDaAdministracaoLocal(
        `${marcador} está definida, sinal de que este processo roda num provedor de hospedagem`,
        2,
      );
    }
  }
  let destino: URL;
  try {
    destino = new URL(urlDoBanco);
  } catch {
    throw new ErroDaAdministracaoLocal(
      "a cadeia de conexão da administração não pôde ser lida",
      2,
    );
  }
  // `?host=` troca o destino por baixo do host da cadeia: não se aceita.
  if (
    !HOSTS_LOCAIS.has(destino.hostname.toLowerCase()) ||
    destino.searchParams.has("host") ||
    destino.searchParams.has("hostaddr")
  ) {
    throw new ErroDaAdministracaoLocal(
      "o banco de destino não é local: este script só roda contra localhost, 127.0.0.1 ou ::1",
      2,
    );
  }
}

/** Banco de teste ou do e2e: simular ou aplicar ali não é o que se quer. */
export function ehBancoDeTeste(nome: string): boolean {
  return (
    nome === "simpleclick_test" ||
    nome.startsWith("sc_e2e_") ||
    nome.startsWith("sc_teste_") ||
    nome.startsWith("sc_molde_")
  );
}

async function conferirBancoConectado(
  conexao: ConexaoLocal,
  pedido: PedidoDaAdministracaoLocal,
  aceitarBancoDeTeste: boolean,
): Promise<void> {
  const { rows } = await conexao.query(
    "SELECT current_database()::text AS banco",
  );
  const atual = String(rows[0]?.banco ?? "");
  if (atual !== pedido.banco) {
    throw new ErroDaAdministracaoLocal(
      `o banco conectado (${atual}) não é o informado em --banco (${pedido.banco}); nada foi lido nem alterado`,
    );
  }
  if (
    pedido.modo !== "verificar" &&
    ehBancoDeTeste(atual) &&
    !aceitarBancoDeTeste
  ) {
    throw new ErroDaAdministracaoLocal(
      `${atual} é banco de teste ou do e2e; simular ou aplicar só no banco local de desenvolvimento`,
    );
  }
}

// ---------------------------------------------------------------------------
// Leitura
// ---------------------------------------------------------------------------

export interface Contagens {
  readonly identidades: number;
  readonly lojas: number;
  readonly vinculos: number;
  readonly administracoesAtivas: number;
}

interface SituacaoDaConta {
  readonly id: string;
  readonly resumoDaSenha: string | null;
  readonly anonimizada: boolean;
  readonly verificada: boolean;
  readonly travada: boolean;
  readonly precisaDestravar: boolean;
  readonly aplicativo: boolean;
  readonly administracao: boolean;
}

async function contar(conexao: ConexaoLocal): Promise<Contagens> {
  const { rows } = await conexao.query(
    `SELECT (SELECT count(*) FROM app.identities)::int    AS identidades,
            (SELECT count(*) FROM app.stores)::int        AS lojas,
            (SELECT count(*) FROM app.store_members)::int AS vinculos,
            (SELECT count(*) FROM app.platform_admins
              WHERE revoked_at IS NULL)::int              AS administracoes`,
  );
  const linha = rows[0] ?? {};
  return {
    identidades: Number(linha.identidades),
    lojas: Number(linha.lojas),
    vinculos: Number(linha.vinculos),
    administracoesAtivas: Number(linha.administracoes),
  };
}

async function administracoesAtivas(
  conexao: ConexaoLocal,
): Promise<readonly string[]> {
  const { rows } = await conexao.query(
    `SELECT identity_id::text AS id FROM app.platform_admins
      WHERE revoked_at IS NULL ORDER BY granted_at, identity_id`,
  );
  return rows.map((linha) => String(linha.id));
}

async function lerConta(
  conexao: ConexaoLocal,
  email: string,
  travarLinha: boolean,
): Promise<SituacaoDaConta | undefined> {
  const { rows } = await conexao.query(
    `SELECT i.id::text AS id,
            i.password_hash AS resumo,
            i.anonymized_at IS NOT NULL AS anonimizada,
            i.email_verified_at IS NOT NULL AS verificada,
            (i.locked_until IS NOT NULL AND i.locked_until > now()) AS travada,
            (i.locked_until IS NOT NULL OR i.failed_login_count <> 0) AS precisa_destravar,
            EXISTS (SELECT 1 FROM app.totp_credentials t
                     WHERE t.identity_id = i.id
                       AND t.confirmed_at IS NOT NULL
                       AND t.disabled_at IS NULL) AS aplicativo,
            EXISTS (SELECT 1 FROM app.platform_admins a
                     WHERE a.identity_id = i.id
                       AND a.revoked_at IS NULL) AS administracao
       FROM app.identities i
      WHERE i.email_norm = $1
      ${travarLinha ? "FOR UPDATE OF i" : ""}`,
    [email],
  );
  const linha = rows[0];
  if (linha === undefined) return undefined;
  return {
    id: String(linha.id),
    resumoDaSenha: typeof linha.resumo === "string" ? linha.resumo : null,
    anonimizada: linha.anonimizada === true,
    verificada: linha.verificada === true,
    travada: linha.travada === true,
    precisaDestravar: linha.precisa_destravar === true,
    aplicativo: linha.aplicativo === true,
    administracao: linha.administracao === true,
  };
}

// ---------------------------------------------------------------------------
// Relatório
// ---------------------------------------------------------------------------

const simOuNao = (valor: boolean) => (valor ? "sim" : "não");

function linhaDeContagens(rotulo: string, contagens: Contagens): string {
  return `${rotulo}: identidades=${contagens.identidades} lojas=${contagens.lojas} vínculos=${contagens.vinculos} administrações ativas=${contagens.administracoesAtivas}`;
}

function linhaDaConta(conta: SituacaoDaConta | undefined): string {
  if (conta === undefined) return "conta informada: não existe";
  return [
    `conta informada: id=${conta.id}`,
    `e-mail verificado: ${simOuNao(conta.verificada)}`,
    `travada: ${simOuNao(conta.travada)}`,
    `aplicativo autenticador: ${simOuNao(conta.aplicativo)}`,
    `administração ativa: ${simOuNao(conta.administracao)}`,
    ...(conta.anonimizada ? ["anonimizada: sim"] : []),
  ].join(" · ");
}

/** Sem aplicativo confirmado, o login de ADMIN só passa em development. */
function exigeAplicativo(pedido: PedidoDaAdministracaoLocal): boolean {
  return pedido.nodeEnvDoPreview !== "development";
}

async function verificar(
  conexao: ConexaoLocal,
  pedido: PedidoDaAdministracaoLocal,
  escrever: (linha: string) => void,
): Promise<number> {
  const contagens = await contar(conexao);
  const ativas = await administracoesAtivas(conexao);
  const conta = await lerConta(conexao, pedido.email, false);

  escrever(linhaDeContagens("contagens", contagens));
  escrever(
    `administrações ativas: ${ativas.length === 0 ? "nenhuma" : ativas.join(", ")}`,
  );
  escrever(linhaDaConta(conta));
  const unica =
    conta !== undefined && ativas.length === 1 && ativas[0] === conta.id;
  escrever(
    unica
      ? "✔ a conta informada é a única administração ativa"
      : "• a conta informada NÃO é a única administração ativa",
  );
  if (exigeAplicativo(pedido) && conta?.aplicativo !== true) {
    escrever(
      `• aplicar seria recusado: a conta não tem aplicativo autenticador confirmado e o preview declarou NODE_ENV=${pedido.nodeEnvDoPreview}`,
    );
  }
  return 0;
}

// ---------------------------------------------------------------------------
// A transação
// ---------------------------------------------------------------------------

interface SenhaPreparada {
  readonly senha: string;
  readonly resumo: string;
}

export interface ResultadoDaTransacao {
  readonly identidadeId: string;
  readonly contaCriada: boolean;
  readonly senhaTrocada: boolean;
  readonly grantConcedido: boolean;
  readonly grantsRevogados: readonly string[];
  readonly sessoesDaConta: number;
  readonly sessoesAdminDeOutras: number;
  readonly antes: Contagens;
  readonly depois: Contagens;
  readonly conta: SituacaoDaConta | undefined;
}

/** Cria a conta (sem aceite legal) ou acerta senha, verificação e trava. */
async function acertarConta(
  conexao: ConexaoLocal,
  pedido: PedidoDaAdministracaoLocal,
  conta: SituacaoDaConta | undefined,
  senha: SenhaPreparada,
): Promise<{ id: string; criada: boolean; senhaTrocada: boolean }> {
  if (conta === undefined) {
    const { rows } = await conexao.query(
      `INSERT INTO app.identities (email_norm, password_hash, email_verified_at, display_name)
       VALUES ($1, $2, now(), 'Administração') RETURNING id::text AS id`,
      [pedido.email, senha.resumo],
    );
    return { id: String(rows[0]?.id), criada: true, senhaTrocada: true };
  }

  const mesmaSenha =
    conta.resumoDaSenha !== null &&
    (await senhaConfere(senha.senha, conta.resumoDaSenha));
  if (!mesmaSenha || !conta.verificada || conta.precisaDestravar) {
    await conexao.query(
      `UPDATE app.identities
          SET password_hash = CASE WHEN $2::boolean THEN $3 ELSE password_hash END,
              email_verified_at = coalesce(email_verified_at, now()),
              failed_login_count = 0,
              locked_until = NULL
        WHERE id = $1::uuid`,
      [conta.id, !mesmaSenha, senha.resumo],
    );
  }
  return { id: conta.id, criada: false, senhaTrocada: !mesmaSenha };
}

/** Grant ativo da conta; os demais revogados (nunca apagados). */
async function acertarGrants(
  conexao: ConexaoLocal,
  identidadeId: string,
): Promise<{ concedido: boolean; revogados: readonly string[] }> {
  const concedido = await conexao.query(
    `INSERT INTO app.platform_admins (identity_id, granted_by)
     VALUES ($1::uuid, NULL)
     ON CONFLICT (identity_id) DO UPDATE
        SET revoked_at = NULL, granted_at = now(), granted_by = NULL
      WHERE app.platform_admins.revoked_at IS NOT NULL
     RETURNING identity_id::text AS id`,
    [identidadeId],
  );
  const revogados = await conexao.query(
    `UPDATE app.platform_admins SET revoked_at = now()
      WHERE revoked_at IS NULL AND identity_id <> $1::uuid
     RETURNING identity_id::text AS id`,
    [identidadeId],
  );
  return {
    concedido: concedido.rows.length > 0,
    revogados: revogados.rows.map((linha) => String(linha.id)).sort(),
  };
}

/** Encerra as sessões que não podem continuar valendo. */
async function encerrarSessoes(
  conexao: ConexaoLocal,
  identidadeId: string,
  senhaTrocada: boolean,
): Promise<{ daConta: number; adminDeOutras: number }> {
  const daConta = senhaTrocada
    ? await conexao.query(
        `UPDATE app.sessions
            SET revoked_at = now(), revoked_reason = 'PASSWORD_CHANGED'
          WHERE identity_id = $1::uuid
            AND revoked_at IS NULL AND expires_at > now()
         RETURNING id`,
        [identidadeId],
      )
    : { rows: [] };
  // Depois desta transação só a conta é administração: qualquer outra sessão
  // emitida como ADMIN e ainda viva é acesso que não deveria existir.
  const deOutras = await conexao.query(
    `UPDATE app.sessions
        SET revoked_at = now(), revoked_reason = 'ADMIN_REVOKED'
      WHERE identity_id <> $1::uuid AND role_at_issue = 'ADMIN'
        AND revoked_at IS NULL AND expires_at > now()
     RETURNING id`,
    [identidadeId],
  );
  return { daConta: daConta.rows.length, adminDeOutras: deOutras.rows.length };
}

/** A conferência final: nada sumiu, e a conta é a única administração. */
async function conferirResultado(
  conexao: ConexaoLocal,
  antes: Contagens,
  identidadeId: string,
  contaCriada: boolean,
): Promise<Contagens> {
  const depois = await contar(conexao);
  const ativas = await administracoesAtivas(conexao);
  const esperadas = antes.identidades + (contaCriada ? 1 : 0);
  if (
    depois.identidades !== esperadas ||
    depois.lojas !== antes.lojas ||
    depois.vinculos !== antes.vinculos ||
    ativas.length !== 1 ||
    ativas[0] !== identidadeId
  ) {
    throw new ErroDaAdministracaoLocal(
      "a conferência final reprovou (contagens mudaram ou a conta não ficou como única administração); nada foi gravado",
    );
  }
  return depois;
}

async function transacao(
  conexao: ConexaoLocal,
  pedido: PedidoDaAdministracaoLocal,
  senha: SenhaPreparada,
): Promise<ResultadoDaTransacao> {
  await conexao.query("BEGIN");
  try {
    await conexao.query("SET LOCAL lock_timeout = '10s'");
    await conexao.query(
      "LOCK TABLE app.platform_admins IN SHARE ROW EXCLUSIVE MODE",
    );
    const antes = await contar(conexao);
    const contaAntes = await lerConta(conexao, pedido.email, true);
    if (contaAntes?.anonimizada === true) {
      throw new ErroDaAdministracaoLocal(
        "a conta informada foi anonimizada (exclusão LGPD) e não volta a valer; nada foi alterado",
      );
    }
    if (exigeAplicativo(pedido) && contaAntes?.aplicativo !== true) {
      throw new ErroDaAdministracaoLocal(
        `a conta ${contaAntes === undefined ? "ainda não existe e nasceria" : "está"} sem aplicativo autenticador confirmado, e o preview declarou NODE_ENV=${pedido.nodeEnvDoPreview}: o login de administração exigiria o segundo fator. Nada foi alterado e nenhuma administração foi revogada`,
      );
    }

    const conta = await acertarConta(conexao, pedido, contaAntes, senha);
    const grants = await acertarGrants(conexao, conta.id);
    const sessoes = await encerrarSessoes(
      conexao,
      conta.id,
      conta.senhaTrocada,
    );
    const depois = await conferirResultado(
      conexao,
      antes,
      conta.id,
      conta.criada,
    );
    const contaDepois = await lerConta(conexao, pedido.email, false);

    await conexao.query(pedido.modo === "aplicar" ? "COMMIT" : "ROLLBACK");
    return {
      identidadeId: conta.id,
      contaCriada: conta.criada,
      senhaTrocada: conta.senhaTrocada,
      grantConcedido: grants.concedido,
      grantsRevogados: grants.revogados,
      sessoesDaConta: sessoes.daConta,
      sessoesAdminDeOutras: sessoes.adminDeOutras,
      antes,
      depois,
      conta: contaDepois,
    };
  } catch (causa) {
    await conexao.query("ROLLBACK");
    throw causa;
  }
}

function relatarTransacao(
  resultado: ResultadoDaTransacao,
  pedido: PedidoDaAdministracaoLocal,
  escrever: (linha: string) => void,
): void {
  escrever(
    `conta: ${resultado.contaCriada ? "criada" : "existente"} (id=${resultado.identidadeId}) · senha: ${resultado.senhaTrocada ? "trocada" : "igual à atual, mantida"}`,
  );
  escrever(
    `administração da conta: ${resultado.grantConcedido ? "concedida agora" : "já estava ativa"}`,
  );
  escrever(
    `administrações revogadas: ${resultado.grantsRevogados.length}${resultado.grantsRevogados.length > 0 ? ` (${resultado.grantsRevogados.join(", ")})` : ""}`,
  );
  escrever(
    `sessões da conta encerradas (PASSWORD_CHANGED): ${resultado.sessoesDaConta} · sessões ADMIN de outras contas encerradas (ADMIN_REVOKED): ${resultado.sessoesAdminDeOutras}`,
  );
  escrever(linhaDeContagens("contagens antes", resultado.antes));
  escrever(linhaDeContagens("contagens depois", resultado.depois));
  escrever(linhaDaConta(resultado.conta));
  if (pedido.modo === "aplicar") {
    escrever("✔ aplicado: a conta é a única administração ativa deste banco");
    if (resultado.grantsRevogados.length > 0) {
      escrever(
        `  para desfazer: UPDATE app.platform_admins SET revoked_at = NULL WHERE identity_id IN (${resultado.grantsRevogados.map((id) => `'${id}'`).join(", ")});`,
      );
    }
  } else {
    escrever(
      "✔ simulação concluída: tudo foi desfeito (ROLLBACK). Para gravar, rode de novo com --aplicar",
    );
  }
}

// ---------------------------------------------------------------------------
// Execução
// ---------------------------------------------------------------------------

/** Troca cada segredo conhecido por um marcador, em qualquer linha. */
function ocultar(linha: string, segredos: readonly string[]): string {
  let limpa = linha;
  for (const segredo of segredos) limpa = limpa.split(segredo).join("[oculto]");
  return limpa;
}

/** Curto demais para valer a troca: ocultar "a" mutilaria a saída inteira. */
const MINIMO_PARA_OCULTAR = 4;

async function pedirSenha(
  opcoes: OpcoesDaAdministracaoLocal,
  guardarSegredo: (segredo: string) => void,
): Promise<SenhaPreparada> {
  if (!opcoes.terminalInterativo) {
    throw new ErroDaAdministracaoLocal(
      "a entrada não é um terminal: a senha só é lida digitada no terminal, sem eco (nada de pipe ou arquivo)",
      2,
    );
  }
  const senha = await opcoes.lerSenha(
    "Senha nova da conta (não aparece ao digitar): ",
  );
  guardarSegredo(senha);
  const repetida = await opcoes.lerSenha("Repita a senha: ");
  guardarSegredo(repetida);
  if (repetida !== senha) {
    throw new ErroDaAdministracaoLocal(
      "as duas senhas digitadas não conferem; nada foi alterado",
    );
  }
  const politica = avaliarPoliticaDeSenha(senha);
  if (!politica.valida) {
    throw new ErroDaAdministracaoLocal(
      `a senha não cumpre a política de senha da plataforma: ${politica.problemas
        .map((problema) => problema.mensagem)
        .join(" ")} Nada foi alterado`,
    );
  }
  const resumo = await derivarSenha(senha);
  guardarSegredo(resumo);
  return { senha, resumo };
}

/** Roda o script inteiro e devolve o código de saída. */
export async function executarAdministracaoLocal(
  opcoes: OpcoesDaAdministracaoLocal,
): Promise<number> {
  const segredos: string[] = [];
  const guardarSegredo = (segredo: string) => {
    if (segredo.length >= MINIMO_PARA_OCULTAR) segredos.push(segredo);
  };
  const escrever = (linha: string) => opcoes.escrever(ocultar(linha, segredos));

  try {
    // Tudo o que pode ser recusado sem banco é recusado antes de tocá-lo.
    const pedido = lerArgumentos(opcoes.argv);
    recusarSenhaNoAmbiente(opcoes.ambiente);
    const url = conexaoDaAdministracao(opcoes.ambiente);
    exigirDestinoLocal(opcoes.ambiente, url);
    guardarSegredo(new URL(url).password);

    escrever(`banco: ${pedido.banco}`);
    escrever(`NODE_ENV declarado do preview: ${pedido.nodeEnvDoPreview}`);
    escrever(
      `modo: ${{ verificar: "verificar (só leitura)", simular: "simulação (desfeita no fim)", aplicar: "aplicar" }[pedido.modo]}`,
    );

    const senha =
      pedido.modo === "verificar"
        ? undefined
        : await pedirSenha(opcoes, guardarSegredo);

    const conexao = await opcoes.conectar(url);
    try {
      await conferirBancoConectado(
        conexao,
        pedido,
        opcoes.aceitarBancoDeTeste === true,
      );
      if (senha === undefined)
        return await verificar(conexao, pedido, escrever);
      const resultado = await transacao(conexao, pedido, senha);
      guardarSegredo(resultado.conta?.resumoDaSenha ?? "");
      relatarTransacao(resultado, pedido, escrever);
      return 0;
    } finally {
      await conexao.end();
    }
  } catch (erro) {
    if (erro instanceof ErroDaAdministracaoLocal) {
      escrever(`✘ ${erro.message}`);
      return erro.codigoDeSaida;
    }
    if (erro instanceof ErroDeConexaoDoBanco) {
      escrever(`✘ ${erro.message}`);
      return 2;
    }
    escrever(
      `✘ falha inesperada, nada foi gravado: ${erro instanceof Error ? erro.message : String(erro)}`,
    );
    return 1;
  }
}

// ---------------------------------------------------------------------------
// Terminal (main fino)
// ---------------------------------------------------------------------------

const ENTER = new Set(["\r", "\n"]);
const CTRL_C = "\u0003";
const CTRL_D = "\u0004";
const APAGAR = new Set(["\u007f", "\b"]);

/** Lê uma linha do terminal em modo cru, sem ecoar nada do que é digitado. */
function lerSenhaSemEco(rotulo: string): Promise<string> {
  const entrada = process.stdin;
  process.stdout.write(rotulo);
  entrada.setRawMode(true);
  entrada.setEncoding("utf8");
  entrada.resume();

  return new Promise((resolver, recusar) => {
    let digitada = "";
    const terminar = () => {
      entrada.off("data", aoLer);
      entrada.setRawMode(false);
      entrada.pause();
      process.stdout.write("\n");
    };
    function aoLer(pedaco: string) {
      for (const caractere of pedaco) {
        if (ENTER.has(caractere)) {
          terminar();
          resolver(digitada);
          return;
        }
        if (caractere === CTRL_C || caractere === CTRL_D) {
          terminar();
          recusar(new ErroDaAdministracaoLocal("cancelado; nada foi alterado"));
          return;
        }
        digitada = APAGAR.has(caractere)
          ? digitada.slice(0, -1)
          : digitada + caractere;
      }
    }
    entrada.on("data", aoLer);
  });
}

/** Abre um `pg.Client` direto (sem agrupador) e devolve já conectado. */
async function conectarDireto(url: string): Promise<ConexaoLocal> {
  const cliente = new pg.Client({ connectionString: url });
  await cliente.connect();
  return cliente;
}

const chamadoDiretamente =
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (chamadoDiretamente) {
  process.exitCode = await executarAdministracaoLocal({
    argv: process.argv.slice(2),
    ambiente: process.env,
    escrever: (linha) => process.stdout.write(`${linha}\n`),
    lerSenha: lerSenhaSemEco,
    terminalInterativo: process.stdin.isTTY === true,
    conectar: conectarDireto,
  });
}
