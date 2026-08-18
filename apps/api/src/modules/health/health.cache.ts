/**
 * Bate na porta do cache e espera resposta (parte de AC-023).
 *
 * Fala o protocolo do Redis direto pelo soquete, sem cliente de biblioteca. São
 * duas decisões, e as duas têm motivo:
 *
 * - **Sem dependência nova (P-014).** O que a verificação de saúde precisa é
 *   mandar `PING` e reconhecer `+PONG` — um punhado de bytes num protocolo de
 *   texto. Uma biblioteca de cliente traria reconexão, agrupamento, assinatura
 *   de canais e mais um pacote para manter, sem resolver nada que estas linhas
 *   não resolvam. Quando `core/cache.ts` nascer (T-015) e já tiver um cliente
 *   de verdade em pé, esta função dá lugar a ele.
 * - **Conexão nova a cada verificação.** Reaproveitar uma conexão já aberta faz
 *   a verificação responder "cache no ar" enquanto o soquete está morto e o
 *   sistema operacional ainda não avisou. A pergunta que a verificação de
 *   pronto faz é "eu consigo falar com o cache AGORA", e a única resposta
 *   honesta vem de uma conexão nova.
 *
 * O comando vai no formato de vetor do protocolo (`*2\r\n$4\r\nAUTH\r\n...`),
 * e não em texto solto: assim uma senha que contenha quebra de linha não pode
 * virar um comando a mais. Segredo continua vindo só do ambiente (P-002).
 */

import { connect as conectarTcp, type Socket } from "node:net";
import { connect as conectarTls } from "node:tls";

/** Resposta que o Redis dá ao `PING`. */
const RESPOSTA_DE_PING = "+PONG";

/** Portas padrão de cada esquema aceito. */
const PORTA_PADRAO = { "redis:": 6379, "rediss:": 6380 } as const;

/** Codifica um comando no formato de vetor do protocolo do Redis. */
function comando(...partes: readonly string[]): string {
  const corpo = partes
    .map((parte) => `$${Buffer.byteLength(parte)}\r\n${parte}\r\n`)
    .join("");
  return `*${partes.length}\r\n${corpo}`;
}

/**
 * Os comandos que a verificação envia, em ordem.
 *
 * `AUTH` só entra quando a cadeia traz credencial — o Redis recusa `AUTH` em
 * servidor sem senha, e a recusa apareceria como "cache fora do ar".
 */
function comandosDeVerificacao(destino: URL): string {
  const senha = decodeURIComponent(destino.password);
  const usuario = decodeURIComponent(destino.username);

  if (senha === "") return comando("PING");
  return usuario === ""
    ? comando("AUTH", senha) + comando("PING")
    : comando("AUTH", usuario, senha) + comando("PING");
}

/** Abre o soquete adequado ao esquema: `rediss:` é a versão com TLS. */
function abrirSoquete(destino: URL): Socket {
  const porta =
    destino.port === ""
      ? PORTA_PADRAO[destino.protocol as keyof typeof PORTA_PADRAO]
      : Number(destino.port);
  const maquina = destino.hostname;

  return destino.protocol === "rediss:"
    ? conectarTls({ host: maquina, port: porta, servername: maquina })
    : conectarTcp({ host: maquina, port: porta });
}

/**
 * Verdadeiro quando o cache respondeu `+PONG` dentro da espera.
 *
 * Nunca lança: a verificação de saúde precisa de um veredito, não de uma
 * exceção. O erro que explicaria a falha é registrado por quem chamou, com o
 * detalhamento que só o servidor vê (AC-024).
 */
export function cacheResponde(
  urlDoCache: string,
  esperaMaximaMs: number,
): Promise<boolean> {
  return new Promise((resolver) => {
    let destino: URL;
    try {
      destino = new URL(urlDoCache);
    } catch {
      resolver(false);
      return;
    }

    let soquete: Socket;
    try {
      soquete = abrirSoquete(destino);
    } catch {
      resolver(false);
      return;
    }

    let recebido = "";
    let respondido = false;

    const encerrar = (resultado: boolean): void => {
      if (respondido) return;
      respondido = true;
      soquete.destroy();
      resolver(resultado);
    };

    soquete.setTimeout(esperaMaximaMs, () => encerrar(false));
    soquete.on("error", () => encerrar(false));
    soquete.on("close", () => encerrar(false));

    soquete.on("connect", () => {
      soquete.write(comandosDeVerificacao(destino));
    });

    soquete.on("data", (pedaco: Buffer) => {
      recebido += pedaco.toString("utf8");
      // `+PONG` só aparece depois de o `AUTH` ter dado certo: o Redis responde
      // `-NOAUTH` e não executa o comando seguinte quando a senha falha.
      if (recebido.includes(RESPOSTA_DE_PING)) encerrar(true);
      // Recusa explícita do servidor não precisa esperar a espera acabar.
      else if (recebido.startsWith("-")) encerrar(false);
    });
  });
}
