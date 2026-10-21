/**
 * Importador do catálogo WinSIS (card #73): as REGRAS, sem banco e sem disco.
 *
 * Tudo aqui é função pura — o que vira cada linha do arquivo do fornecedor no
 * catálogo da loja. A gravação (`index.ts`) só aplica o plano que sai daqui, e
 * os testes (`mapeamento.test.ts`) cobram as regras que o dono decidiu:
 *
 * - **Preço** igual ao do fornecedor, em centavos inteiros. O mesmo valor fica
 *   guardado como custo (`COST`), para a margem poder entrar depois.
 * - **Estoque 0** entra ESGOTADO: o produto aparece, com controle de estoque
 *   ligado e quantidade 0, e volta sozinho quando a reimportação traz saldo.
 * - **Preço 0** entra OCULTO (rascunho) e vai para o relatório; quando o
 *   fornecedor passa a ter preço, a reimportação publica de novo.
 * - **Categoria** pela palavra do início do nome (`mapa-de-categorias.json`).
 * - **Nome** como o fornecedor escreveu (maiúsculas e ponto final inclusos).
 */

export interface ProdutoWinsis {
  readonly codigo: string;
  readonly referencia: string;
  readonly nome: string;
  readonly preco: number;
  readonly estoque: number;
  readonly marca: string;
  readonly descricao: string;
  readonly sem_foto: boolean;
}

export interface ArquivoWinsis {
  readonly exportadoEm: string | null;
  readonly total: number;
  readonly produtos: readonly ProdutoWinsis[];
}

export class ErroNoArquivo extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = "ErroNoArquivo";
  }
}

function texto(valor: unknown): string {
  if (valor === null || valor === undefined) return "";
  return String(valor).trim();
}

/**
 * Lê o JSON exportado. Linha sem código é recusada aqui (sem ela não há como
 * reimportar sem duplicar); o resto da conferência é por produto, no plano.
 */
export function lerArquivoWinsis(conteudo: string): ArquivoWinsis {
  let bruto: unknown;
  try {
    bruto = JSON.parse(conteudo);
  } catch {
    throw new ErroNoArquivo("O arquivo não é um JSON válido.");
  }
  const raiz = (bruto ?? {}) as Record<string, unknown>;
  if (!Array.isArray(raiz.produtos)) {
    throw new ErroNoArquivo('O arquivo não tem a lista "produtos".');
  }
  const produtos = raiz.produtos.map((linha, indice): ProdutoWinsis => {
    const item = (linha ?? {}) as Record<string, unknown>;
    const codigo = texto(item.codigo);
    if (codigo === "") {
      throw new ErroNoArquivo(`O produto da posição ${indice + 1} não tem código.`);
    }
    return {
      codigo,
      referencia: texto(item.referencia),
      nome: texto(item.nome),
      preco: typeof item.preco === "number" ? item.preco : Number.NaN,
      estoque: typeof item.estoque === "number" ? item.estoque : Number.NaN,
      marca: texto(item.marca),
      descricao: texto(item.descricao),
      sem_foto: item.sem_foto === true,
    };
  });
  return {
    exportadoEm: typeof raiz.exportado_em === "string" ? raiz.exportado_em : null,
    total: typeof raiz.total === "number" ? raiz.total : produtos.length,
    produtos,
  };
}

// ---------------------------------------------------------------------------
// Categoria pelo nome
// ---------------------------------------------------------------------------

export interface CategoriaDoMapa {
  readonly chave: string;
  readonly nome: string;
  readonly descricao: string;
}

export interface MapaDeCategorias {
  readonly categorias: readonly CategoriaDoMapa[];
  readonly outras: string;
  readonly palavrasDeGrupo: readonly string[];
  readonly pares: Readonly<Record<string, string>>;
  readonly palavras: Readonly<Record<string, string>>;
}

