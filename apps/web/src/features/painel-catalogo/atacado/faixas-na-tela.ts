/**
 * As faixas de atacado como o dono as digita no cadastro do produto (card #55).
 *
 * A tela guarda TEXTO ("10", "2,50"), e só na hora de salvar vira o que a API
 * espera: `quantidadeMinima`, `tipoDeDesconto` e `desconto` inteiros
 * (percentual de 1 a 99 ou centavos). As travas são as do servidor —
 * `problemasDasFaixas` do core, a mesma função que a API usa —, para a pessoa
 * ouvir aqui o que ouviria no 422, com o resto do preenchimento na tela.
 *
 * Campo vazio = só varejo: uma linha sem quantidade e sem desconto não vai no
 * envio, e nenhuma linha preenchida manda `[]`, que apaga as faixas gravadas.
 */
import { LIMITES_DO_ATACADO } from "@simpleclick/contracts";

import { centavosDoTexto } from "../../../lib/dinheiro.ts";
import {
  problemasDasFaixas,
  unitarioNaFaixa,
  type FaixaDeAtacado,
  type ProblemaDaFaixa,
  type TipoDeDescontoDoAtacado,
} from "../../../lib/atacado.ts";

/** Uma faixa só, ou crescente: quanto mais compra, mais desconto. */
export type ModalidadeDoAtacado = "UNICA" | "CRESCENTE";

export interface LinhaDeFaixa {
  /** Identidade da linha na tela, para remover a certa. */
  readonly chave: number;
  readonly quantidade: string;
  readonly desconto: string;
  /** O nome que veio gravado; a tela não edita, mas não o perde. */
  readonly rotulo: string | null;
}

export interface AtacadoNaTela {
  readonly modalidade: ModalidadeDoAtacado;
  /** O mesmo em todas as faixas: a API recusa a mistura. */
  readonly tipo: TipoDeDescontoDoAtacado;
  readonly linhas: readonly LinhaDeFaixa[];
}

/** Uma faixa gravada, como a API devolve no produto. */
export interface FaixaGravada {
  readonly quantidadeMinima: number;
  readonly tipoDeDesconto: TipoDeDescontoDoAtacado;
  readonly desconto: number;
  readonly rotulo?: string | null | undefined;
  readonly ativo?: boolean | undefined;
}

/** O corpo de uma faixa no envio (`faixasDeAtacado`). */
export interface FaixaParaEnviar {
  readonly quantidadeMinima: number;
  readonly tipoDeDesconto: TipoDeDescontoDoAtacado;
  readonly desconto: number;
  readonly rotulo?: string;
}

let proximaChave = 1;

export function linhaNova(): LinhaDeFaixa {
  return { chave: proximaChave++, quantidade: "", desconto: "", rotulo: null };
}

function centavosNoCampo(centavos: number): string {
  return (centavos / 100).toFixed(2).replace(".", ",");
}

/** O estado da seção a partir do que está gravado (nada = só varejo). */
export function atacadoInicial(
  gravadas: readonly FaixaGravada[] | null | undefined,
): AtacadoNaTela {
  const ativas = [...(gravadas ?? [])]
    .filter((faixa) => faixa.ativo !== false)
    .sort((a, b) => a.quantidadeMinima - b.quantidadeMinima);
  const primeira = ativas[0];
  if (primeira === undefined) {
    return { modalidade: "UNICA", tipo: "PERCENTUAL", linhas: [linhaNova()] };
  }
  return {
    modalidade: ativas.length > 1 ? "CRESCENTE" : "UNICA",
    tipo: primeira.tipoDeDesconto,
    linhas: ativas.map((faixa) => ({
      chave: proximaChave++,
      quantidade: String(faixa.quantidadeMinima),
      desconto:
        faixa.tipoDeDesconto === "VALOR"
          ? centavosNoCampo(faixa.desconto)
          : String(faixa.desconto),
      rotulo: faixa.rotulo ?? null,
    })),
  };
}

export function linhaEmBranco(linha: LinhaDeFaixa): boolean {
  return linha.quantidade.trim() === "" && linha.desconto.trim() === "";
}

/** Unidades inteiras; nulo para o que não é número inteiro. */
export function quantidadeDoTexto(texto: string): number | null {
  const limpo = texto.replace(/\s+/g, "").replace(/\./g, "");
  if (!/^\d+$/.test(limpo)) return null;
  const valor = Number(limpo);
  return Number.isSafeInteger(valor) ? valor : null;
}

/** Percentual inteiro ("10" ou "10%") ou centavos ("2,50"); nulo se não der. */
export function descontoDoTexto(
  texto: string,
  tipo: TipoDeDescontoDoAtacado,
): number | null {
  if (tipo === "VALOR") return centavosDoTexto(texto);
  const limpo = texto.replace(/\s+/g, "").replace(/%$/, "");
  if (!/^\d+$/.test(limpo)) return null;
  return Number(limpo);
}

/** Uma faixa lida da linha, ou nula enquanto falta algo. */
export function faixaDaLinha(
  linha: LinhaDeFaixa,
  tipo: TipoDeDescontoDoAtacado,
): FaixaDeAtacado | null {
  const quantidadeMinima = quantidadeDoTexto(linha.quantidade);
  const desconto = descontoDoTexto(linha.desconto, tipo);
  if (quantidadeMinima === null || desconto === null) return null;
  return { quantidadeMinima, tipoDeDesconto: tipo, desconto };
}

/** O preço por unidade que a linha dá, para mostrar enquanto se digita. */
export type PrecoDaLinha =
  | { readonly caso: "incompleta" }
  | { readonly caso: "sem-varejo" }
  | { readonly caso: "nao-cabe" }
  | {
      readonly caso: "ok";
      readonly unitarioCentavos: number;
      readonly descontoPorUnidadeCentavos: number;
    };

