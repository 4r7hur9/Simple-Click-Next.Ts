/**
 * A administração permanente na partida da API (card #3).
 *
 * Duas peças pequenas, ambas chamadas por `main.ts`:
 *
 * 1. `extrairPedidoDaAdministracao` lê `ADMIN_*` UMA vez, no topo de
 *    `iniciarApi`, e tira `ADMIN_SENHA` e `ADMIN_TOTP_SEGREDO` de `process.env`
 *    (quando a fonte é ele): o resto do processo não precisa mais deles. O
 *    objeto de fonte que um teste injeta nunca é alterado. Observação honesta:
 *    isso não apaga o bloco original que o sistema operacional guarda do
 *    ambiente do processo; quem lê as variáveis do serviço continua vendo o
 *    segredo, e é por isso que a documentação manda apagá-las depois do 1º login.
 * 2. `executarAdministracaoPermanente` cria a conta (caso de uso em
 *    `modules/auth/administracao-permanente.ts`) com prazo curto. Qualquer
 *    falha vira UMA linha de registro com a situação e, no máximo, o SQLSTATE:
 *    nunca a mensagem do banco (o `detail` dela pode trazer o e-mail), nem
 *    e-mail, senha, segredo ou URL. A API sobe do mesmo jeito.
 */

import pg from "pg";

import { criarCifradorDeSegredos, CONTEXTO_DO_TOTP } from "./core/cifra.ts";
import { conexaoDaAdministracao } from "./core/db.ts";
import {
  type FonteDeAmbiente,
  lerPedidoDaAdministracaoPermanente,
  type PedidoDaAdministracaoPermanente,
} from "./core/env.ts";
import type { Registrador } from "./core/log.ts";
import {
  garantirAdministracaoPermanente,
  type SituacaoDaAdministracaoPermanente,
} from "./modules/auth/administracao-permanente.ts";
import type { ConexaoDaAdministracao } from "./modules/auth/primeira-administracao.ts";

export const EVENTO_DA_ADMINISTRACAO_PERMANENTE =
  "administracao_permanente.situacao";

/** Prazo total do passo: bem abaixo do healthcheck da Railway (120 s). */
export const PRAZO_DA_ADMINISTRACAO_PERMANENTE_EM_MS = 15_000;

/** Uma conexão que o passo abre e fecha. O `pg.Client` serve. */
export interface ConexaoAberta extends ConexaoDaAdministracao {
  end(): Promise<void>;
}

export type ConectarNaAdministracao = (url: string) => Promise<ConexaoAberta>;

const conectarComPg: ConectarNaAdministracao = async (url) => {
  const cliente = new pg.Client({
    connectionString: url,
    connectionTimeoutMillis: 5_000,
    application_name: "simpleclick-administracao-permanente",
  });
  await cliente.connect();
  return cliente;
};

/** Lê o pedido e tira a senha e o segredo de `process.env`. */
export function extrairPedidoDaAdministracao(
  fonte: FonteDeAmbiente,
): PedidoDaAdministracaoPermanente {
  const pedido = lerPedidoDaAdministracaoPermanente(fonte);
  if (fonte === process.env) {
    delete process.env["ADMIN_SENHA"];
    delete process.env["ADMIN_TOTP_SEGREDO"];
  }
  return pedido;
}

export type ResultadoDaPartidaDaAdministracao =
  | "ausente"
  | "incompleta"
  | "invalida"
  | "falhou"
  | "prazo"
  | SituacaoDaAdministracaoPermanente;

export interface OpcoesDaAdministracaoPermanente {
  readonly pedido: PedidoDaAdministracaoPermanente;
  /** Para `conexaoDaAdministracao` e a chave de cifra; nunca é alterada. */
  readonly fonte: FonteDeAmbiente;
  readonly registro: Registrador;
  readonly conectar?: ConectarNaAdministracao;
  readonly prazoMs?: number;
}

/** O SQLSTATE de um erro do pg, quando houver (cinco caracteres). */
function sqlstateDe(erro: unknown): string | undefined {
  const codigo = (erro as { code?: unknown } | null)?.code;
  return typeof codigo === "string" && /^[0-9A-Z]{5}$/.test(codigo)
    ? codigo
    : undefined;
}

class PrazoEsgotado extends Error {}

export async function executarAdministracaoPermanente(
  opcoes: OpcoesDaAdministracaoPermanente,
): Promise<ResultadoDaPartidaDaAdministracao> {
  const { pedido, fonte, registro } = opcoes;
  const situacaoDe = (
    situacao: ResultadoDaPartidaDaAdministracao,
    extra: Record<string, unknown> = {},
    nivel: "info" | "aviso" | "depuracao" = "aviso",
  ) => {
    registro[nivel](EVENTO_DA_ADMINISTRACAO_PERMANENTE, {
      situacao_da_administracao: situacao,
      ...extra,
    });
    return situacao;
  };

  if (pedido.situacao === "ausente") return "ausente";
  if (pedido.situacao !== "pronta") {
    return situacaoDe(pedido.situacao, { campos: pedido.campos });
  }

  let conexao: ConexaoAberta | undefined;
  let temporizador: NodeJS.Timeout | undefined;
  try {
    const trabalho = (async () => {
      conexao = await (opcoes.conectar ?? conectarComPg)(
        conexaoDaAdministracao(fonte),
      );
      return garantirAdministracaoPermanente({
        conexao,
        email: pedido.email,
        senha: pedido.senha,
        segredo: pedido.segredo,
        nome: pedido.nome,
        cifrador: criarCifradorDeSegredos(
          fonte["CHAVE_CIFRA_TOTP"]?.trim() ?? "",
          CONTEXTO_DO_TOTP,
        ),
      });
    })();
    const prazo = new Promise<never>((_, recusar) => {
      temporizador = setTimeout(
        () => recusar(new PrazoEsgotado()),
        opcoes.prazoMs ?? PRAZO_DA_ADMINISTRACAO_PERMANENTE_EM_MS,
      );
    });
    // O trabalho que perder a corrida não pode virar rejeição sem dono.
    trabalho.catch(() => undefined);
    const situacao = await Promise.race([trabalho, prazo]);
    return situacaoDe(
      situacao,
      {},
      situacao === "criada"
        ? "info"
        : situacao === "ja_existia"
          ? "depuracao"
          : "aviso",
    );
  } catch (erro) {
    if (erro instanceof PrazoEsgotado) return situacaoDe("prazo");
    const sqlstate = sqlstateDe(erro);
    return situacaoDe("falhou", sqlstate === undefined ? {} : { sqlstate });
  } finally {
    if (temporizador !== undefined) clearTimeout(temporizador);
    // Sem esperar: uma conexão pendurada não pode segurar a partida.
    void conexao?.end().catch(() => undefined);
  }
}