/** Confere que toda palavra do mapa aponta para uma categoria que existe. */
export function validarMapa(bruto: unknown): MapaDeCategorias {
  const mapa = bruto as MapaDeCategorias;
  if (!Array.isArray(mapa?.categorias) || mapa.categorias.length === 0) {
    throw new ErroNoArquivo("O mapa de categorias não tem categorias.");
  }
  const chaves = new Set(mapa.categorias.map((c) => c.chave));
  if (!chaves.has(mapa.outras)) {
    throw new ErroNoArquivo(`A categoria "outras" (${mapa.outras}) não está na lista.`);
  }
  for (const regras of [mapa.pares ?? {}, mapa.palavras ?? {}]) {
    for (const [palavra, chave] of Object.entries(regras)) {
      if (!chaves.has(chave)) {
        throw new ErroNoArquivo(`"${palavra}" aponta para a categoria "${chave}", que não existe.`);
      }
    }
  }
  return {
    categorias: mapa.categorias,
    outras: mapa.outras,
    palavrasDeGrupo: mapa.palavrasDeGrupo ?? [],
    pares: mapa.pares ?? {},
    palavras: mapa.palavras ?? {},
  };
}

/**
 * As palavras do nome no formato em que o mapa é escrito: maiúsculas, sem
 * acento, sem "*" ou "(" na frente, sem pontuação no fim e só até a primeira
 * barra ("MOLA/PINO" vale como "MOLA").
 */
export function palavrasDoNome(nome: string): string[] {
  return nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .split(/\s+/)
    .map((palavra) =>
      (palavra.replace(/^[*()]+/, "").split("/")[0] ?? "").replace(/[.,;:)]+$/, ""),
    )
    .filter((palavra) => palavra !== "");
}

export interface CategoriaEscolhida {
  readonly chave: string;
  /** Como foi escolhida: pelo par de palavras, pela palavra ou por exclusão. */
  readonly regra: "par" | "palavra" | "outras";
  /** A palavra (ou o par) que decidiu; vazia em "outras". */
  readonly palavra: string;
}

export function categoriaDoNome(
  nome: string,
  mapa: MapaDeCategorias,
): CategoriaEscolhida {
  let palavras = palavrasDoNome(nome);
  // "KIT AMORT…", "JG JUNTA…": o que diz o sistema do carro é a 2ª palavra.
  if (palavras.length > 1 && mapa.palavrasDeGrupo.includes(palavras[0]!)) {
    palavras = palavras.slice(1);
  }
  const [primeira, segunda] = palavras;
  if (primeira !== undefined && segunda !== undefined) {
    const par = `${primeira} ${segunda}`;
    const chave = mapa.pares[par];
    if (chave !== undefined) return { chave, regra: "par", palavra: par };
  }
  if (primeira !== undefined) {
    const chave = mapa.palavras[primeira];
    if (chave !== undefined) return { chave, regra: "palavra", palavra: primeira };
  }
  return { chave: mapa.outras, regra: "outras", palavra: "" };
}

// ---------------------------------------------------------------------------
// Preço, estoque e situação na vitrine
// ---------------------------------------------------------------------------

/** R$ do fornecedor → centavos inteiros (9.72 → 972). Inválido é recusado. */
export function centavosDoPreco(preco: number): number {
  if (!Number.isFinite(preco) || preco < 0) {
    throw new ErroNoArquivo(`preço inválido (${String(preco)})`);
  }
  const centavos = Math.round(preco * 100);
  if (!Number.isSafeInteger(centavos) || centavos > 999_999_999) {
    throw new ErroNoArquivo(`preço fora do limite (${String(preco)})`);
  }
  return centavos;
}

/**
 * Estoque do fornecedor → quantidade da variação. Negativo (venda além do
 * saldo no ERP) entra como 0, esgotado; fração é arredondada para baixo.
 */
export function quantidadeDoEstoque(estoque: number): {
  readonly quantidade: number;
  readonly aviso: string | null;
} {
  if (!Number.isFinite(estoque)) {
    throw new ErroNoArquivo(`estoque inválido (${String(estoque)})`);
  }
  if (estoque < 0) {
    return { quantidade: 0, aviso: `estoque negativo (${estoque}) entrou como 0` };
  }
  const quantidade = Math.floor(estoque);
  return {
    quantidade: Math.min(quantidade, 2_147_483_647),
    aviso: quantidade === estoque ? null : `estoque fracionado (${estoque}) arredondado para ${quantidade}`,
  };
}

export type StatusDoProduto = "DRAFT" | "PUBLISHED";

