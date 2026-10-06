/**
 * Entrada do agente de impressão (T-609): `node src/main.ts` (ou `pnpm
 * start`) na máquina da loja, com o Node 24.
 *
 * Lê a configuração gravada pelo pareamento, abre o diário e roda o laço até
 * receber Ctrl+C (SIGINT) ou SIGTERM. O registro sai no terminal, uma linha
 * JSON por evento, sem dado do cliente: só identificador de trabalho, código
 * do pedido e motivo de falha.
 */
import { executarAgente, type RegistroDoAgente } from "./agente.ts";
import { criarCliente } from "./cliente.ts";
import {
  caminhoDoDiario,
  carregarConfiguracao,
  pastaDoAgente,
} from "./configuracao.ts";
import { abrirDiario } from "./diario.ts";
import { enviarParaImpressora } from "./impressora-tcp.ts";

const registrar: RegistroDoAgente = (evento, dados = {}) => {
  process.stdout.write(
    `${JSON.stringify({ quando: new Date().toISOString(), evento, ...dados })}\n`,
  );
};

async function principal(): Promise<void> {
  const pasta = pastaDoAgente();
  const configuracao = await carregarConfiguracao(pasta);
  const diario = await abrirDiario(caminhoDoDiario(pasta));
  const cliente = criarCliente({
    api: configuracao.api,
    credencial: configuracao.credencial,
    ...(configuracao.origem === undefined
      ? {}
      : { origem: configuracao.origem }),
  });

  const parar = new AbortController();
  process.once("SIGINT", () => parar.abort());
  process.once("SIGTERM", () => parar.abort());

  registrar("agente.iniciado", {
    loja: configuracao.loja.apelido,
    impressora: `${configuracao.impressora.host}:${String(configuracao.impressora.porta)}`,
  });
  await executarAgente(
    {
      cliente,
      diario,
      perfil: configuracao.perfil,
      imprimir: (bytes) => enviarParaImpressora(configuracao.impressora, bytes),
      registrar,
    },
    {
      sinal: parar.signal,
      ...(configuracao.intervaloMs === undefined
        ? {}
        : { intervaloMs: configuracao.intervaloMs }),
    },
  );
  registrar("agente.encerrado");
}

try {
  await principal();
} catch (causa) {
  process.stderr.write(
    `o agente parou: ${causa instanceof Error ? causa.message : String(causa)}\n`,
  );
  process.exitCode = 1;
}
