/**
 * Emulador de impressora térmica de rede (T-610 — AC-620, AC-621).
 *
 * Escuta TCP como uma impressora na porta 9100: cada conexão é um cupom, e
 * os bytes recebidos são lidos pelo MESMO decodificador do teste do gerador
 * (`lerEscPos`, em `packages/core`). Assim se confere acento, alinhamento,
 * corte e a marca de reimpressão sem papel nem hardware.
 *
 * Dois usos, o mesmo código:
 *
 * - dentro do Vitest, `iniciarEmulador()` sobe numa porta livre do processo
 *   do teste e entrega o que foi "impresso" (`aguardarImpressao`);
 * - no terminal, `node src/emulador.ts` (ou `pnpm emulador`) escuta na 9100 e
 *   mostra a prévia de cada cupom que chegar. Com `--demonstrar`, ele mesmo
 *   envia um cupom com acento e reimpressão e confere a leitura — é o que
 *   `infra/scripts/testar-impressao.sh` roda.
 */
import { createServer, type Server, type Socket } from "node:net";
import { parseArgs } from "node:util";

import {
  compilarEscPos,
  diagramarCupom,
  gerarCupom,
  lerEscPos,
  previaDoPapel,
  type LinhaDoCupom,
  type TabelaDeCaracteres,
} from "@simpleclick/core";

import { enviarParaImpressora } from "./impressora-tcp.ts";

/** Um cupom que chegou ao emulador. */
export interface CupomRecebido {
  /** Os bytes exatamente como chegaram. */
  readonly bytes: Uint8Array;
  /** A leitura do papel, ou o motivo da recusa (byte estranho, sem tabela). */
  readonly papel:
    | {
        readonly lido: true;
        readonly tabela: TabelaDeCaracteres;
        readonly linhas: LinhaDoCupom[];
        readonly previa: string;
      }
    | { readonly lido: false; readonly erro: string };
}

export interface OpcoesDoEmulador {
  /** Porta TCP. Padrão 0: o sistema escolhe uma livre (o caso do teste). */
  readonly porta?: number;
  /** Padrão 127.0.0.1: o emulador não se oferece para a rede. */
  readonly host?: string;
  /**
   * Simula a impressora fora do ar: a conexão é derrubada sem ler nada, como
   * uma impressora desligada ou sem papel que recusa o trabalho.
   */
  readonly recusar?: () => boolean;
  /** Chamado a cada cupom recebido (o modo de terminal imprime a prévia). */
  readonly aoReceber?: (cupom: CupomRecebido) => void;
}

export interface Emulador {
  readonly porta: number;
  readonly host: string;
  /** Tudo o que chegou, na ordem. */
  readonly recebidos: readonly CupomRecebido[];
  /** Espera até `quantos` cupons terem chegado (padrão: um a mais que agora). */
  aguardarImpressao(quantos?: number, prazoMs?: number): Promise<void>;
  fechar(): Promise<void>;
}

/** Lê os bytes de uma conexão como um cupom impresso. */
export function lerCupomRecebido(bytes: Uint8Array): CupomRecebido {
  try {
    const { tabela, linhas } = lerEscPos(bytes);
    return {
      bytes,
      papel: { lido: true, tabela, linhas, previa: previaDoPapel(linhas) },
    };
  } catch (causa) {
    return {
      bytes,
      papel: {
        lido: false,
        erro: causa instanceof Error ? causa.message : String(causa),
      },
    };
  }
}

/** Sobe o emulador e devolve quando ele já está escutando. */
export async function iniciarEmulador(
  opcoes: OpcoesDoEmulador = {},
): Promise<Emulador> {
  const recebidos: CupomRecebido[] = [];
  const conexoes = new Set<Socket>();
  const esperas: Array<() => void> = [];

  const servidor: Server = createServer((conexao) => {
    conexoes.add(conexao);
    conexao.on("close", () => conexoes.delete(conexao));
    conexao.on("error", () => conexao.destroy());
    if (opcoes.recusar?.() === true) {
      conexao.resetAndDestroy();
      return;
    }
    const partes: Buffer[] = [];
    conexao.on("data", (parte: Buffer) => partes.push(parte));
    conexao.on("end", () => {
      // Conexão sem byte nenhum é sonda (a verificação de saúde do compose),
      // e não cupom: não entra na lista nem aparece na prévia.
      if (partes.length === 0) {
        conexao.end();
        return;
      }
      const cupom = lerCupomRecebido(new Uint8Array(Buffer.concat(partes)));
      recebidos.push(cupom);
      opcoes.aoReceber?.(cupom);
      for (const acordar of esperas.splice(0)) acordar();
      conexao.end();
    });
  });

  const host = opcoes.host ?? "127.0.0.1";
  await new Promise<void>((pronto, falhou) => {
    servidor.once("error", falhou);
    servidor.listen(opcoes.porta ?? 0, host, () => {
      servidor.off("error", falhou);
      pronto();
    });
  });
  const endereco = servidor.address();
  if (endereco === null || typeof endereco === "string") {
    throw new Error("o emulador não conseguiu escutar numa porta TCP");
  }

  return {
    porta: endereco.port,
    host,
    recebidos,
    async aguardarImpressao(quantos = recebidos.length + 1, prazoMs = 5_000) {
      const limite = Date.now() + prazoMs;
      while (recebidos.length < quantos) {
        const resta = limite - Date.now();
        if (resta <= 0) {
          throw new Error(
            `o emulador esperava ${String(quantos)} cupom(ns) e recebeu ${String(recebidos.length)}`,
          );
        }
        await new Promise<void>((acordar) => {
          const relogio = setTimeout(acordar, resta);
          esperas.push(() => {
            clearTimeout(relogio);
            acordar();
          });
        });
      }
    },
    async fechar() {
      for (const conexao of conexoes) conexao.destroy();
      await new Promise<void>((pronto) => servidor.close(() => pronto()));
    },
  };
}

