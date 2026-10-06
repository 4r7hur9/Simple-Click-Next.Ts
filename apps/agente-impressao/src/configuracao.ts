/**
 * A configuração local do agente (T-609): onde fica a API, a credencial que
 * o pareamento entregou, a impressora da loja e o perfil dela.
 *
 * Mora num arquivo JSON da máquina da loja (padrão `~/.simpleclick-agente/
 * agente.json`, ou a pasta de `SIMPLECLICK_AGENTE_DIR`), gravado só para o
 * usuário que roda o agente: a credencial está ali. O perfil da impressora é
 * da máquina, e não do servidor (decisão da T-608): a mesma loja pode trocar
 * de impressora sem mexer no painel.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

import {
  ehTabelaDeCaracteres,
  TABELA_PADRAO,
  type CorteDoPapel,
  type PerfilDaImpressora,
} from "@simpleclick/core";

import type { EnderecoDaImpressora } from "./impressora-tcp.ts";

export interface ConfiguracaoDoAgente {
  readonly api: string;
  /** Origem mandada nos POST; padrão, a da própria API (AC-126). */
  readonly origem?: string;
  readonly credencial: string;
  readonly agente: { readonly id: string; readonly nome: string };
  readonly loja: { readonly apelido: string; readonly nome: string };
  readonly impressora: EnderecoDaImpressora;
  readonly perfil: PerfilDaImpressora;
  readonly intervaloMs?: number;
}

/** A pasta do agente nesta máquina. */
export function pastaDoAgente(ambiente = process.env): string {
  return (
    ambiente.SIMPLECLICK_AGENTE_DIR ?? join(homedir(), ".simpleclick-agente")
  );
}

export const caminhoDaConfiguracao = (pasta: string) =>
  join(pasta, "agente.json");
export const caminhoDoDiario = (pasta: string) => join(pasta, "diario.txt");

/** Configuração inválida ou ausente: o agente não sabe para quem imprimir. */
export class ErroDaConfiguracao extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = "ErroDaConfiguracao";
  }
}

const CORTES: readonly CorteDoPapel[] = ["parcial", "total", "nenhum"];

function texto(valor: unknown, campo: string): string {
  if (typeof valor !== "string" || valor.trim() === "") {
    throw new ErroDaConfiguracao(`campo "${campo}" ausente na configuração`);
  }
  return valor;
}

/** Confere o arquivo lido, campo a campo, com o padrão onde há padrão. */
export function lerConfiguracao(valor: unknown): ConfiguracaoDoAgente {
  if (typeof valor !== "object" || valor === null) {
    throw new ErroDaConfiguracao("a configuração não é um objeto JSON");
  }
  const bruto = valor as Record<string, unknown>;
  const agente = (bruto.agente ?? {}) as Record<string, unknown>;
  const loja = (bruto.loja ?? {}) as Record<string, unknown>;
  const impressora = (bruto.impressora ?? {}) as Record<string, unknown>;
  const perfil = (bruto.perfil ?? {}) as Record<string, unknown>;

  const porta = impressora.porta ?? 9100;
  if (typeof porta !== "number" || !Number.isInteger(porta) || porta < 1) {
    throw new ErroDaConfiguracao('campo "impressora.porta" inválido');
  }
  const tabela = perfil.tabela ?? TABELA_PADRAO;
  if (!ehTabelaDeCaracteres(tabela)) {
    throw new ErroDaConfiguracao(
      'campo "perfil.tabela" deve ser cp860 ou cp850',
    );
  }
  const corte = perfil.corte ?? "parcial";
  if (!CORTES.includes(corte as CorteDoPapel)) {
    throw new ErroDaConfiguracao(
      'campo "perfil.corte" deve ser parcial, total ou nenhum',
    );
  }
  const intervalo = bruto.intervaloMs;
  if (
    intervalo !== undefined &&
    (typeof intervalo !== "number" || intervalo < 500)
  ) {
    throw new ErroDaConfiguracao(
      'campo "intervaloMs" deve ser um número a partir de 500',
    );
  }

  return {
    api: texto(bruto.api, "api"),
    ...(typeof bruto.origem === "string" ? { origem: bruto.origem } : {}),
    credencial: texto(bruto.credencial, "credencial"),
    agente: {
      id: texto(agente.id, "agente.id"),
      nome: texto(agente.nome, "agente.nome"),
    },
    loja: {
      apelido: texto(loja.apelido, "loja.apelido"),
      nome: texto(loja.nome, "loja.nome"),
    },
    impressora: { host: texto(impressora.host, "impressora.host"), porta },
    perfil: { tabela, corte: corte as CorteDoPapel },
    ...(intervalo === undefined ? {} : { intervaloMs: intervalo }),
  };
}

/** Lê a configuração da pasta; sem arquivo, explica como parear. */
export async function carregarConfiguracao(
  pasta: string,
): Promise<ConfiguracaoDoAgente> {
  let conteudo: string;
  try {
    conteudo = await readFile(caminhoDaConfiguracao(pasta), "utf8");
  } catch {
    throw new ErroDaConfiguracao(
      `nenhuma configuração em ${caminhoDaConfiguracao(pasta)}; pareie o agente antes (pnpm parear)`,
    );
  }
  return lerConfiguracao(JSON.parse(conteudo));
}

/** Grava a configuração legível só pelo usuário (a credencial está nela). */
export async function gravarConfiguracao(
  pasta: string,
  configuracao: ConfiguracaoDoAgente,
): Promise<void> {
  await mkdir(pasta, { recursive: true, mode: 0o700 });
  await writeFile(
    caminhoDaConfiguracao(pasta),
    `${JSON.stringify(configuracao, null, 2)}\n`,
    { encoding: "utf8", mode: 0o600 },
  );
}