/**
 * A situação na vitrine depois da importação.
 *
 * Preço 0 sempre oculta (rascunho) e marca que foi o importador que ocultou.
 * Com preço, o produto novo nasce publicado e o ocultado pelo importador volta
 * a ser publicado; qualquer outro rascunho é decisão do dono e fica como está.
 */
export function situacaoAoImportar(
  precoCentavos: number,
  atual: { readonly status: string; readonly ocultoPorPreco: boolean } | null,
): { readonly status: StatusDoProduto; readonly ocultoPorPreco: boolean } {
  if (precoCentavos === 0) return { status: "DRAFT", ocultoPorPreco: true };
  if (atual === null || atual.ocultoPorPreco) {
    return { status: "PUBLISHED", ocultoPorPreco: false };
  }
  return {
    status: atual.status === "DRAFT" ? "DRAFT" : "PUBLISHED",
    ocultoPorPreco: false,
  };
}

// ---------------------------------------------------------------------------
// Referência, descrição e endereço do produto
// ---------------------------------------------------------------------------

/**
 * "FAC906 (SIMILAR SK959/ACP906/AKX35323)" → referência FAC906 e similares
 * SK959, ACP906, AKX35323. Sem parênteses, a referência é o texto inteiro.
 */
export function separarReferencia(referencia: string): {
  readonly referencia: string;
  readonly similares: readonly string[];
} {
  const limpa = referencia.trim();
  const abre = limpa.indexOf("(");
  if (abre < 0) return { referencia: limpa, similares: [] };
  const fecha = limpa.indexOf(")", abre);
  const dentro = limpa.slice(abre + 1, fecha < 0 ? undefined : fecha);
  const fora = `${limpa.slice(0, abre)} ${fecha < 0 ? "" : limpa.slice(fecha + 1)}`
    .replace(/\s+/g, " ")
    .trim();
  const similares = dentro
    .replace(/^\s*SIMILAR(ES)?\s*:?\s*/i, "")
    .split(/[/,;]|\s+/)
    .map((parte) => parte.trim().replace(/^\*+/, ""))
    .filter((parte) => parte !== "");
  return { referencia: fora, similares: [...new Set(similares)] };
}

/** Apelido do produto no endereço: o nome em minúsculas + o código (único). */
export function apelidoDoProduto(nome: string, codigo: string): string {
  const base = nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/g, "");
  const sufixo = codigo.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return base === "" ? `peca-${sufixo}` : `${base}-${sufixo}`;
}

/** O nome do arquivo de foto: o código sem zeros à esquerda. */
export function nomeDaFoto(codigo: string): string {
  return codigo.trim().replace(/^0+(?=.)/, "");
}

export interface PlanoDoProduto {
  readonly codigo: string;
  readonly nome: string;
  readonly apelido: string;
  readonly descricao: string;
  readonly chamada: string | null;
  readonly categoria: CategoriaEscolhida;
  readonly precoCentavos: number;
  readonly estoque: number;
  readonly marca: string;
  readonly referencia: string;
  readonly similares: readonly string[];
  /** O fornecedor diz que não tem foto (o arquivo pode faltar mesmo sem isso). */
  readonly semFotoNoFornecedor: boolean;
  readonly avisos: readonly string[];
}

/** Até 2.000 caracteres, como o cadastro do painel aceita. */
const LIMITE_DA_DESCRICAO = 2_000;

/**
 * A ficha do produto. A página pública mostra a descrição (as especificações
 * da categoria servem aos filtros), então marca, referência e similares vão
 * nela também, antes do texto do fornecedor.
 */
export function descricaoDoProduto(dados: {
  readonly marca: string;
  readonly referencia: string;
  readonly similares: readonly string[];
  readonly codigo: string;
  readonly descricao: string;
}): string {
  const linhas = [
    dados.marca === "" ? null : `Marca: ${dados.marca}`,
    dados.referencia === "" ? null : `Referência do fabricante: ${dados.referencia}`,
    dados.similares.length === 0 ? null : `Similares: ${dados.similares.join(", ")}`,
    `Código: ${dados.codigo}`,
  ].filter((linha): linha is string => linha !== null);
  const ficha = linhas.join("\n");
  const completa = dados.descricao === "" ? ficha : `${ficha}\n\n${dados.descricao}`;
  return completa.slice(0, LIMITE_DA_DESCRICAO);
}