/** Escreve no terminal sem `console` (que a regra do projeto reserva). */
function escrever(texto: string): void {
  process.stdout.write(`${texto}\n`);
}

function mostrar(cupom: CupomRecebido): void {
  if (cupom.papel.lido) {
    escrever(
      `\n=== cupom recebido (${String(cupom.bytes.length)} bytes, tabela ${cupom.papel.tabela}) ===`,
    );
    escrever(cupom.papel.previa);
  } else {
    escrever(`\n=== cupom RECUSADO: ${cupom.papel.erro} ===`);
  }
}

/**
 * Envia um cupom de exemplo (acento, cedilha e 2ª via) para `destino` e, se o
 * destino for o próprio emulador, confere que o papel lido é o compilado.
 */
async function demonstrar(destino?: { host: string; porta: number }) {
  const cupom = gerarCupom(
    {
      loja: "Açaíteria São João",
      codigo: "A-0001",
      feitoEm: new Date().toISOString(),
      fusoHorario: "America/Sao_Paulo",
      canal: "ONLINE",
      cliente: { nome: "Conceição Araújo", telefone: "5511912345678" },
      itens: [
        {
          nome: "Açaí com granola",
          quantidade: 1,
          totalDaLinhaEmCentavos: 2350,
          opcoes: [{ grupo: "Calda", opcao: "Guaraná" }],
          observacao: "Caprichar na paçoca",
        },
        { nome: "Guaraná", quantidade: 2, totalDaLinhaEmCentavos: 1200 },
      ],
      entrega: { tipo: "PICKUP" },
      taxaDeEntrega: { modo: "FREE", valorEmCentavos: 0 },
      pagamento: { forma: "PIX" },
      subtotalEmCentavos: 3550,
      totalEmCentavos: 3550,
    },
    { larguraMm: 58, via: 2 },
  );
  const linhas = diagramarCupom(cupom, { tabela: "cp860" });
  const bytes = compilarEscPos(linhas, { tabela: "cp860" });

  if (destino !== undefined) {
    await enviarParaImpressora(destino, bytes);
    escrever(
      `cupom de exemplo enviado a ${destino.host}:${String(destino.porta)}`,
    );
    return true;
  }

  const emulador = await iniciarEmulador({ aoReceber: mostrar });
  try {
    await enviarParaImpressora(
      { host: emulador.host, porta: emulador.porta },
      bytes,
    );
    await emulador.aguardarImpressao(1);
    const papel = emulador.recebidos[0]?.papel;
    const igual =
      papel?.lido === true &&
      JSON.stringify(papel.linhas) === JSON.stringify(linhas);
    escrever(
      igual
        ? "\nOK: o papel lido é exatamente o cupom compilado (acento e 2ª via)."
        : "\nFALHOU: o papel lido difere do cupom compilado.",
    );
    return igual;
  } finally {
    await emulador.fechar();
  }
}

async function principal(): Promise<void> {
  const { values } = parseArgs({
    options: {
      porta: {
        type: "string",
        default: process.env.PORTA_IMPRESSORA ?? "9100",
      },
      host: {
        type: "string",
        default: process.env.HOST_IMPRESSORA ?? "127.0.0.1",
      },
      demonstrar: { type: "boolean", default: false },
      impressora: { type: "string" },
    },
  });

  if (values.demonstrar || values.impressora !== undefined) {
    let destino: { host: string; porta: number } | undefined;
    if (values.impressora !== undefined) {
      const [host = "", porta = "9100"] = values.impressora.split(":");
      destino = { host, porta: Number(porta) };
    }
    process.exitCode = (await demonstrar(destino)) ? 0 : 1;
    return;
  }

  const emulador = await iniciarEmulador({
    porta: Number(values.porta),
    host: values.host,
    aoReceber: mostrar,
  });
  escrever(
    `emulador de impressora escutando em ${emulador.host}:${String(emulador.porta)} (Ctrl+C encerra)`,
  );
  const encerrar = () => void emulador.fechar().then(() => process.exit(0));
  process.once("SIGINT", encerrar);
  process.once("SIGTERM", encerrar);
}

if (import.meta.main) await principal();
