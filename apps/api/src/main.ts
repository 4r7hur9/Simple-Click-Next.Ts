/**
 * A partida e o desligamento da API (T-019, T-023).
 *
 * Partir é: validar o ambiente inteiro antes de abrir qualquer coisa (AC-002),
 * subir as filas de segundo plano quando elas estão ligadas (AC-046) e só
 * então escutar a porta, que tem um nome só — `PORT` (AC-048).
 *
 * Desligar é o inverso, na ordem que a dependência pede (AC-047): parar de
 * aceitar conexão e esperar a resposta em curso — uma requisição pode
 * enfileirar e-mail e tocar o banco —, depois fechar as filas, depois banco e
 * cache. Com prazo: processo que não consegue fechar sai sozinho com código
 * diferente de zero dizendo o que ficou aberto, em vez de esperar o provedor
 * derrubá-lo sem registro nenhum.
 *
 * O arquivo se executa sozinho só quando é a entrada do processo
 * (`node src/main.ts`, `node dist/main.js`). Importado, ele não sobe nada — é
 * assim que a prova exercita a partida e o desligamento sem disputar porta com
 * o ambiente e sem depender de sinal de sistema operacional.
 */

import {
  createServer,
  type RequestListener,
  type Server,
  type ServerResponse,
} from "node:http";
import type { AddressInfo } from "node:net";
import { fileURLToPath } from "node:url";

import { criarApp } from "./app.ts";
import { encerrarCache } from "./core/cache.ts";
import { encerrarBanco, encerrarBancoDaAdministracao } from "./core/db.ts";
import {
  carregarAmbiente,
  ErroDeAmbiente,
  segundoPlanoLigado,
  variaveisAposentadasPresentes,
  type FonteDeAmbiente,
} from "./core/env.ts";
import {
  criarRegistrador,
  definirRegistrador,
  descreverErro,
  type Registrador,
} from "./core/log.ts";
import {
  enviadorNaoConfigurado,
  montarSegundoPlano,
  type EnviadorDeEmail,
  type FalhaDeTentativa,
  type SegundoPlano,
} from "./jobs/index.ts";

/**
 * Quanto o desligamento pode levar antes de desistir e sair com erro.
 *
 * Abaixo dos 10 s que o `docker stop` dá entre o sinal de término e a morte
 * forçada: assim, mesmo no pior caso, a última linha do registro é nossa e
 * diz o que não fechou. O provedor precisa dar pelo menos isso entre os dois
 * sinais (ver `infra/railway/README.md`).
 */
export const PRAZO_DE_DESLIGAMENTO_MS = 8_000;

/** Sinais que pedem desligamento ordenado: o do provedor e o do Ctrl+C. */
export const SINAIS_DE_TERMINO = ["SIGTERM", "SIGINT"] as const;

/** Sinal de término que a API sabe tratar. */
export type SinalDeTermino = (typeof SINAIS_DE_TERMINO)[number];

/** Eventos que a partida e o desligamento escrevem no registro. */
export const EVENTOS_DA_PARTIDA = {
  iniciou: "api.iniciou",
  partidaRecusada: "api.partida_recusada",
  partidaFalhou: "api.partida_falhou",
  variavelAposentada: "ambiente.variavel_aposentada",
  segundoPlanoIniciou: "segundo_plano.iniciou",
  segundoPlanoDesligado: "segundo_plano.desligado",
  tentativaFalhou: "segundo_plano.tentativa_falhou",
  desligando: "api.desligando",
  desligou: "api.desligou",
  recursoNaoFechou: "api.recurso_nao_fechou",
  prazoEstourou: "api.desligamento_estourou",
} as const;

/** Algo que a API abriu e precisa fechar ao desligar. */
export interface RecursoDaApi {
  readonly nome: string;
  encerrar(): Promise<void>;
}

/**
 * Banco e cache da aplicação. Os três abrem preguiçosamente, na primeira
 * requisição que precisa deles; fechar o que nunca abriu não faz nada.
 */
export const RECURSOS_DA_API: readonly RecursoDaApi[] = [
  { nome: "banco", encerrar: encerrarBanco },
  { nome: "banco_da_administracao", encerrar: encerrarBancoDaAdministracao },
  { nome: "cache", encerrar: encerrarCache },
];

