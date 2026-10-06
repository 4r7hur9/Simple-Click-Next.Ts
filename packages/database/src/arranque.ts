/**
 * Arranque do banco de produção (T-024, AC-049).
 *
 * Leva um banco recém-criado e vazio ao estado do código, UMA vez, com a
 * credencial de dono que o provedor entrega. Depois disso a publicação segue
 * só pelo `infra/railway/pre-deploy.sh`, com a credencial de migração.
 *
 * Por que existe um caminho separado: a migração 0001 é quem CRIA os papéis
 * `sc_migrator`, `sc_app` e `sc_admin`. Num banco vazio a credencial de
 * migração ainda não existe, então a primeira aplicação só pode ser feita por
 * quem pode criar papel. O arranque faz essa primeira aplicação e termina
 * conferindo, já com cada papel novo, que a troca de credencial funcionou:
 *
 *   1. recusa ambiente com conexão ou cache de teste (o acidente mais caro);
 *   2. aplica as migrações com a credencial de arranque;
 *   3. entra como `sc_migrator` e confere que o banco está em dia e isolado;
 *   4. entra como `sc_app` e `sc_admin` para provar que as senhas valem.
 *
 * Rodar de novo não altera nada (o aplicador só aplica o que falta). Nenhuma
 * senha aparece na saída nem em mensagem de erro (P-002).
 */

import {
  aplicarMigracoes,
  type ClienteSql,
  derivarUrlDePapel,
  exigirIsolamentoEmTodaTabelaDeLoja,
  exigirMigracoesEmDia,
} from "./migrate.ts";

/** Fonte das variáveis: o ambiente do processo, ou um dublê na prova. */
export type AmbienteDoArranque = Readonly<Record<string, string | undefined>>;

/** Variável com a credencial de dono do banco, usada só no arranque. */
export const VARIAVEL_DA_CREDENCIAL_DE_ARRANQUE = "DATABASE_URL_ARRANQUE";

/** As variáveis de teste que nunca podem existir num ambiente de produção. */
const VARIAVEIS_DE_TESTE = ["DATABASE_URL_TEST", "REDIS_URL_TEST"] as const;

/** Cada papel criado pela 0001 e a variável que guarda a senha dele. */
export const PAPEIS_DO_BANCO = [
  { papel: "sc_migrator", variavel: "SENHA_BANCO_MIGRADOR" },
  { papel: "sc_app", variavel: "SENHA_BANCO_APLICACAO" },
  { papel: "sc_admin", variavel: "SENHA_BANCO_ADMINISTRACAO" },
] as const;

/** Um cliente aberto, que quem pediu encerra. */
export interface ClienteAberto extends ClienteSql {
  end(): Promise<void>;
}

/** Abre uma conexão. Na prova e na linha de comando é o `pg.Client`. */
export type Conectar = (url: string) => Promise<ClienteAberto>;

/** O arranque recusou antes de tocar o banco, ou a conferência reprovou. */
export class ErroDeArranque extends Error {
  /** 2 = ambiente incompleto; 1 = recusa ou conferência reprovada. */
  readonly codigoDeSaida: 1 | 2;

  constructor(mensagem: string, codigoDeSaida: 1 | 2 = 1) {
    super(mensagem);
    this.name = "ErroDeArranque";
    this.codigoDeSaida = codigoDeSaida;
  }
}

/** O que aconteceu, para a saída de quem rodou. */
export interface RelatorioDoArranque {
  readonly aplicadas: readonly string[];
  readonly jaAplicadas: number;
  /** Papéis que entraram com a senha do ambiente depois da aplicação. */
  readonly papeisConferidos: readonly string[];
}

export interface OpcoesDoArranque {
  readonly ambiente: AmbienteDoArranque;
  readonly conectar: Conectar;
  readonly relatar?: (linha: string) => void;
}

/** Valor de uma variável, sem espaços, ou `undefined` quando vazia. */
function valorDe(ambiente: AmbienteDoArranque, nome: string) {
  const valor = ambiente[nome]?.trim();
  return valor === undefined || valor === "" ? undefined : valor;
}

