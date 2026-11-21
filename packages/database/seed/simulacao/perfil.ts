/**
 * O PLANO do perfil de simulação (D-3 a D-6): 100 lojas e 1.000 pedidos, tudo
 * decidido por funções puras a partir de `semente` e `referencia`. Nada aqui
 * toca banco: quem grava é `index.ts`, usando a escrita do seed de
 * demonstração sobre as `LojaDemo` que este arquivo monta.
 *
 * Regras que importam (e que `perfil.test.ts` confere):
 *
 * - Cada loja é um CLONE próprio de um dos 22 modelos (`i mod 22`): nenhum id,
 *   apelido, contato ou pasta herda do modelo. Os ids nascem de `sim-NNN`.
 * - 2 categorias (as duas maiores do modelo) e 8 produtos publicados; faltando,
 *   completa com produtos de outras categorias, movidos para a 2ª.
 * - 10 pedidos por loja, sempre os mesmos 10 status, todos ANTES da referência.
 * - A loja 000 é a "Cozinha do Benfica", com o pedido-prova de R$ 51,00.
 * - Mesma semente e referência dão o mesmo plano; outra semente muda o conteúdo.
 */

import { createHash } from "node:crypto";

import { idDaCategoria } from "../catalogo.ts";
import type {
  CategoriaDemo,
  ClienteDemo,
  EixoDemo,
  ItemDemo,
  LojaDemo,
  PedidoDemo,
  ProdutoDemo,
  StatusDemo,
} from "../demo/dados.ts";
import { id, sorteio } from "../demo/escrita.ts";
import { LOJAS_NOVAS } from "../demo/lojas/index.ts";
import {
  CHAVE_DA_CLIENTE_DE_TESTE,
  clientesGerados,
  type PedidoDoRoteiro,
} from "../demo/roteiro.ts";
import { tokenDeExemplo } from "../deterministico.ts";
import { BAIRROS, RUAS } from "./bairros.ts";

export const TOTAL_DE_LOJAS = 100;
export const PEDIDOS_POR_LOJA = 10;
export const PRODUTOS_POR_LOJA = 8;
export const CLIENTES_POR_LOJA = 6;

/** Fortaleza não tem horário de verão: o fuso é fixo em UTC-3. */
const DESLOCAMENTO_DO_FUSO_MIN = -180;
const MINUTO = 60_000;
const DIA = 86_400_000;

/** Segmentos de varejo que ganham uma faixa de atacado em 1 produto (D-5). */
export const SEGMENTOS_COM_ATACADO: readonly string[] = [
  "GROCERY",
  "HARDWARE",
  "STATIONERY",
  "AUTO_PARTS",
  "PET_SHOP",
];

/** Faixa de atacado: a partir de 10 unidades, 5 % de desconto. */
export const ATACADO = { minimo: 10, desconto: 5 } as const;

/** A palavra que abre o nome da loja de cada segmento. */
const TIPO_DO_NOME: Readonly<Record<string, string>> = {
  FOOD_MARMITA: "Cozinha",
  FOOD_PIZZA: "Pizzaria",
  FOOD_SNACK: "Hamburgueria",
  FOOD_BAKERY: "Padaria",
  FOOD_ACAI: "Açaiteria",
  BEVERAGES: "Adega",
  GROCERY: "Mercadinho",
  FOOD_RESTAURANT: "Restaurante",
  SHOES: "Calçados",
  TOBACCO: "Tabacaria",
  STATIONERY: "Papelaria",
  PHARMACY: "Farmácia",
  PET_SHOP: "Pet Shop",
  FLORIST: "Floricultura",
  COSMETICS: "Perfumaria",
  APPAREL: "Moda",
  ELECTRONICS: "Eletrônicos",
  BOOKSTORE: "Livraria",
  TOYS: "Brinquedos",
  HARDWARE: "Construção",
  RETAIL_GENERIC: "Bazar",
  AUTO_PARTS: "Autopeças",
};

// ---------------------------------------------------------------------------
// Tipos do plano
// ---------------------------------------------------------------------------