/** Ajustes da partida. Tudo tem padrão; a prova troca o que precisa. */
export interface OpcoesDaPartida {
  /** De onde vêm as variáveis. Padrão: `process.env`. */
  readonly fonte?: FonteDeAmbiente;
  /** Quem atende as requisições. Padrão: a composição de `app.ts`. */
  readonly aplicacao?: RequestListener;
  /**
   * Porta de saída do e-mail. Padrão: o adaptador que falha alto, até o dono
   * escolher o provedor (dívida 35) — o trabalho esgota as tentativas e fica
   * falho e inspecionável, em vez de a API fingir que enviou.
   */
  readonly enviadorDeEmail?: EnviadorDeEmail;
  /** Espaço de nomes das filas no Redis. A prova usa um por execução. */
  readonly prefixoDasFilas?: string;
  /** O que fechar depois das filas. Padrão: banco e cache da aplicação. */
  readonly recursos?: readonly RecursoDaApi[];
  readonly prazoDeDesligamentoMs?: number;
  /** Padrão: o registrador da aplicação, já no nível do ambiente. */
  readonly registrador?: Registrador;
}

/** Como o desligamento terminou. */
export type ResultadoDoDesligamento =
  | { readonly limpo: true; readonly duracaoMs: number }
  | {
      readonly limpo: false;
      readonly duracaoMs: number;
      /** O que ficou aberto ou falhou ao fechar, pelo nome. */
      readonly naoFechou: readonly string[];
    };

/** A API escutando, com o único caminho de desligamento. */
export interface ApiEmPe {
  readonly porta: number;
  readonly servidor: Server;
  /** As filas deste processo, ou `undefined` quando o segundo plano está desligado. */
  readonly segundoPlano: SegundoPlano | undefined;
  /** Desliga na ordem certa. Chamar de novo devolve o mesmo desligamento. */
  desligar(motivo: string): Promise<ResultadoDoDesligamento>;
}

/** Escuta a porta, ou rejeita com o erro de escuta (porta ocupada, por exemplo). */
function escutar(servidor: Server, porta: number): Promise<void> {
  return new Promise((resolver, rejeitar) => {
    const aoFalhar = (erro: Error): void => {
      servidor.off("listening", aoEscutar);
      rejeitar(erro);
    };
    const aoEscutar = (): void => {
      servidor.off("error", aoFalhar);
      resolver();
    };
    servidor.once("error", aoFalhar);
    servidor.once("listening", aoEscutar);
    servidor.listen(porta);
  });
}

/**
 * Tentativa de segundo plano que falhou, no registro. Identificador e
 * contagem, nunca o conteúdo do trabalho (P-009): o endereço de quem recebe o
 * e-mail não sai daqui.
 */
function registrarTentativa(
  registro: Registrador,
  falha: FalhaDeTentativa,
): void {
  const dados = {
    recurso: falha.fila,
    recursoId: falha.trabalhoId,
    nome: falha.trabalhoNome,
    tentativa: falha.tentativasFeitas,
    quantidade: falha.tentativasPermitidas,
    estado: falha.esgotou ? "esgotado" : "vai_repetir",
    // O adaptador de envio é obrigado a não pôr dado pessoal na mensagem do
    // erro que lança (ver `EnviadorDeEmail`); é ela que diz o que falta
    // configurar quando o provedor ainda não existe.
    mensagem: falha.motivo,
  };
  if (falha.esgotou) registro.erro(EVENTOS_DA_PARTIDA.tentativaFalhou, dados);
  else registro.aviso(EVENTOS_DA_PARTIDA.tentativaFalhou, dados);
}

/**
 * Sobe a API: valida o ambiente, sobe o segundo plano quando ligado e escuta.
 *
 * Lança `ErroDeAmbiente` ANTES de abrir qualquer conexão quando o ambiente está
 * incompleto (AC-002) — nada fica pendurado segurando o processo de pé.
 */