/**
 * Confere o ambiente ANTES de abrir qualquer conexão e devolve a credencial
 * de arranque. Falta de variável sai com código 2; variável de teste presente
 * é recusa (código 1), porque o ambiente está errado, não incompleto.
 */
export function conferirAmbienteDoArranque(
  ambiente: AmbienteDoArranque,
): string {
  for (const nome of VARIAVEIS_DE_TESTE) {
    if (valorDe(ambiente, nome) !== undefined) {
      throw new ErroDeArranque(
        `${nome} está no ambiente. Produção e teste nunca dividem banco nem cache (AC-031): remova a variável e rode de novo.`,
      );
    }
  }

  const faltando = [
    VARIAVEL_DA_CREDENCIAL_DE_ARRANQUE,
    ...PAPEIS_DO_BANCO.map((item) => item.variavel),
  ].filter((nome) => valorDe(ambiente, nome) === undefined);
  if (faltando.length > 0) {
    throw new ErroDeArranque(
      `Faltam variáveis de ambiente: ${faltando.join(", ")}. Veja a seção de publicação do README.`,
      2,
    );
  }

  const url = valorDe(ambiente, VARIAVEL_DA_CREDENCIAL_DE_ARRANQUE) as string;
  try {
    new URL(url);
  } catch {
    // A mensagem não repete o valor: ele contém a senha de dono do banco.
    throw new ErroDeArranque(
      `${VARIAVEL_DA_CREDENCIAL_DE_ARRANQUE} não é um endereço postgresql:// válido.`,
      2,
    );
  }
  return url;
}

/** Executa com uma conexão e a encerra, mesmo quando a ação falha. */
async function comConexao<T>(
  conectar: Conectar,
  url: string,
  acao: (cliente: ClienteAberto) => Promise<T>,
): Promise<T> {
  const cliente = await conectar(url);
  try {
    return await acao(cliente);
  } finally {
    await cliente.end();
  }
}

/**
 * Leva o banco ao estado do código e confere a troca de credencial.
 *
 * Lança `ErroDeArranque` com mensagem que nunca traz senha; os erros do
 * aplicador de migrações (que também não trazem) passam como vieram.
 */
export async function arrancarBanco(
  opcoes: OpcoesDoArranque,
): Promise<RelatorioDoArranque> {
  const { ambiente, conectar, relatar = () => {} } = opcoes;
  const url = conferirAmbienteDoArranque(ambiente);

  relatar("aplicando as migrações com a credencial de arranque");
  const relatorio = await comConexao(conectar, url, (cliente) =>
    aplicarMigracoes({ cliente, segredos: ambiente, relatar }),
  );

  const papeisConferidos: string[] = [];
  for (const { papel, variavel } of PAPEIS_DO_BANCO) {
    const urlDoPapel = derivarUrlDePapel(
      url,
      papel,
      valorDe(ambiente, variavel) as string,
    );
    try {
      await comConexao(conectar, urlDoPapel, async (cliente) => {
        const quem = await cliente.query("SELECT current_user AS papel");
        if (quem.rows[0]?.papel !== papel) {
          throw new Error(`entrou como ${String(quem.rows[0]?.papel)}`);
        }
        // Só a credencial de migração confere o esquema: é ela que a
        // publicação usa daqui em diante, e é com ela que precisa funcionar.
        if (papel === "sc_migrator") {
          await exigirMigracoesEmDia(cliente);
          await exigirIsolamentoEmTodaTabelaDeLoja(cliente);
        }
      });
    } catch (causa) {
      const motivo = causa instanceof Error ? causa.message : String(causa);
      throw new ErroDeArranque(
        `O papel ${papel} não passou na conferência depois do arranque (${motivo}). Confira ${variavel}.`,
      );
    }
    papeisConferidos.push(papel);
    relatar(`papel ${papel} entra com a senha do ambiente`);
  }

  return {
    aplicadas: relatorio.aplicadas,
    jaAplicadas: relatorio.jaAplicadas,
    papeisConferidos,
  };
}
