/**
 * Busca um produto na API e o prepara para a tela (AC-410, AC-413).
 *
 * O SITE NÃO FALA COM O BANCO: a tabela de fronteiras só autoriza esta camada a
 * conhecer o contrato, e é a API que resolve qual loja atende aquele apelido.
 * A resposta é conferida contra o esquema porque o que vem pela rede é DADO até
 * alguém provar o contrário — e é essa conferência que faz a página quebrar no
 * lugar certo se o contrato mudar, em vez de mostrar texto sumido.
 *
 * O PREÇO É ESCRITO AQUI, e não no componente: `web-features` não alcança
 * `packages/core`, e a conta de dinheiro é de lá (P-006).
 */
import {
  esquemaDoProduto,
  type ProdutoNoContrato,
} from "@simpleclick/contracts";
import { emReais } from "@simpleclick/core";

import type {
  GrupoNaTela,
  MotivoNaTela,
  OpcaoNaTela,
  ProdutoNaTela,
  VariacaoNaTela,
} from "../lib/produto.ts";

import { enderecoDaApi, ESPERA_MAXIMA_EM_MS } from "./api-client.ts";
import { etiquetasDaVitrine } from "./cache.ts";
import { SEGUNDOS_DE_CACHE } from "./vitrine.ts";

/** O que a página recebe: o produto, ou o motivo de não haver produto. */
export type ResultadoDoProduto =
  | { readonly estado: "encontrado"; readonly produto: ProdutoNaTela }
  | { readonly estado: "nao-encontrado" }
  | { readonly estado: "indisponivel"; readonly motivo: string };

/**
 * Escreve o acréscimo de uma opção.
 *
 * O SINAL VAI JUNTO, e por extenso na frente do valor: "+ R$ 3,00" e
 * "− R$ 2,00". Sem o sinal, "R$ 2,00" ao lado de "Sem cebola" parece o preço de
 * tirar a cebola. Zero devolve nulo — a opção que não muda o preço não ganha
 * rótulo nenhum, porque "+ R$ 0,00" é ruído em toda linha do formulário.
 */
function escreverAcrescimo(centavos: number): string | null {
  if (centavos === 0) return null;
  return centavos > 0 ? `+ ${emReais(centavos)}` : `− ${emReais(-centavos)}`;
}

/** A regra do grupo, em palavras. */
function regraDoGrupo(minimo: number, maximo: number | null): string {
  if (minimo > 0 && maximo === minimo) {
    return minimo === 1 ? "Escolha 1" : `Escolha ${minimo}`;
  }
  if (minimo > 0 && maximo !== null) return `Escolha de ${minimo} a ${maximo}`;
  if (minimo > 0) return `Escolha ao menos ${minimo}`;
  if (maximo !== null) return `Escolha até ${maximo}`;
  return "Opcional";
}

/** A frase que a página mostra no lugar do botão (AC-413). */
function explicar(motivo: MotivoNaTela | null): string | null {
  switch (motivo) {
    case "ESGOTADO":
      return "Este item acabou.";
    case "FORA_DO_HORARIO":
      return "Este item não está sendo vendido agora.";
    case "LOJA_FECHADA":
      return "A loja está fechada no momento. Você pode ver o item e voltar depois.";
    default:
      return null;
  }
}

export interface OpcoesDaBusca {
  readonly apelidoDaLoja: string;
  /**
   * Se a loja está aberta agora. Vem da rota da APRESENTAÇÃO, que é quem sabe
   * o horário — a rota do produto não devolve isso de propósito, para não ter
   * duas cópias da regra de horário.
   */
  readonly lojaAberta?: boolean | undefined;
  readonly buscar?: typeof fetch | undefined;
}

export async function buscarProduto(
  produtoId: string,
  { apelidoDaLoja, lojaAberta = true, buscar = fetch }: OpcoesDaBusca,
): Promise<ResultadoDoProduto> {
  const endereco = `${enderecoDaApi()}/v1/vitrine/${encodeURIComponent(
    apelidoDaLoja,
  )}/produto/${encodeURIComponent(produtoId)}`;

  let resposta: Response;
  try {
    resposta = await buscar(endereco, {
      // A etiqueta é a da loja inteira: preço, foto e horário mudam pelo
      // painel, e o aviso do dono vence a página de cada produto junto.
      next: {
        revalidate: SEGUNDOS_DE_CACHE,
        tags: etiquetasDaVitrine(apelidoDaLoja),
      },
      signal: AbortSignal.timeout(ESPERA_MAXIMA_EM_MS),
      headers: { accept: "application/json" },
    } as RequestInit);
  } catch (erro) {
    const motivo = erro instanceof Error ? erro.message : "falha de rede";
    return { estado: "indisponivel", motivo };
  }

  // 404 é resposta, e não falha: produto inexistente, em rascunho, de categoria
  // oculta e de loja suspensa respondem igual, e de propósito.
  if (resposta.status === 404) return { estado: "nao-encontrado" };

  if (!resposta.ok) {
    return {
      estado: "indisponivel",
      motivo: `a API respondeu ${resposta.status}`,
    };
  }

  let corpo: unknown;
  try {
    corpo = await resposta.json();
  } catch {
    return {
      estado: "indisponivel",
      motivo: "a API respondeu algo que não é JSON",
    };
  }

  const conferido = esquemaDoProduto.safeParse(corpo);
  if (!conferido.success) {
    return {
      estado: "indisponivel",
      motivo: "a resposta da API não bate com o contrato publicado",
    };
  }

  return {
    estado: "encontrado",
    produto: prepararProduto(conferido.data, apelidoDaLoja, lojaAberta),
  };
}