export function planejarProduto(
  produto: ProdutoWinsis,
  mapa: MapaDeCategorias,
): PlanoDoProduto {
  const nome = produto.nome.replace(/\s+/g, " ").trim();
  if (nome === "") throw new ErroNoArquivo("produto sem nome");
  if (nome.length > 160) throw new ErroNoArquivo("nome com mais de 160 caracteres");
  const precoCentavos = centavosDoPreco(produto.preco);
  const estoque = quantidadeDoEstoque(produto.estoque);
  const { referencia, similares } = separarReferencia(produto.referencia);
  const avisos: string[] = [];
  if (estoque.aviso !== null) avisos.push(estoque.aviso);
  // Entra como os outros (a decisão é do dono), mas vai para o relatório.
  if (/BLOQUEAD/i.test(nome)) avisos.push("o nome diz que está bloqueado para venda");
  const chamada = [produto.marca, referencia === "" ? "" : `Ref. ${referencia}`]
    .filter((parte) => parte !== "")
    .join(" · ");
  return {
    codigo: produto.codigo,
    nome,
    apelido: apelidoDoProduto(nome, produto.codigo),
    descricao: descricaoDoProduto({
      marca: produto.marca,
      referencia,
      similares,
      codigo: produto.codigo,
      descricao: produto.descricao,
    }),
    chamada: chamada === "" ? null : chamada.slice(0, 160),
    categoria: categoriaDoNome(nome, mapa),
    precoCentavos,
    estoque: estoque.quantidade,
    marca: produto.marca,
    referencia,
    similares,
    semFotoNoFornecedor: produto.sem_foto,
    avisos,
  };
}

// ---------------------------------------------------------------------------
// Cobertura do mapa
// ---------------------------------------------------------------------------

export interface CoberturaDoMapa {
  readonly total: number;
  readonly porCategoria: readonly { readonly chave: string; readonly nome: string; readonly produtos: number }[];
  /** As palavras iniciais mais comuns entre os que caíram em "Outras peças". */
  readonly palavrasEmOutras: readonly { readonly palavra: string; readonly produtos: number }[];
  /** Os primeiros nomes (mais comuns por palavra) que caíram em "Outras peças". */
  readonly nomesEmOutras: readonly string[];
}

export function coberturaDoMapa(
  nomes: readonly string[],
  mapa: MapaDeCategorias,
  quantos = 50,
): CoberturaDoMapa {
  const contagem = new Map<string, number>(mapa.categorias.map((c) => [c.chave, 0]));
  const emOutras = new Map<string, string[]>();
  for (const nome of nomes) {
    const escolhida = categoriaDoNome(nome, mapa);
    contagem.set(escolhida.chave, (contagem.get(escolhida.chave) ?? 0) + 1);
    if (escolhida.regra === "outras") {
      const palavras = palavrasDoNome(nome);
      const chave =
        palavras.length > 1 && mapa.palavrasDeGrupo.includes(palavras[0]!)
          ? `${palavras[0]} ${palavras[1]}`
          : (palavras[0] ?? "(vazio)");
      emOutras.set(chave, [...(emOutras.get(chave) ?? []), nome]);
    }
  }
  const palavras = [...emOutras.entries()]
    .map(([palavra, lista]) => ({ palavra, produtos: lista.length, lista }))
    .sort((a, b) => b.produtos - a.produtos || a.palavra.localeCompare(b.palavra));
  const nomesEmOutras: string[] = [];
  // Um nome de cada palavra por vez: os 50 cobrem o máximo de palavras.
  for (let rodada = 0; nomesEmOutras.length < quantos; rodada++) {
    let algum = false;
    for (const grupo of palavras) {
      const nome = grupo.lista[rodada];
      if (nome === undefined) continue;
      algum = true;
      nomesEmOutras.push(nome);
      if (nomesEmOutras.length >= quantos) break;
    }
    if (!algum) break;
  }
  return {
    total: nomes.length,
    porCategoria: mapa.categorias
      .map((c) => ({ chave: c.chave, nome: c.nome, produtos: contagem.get(c.chave) ?? 0 }))
      .sort((a, b) => b.produtos - a.produtos),
    palavrasEmOutras: palavras.map(({ palavra, produtos }) => ({ palavra, produtos })),
    nomesEmOutras,
  };
}
