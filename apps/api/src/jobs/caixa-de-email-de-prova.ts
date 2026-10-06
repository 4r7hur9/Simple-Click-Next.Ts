/**
 * Caixa de e-mail de prova (T-114): o adaptador que o ponta a ponta usa para
 * LER o que a API mandaria por e-mail — link de verificação, código do login,
 * link de recuperação — sem provedor de e-mail nenhum.
 *
 * Cada mensagem vira um arquivo JSON na pasta de `CAIXA_DE_EMAIL_DE_PROVA`.
 * Só vale fora de produção: `saidaDeEmailDoAmbiente` nem olha a variável
 * quando `NODE_ENV=production`, então ela não abre caminho para link ou
 * código irem parar no disco do servidor de verdade. Nada disso passa pelo
 * registro (P-009): a pasta é do teste, não do log.
 */
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { EnviadorDeEmail } from "./email.job.ts";

/** Nome da variável que liga a caixa de prova (fora de produção). */
export const VARIAVEL_DA_CAIXA_DE_PROVA = "CAIXA_DE_EMAIL_DE_PROVA";

/** Uma mensagem como fica gravada na caixa de prova. */
export interface MensagemNaCaixaDeProva {
  readonly destinatario: string;
  readonly assunto: string;
  readonly corpo: string;
  /** Instante da gravação, em milissegundos (para o teste achar a mais nova). */
  readonly enviadaEm: number;
}

/**
 * Enviador que grava cada mensagem num arquivo próprio da pasta informada.
 * Arquivo por mensagem, com nome único: duas requisições ao mesmo tempo
 * nunca disputam o mesmo arquivo.
 */
export function enviadorParaCaixaDeProva(pasta: string): EnviadorDeEmail {
  return {
    enviar: async (mensagem) => {
      await mkdir(pasta, { recursive: true });
      const gravada: MensagemNaCaixaDeProva = {
        destinatario: mensagem.destinatario,
        assunto: mensagem.assunto,
        corpo: mensagem.corpo,
        enviadaEm: Date.now(),
      };
      await writeFile(
        join(pasta, `${gravada.enviadaEm}-${randomUUID()}.json`),
        JSON.stringify(gravada),
        "utf8",
      );
    },
  };
}