export function precoDaLinha(
  linha: LinhaDeFaixa,
  tipo: TipoDeDescontoDoAtacado,
  varejoCentavos: number | null,
): PrecoDaLinha {
  const faixa = faixaDaLinha(linha, tipo);
  if (faixa === null || faixa.desconto <= 0) return { caso: "incompleta" };
  if (varejoCentavos === null || varejoCentavos <= 0)
    return { caso: "sem-varejo" };
  const unitario = unitarioNaFaixa(varejoCentavos, faixa);
  if (unitario === null) return { caso: "nao-cabe" };
  return {
    caso: "ok",
    unitarioCentavos: unitario,
    descontoPorUnidadeCentavos: varejoCentavos - unitario,
  };
}

/** A menor quantidade preenchida: o pedido mínimo do atacado. */
export function pedidoMinimoNaTela(estado: AtacadoNaTela): number | null {
  const quantidades = estado.linhas
    .map((linha) => faixaDaLinha(linha, estado.tipo)?.quantidadeMinima)
    .filter(
      (valor): valor is number =>
        valor !== undefined && valor >= LIMITES_DO_ATACADO.quantidadeMinima,
    );
  return quantidades.length === 0 ? null : Math.min(...quantidades);
}

export type LeituraDoAtacado =
  | {
      readonly ok: true;
      readonly faixas: readonly FaixaParaEnviar[];
      /** Para cada faixa enviada, a linha da tela de onde ela veio. */
      readonly origem: readonly number[];
    }
  | { readonly ok: false; readonly problemas: readonly ProblemaDaFaixa[] };

/**
 * Lê a seção para o envio, com as travas do servidor. Os `indice` dos
 * problemas são as linhas da TELA (contando as em branco).
 */
export function lerAtacado(
  estado: AtacadoNaTela,
  varejoCentavos: number | null,
): LeituraDoAtacado {
  const problemas: ProblemaDaFaixa[] = [];
  const faixas: FaixaDeAtacado[] = [];
  const origem: number[] = [];

  estado.linhas.forEach((linha, indice) => {
    if (linhaEmBranco(linha)) return;
    const quantidade = quantidadeDoTexto(linha.quantidade);
    const desconto = descontoDoTexto(linha.desconto, estado.tipo);
    if (linha.quantidade.trim() === "")
      problemas.push({
        indice,
        mensagem: "Informe a partir de quantas unidades a faixa vale.",
      });
    else if (quantidade === null)
      problemas.push({
        indice,
        mensagem: "Use um número inteiro de unidades.",
      });
    else if (quantidade > LIMITES_DO_ATACADO.quantidadeMaxima)
      problemas.push({
        indice,
        mensagem: "A quantidade vai até 1.000.000 de unidades.",
      });
    if (linha.desconto.trim() === "")
      problemas.push({ indice, mensagem: "Informe o desconto da faixa." });
    else if (desconto === null)
      problemas.push({
        indice,
        mensagem:
          estado.tipo === "PERCENTUAL"
            ? "Use um percentual inteiro, de 1% a 99%."
            : "Informe o desconto em reais, como 2,50.",
      });
    if (quantidade !== null && desconto !== null) {
      faixas.push({
        quantidadeMinima: quantidade,
        tipoDeDesconto: estado.tipo,
        desconto,
      });
      origem.push(indice);
    }
  });

  if (faixas.length + problemas.length === 0) {
    return { ok: true, faixas: [], origem: [] };
  }
  if (origem.length > LIMITES_DO_ATACADO.faixasPorProduto)
    problemas.push({
      indice: null,
      mensagem: `Cadastre no máximo ${LIMITES_DO_ATACADO.faixasPorProduto} faixas.`,
    });
  if (problemas.length > 0) return { ok: false, problemas };

  const daRegra = problemasDasFaixas(faixas, varejoCentavos);
  if (daRegra.length > 0) {
    return {
      ok: false,
      problemas: daRegra.map((problema) => ({
        indice: problema.indice === null ? null : origem[problema.indice]!,
        mensagem: problema.mensagem,
      })),
    };
  }

  return {
    ok: true,
    faixas: faixas.map((faixa, posicao): FaixaParaEnviar => {
      const enviada = {
        quantidadeMinima: faixa.quantidadeMinima,
        tipoDeDesconto: faixa.tipoDeDesconto,
        desconto: faixa.desconto,
      };
      const rotulo = estado.linhas[origem[posicao]!]?.rotulo;
      return rotulo ? { ...enviada, rotulo } : enviada;
    }),
    origem,
  };
}

/** Os problemas que a API devolveu (índice do envio) na linha da tela. */
export function problemasNaTela(
  problemas: readonly ProblemaDaFaixa[],
  origem: readonly number[],
): ProblemaDaFaixa[] {
  return problemas.map((problema) => ({
    indice: problema.indice === null ? null : (origem[problema.indice] ?? null),
    mensagem: problema.mensagem,
  }));
}

/** Troca a modalidade sem perder o que já foi digitado na primeira faixa. */
export function mudarModalidade(
  estado: AtacadoNaTela,
  modalidade: ModalidadeDoAtacado,
): AtacadoNaTela {
  if (modalidade === estado.modalidade) return estado;
  if (modalidade === "UNICA") {
    const preenchida =
      estado.linhas.find((linha) => !linhaEmBranco(linha)) ?? linhaNova();
    return { ...estado, modalidade, linhas: [preenchida] };
  }
  return {
    ...estado,
    modalidade,
    linhas:
      estado.linhas.length < 2
        ? [...estado.linhas, linhaNova()]
        : estado.linhas,
  };
}