export interface PlanoDaLoja {
  readonly indice: number;
  /** `sim-000`: de onde saem todos os ids. */
  readonly chave: string;
  /** `stores.code`: `SIM-<impressão>-000`. */
  readonly codigo: string;
  /** Chave do modelo de `LOJAS_NOVAS` de onde a loja foi clonada. */
  readonly modelo: string;
  /** `vertical_presets.code`. */
  readonly segmento: string;
  readonly bairro: string;
  readonly loja: LojaDemo;
  readonly pedidos: readonly PedidoDoRoteiro[];
  /** Produto da faixa de atacado, só nas lojas de varejo escolhidas. */
  readonly atacado: { readonly produto: string } | null;
  readonly criadaEm: Date;
  readonly aprovadaEm: Date;
}

export interface PlanoDoPerfil {
  readonly semente: string;
  readonly referencia: Date;
  /** 8 hex de semente + referência: vai em `stores.code`. */
  readonly impressao: string;
  readonly lojas: readonly PlanoDaLoja[];
}

// ---------------------------------------------------------------------------
// Peças pequenas
// ---------------------------------------------------------------------------

/** 8 hex do par (semente, referência): identifica o perfil dentro do banco. */
export function impressaoDoPerfil(semente: string, referencia: Date): string {
  return createHash("sha256")
    .update(`${semente}\n${referencia.toISOString()}`)
    .digest("hex")
    .slice(0, 8);
}

const numerar = (indice: number): string => String(indice).padStart(3, "0");

export const chaveDaLoja = (indice: number): string => `sim-${numerar(indice)}`;

export const codigoDaLoja = (impressao: string, indice: number): string =>
  `SIM-${impressao}-${numerar(indice)}`;

export const chaveDoPedido = (loja: string, k: number): string =>
  `${loja}:pedido:${k}`;

/** O token do acompanhamento do pedido, o mesmo que a carga grava. */
export const tokenDoPedido = (chave: string): string =>
  tokenDeExemplo(`demo:${chave}`);

