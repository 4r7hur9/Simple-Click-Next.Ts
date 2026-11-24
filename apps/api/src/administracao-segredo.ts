/**
 * Gera, NO SEU COMPUTADOR, o segredo do aplicativo autenticador da
 * administração permanente (card #3):
 *
 *   pnpm --filter @simpleclick/api administracao:segredo
 *
 * Mostra a chave (e o link `otpauth://`) para cadastrar no aplicativo do
 * celular, pede o código de 6 dígitos que o aplicativo mostra e só então diz
 * que o valor serve para `ADMIN_TOTP_SEGREDO` — assim um erro de cópia aparece
 * aqui, e não depois, com a administração trancada.
 *
 * Não abre banco, não lê `CHAVE_CIFRA_TOTP` nem nenhuma outra variável de
 * segredo, e só roda num terminal de verdade. A chave aparece só nesta saída:
 * quem automatiza (inclusive um agente) NÃO deve rodá-lo com valores reais.
 * Fica fora do build (`tsconfig.build.json`): não existe na imagem da API.
 * Saída: 0 confirmado, 1 código não confere, 2 sem terminal.
 */

import { createInterface } from "node:readline/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  comparacaoSeguraTotp,
  gerarCodigoTotp,
  prepararAtivacaoTotp,
} from "./modules/auth/totp.usecase.ts";

const PASSO_EM_MS = 30_000;

export interface OpcoesDoGeradorDeSegredo {
  readonly escrever: (linha: string) => void;
  /** Pede o código de 6 dígitos ao terminal. */
  readonly lerCodigo: () => Promise<string>;
  readonly terminalInterativo: boolean;
  readonly agora?: () => Date;
  readonly gerarBytes?: () => Uint8Array;
}

export async function executarGeradorDeSegredo(
  opcoes: OpcoesDoGeradorDeSegredo,
): Promise<number> {
  const { escrever, agora = () => new Date() } = opcoes;
  if (!opcoes.terminalInterativo) {
    escrever(
      "✘ rode este comando num terminal: a chave não pode ir para arquivo nem para pipe",
    );
    return 2;
  }

  // Cifrador de identidade, de propósito: aqui nada é guardado, e a chave real
  // da plataforma (CHAVE_CIFRA_TOTP) nunca entra neste script.
  const preparada = await prepararAtivacaoTotp(
    "administracao-permanente",
    "administracao",
    {
      repositorio: {
        guardarPendente: async () => undefined,
        ativarSeCodigoConfere: () => Promise.reject(new Error("não usado")),
        buscar: () => Promise.reject(new Error("não usado")),
        validarEConsumir: () => Promise.reject(new Error("não usado")),
      },
      cifrador: { cifrar: async (valor) => valor },
    },
    opcoes.gerarBytes,
  );

  escrever("Cadastre no aplicativo autenticador do celular:");
  escrever(
    `  chave: ${preparada.segredo.match(/.{1,4}/g)?.join(" ") ?? preparada.segredo}`,
  );
  escrever(`  link:  ${preparada.uriDoAplicativo}`);
  escrever("");

  const codigo = (await opcoes.lerCodigo()).trim();
  const atual = Math.floor(agora().getTime() / PASSO_EM_MS);
  const confere = [atual - 1, atual, atual + 1].some((passo) =>
    comparacaoSeguraTotp(
      gerarCodigoTotp(preparada.segredo, new Date(passo * PASSO_EM_MS)),
      codigo,
    ),
  );
  if (!confere) {
    escrever(
      "✘ o código não confere. Não use esta chave: rode o comando de novo e cadastre a nova.",
    );
    return 1;
  }
  escrever(
    "✔ código conferido. No Railway (serviço api), use como ADMIN_TOTP_SEGREDO a chave acima, sem espaços.",
  );
  return 0;
}

async function perguntarNoTerminal(): Promise<string> {
  const terminal = createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  try {
    return await terminal.question("Código de 6 dígitos do aplicativo: ");
  } finally {
    terminal.close();
  }
}

const chamadoDiretamente =
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (chamadoDiretamente) {
  process.exitCode = await executarGeradorDeSegredo({
    escrever: (linha) => process.stdout.write(`${linha}\n`),
    lerCodigo: perguntarNoTerminal,
    terminalInterativo:
      process.stdin.isTTY === true && process.stdout.isTTY === true,
  });
}
