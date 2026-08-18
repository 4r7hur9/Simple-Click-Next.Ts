/**
 * Apoio aos testes das filas de segundo plano.
 *
 * Reúne o que os testes de fila precisam e que não é comportamento sob prova:
 * achar o Redis de teste, isolar cada arquivo num espaço de nomes próprio,
 * limpar o que sobrou e esperar por uma condição sem dormir tempo fixo.
 *
 * Mora em `tests/` e não em `src/` de propósito: é andaime de teste, e andaime
 * de teste não pode acabar dentro da imagem de produção.
 */

import { existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { Redis } from "ioredis";

import {
  type EnviadorDeEmail,
  type MensagemDeEmail,
} from "../src/jobs/email.job.ts";

const RAIZ_DO_REPOSITORIO = fileURLToPath(
  new URL("../../../", import.meta.url),
);

const ARQUIVO_DE_AMBIENTE = join(RAIZ_DO_REPOSITORIO, ".env");
if (existsSync(ARQUIVO_DE_AMBIENTE)) process.loadEnvFile(ARQUIVO_DE_AMBIENTE);

/**
 * URL do Redis de teste, com recusa que diz o que fazer.
 *
 * Falhar aqui é obrigatório: um teste de fila que se pula por falta de Redis
 * some do relatório e leva junto a única prova de que o trabalho falho não
 * desaparece — que é justamente o critério mais fácil de quebrar sem ninguém
 * notar.
 */
export function urlDoRedisDeTeste(): string {
  const url = process.env.REDIS_URL_TEST?.trim();
  if (url === undefined || url === "") {
    throw new Error(
      [
        "REDIS_URL_TEST não está definida, e sem ela não há fila para provar.",
        "Suba o ambiente e preencha o arquivo de ambiente:",
        "  bash infra/scripts/up.sh core",
        "  cp .env.example .env   # e complete os valores",
      ].join("\n"),
    );
  }

  const desenvolvimento = process.env.REDIS_URL?.trim();
  if (desenvolvimento !== undefined && desenvolvimento === url) {
    throw new Error(
      [
        "REDIS_URL_TEST aponta para o mesmo Redis de REDIS_URL, o de desenvolvimento.",
        "A suíte apaga as chaves que cria; apontar para o mesmo índice arrisca o",
        "ambiente local. Use outro índice — por exemplo, terminar a URL em /1.",
      ].join("\n"),
    );
  }

  return url;
}

/**
 * Espaço de nomes exclusivo desta execução.
 *
 * Várias árvores de trabalho desta máquina falam com o MESMO Redis. Sem um
 * prefixo por execução, dois testes rodando ao mesmo tempo dividiriam a mesma
 * fila e um consumiria o trabalho do outro — falha intermitente e difícil de
 * ler. O rótulo entra só para quem for investigar sobra saber de onde veio.
 */
export function prefixoDeTeste(rotulo: string): string {
  return `sc-teste-${rotulo}-${randomUUID()}`;
}

/** Apaga tudo que ficou sob o prefixo. O prefixo é só desta execução. */
export async function limparPrefixo(
  url: string,
  prefixo: string,
): Promise<void> {
  const conexao = new Redis(url, { maxRetriesPerRequest: null });
  try {
    const chaves = await conexao.keys(`${prefixo}*`);
    if (chaves.length > 0) await conexao.del(...chaves);
  } finally {
    await conexao.quit();
  }
}

/** Intervalo entre duas consultas à condição, em milissegundos. */
const PASSO_DA_ESPERA_MS = 20;

/**
 * Espera até a condição valer, ou falha dizendo o que não aconteceu.
 *
 * Substitui "dormir 3 segundos e torcer": o teste anda assim que o segundo
 * plano termina, e quando não termina a mensagem diz o que se esperava — em
 * vez de uma comparação genérica logo abaixo de um `setTimeout`.
 */
export async function esperarPor(
  condicao: () => boolean | Promise<boolean>,
  oQueSeEspera: string,
  limiteMs = 15_000,
): Promise<void> {
  const limite = Date.now() + limiteMs;
  for (;;) {
    if (await condicao()) return;
    if (Date.now() > limite) {
      throw new Error(
        `Esperava ${oQueSeEspera}, e isso não aconteceu em ${limiteMs} ms.`,
      );
    }
    await new Promise((seguir) => setTimeout(seguir, PASSO_DA_ESPERA_MS));
  }
}

/** Uma chamada ao enviador de prova, com quando começou e quando terminou. */
export interface ChamadaDeEnvio {
  readonly mensagem: MensagemDeEmail;
  readonly comecouEm: number;
  terminouEm: number | undefined;
  falhou: boolean;
}

/**
 * Duplo da porta de saída de e-mail: conta chamadas e falha sob comando.
 *
 * Nenhum teste deste projeto fala com serviço de e-mail de verdade. O duplo
 * também demora de propósito — é a demora dele que torna mensurável a promessa
 * de AC-025 de que a resposta não espera o envio.
 */
export interface EnviadorDeProva extends EnviadorDeEmail {
  readonly chamadas: readonly ChamadaDeEnvio[];
  /** Quanto cada envio demora. Alterável no meio do teste. */
  duracaoMs: number;
  /** Enquanto verdadeiro, todo envio falha. Alterável no meio do teste. */
  falhar: boolean;
  /** Motivo da falha; nunca carrega dado pessoal (P-009). */
  motivoDaFalha: string;
}

/** Opções iniciais do duplo. Todas mutáveis depois, pelo próprio objeto. */
export interface OpcoesDoEnviadorDeProva {
  readonly duracaoMs?: number;
  readonly falhar?: boolean;
  readonly motivoDaFalha?: string;
}

/** Cria o duplo da porta de saída de e-mail. */
export function criarEnviadorDeProva(
  opcoes: OpcoesDoEnviadorDeProva = {},
): EnviadorDeProva {
  const chamadas: ChamadaDeEnvio[] = [];

  const duplo: EnviadorDeProva = {
    chamadas,
    duracaoMs: opcoes.duracaoMs ?? 0,
    falhar: opcoes.falhar ?? false,
    motivoDaFalha: opcoes.motivoDaFalha ?? "serviço de e-mail indisponível",

    async enviar(mensagem: MensagemDeEmail): Promise<void> {
      const chamada: ChamadaDeEnvio = {
        mensagem,
        comecouEm: Date.now(),
        terminouEm: undefined,
        falhou: false,
      };
      chamadas.push(chamada);

      if (duplo.duracaoMs > 0) {
        await new Promise((seguir) => setTimeout(seguir, duplo.duracaoMs));
      }

      chamada.terminouEm = Date.now();
      if (duplo.falhar) {
        chamada.falhou = true;
        throw new Error(duplo.motivoDaFalha);
      }
    },
  };

  return duplo;
}