export async function iniciarApi(
  opcoes: OpcoesDaPartida = {},
): Promise<ApiEmPe> {
  const fonte = opcoes.fonte ?? process.env;
  const ambiente = carregarAmbiente(fonte);

  const registro =
    opcoes.registrador ??
    criarRegistrador({
      nivel: ambiente.LOG_LEVEL,
      ambiente: ambiente.NODE_ENV,
    });
  definirRegistrador(registro);

  const aposentadas = variaveisAposentadasPresentes(fonte);
  if (aposentadas.length > 0) {
    // Chegar aqui quer dizer que o nome antigo aponta para a mesma porta —
    // diferente, `carregarAmbiente` já recusou (AC-048).
    registro.aviso(EVENTOS_DA_PARTIDA.variavelAposentada, {
      campos: aposentadas,
      detalhe: "a porta se chama PORT",
    });
  }

  const segundoPlano = segundoPlanoLigado(ambiente)
    ? montarSegundoPlano({
        urlDoRedis: ambiente.REDIS_URL,
        enviadorDeEmail: opcoes.enviadorDeEmail ?? enviadorNaoConfigurado(),
        prefixo: opcoes.prefixoDasFilas,
        aoFalhar: (falha) => registrarTentativa(registro, falha),
      })
    : undefined;

  if (segundoPlano === undefined) {
    registro.info(EVENTOS_DA_PARTIDA.segundoPlanoDesligado, {
      estado: "desligado",
    });
  } else {
    registro.info(EVENTOS_DA_PARTIDA.segundoPlanoIniciou, {
      itens: [segundoPlano.email.nome],
      quantidade: segundoPlano.trabalhadores.length,
    });
  }

  const aplicacao =
    opcoes.aplicacao ?? criarApp({ origens: ambiente.ORIGENS_PERMITIDAS });

  // As respostas ainda abertas. Ao desligar, as que não mandaram cabeçalho
  // ganham `Connection: close`: sem isso a conexão persistente do cliente
  // seguraria o servidor aberto até o tempo de ociosidade dela vencer.
  const emCurso = new Set<ServerResponse>();
  let desligando = false;

  const servidor = createServer((requisicao, resposta) => {
    if (desligando) resposta.setHeader("Connection", "close");
    emCurso.add(resposta);
    resposta.once("close", () => emCurso.delete(resposta));
    resposta.once("finish", () => {
      // A conexão que já tinha mandado o cabeçalho fica ociosa ao terminar;
      // fechá-la aqui é o que deixa o servidor terminar de fechar.
      if (desligando) setImmediate(() => servidor.closeIdleConnections());
    });
    aplicacao(requisicao, resposta);
  });

  try {
    await escutar(servidor, ambiente.PORT);
  } catch (erro) {
    await segundoPlano?.fechar().catch(() => undefined);
    throw erro;
  }

  const porta = (servidor.address() as AddressInfo).port;
  // A porta entra como campo, não como texto interpolado (AC-021).
  registro.info(EVENTOS_DA_PARTIDA.iniciou, { porta });

  /** Para de aceitar conexão e espera a última resposta em curso sair. */
  function pararDeAtender(): Promise<void> {
    return new Promise((resolver, rejeitar) => {
      servidor.close((erro) => (erro ? rejeitar(erro) : resolver()));
      for (const resposta of emCurso) {
        if (!resposta.headersSent) resposta.setHeader("Connection", "close");
      }
      servidor.closeIdleConnections();
    });
  }

  const prazo = opcoes.prazoDeDesligamentoMs ?? PRAZO_DE_DESLIGAMENTO_MS;
  const recursos = opcoes.recursos ?? RECURSOS_DA_API;

  async function executarDesligamento(
    motivo: string,
  ): Promise<ResultadoDoDesligamento> {
    const inicio = Date.now();
    desligando = true;
    registro.info(EVENTOS_DA_PARTIDA.desligando, { detalhe: motivo });

    const pendentes = new Set<string>([
      "http",
      ...(segundoPlano === undefined ? [] : ["segundo_plano"]),
      ...recursos.map((recurso) => recurso.nome),
    ]);
    const falharam: string[] = [];

    const fechar = async (
      nome: string,
      acao: () => Promise<void>,
    ): Promise<void> => {
      try {
        await acao();
      } catch (erro) {
        falharam.push(nome);
        registro.erro(EVENTOS_DA_PARTIDA.recursoNaoFechou, {
          recurso: nome,
          erro: descreverErro(erro),
        });
      } finally {
        pendentes.delete(nome);
      }
    };

    const sequencia = (async () => {
      await fechar("http", pararDeAtender);
      if (segundoPlano !== undefined) {
        await fechar("segundo_plano", () => segundoPlano.fechar());
      }
      await Promise.all(
        recursos.map((recurso) => fechar(recurso.nome, recurso.encerrar)),
      );
    })();

    let relogio: NodeJS.Timeout | undefined;
    const estouro = new Promise<"estourou">((resolver) => {
      relogio = setTimeout(() => resolver("estourou"), prazo);
    });
    const desfecho = await Promise.race([
      sequencia.then(() => "terminou" as const),
      estouro,
    ]);
    clearTimeout(relogio);
    const duracaoMs = Date.now() - inicio;

    if (desfecho === "estourou") {
      // Quem ainda está conectado perde a conexão agora: o processo vai sair.
      servidor.closeAllConnections();
      const naoFechou = [...falharam, ...pendentes];
      registro.erro(EVENTOS_DA_PARTIDA.prazoEstourou, {
        duracaoMs,
        esperaMs: prazo,
        itens: naoFechou,
      });
      return { limpo: false, duracaoMs, naoFechou };
    }

    if (falharam.length > 0) {
      registro.erro(EVENTOS_DA_PARTIDA.desligou, {
        duracaoMs,
        estado: "com_falha",
        itens: falharam,
      });
      return { limpo: false, duracaoMs, naoFechou: falharam };
    }

    registro.info(EVENTOS_DA_PARTIDA.desligou, { duracaoMs, estado: "limpo" });
    return { limpo: true, duracaoMs };
  }

  let desligamento: Promise<ResultadoDoDesligamento> | undefined;

  return {
    porta,
    servidor,
    segundoPlano,
    desligar: (motivo) => (desligamento ??= executarDesligamento(motivo)),
  };
}

