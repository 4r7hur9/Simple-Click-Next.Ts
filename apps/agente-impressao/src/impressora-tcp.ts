/**
 * A impressora de rede: os bytes ESC/POS escritos por TCP na porta 9100
 * (T-609; decisão de 03/10 — a versão 1 fala só com impressora de rede).
 *
 * Uma conexão por cupom. "Impresso" aqui quer dizer que a impressora aceitou
 * todos os bytes e a conexão fechou sem erro: o protocolo cru da 9100 não tem
 * confirmação de papel, e é por isso que o agente guarda o diário ANTES de
 * confirmar ao servidor (AC-625).
 */
import { connect } from "node:net";

/** Onde a impressora está na rede da loja. */
export interface EnderecoDaImpressora {
  readonly host: string;
  /** Padrão das impressoras térmicas de rede: 9100. */
  readonly porta: number;
}

/** A impressora não aceitou o cupom (fora do ar, recusou, demorou demais). */
export class ErroDaImpressora extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = "ErroDaImpressora";
  }
}

/**
 * Escreve o cupom e espera a conexão fechar. Rejeita com `ErroDaImpressora`
 * se a impressora recusar a conexão, derrubá-la no meio ou passar do prazo.
 */
export function enviarParaImpressora(
  endereco: EnderecoDaImpressora,
  bytes: Uint8Array,
  prazoMs = 10_000,
): Promise<void> {
  return new Promise((pronto, falhou) => {
    let resolvido = false;
    const terminar = (erro?: Error) => {
      if (resolvido) return;
      resolvido = true;
      clearTimeout(relogio);
      if (erro === undefined) pronto();
      else falhou(erro);
    };

    const conexao = connect({ host: endereco.host, port: endereco.porta });
    const relogio = setTimeout(() => {
      conexao.destroy();
      terminar(
        new ErroDaImpressora(
          `a impressora em ${endereco.host}:${String(endereco.porta)} não respondeu em ${String(prazoMs)} ms`,
        ),
      );
    }, prazoMs);

    conexao.on("error", (causa) =>
      terminar(
        new ErroDaImpressora(
          `impressora em ${endereco.host}:${String(endereco.porta)} indisponível: ${causa.message}`,
        ),
      ),
    );
    conexao.on("connect", () => {
      conexao.end(bytes);
    });
    // A impressora (ou o emulador) fecha depois de ler tudo. Leitura que
    // chega é descartada: o protocolo cru não tem resposta que interesse.
    conexao.on("data", () => undefined);
    conexao.on("close", (comErro) => {
      if (comErro) {
        terminar(
          new ErroDaImpressora(
            `a impressora em ${endereco.host}:${String(endereco.porta)} derrubou a conexão`,
          ),
        );
      } else {
        terminar();
      }
    });
  });
}
