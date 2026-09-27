import { randomUUID } from "node:crypto";

export const STATUS_DO_PRODUTO = ["DRAFT", "PUBLISHED"] as const;
export type StatusDoProduto = (typeof STATUS_DO_PRODUTO)[number];

export interface ImagemDoProduto {
  readonly url: string;
  readonly principal: boolean;
}

export interface Produto {
  readonly id: string;
  readonly nome: string;
  readonly descricao: string | null;
  readonly categoriaId: string;
  readonly precoCentavos: number;
  readonly status: StatusDoProduto;
  readonly disponivel: boolean;
  readonly atributos: Readonly<Record<string, unknown>>;
  readonly imagens: readonly ImagemDoProduto[];
  readonly criadoEm: Date;
  readonly atualizadoEm: Date;
  readonly removidoEm: Date | null;
}

export interface EntradaDeProduto {
  readonly id?: string;
  readonly nome: string;
  readonly descricao?: string | null;
  readonly categoriaId: string;
  readonly precoCentavos: number;
  readonly status?: StatusDoProduto;
  readonly disponivel?: boolean;
  readonly atributos?: Readonly<Record<string, unknown>>;
  readonly imagens?: readonly ImagemDoProduto[];
  readonly agora?: Date;
}

export interface AlteracoesDoProduto {
  readonly nome?: string;
  readonly descricao?: string | null;
  readonly categoriaId?: string;
  readonly precoCentavos?: number;
  readonly status?: StatusDoProduto;
  readonly disponivel?: boolean;
  readonly atributos?: Readonly<Record<string, unknown>>;
  readonly imagens?: readonly ImagemDoProduto[];
  readonly agora?: Date;
}

function textoObrigatorio(valor: string, campo: string): string {
  const normalizado = valor.trim();
  if (normalizado === "") throw new Error(`${campo} é obrigatório.`);
  return normalizado;
}

function centavos(valor: number): number {
  if (!Number.isSafeInteger(valor) || valor < 0) {
    throw new Error("O preço deve ser informado em centavos inteiros.");
  }
  return valor;
}

function statusValido(status: StatusDoProduto): StatusDoProduto {
  if (!STATUS_DO_PRODUTO.includes(status)) {
    throw new Error("O status do produto é inválido.");
  }
  return status;
}

function copiarImagens(
  imagens: readonly ImagemDoProduto[] | undefined,
): readonly ImagemDoProduto[] {
  return (imagens ?? []).map((imagem) => ({ ...imagem }));
}

function validarImagens(
  imagens: readonly ImagemDoProduto[] | undefined,
): readonly ImagemDoProduto[] {
  const copiadas = copiarImagens(imagens);
  if (copiadas.filter((imagem) => imagem.principal).length > 1) {
    throw new Error("Um produto pode ter somente uma imagem principal.");
  }
  return copiadas;
}

/** Cria o registro de domínio antes de a camada de persistência publicá-lo. */
export function criarProduto(entrada: EntradaDeProduto): Produto {
  const agora = entrada.agora ?? new Date();
  const status = statusValido(entrada.status ?? "DRAFT");
  return {
    id: entrada.id ?? randomUUID(),
    nome: textoObrigatorio(entrada.nome, "O nome do produto"),
    descricao:
      entrada.descricao === null ? null : (entrada.descricao?.trim() ?? null),
    categoriaId: textoObrigatorio(entrada.categoriaId, "A categoria"),
    precoCentavos: centavos(entrada.precoCentavos),
    status,
    disponivel: entrada.disponivel ?? true,
    atributos: { ...(entrada.atributos ?? {}) },
    imagens: validarImagens(entrada.imagens),
    criadoEm: agora,
    atualizadoEm: agora,
    removidoEm: null,
  };
}

/** Edita somente um produto ainda existente, sem reabrir um removido. */
export function editarProduto(
  produto: Produto,
  alteracoes: AlteracoesDoProduto,
): Produto {
  if (produto.removidoEm !== null) {
    throw new Error("Não é possível editar um produto removido.");
  }
  const agora = alteracoes.agora ?? new Date();
  return {
    ...produto,
    ...(alteracoes.nome === undefined
      ? {}
      : { nome: textoObrigatorio(alteracoes.nome, "O nome do produto") }),
    ...(alteracoes.descricao === undefined
      ? {}
      : {
          descricao:
            alteracoes.descricao === null ? null : alteracoes.descricao.trim(),
        }),
    ...(alteracoes.categoriaId === undefined
      ? {}
      : {
          categoriaId: textoObrigatorio(alteracoes.categoriaId, "A categoria"),
        }),
    ...(alteracoes.precoCentavos === undefined
      ? {}
      : { precoCentavos: centavos(alteracoes.precoCentavos) }),
    ...(alteracoes.status === undefined
      ? {}
      : { status: statusValido(alteracoes.status) }),
    ...(alteracoes.disponivel === undefined
      ? {}
      : { disponivel: alteracoes.disponivel }),
    ...(alteracoes.atributos === undefined
      ? {}
      : { atributos: { ...alteracoes.atributos } }),
    ...(alteracoes.imagens === undefined
      ? {}
      : { imagens: validarImagens(alteracoes.imagens) }),
    atualizadoEm: agora,
  };
}

/**
 * A duplicata nasce rascunho e fora de venda (AC-307): o dono revisa o
 * parecido antes de ele ir ao ar. É a MESMA regra que a rota de duplicar grava
 * no banco — ela importa daqui, e não repete.
 */
export const ESTADO_DA_DUPLICATA = {
  status: "DRAFT",
  disponivel: false,
} as const satisfies { status: StatusDoProduto; disponivel: boolean };

/** O nome da duplicata cabe no limite do nome do produto. */
export function nomeDaDuplicata(nome: string): string {
  return `${nome} (cópia)`.slice(0, 160);
}

/** Copia todos os dados editáveis, mas nunca copia publicação ou remoção. */
export function duplicarProduto(
  produto: Produto,
  opcoes: { readonly id?: string; readonly agora?: Date } = {},
): Produto {
  const agora = opcoes.agora ?? new Date();
  return {
    ...produto,
    id: opcoes.id ?? randomUUID(),
    nome: nomeDaDuplicata(produto.nome),
    status: ESTADO_DA_DUPLICATA.status,
    disponivel: ESTADO_DA_DUPLICATA.disponivel,
    atributos: { ...produto.atributos },
    imagens: copiarImagens(produto.imagens),
    criadoEm: agora,
    atualizadoEm: agora,
    removidoEm: null,
  };
}

/** Remove logicamente: pedidos antigos continuam apontando para o mesmo id. */
export function removerProduto(
  produto: Produto,
  agora: Date = new Date(),
): Produto {
  if (produto.removidoEm !== null) return produto;
  return {
    ...produto,
    status: "DRAFT",
    disponivel: false,
    atualizadoEm: agora,
    removidoEm: agora,
  };
}

/** Regra única de entrada pública; rascunho e removido nunca são publicados. */
export function produtoVisivelNaVitrine(produto: Produto): boolean {
  return (
    produto.removidoEm === null &&
    produto.status === "PUBLISHED" &&
    produto.disponivel
  );
}