/** O pedaço de `process` que a partida usa para ouvir sinal. */
export interface EmissorDeSinais {
  once(sinal: SinalDeTermino, ouvinte: () => void): unknown;
}

/**
 * Liga os sinais de término ao desligamento ordenado, e o desfecho ao código
 * de saída: zero quando tudo fechou, um quando algo ficou aberto (AC-047).
 *
 * `once` de propósito: um segundo Ctrl+C, depois que o primeiro já pediu o
 * desligamento, volta ao comportamento padrão do Node e encerra na hora — a
 * saída de emergência de quem não quer esperar o prazo.
 */
export function instalarDesligamento(
  api: Pick<ApiEmPe, "desligar">,
  emissor: EmissorDeSinais = process,
  sair: (codigo: number) => void = (codigo) => process.exit(codigo),
): void {
  for (const sinal of SINAIS_DE_TERMINO) {
    emissor.once(sinal, () => {
      void api.desligar(sinal).then(
        (resultado) => sair(resultado.limpo ? 0 : 1),
        () => sair(1),
      );
    });
  }
}

/**
 * Partida que não aconteceu. A recusa por ambiente vai inteira para a saída de
 * erro, em texto — quem a lê é uma pessoa configurando o serviço — e também
 * para o registro, só com os nomes das variáveis.
 */
function recusarPartida(erro: unknown): void {
  // Nível fixo: se a variável reprovada for LOG_LEVEL, o registrador do
  // ambiente nem conseguiria nascer.
  const registro = criarRegistrador({ nivel: "info" });

  if (erro instanceof ErroDeAmbiente) {
    process.stderr.write(`${erro.message}\n`);
    registro.fatal(EVENTOS_DA_PARTIDA.partidaRecusada, {
      campos: erro.variaveis,
    });
  } else {
    const descricao = descreverErro(erro);
    const codigo =
      typeof descricao.codigo === "string" ? ` (${descricao.codigo})` : "";
    process.stderr.write(
      `A API não iniciou: ${String(descricao.nome)}${codigo}. O detalhe está no registro.\n`,
    );
    registro.fatal(EVENTOS_DA_PARTIDA.partidaFalhou, { erro: descricao });
  }

  // Sem `process.exit`: nada ficou aberto, e sair pelo fim natural deixa a
  // saída de erro terminar de escrever antes de o processo acabar.
  process.exitCode = 1;
}

/**
 * Verdadeiro quando este arquivo é a entrada do processo. `import.meta.main`
 * existe a partir do Node 24.2; antes dele, a comparação com o script pedido
 * na linha de comando responde o mesmo.
 */
function ehEntradaDoProcesso(): boolean {
  const meta: { readonly main?: boolean } = import.meta;
  return meta.main ?? process.argv[1] === fileURLToPath(import.meta.url);
}

if (ehEntradaDoProcesso()) {
  void iniciarApi().then((api) => instalarDesligamento(api), recusarPartida);
}