/** "Café da Esquina" → "cafe-da-esquina". */
export function apelidoDe(nome: string): string {
  return nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const PALAVRAS_DE_LIGACAO = new Set(["do", "da", "de", "dos", "das"]);

function iniciaisDe(nome: string): string {
  return nome
    .split(/\s+/)
    .filter((palavra) => !PALAVRAS_DE_LIGACAO.has(palavra.toLowerCase()))
    .slice(0, 2)
    .map((palavra) => palavra.charAt(0).toUpperCase())
    .join("");
}

/** Arredonda para R$ 0,50 (mínimo R$ 0,50). */
const arredondar = (centavos: number): number =>
  Math.max(50, Math.round(centavos / 50) * 50);

// ---------------------------------------------------------------------------
// Bairros e nomes
// ---------------------------------------------------------------------------

/** O bairro de cada loja: o Benfica na 000, e 99 outros embaralhados pela semente. */
function bairrosDoPerfil(semente: string): readonly (readonly [string, string])[] {
  const [benfica, ...resto] = BAIRROS;
  const embaralhados = [...resto].sort((a, b) => {
    const pa = sorteio(`${semente}:bairro:${a[0]}`, 1_000_000);
    const pb = sorteio(`${semente}:bairro:${b[0]}`, 1_000_000);
    return pa - pb || a[0].localeCompare(b[0]);
  });
  return [benfica!, ...embaralhados.slice(0, TOTAL_DE_LOJAS - 1)];
}

// ---------------------------------------------------------------------------
// Catálogo (D-5)
// ---------------------------------------------------------------------------

/** "Peso: 650 g" a partir da especificação original. */
function fraseDaEspecificacao(
  categoria: CategoriaDemo,
  chave: string,
  valor: string | number | boolean,
): string {
  const definicao = categoria.especificacoes.find((e) => e.chave === chave);
  const rotulo = definicao?.rotulo ?? chave;
  const texto = typeof valor === "boolean" ? (valor ? "Sim" : "Não") : String(valor);
  const unidade = definicao?.unidade === undefined ? "" : ` ${definicao.unidade}`;
  return `${rotulo}: ${texto}${unidade}`;
}

/** Variação de -10 % a +10 %, decidida pela semente, por produto. */
function fatorDoPreco(semente: string, loja: string, produto: string): number {
  return 1 + (sorteio(`${semente}:preco:${loja}:${produto}`, 21) - 10) / 100;
}

function moldarEixos(
  eixos: readonly EixoDemo[] | undefined,
  fator: number,
): { readonly eixos: readonly EixoDemo[] } | Record<string, never> {
  if (eixos === undefined) return {};
  return {
    eixos: eixos.map((eixo) => ({
      ...eixo,
      opcoes: eixo.opcoes.map((opcao) =>
        opcao.preco === undefined
          ? opcao
          : { ...opcao, preco: arredondar(opcao.preco * fator) },
      ),
    })),
  };
}

/** O produto da loja do perfil: preços variados, estoque alto, descrição com a especificação. */
function moldarProduto(
  produto: ProdutoDemo,
  original: CategoriaDemo,
  destino: string,
  movido: boolean,
  semente: string,
  loja: LojaDemo,
  chaveDaLoja: string,
): ProdutoDemo {
  const fator = fatorDoPreco(semente, chaveDaLoja, produto.chave);
  const preco = arredondar(produto.preco * fator);
  let promo: number | undefined;
  if (produto.promo !== undefined) {
    promo = arredondar(produto.promo * fator);
    if (promo >= preco) promo = preco > 50 ? preco - 50 : undefined;
  }
  const custo = Math.max(1, Math.min(preco - 1, Math.round(produto.custo * fator)));
  const frases = Object.entries(produto.especificacoes).map(([chave, valor]) =>
    fraseDaEspecificacao(original, chave, valor),
  );
  const descricao =
    frases.length === 0
      ? produto.descricao
      : `${produto.descricao} ${frases.join("; ")}.`;
  const { promo: _promo, eixos: _eixos, estoque: _estoque, ...base } = produto;
  return {
    ...base,
    categoria: destino,
    descricao,
    preco,
    custo,
    // Produto movido de categoria perde as especificações (a 2ª categoria não
    // tem as definições); elas já foram para a descrição.
    especificacoes: movido ? {} : produto.especificacoes,
    ...(promo === undefined ? {} : { promo }),
    ...moldarEixos(produto.eixos, fator),
    // Estoque alto no varejo, para o k6 não esgotar.
    ...(loja.ehComida ? {} : { estoque: () => 9999 }),
  };
}

/** A marmita-prova da Cozinha do Benfica (D-5): R$ 20,00, sem eixo, com ovo frito a R$ 3,00. */
function marmitaDaProva(original: ProdutoDemo): ProdutoDemo {
  const { eixos: _eixos, promo: _promo, estoque: _estoque, ...base } = original;
  return {
    ...base,
    chave: "marmita-frango-grelhado",
    nome: "Marmita de frango grelhado",
    preco: 2000,
    custo: 900,
    descricao: "Porção de 450 g com arroz, feijão e legumes",
    especificacoes: { proteina: "Frango", peso: 450 },
    grupos: [
      {
        chave: "adicionais",
        nome: "Adicionais",
        kind: "ADDON",
        minimo: 0,
        maximo: 3,
        opcoes: [{ chave: "ovo-frito", nome: "Ovo frito", acrescimo: 300 }],
      },
    ],
  };
}

interface CatalogoMoldado {
  readonly categorias: readonly CategoriaDemo[];
  readonly produtos: readonly ProdutoDemo[];
  /** Chaves da 1ª categoria, de onde sai o produto de atacado. */
  readonly daPrimeira: readonly string[];
}

function moldarCatalogo(
  modelo: LojaDemo,
  semente: string,
  chave: string,
  clone: LojaDemo,
  ehProva: boolean,
): CatalogoMoldado {
  const publicados = modelo.produtos.filter((p) => p.rascunho !== true);
  const contagem = new Map<string, number>();
  for (const p of publicados) {
    contagem.set(p.categoria, (contagem.get(p.categoria) ?? 0) + 1);
  }
  // As duas maiores; empate fica com a que vem primeiro no modelo.
  const ordenadas = modelo.categorias
    .map((categoria, posicao) => ({ categoria, posicao }))
    .filter(({ categoria }) => contagem.has(categoria.chave))
    .sort(
      (a, b) =>
        (contagem.get(b.categoria.chave) ?? 0) -
          (contagem.get(a.categoria.chave) ?? 0) || a.posicao - b.posicao,
    );
  const primeira = ordenadas[0]!.categoria;
  const segunda = ordenadas[1]!.categoria;
  const dasDuas = publicados.filter(
    (p) => p.categoria === primeira.chave || p.categoria === segunda.chave,
  );
  const demais = publicados.filter((p) => !dasDuas.includes(p));
  const porSemente = (lista: readonly ProdutoDemo[], rotulo: string) =>
    [...lista].sort(
      (a, b) =>
        sorteio(`${semente}:${rotulo}:${chave}:${a.chave}`, 1_000_000) -
        sorteio(`${semente}:${rotulo}:${chave}:${b.chave}`, 1_000_000),
    );

  let escolhidos = dasDuas;
  if (escolhidos.length > PRODUTOS_POR_LOJA) {
    const mantidos = new Set(
      porSemente(escolhidos, "corte").slice(0, PRODUTOS_POR_LOJA),
    );
    escolhidos = escolhidos.filter((p) => mantidos.has(p));
  }
  const preenchimento =
    escolhidos.length < PRODUTOS_POR_LOJA
      ? porSemente(demais, "completa").slice(0, PRODUTOS_POR_LOJA - escolhidos.length)
      : [];
  const movidos = new Set(preenchimento);

  const produtos = [...escolhidos, ...preenchimento].map((produto) => {
    const original = modelo.categorias.find((c) => c.chave === produto.categoria)!;
    const moldado = moldarProduto(
      produto,
      original,
      movidos.has(produto) ? segunda.chave : produto.categoria,
      movidos.has(produto),
      semente,
      clone,
      chave,
    );
    return ehProva && produto.chave === "marmita-frango-grelhado"
      ? marmitaDaProva(moldado)
      : moldado;
  });
  return {
    categorias: [primeira, segunda],
    produtos,
    daPrimeira: produtos
      .filter((p) => p.categoria === primeira.chave)
      .map((p) => p.chave),
  };
}

// ---------------------------------------------------------------------------
// Pedidos (D-6)
// ---------------------------------------------------------------------------

type Forma = "DELIVERY" | "PICKUP";

const MOTIVOS_DE_CANCELAMENTO = [
  "Cliente desistiu do pedido.",
  "Produto em falta no estoque.",
  "Endereço fora da área de entrega.",
] as const;

/** Os 10 status de cada loja, na ordem K = 1…10. */
export function statusDosPedidos(formas: readonly Forma[]): readonly StatusDemo[] {
  const temEntrega = formas.includes("DELIVERY");
  const temRetirada = formas.includes("PICKUP");
  const intermediarios: StatusDemo[] =
    temEntrega && temRetirada
      ? ["READY_FOR_PICKUP", "OUT_FOR_DELIVERY"]
      : temRetirada
        ? ["READY_FOR_PICKUP", "READY_FOR_PICKUP"]
        : ["OUT_FOR_DELIVERY", "OUT_FOR_DELIVERY"];
  return [
    "PENDING",
    "ACCEPTED",
    "PREPARING",
    "PREPARING",
    ...intermediarios,
    "COMPLETED",
    "COMPLETED",
    "COMPLETED",
    "CANCELLED",
  ];
}

/**
 * O caminho de status que o histórico do pedido percorre. Espelha
 * `caminhoAte` de `demo/index.ts` (que não é exportado); a validação do banco
 * confere o histórico gravado contra `proximosStatus`, e o teste confere este.
 */
export function caminhoEsperado(
  status: StatusDemo,
  entrega: Forma,
): readonly StatusDemo[] {
  switch (status) {
    case "PENDING":
      return ["PENDING"];
    case "ACCEPTED":
      return ["PENDING", "ACCEPTED"];
    case "PREPARING":
      return ["PENDING", "ACCEPTED", "PREPARING"];
    case "READY_FOR_PICKUP":
      return ["PENDING", "ACCEPTED", "PREPARING", "READY_FOR_PICKUP"];
    case "OUT_FOR_DELIVERY":
      return ["PENDING", "ACCEPTED", "PREPARING", "OUT_FOR_DELIVERY"];
    case "COMPLETED":
      return [
        "PENDING",
        "ACCEPTED",
        "PREPARING",
        entrega === "PICKUP" ? "READY_FOR_PICKUP" : "OUT_FOR_DELIVERY",
        "COMPLETED",
      ];
    case "CANCELLED":
      return ["PENDING", "ACCEPTED", "CANCELLED"];
    case "REJECTED":
      return ["PENDING", "CANCELLED"];
  }
}

/** UTC (ms) da meia-noite de Fortaleza do dia da referência. */
function meiaNoiteLocal(referencia: Date): number {
  const deslocado = referencia.getTime() + DESLOCAMENTO_DO_FUSO_MIN * MINUTO;
  return Math.floor(deslocado / DIA) * DIA - DESLOCAMENTO_DO_FUSO_MIN * MINUTO;
}

/** Ativos: de 30 a 240 min antes. Concluídos e cancelado: de 1 a 6 dias antes, entre 11 h e 21 h locais. */
function minutosAtras(
  semente: string,
  chave: string,
  referencia: Date,
  ativo: boolean,
): number {
  if (ativo) return 30 + sorteio(`${semente}:${chave}:minutos`, 211);
  const dias = 1 + sorteio(`${semente}:${chave}:dia`, 6);
  const minutoDoDia = 11 * 60 + sorteio(`${semente}:${chave}:hora`, 600);
  const alvo = meiaNoiteLocal(referencia) - dias * DIA + minutoDoDia * MINUTO;
  return Math.round((referencia.getTime() - alvo) / MINUTO);
}

function itensDoPedido(
  semente: string,
  chave: string,
  loja: LojaDemo,
): readonly ItemDemo[] {
  const produtos = loja.produtos;
  const quantos = 1 + sorteio(`${semente}:${chave}:quantos`, 3);
  const itens: ItemDemo[] = [];
  const usados = new Set<string>();
  for (let k = 0; itens.length < quantos && k < 24; k++) {
    const produto = produtos[sorteio(`${semente}:${chave}:produto:${k}`, produtos.length)]!;
    if (usados.has(produto.chave)) continue;
    usados.add(produto.chave);
    itens.push([
      produto.chave,
      1 + sorteio(`${semente}:${chave}:qtd:${k}`, loja.ehComida ? 3 : 2),
      sorteio(`${semente}:${chave}:variante:${k}`, 8),
    ]);
  }
  return itens;
}

function montarPedidos(
  semente: string,
  referencia: Date,
  chaveDaLoja: string,
  loja: LojaDemo,
  ehProva: boolean,
): readonly PedidoDoRoteiro[] {
  const formas: readonly Forma[] = loja.nova?.formas ?? ["DELIVERY", "PICKUP"];
  const formasDePagamento =
    (loja.pagamento["formas"] as readonly PedidoDemo["pagamento"][] | undefined) ?? ["PIX"];
  const clientes = loja.clientes!;
  return statusDosPedidos(formas).map((status, posicao) => {
    const k = posicao + 1;
    const chave = chaveDoPedido(chaveDaLoja, k);
    const ativo = posicao < 6;
    let entrega: Forma;
    if (status === "READY_FOR_PICKUP") entrega = "PICKUP";
    else if (status === "OUT_FOR_DELIVERY") entrega = "DELIVERY";
    else if (formas.length === 1) entrega = formas[0]!;
    else entrega = sorteio(`${semente}:${chave}:entrega`, 3) === 0 ? "PICKUP" : "DELIVERY";

    // O pedido-prova: 1º concluído da Cozinha do Benfica, entregue em casa.
    const prova = ehProva && k === 7;
    if (prova) entrega = "DELIVERY";
    const itens: readonly ItemDemo[] = prova
      ? [["marmita-frango-grelhado", 2, 0, ["ovo-frito"]]]
      : itensDoPedido(semente, chave, loja);

    const pedido: PedidoDemo = {
      status,
      minutosAtras: minutosAtras(semente, chave, referencia, ativo),
      cliente: clientes[sorteio(`${semente}:${chave}:cliente`, clientes.length)]!.chave,
      entrega,
      pagamento:
        formasDePagamento[sorteio(`${semente}:${chave}:pagamento`, formasDePagamento.length)]!,
      itens,
      ...(status === "CANCELLED"
        ? {
            observacao:
              MOTIVOS_DE_CANCELAMENTO[
                sorteio(`${semente}:${chave}:motivo`, MOTIVOS_DE_CANCELAMENTO.length)
              ],
          }
        : {}),
    };
    return { chave, pedido, numero: 1000 + k };
  });
}

/** Frete como `plantarPedidos` o calcula. */
export function freteDoPedido(
  loja: LojaDemo,
  entrega: Forma,
  subtotal: number,
): number {
  const taxa = Number(loja.entrega["taxaPadraoCents"] ?? 0);
  const gratisAcima = loja.entrega["gratisAcimaDeCents"] as number | null;
  if (entrega === "PICKUP") return 0;
  if (gratisAcima !== null && subtotal >= gratisAcima) return 0;
  return taxa;
}

/** Subtotal de itens sem eixo (o que a prova usa): (preço + acréscimos) × quantidade. */
export function subtotalSimples(loja: LojaDemo, itens: readonly ItemDemo[]): number {
  let soma = 0;
  for (const [chave, quantidade, , extras] of itens) {
    const produto = loja.produtos.find((p) => p.chave === chave)!;
    if (produto.eixos !== undefined) {
      throw new Error(`subtotalSimples: ${chave} tem eixo`);
    }
    const acrescimo = (produto.grupos ?? [])
      .filter((g) => g.kind !== "INGREDIENT")
      .flatMap((g) => g.opcoes)
      .filter((o) => extras?.includes(o.chave) === true)
      .reduce((s, o) => s + (o.acrescimo ?? 0), 0);
    soma += ((produto.promo ?? produto.preco) + acrescimo) * quantidade;
  }
  return soma;
}

/** O total do pedido-prova, calculado no plano (deve dar 5100). */
export function totalDaProva(plano: PlanoDoPerfil): number {
  const loja = plano.lojas[0]!;
  const prova = loja.pedidos.find((p) => p.numero === 1007)!.pedido;
  const subtotal = subtotalSimples(loja.loja, prova.itens);
  return subtotal + freteDoPedido(loja.loja, prova.entrega, subtotal);
}

/** O id do pedido-prova (K = 7 da loja 000). */
export const CHAVE_DO_PEDIDO_PROVA = chaveDoPedido(chaveDaLoja(0), 7);

// ---------------------------------------------------------------------------
// A loja (D-4)
// ---------------------------------------------------------------------------

function montarLoja(
  semente: string,
  referencia: Date,
  indice: number,
  bairro: readonly [string, string],
): PlanoDaLoja {
  const modelo = LOJAS_NOVAS[indice % LOJAS_NOVAS.length]!;
  const nova = modelo.nova!;
  const chave = chaveDaLoja(indice);
  const [nomeDoBairro, artigo] = bairro;
  const tipo = TIPO_DO_NOME[nova.ramo] ?? "Loja";
  const nome = `${tipo} ${artigo} ${nomeDoBairro}`;
  const apelido = apelidoDe(nome);
  const ehProva = indice === 0;

  const { stories: _stories, pedidos: _pedidos, nova: _nova, clientes: _clientes, ...resto } =
    modelo;
  const clientes = clientesGerados({ ...modelo, chave: `${semente}:${chave}` }).filter(
    (c: ClienteDemo) => c.chave !== CHAVE_DA_CLIENTE_DE_TESTE,
  );

  const telefone = `+55859${String(70_000_000 + indice * 7919 + sorteio(`${semente}:fone:${chave}`, 7000)).padStart(8, "0")}`;
  const lat = -3.7319 + (sorteio(`${semente}:lat:${chave}`, 2001) - 1000) / 20_000;
  const lng = -38.5267 + (sorteio(`${semente}:lng:${chave}`, 2001) - 1000) / 20_000;
  const rua = RUAS[sorteio(`${semente}:rua:${chave}`, RUAS.length)]!;
  const cep = `60${String(100_000 + sorteio(`${semente}:cep:${chave}`, 899_999)).slice(0, 6)}`;

  const aprovadaEm = new Date(
    referencia.getTime() - (20 + sorteio(`${semente}:aprovada:${chave}`, 10)) * DIA,
  );

  const base: LojaDemo = {
    ...resto,
    chave,
    nova: {
      apelido,
      nome,
      ramo: nova.ramo,
      dono: {
        nome: `Responsável ${nome}`,
        email: `dono@${apelido}.simulacao.test`,
      },
      ...(nova.formas === undefined ? {} : { formas: nova.formas }),
    },
    coordenadas: { lat, lng },
    capa: true,
    pasta: `simulacao/${apelido}`,
    iniciais: iniciaisDe(nome),
    sobre: `${nome} é uma loja do perfil de simulação do SimpleClick, em ${nomeDoBairro}, Fortaleza/CE. ${modelo.chamada}.`,
    whatsapp: telefone,
    telefone,
    email: `contato@${apelido}.simulacao.test`,
    endereco: {
      rua,
      numero: String(10 + sorteio(`${semente}:numero:${chave}`, 4990)),
      bairro: nomeDoBairro,
      cidade: "Fortaleza",
      uf: "CE",
      cep,
    },
    pagamento: {
      pix: {
        tipo: "EMAIL",
        chave: `pix@${apelido}.simulacao.test`,
        titular: nome,
      },
      formas: modelo.pagamento["formas"],
    },
    horarios: [["00:00", "00:00"]],
    entrega: ehProva
      ? {
          ...modelo.entrega,
          taxaPadraoCents: 500,
          gratisAcimaDeCents: 10_000,
          minimoEntregaCents: 2000,
        }
      : modelo.entrega,
    clientes,
  };
  const catalogo = moldarCatalogo(modelo, semente, chave, base, ehProva);
  const loja: LojaDemo = {
    ...base,
    categorias: catalogo.categorias,
    produtos: catalogo.produtos,
  };

  // O atacado vai num produto de preço único (sem eixo): com variações de preço
  // diferentes o cartão da vitrine não tem preço de varejo, e a faixa não aparece.
  const candidatos = loja.produtos.filter((p) => p.eixos === undefined);
  const daPrimeira = candidatos.filter((p) => catalogo.daPrimeira.includes(p.chave));
  const entre = daPrimeira.length > 0 ? daPrimeira : candidatos;
  const atacado =
    SEGMENTOS_COM_ATACADO.includes(nova.ramo) && entre.length > 0
      ? { produto: entre[sorteio(`${semente}:atacado:${chave}`, entre.length)]!.chave }
      : null;

  return {
    indice,
    chave,
    codigo: codigoDaLoja(impressaoDoPerfil(semente, referencia), indice),
    modelo: modelo.chave,
    segmento: nova.ramo,
    bairro: nomeDoBairro,
    loja,
    pedidos: montarPedidos(semente, referencia, chave, loja, ehProva),
    atacado,
    criadaEm: new Date(aprovadaEm.getTime() - 2 * DIA),
    aprovadaEm,
  };
}

/** O plano completo: 100 lojas e 1.000 pedidos. */
export function montarPlano(semente: string, referencia: Date): PlanoDoPerfil {
  const bairros = bairrosDoPerfil(semente);
  return {
    semente,
    referencia,
    impressao: impressaoDoPerfil(semente, referencia),
    lojas: bairros.map((bairro, indice) => montarLoja(semente, referencia, indice, bairro)),
  };
}

// ---------------------------------------------------------------------------
// Ids e impressões
// ---------------------------------------------------------------------------

/** Os ids que a carga grava, pelas mesmas regras de `demo/index.ts`. */
export function idsDaLoja(plano: PlanoDaLoja): {
  readonly loja: string;
  readonly categorias: readonly string[];
  readonly produtos: readonly string[];
  readonly clientes: readonly string[];
  readonly pedidos: readonly string[];
} {
  const { chave, loja } = plano;
  return {
    loja: id(`loja:${chave}`),
    categorias: loja.categorias.map((c) => idDaCategoria(chave, c.chave)),
    produtos: loja.produtos.map((p) => id(`produto:${chave}:${p.chave}`)),
    clientes: (loja.clientes ?? []).map((c) => id(`cliente:${chave}:${c.chave}`)),
    pedidos: plano.pedidos.map((p) => id(`pedido:${p.chave}`)),
  };
}

export function todosOsIds(plano: PlanoDoPerfil): readonly string[] {
  return plano.lojas
    .flatMap((l) => {
      const i = idsDaLoja(l);
      return [i.loja, ...i.categorias, ...i.produtos, ...i.clientes, ...i.pedidos];
    })
    .sort();
}

const sha256 = (texto: string): string =>
  createHash("sha256").update(texto).digest("hex");

/**
 * As duas impressões do plano: `ids` (só os ids, ordenados) e `conteudo`
 * (preços, itens, status, datas e nomes por id). Outra semente muda o segundo
 * e não o primeiro.
 */
export function impressoesDoPlano(plano: PlanoDoPerfil): {
  readonly ids: string;
  readonly conteudo: string;
} {
  const conteudo = plano.lojas.map((l) => ({
    loja: l.chave,
    nome: l.loja.nova!.nome,
    bairro: l.bairro,
    produtos: l.loja.produtos.map((p) => ({
      chave: p.chave,
      nome: p.nome,
      categoria: p.categoria,
      preco: p.preco,
      promo: p.promo ?? null,
      custo: p.custo,
      opcoes: (p.eixos ?? []).flatMap((e) => e.opcoes.map((o) => o.preco ?? null)),
      descricao: p.descricao,
    })),
    atacado: l.atacado,
    pedidos: l.pedidos.map((p) => ({
      chave: p.chave,
      status: p.pedido.status,
      entrega: p.pedido.entrega,
      pagamento: p.pedido.pagamento,
      cliente: p.pedido.cliente,
      itens: p.pedido.itens,
      colocadoEm: new Date(
        plano.referencia.getTime() - p.pedido.minutosAtras * MINUTO,
      ).toISOString(),
      motivo: p.pedido.observacao ?? null,
    })),
  }));
  return {
    ids: sha256(todosOsIds(plano).join("\n")),
    conteudo: sha256(JSON.stringify(conteudo)),
  };
}

// ---------------------------------------------------------------------------
// Imagens esperadas
// ---------------------------------------------------------------------------

/**
 * Quantas fotos o produto ganha (a principal, mais as extras até o teto de 3):
 * espelha o laço de `plantarProduto`.
 */
export function fotosDoProduto(produto: ProdutoDemo): number {
  const eixoDeCor = produto.eixos?.find((e) => e.opcoes.some((o) => o.cor));
  const base = eixoDeCor ? Math.min(3, eixoDeCor.opcoes.length) : 1;
  return Math.min(3, base + (produto.fotos?.length ?? 0));
}
