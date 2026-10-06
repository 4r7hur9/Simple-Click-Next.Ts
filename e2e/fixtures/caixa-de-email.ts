/**
 * A caixa de e-mail do ponta a ponta (T-114).
 *
 * A API do ponta a ponta sobe com `CAIXA_DE_EMAIL_DE_PROVA` apontando para
 * esta pasta (ver `playwright.config.ts`), e cada e-mail que ela mandaria
 * vira um arquivo JSON aqui (`apps/api/src/jobs/caixa-de-email-de-prova.ts`).
 * Os cenários leem daqui o link de verificação, o código do login e o link de
 * recuperação — do jeito que a pessoa leria na caixa de entrada dela.
 *
 * Cada cenário usa um endereço só dele, então mensagens de execuções
 * anteriores, que ficam na pasta, nunca se confundem com as de agora.
 */
import { readdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

/** A pasta que a API grava e os cenários leem. */
export const PASTA_DA_CAIXA_DE_EMAIL =
  process.env["CAIXA_DE_EMAIL_DE_PROVA"] ??
  join(tmpdir(), "simpleclick-e2e-caixa-de-email");

/** Uma mensagem como a API gravou. */
export interface EmailRecebido {
  readonly destinatario: string;
  readonly assunto: string;
  readonly corpo: string;
  readonly enviadaEm: number;
}

/** Os assuntos que os cenários procuram (iguais aos de `emails-de-acesso.ts`). */
export const ASSUNTOS = {
  verificacao: "Confirme seu e-mail no SimpleClick",
  codigoDoLogin: "Seu código de acesso ao SimpleClick",
  recuperacao: "Redefina sua senha do SimpleClick",
  reusoDeSessao: "Encerramos uma sessão suspeita na sua conta",
  contaBloqueada: "Bloqueamos tentativas de entrar na sua conta",
} as const;

/** Um endereço que não se repete entre cenários, projetos e execuções. */
export function enderecoUnico(prefixo: string, projeto: string): string {
  return `${prefixo}-${projeto}-${randomUUID().slice(0, 8)}@e2e-acesso.test`;
}

/** Todas as mensagens gravadas para um endereço, da mais antiga à mais nova. */
export async function mensagensPara(para: string): Promise<EmailRecebido[]> {
  let arquivos: string[];
  try {
    arquivos = await readdir(PASTA_DA_CAIXA_DE_EMAIL);
  } catch {
    return [];
  }
  const lidas: EmailRecebido[] = [];
  for (const arquivo of arquivos) {
    if (!arquivo.endsWith(".json")) continue;
    try {
      const mensagem = JSON.parse(
        await readFile(join(PASTA_DA_CAIXA_DE_EMAIL, arquivo), "utf8"),
      ) as EmailRecebido;
      if (mensagem.destinatario.toLowerCase() === para.toLowerCase()) {
        lidas.push(mensagem);
      }
    } catch {
      // Arquivo ainda sendo escrito: a próxima leitura o pega inteiro.
    }
  }
  return lidas.sort((a, b) => a.enviadaEm - b.enviadaEm);
}

/**
 * Espera chegar uma mensagem com o assunto informado, enviada depois de
 * `depoisDe` (milissegundos). Devolve a mais nova; falha com o que chegou.
 */
export async function esperarEmail(
  para: string,
  assunto: string,
  depoisDe = 0,
  prazoMs = 20_000,
): Promise<EmailRecebido> {
  const limite = Date.now() + prazoMs;
  for (;;) {
    const achadas = (await mensagensPara(para)).filter(
      (mensagem) =>
        mensagem.assunto === assunto && mensagem.enviadaEm >= depoisDe,
    );
    const ultima = achadas.at(-1);
    if (ultima !== undefined) return ultima;
    if (Date.now() > limite) {
      const chegaram = (await mensagensPara(para)).map((m) => m.assunto);
      throw new Error(
        `nenhum e-mail "${assunto}" chegou para ${para}; chegaram: ${JSON.stringify(chegaram)}`,
      );
    }
    await new Promise((resolver) => setTimeout(resolver, 200));
  }
}

/** O primeiro link do corpo do e-mail. */
export function linkDoEmail(mensagem: EmailRecebido): string {
  const link = /https?:\/\/\S+/.exec(mensagem.corpo)?.[0];
  if (link === undefined) throw new Error("o e-mail não trouxe link");
  return link;
}

/** O código de seis dígitos do e-mail do login. */
export function codigoDoEmail(mensagem: EmailRecebido): string {
  const codigo = /\b(\d{6})\b/.exec(mensagem.corpo)?.[1];
  if (codigo === undefined) throw new Error("o e-mail não trouxe código");
  return codigo;
}
