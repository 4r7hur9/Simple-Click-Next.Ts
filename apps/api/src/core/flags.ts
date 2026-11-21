/**
 * Feature flags de AMBIENTE (card #140).
 *
 * NÃO CONFUNDIR com `funcionalidades.ts`: lá o liga/desliga é POR LOJA, lido do
 * banco, e a rota desligada responde 403. Aqui é POR PROCESSO, lido da
 * configuração do ambiente na partida: o mesmo código vai a homologação e a
 * produção, e cada ambiente decide se a mudança já está visível. Tudo nasce
 * DESLIGADO; desligar de novo é trocar o valor e reiniciar.
 *
 * A INTERFACE É A TROCÁVEL. `ProvedorDeFlags.ligada` é síncrona, como o
 * `isEnabled` dos SDKs do Unleash e do GrowthBook depois de inicializados. Para
 * adotar um deles, escreve-se outro provedor (SDK de versão FIXA, iniciado na
 * partida e entregue ao `criarApp` em `opcoes.flags`) e nenhuma rota muda — elas
 * recebem só um booleano.
 *
 * Quem lê a variável é `env.ts`, que a valida na partida; este arquivo só
 * traduz o valor já validado.
 */
import type { Ambiente } from "./env.ts";

/** Cada flag: de que variável vem e qual o valor quando ela falta. */
export const CATALOGO_DE_FLAGS = {
  "vitrine.proximo_preco": {
    variavel: "FLAG_VITRINE_PROXIMO_PRECO",
    padrao: false,
    descricao:
      "Página pública do produto anuncia a próxima queda de preço (7 dias).",
  },
} as const;

export type NomeDaFlag = keyof typeof CATALOGO_DE_FLAGS;

export interface ProvedorDeFlags {
  ligada(nome: NomeDaFlag): boolean;
}

/** Tudo desligado: o padrão de qualquer `criarApp` que não diga outra coisa. */
export const FLAGS_DESLIGADAS: ProvedorDeFlags = {
  ligada: () => false,
};

/** As flags como o ambiente já validado as definiu. */
export function flagsDoAmbiente(
  ambiente: Pick<Ambiente, "FLAG_VITRINE_PROXIMO_PRECO">,
): ProvedorDeFlags {
  const valores: Record<NomeDaFlag, boolean> = {
    "vitrine.proximo_preco": ambiente.FLAG_VITRINE_PROXIMO_PRECO === "ligado",
  };
  return { ligada: (nome) => valores[nome] };
}

/** Flags fixas, para provas: o que não for citado fica desligado. */
export function flagsFixas(
  ligadas: Partial<Record<NomeDaFlag, boolean>>,
): ProvedorDeFlags {
  return { ligada: (nome) => ligadas[nome] ?? CATALOGO_DE_FLAGS[nome].padrao };
}