/** Transforma a resposta do contrato no que a tela desenha. */
export function prepararProduto(
  daApi: ProdutoNoContrato,
  apelidoDaLoja: string,
  lojaAberta: boolean,
): ProdutoNaTela {
  const grupos: readonly GrupoNaTela[] = daApi.grupos.map((grupo) => ({
    id: grupo.id,
    nome: grupo.nome,
    descricao: grupo.descricao,
    minimo: grupo.minimo,
    maximo: grupo.maximo,
    permiteRepetir: grupo.permiteRepetir,
    eixoDeVariacao: grupo.eixoDeVariacao,
    tipo: grupo.tipo,
    // Derivada do mínimo, como no banco e no contrato: um campo próprio poderia
    // divergir do número que de fato bloqueia.
    obrigatorio: grupo.minimo >= 1,
    regra: regraDoGrupo(grupo.minimo, grupo.maximo),
    opcoes: grupo.opcoes.map((opcao): OpcaoNaTela => ({
      id: opcao.id,
      nome: opcao.nome,
      acrescimo: escreverAcrescimo(opcao.acrescimoCentavos),
      acrescimoCentavos: opcao.acrescimoCentavos,
      marcadaPorPadrao: opcao.marcadaPorPadrao,
      disponivel: opcao.disponivel,
    })),
  }));

  const variacoes: readonly VariacaoNaTela[] = daApi.variacoes.map(
    (variacao) => ({
      id: variacao.id,
      nome: variacao.nome,
      preco:
        variacao.precoCentavos === null
          ? null
          : emReais(variacao.precoCentavos),
      precoCentavos: variacao.precoCentavos,
      precoAnterior:
        variacao.precoAnteriorCentavos !== null &&
        variacao.precoCentavos !== null &&
        variacao.precoAnteriorCentavos > variacao.precoCentavos
          ? emReais(variacao.precoAnteriorCentavos)
          : null,
      disponivel: variacao.disponivel,
      padrao: variacao.padrao,
      valoresDosEixos: variacao.valoresDosEixos,
      atacado: variacao.atacado ?? null,
    }),
  );

  // LOJA FECHADA VENCE os motivos do produto: de nada adianta dizer que o item
  // está disponível se ninguém vai preparar o pedido agora. E ela é decidida
  // AQUI, e não na API, porque quem sabe o horário é a rota da apresentação.
  const motivo: MotivoNaTela | null = !lojaAberta
    ? "LOJA_FECHADA"
    : daApi.motivoIndisponivel;

  return {
    id: daApi.id,
    apelido: daApi.apelido,
    nome: daApi.nome,
    chamada: daApi.chamada,
    descricao: daApi.descricao,
    imagens: daApi.imagens,
    midias: daApi.midias ?? [],
    especificacoes: daApi.especificacoes ?? [],
    preco: daApi.precoCentavos === null ? null : emReais(daApi.precoCentavos),
    precoCentavos: daApi.precoCentavos,
    precoAnterior:
      daApi.precoAnteriorCentavos !== null &&
      daApi.precoCentavos !== null &&
      daApi.precoAnteriorCentavos > daApi.precoCentavos
        ? emReais(daApi.precoAnteriorCentavos)
        : null,
    atacado: daApi.atacado ?? null,
    grupos,
    variacoes,
    disponivel: daApi.disponivel && lojaAberta,
    motivoIndisponivel: motivo,
    explicacaoDaIndisponibilidade: explicar(motivo),
    aceitaObservacao: daApi.aceitaObservacao,
    linkDaSecao: daApi.secao
      ? `/loja/${apelidoDaLoja}/cardapio?categoria=${encodeURIComponent(daApi.secao.apelido)}`
      : null,
    nomeDaSecao: daApi.secao?.nome ?? null,
    linkDoCatalogo: `/loja/${apelidoDaLoja}/cardapio`,
  };
}

/**
 * O texto que aparece na prévia do compartilhamento (AC-414).
 *
 * O PREÇO ENTRA porque é o que a pessoa que recebe o link quer saber antes de
 * abrir. Sem ele, a prévia diz o nome do produto e obriga um toque para
 * descobrir quanto custa — e num grupo de WhatsApp esse toque não acontece.
 *
 * A ordem das fontes é a da utilidade: a chamada é a frase que o dono escreveu
 * para vender; a descrição é o detalhe; e o texto de reserva existe para o
 * produto que não tem nem uma nem outra, que é o caso da loja recém-criada.
 */
export function resumoParaCompartilhar(
  produto: ProdutoNaTela,
  nomeDaLoja: string,
): string {
  const base =
    produto.chamada ??
    produto.descricao ??
    `${produto.nome} em ${nomeDaLoja}. Peça pelo WhatsApp.`;

  return produto.preco === null ? base : `${base} · ${produto.preco}`;
}
