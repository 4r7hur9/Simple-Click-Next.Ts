/**
 * Importador do catálogo WinSIS (card #73) — UniversoKar Distribuidora.
 *
 * Lê o JSON exportado do fornecedor e deixa o catálogo da loja igual a ele,
 * chaveado pelo CÓDIGO do fornecedor (que vira o código da variação, `sku`):
 *
 * - **Idempotente.** Rodar de novo atualiza nome, marca, referência, preço,
 *   estoque, categoria e foto; o que não mudou não é regravado (nem mexe na
 *   versão do catálogo). A foto só é reenviada quando o arquivo mudou (SHA-256).
 * - **Não apaga.** Produto que sumiu do arquivo só aparece no relatório.
 *   Produto que o dono removeu no painel não é recriado.
 * - **Lotes.** Uma transação por lote (padrão 200 produtos); lote que falha é
 *   refeito produto a produto, e só o produto com problema fica de fora, com
 *   o código e o motivo no relatório. Fotos com concorrência limitada.
 * - **Credencial de administração** (`sc_admin`), como a carga de
 *   demonstração: cada escrita atravessa as políticas e as travas do banco
 *   (limite de produtos, uma categoria principal, preço em centavos, estoque
 *   não negativo, código único por loja).
 * - **Nunca em produção**: as fotos vão para `apps/web/public/demo/<loja>/`.
 *
 * Uso (na raiz): `pnpm --filter @simpleclick/database importar:winsis -- [opções]`
 *   --arquivo <json>        padrão: ~/Documents/winsis-export/dados/winsis-produtos-2026-10-18-14-30-43.json
 *   --fotos <pasta>         padrão: ~/Documents/winsis-export/dados/fotos
 *   --loja <apelido>        padrão: universokar (criada se não existir)
 *   --dry-run               não grava nada: mostra o que faria e gera o relatório
 *   --limit N               só os N primeiros (depois do filtro de códigos)
 *   --apenas-codigos a,b,c  só estes códigos
 *   --lote N                produtos por transação (padrão 200)
 *   --concorrencia N        fotos ao mesmo tempo (padrão 8)
 * Relatório: .rmcode/importacao-winsis/ (fora do git).
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { type ClienteSql, derivarUrlDePapel } from "../../src/migrate.ts";
import { exigirAmbienteQueNaoEProducao } from "../index.ts";
import {
  type DestinoDasFotos,
  destinoNoDisco,
  emParalelo,
  type FotoLida,
  indiceDeFotos,
  lerFoto,
} from "./fotos.ts";
import {
  acharLoja,
  type ChaveDaEspecificacao,
  garantirCategorias,
  garantirUniversoKar,
  idWinsis,
  LOJA_UNIVERSOKAR,
} from "./loja.ts";
import {
  type CoberturaDoMapa,
  coberturaDoMapa,
  lerArquivoWinsis,
  type MapaDeCategorias,
  nomeDaFoto,
  type PlanoDoProduto,
  planejarProduto,
  situacaoAoImportar,
  validarMapa,
} from "./mapeamento.ts";

const RAIZ = fileURLToPath(new URL("../../../../", import.meta.url));
const DADOS = join(homedir(), "Documents", "winsis-export", "dados");
export const ARQUIVO_PADRAO = join(DADOS, "winsis-produtos-2026-10-18-14-30-43.json");
export const FOTOS_PADRAO = join(DADOS, "fotos");
const MAPA = fileURLToPath(new URL("./mapa-de-categorias.json", import.meta.url));
const PASTA_DO_RELATORIO = join(RAIZ, ".rmcode", "importacao-winsis");

// ---------------------------------------------------------------------------
// Opções
// ---------------------------------------------------------------------------

export interface OpcoesDaImportacao {
  readonly arquivo: string;
  readonly fotos: string;
  readonly loja: string;
  readonly simular: boolean;
  readonly limite: number | null;
  readonly codigos: readonly string[] | null;
  readonly lote: number;
  readonly concorrencia: number;
}

export function lerOpcoes(argumentos: readonly string[]): OpcoesDaImportacao {
  const valor = (nome: string): string | undefined => {
    const indice = argumentos.indexOf(nome);
    if (indice < 0) return undefined;
    const proximo = argumentos[indice + 1];
    if (proximo === undefined || proximo.startsWith("--")) {
      throw new Error(`A opção ${nome} precisa de um valor.`);
    }
    return proximo;
  };
  const inteiro = (nome: string, padrao: number | null): number | null => {
    const bruto = valor(nome);
    if (bruto === undefined) return padrao;
    const numero = Number(bruto);
    if (!Number.isInteger(numero) || numero < 1) {
      throw new Error(`A opção ${nome} precisa de um número inteiro positivo.`);
    }
    return numero;
  };
  const conhecidas = new Set([
    "--arquivo", "--fotos", "--loja", "--dry-run", "--limit", "--apenas-codigos", "--lote", "--concorrencia",
  ]);
  for (const argumento of argumentos) {
    if (argumento.startsWith("--") && !conhecidas.has(argumento)) {
      throw new Error(`Opção desconhecida: ${argumento}`);
    }
  }
  const codigos = valor("--apenas-codigos");
  return {
    arquivo: resolve(valor("--arquivo") ?? ARQUIVO_PADRAO),
    fotos: resolve(valor("--fotos") ?? FOTOS_PADRAO),
    loja: valor("--loja") ?? LOJA_UNIVERSOKAR.apelido,
    simular: argumentos.includes("--dry-run"),
    limite: inteiro("--limit", null),
    codigos:
      codigos === undefined
        ? null
        : codigos.split(",").map((c) => c.trim()).filter((c) => c !== ""),
    lote: inteiro("--lote", 200) ?? 200,
    concorrencia: inteiro("--concorrencia", 8) ?? 8,
  };
}

// ---------------------------------------------------------------------------
// O que já está no banco
// ---------------------------------------------------------------------------

interface ProdutoNoBanco {
  readonly produtoId: string;
  readonly varianteId: string;
  readonly nome: string;
  readonly apelido: string;
  readonly descricao: string | null;
  readonly chamada: string | null;
  readonly status: string;
  readonly removido: boolean;
  readonly atributos: Record<string, unknown>;
  readonly estoque: number | null;
  readonly controlaEstoque: boolean;
  readonly categoriaId: string | null;
  readonly base: { readonly id: string; readonly valor: number } | null;
  readonly custo: { readonly id: string; readonly valor: number } | null;
  readonly foto: {
    readonly imagemId: string;
    readonly arquivoId: string | null;
    readonly sha256: string | null;
    readonly chave: string | null;
  } | null;
  /** Valores das especificações do importador: definição → texto. */
  readonly valores: ReadonlyMap<string, string>;
}

async function lerCatalogoDaLoja(
  cliente: ClienteSql,
  lojaId: string,
): Promise<Map<string, ProdutoNoBanco>> {
  const resultado = await cliente.query(
    `SELECT v.sku, v.id::text AS variante_id, v.stock_quantity,
            p.id::text AS produto_id, p.name, p.slug, p.description, p.short_description,
            p.status, p.attributes, p.track_stock, (p.deleted_at IS NOT NULL) AS removido,
            (SELECT pc.category_id::text FROM app.product_categories pc
              WHERE pc.product_id = p.id AND pc.is_primary) AS categoria_id,
            (SELECT jsonb_object_agg(pp.kind, jsonb_build_object('id', pp.id, 'valor', pp.amount_cents))
               FROM app.product_prices pp
              WHERE pp.product_id = p.id AND pp.kind IN ('BASE', 'COST')
                AND pp.min_quantity = 1 AND pp.is_active
                AND pp.starts_at IS NULL AND pp.ends_at IS NULL) AS precos,
            (SELECT jsonb_build_object('imagem', pi.id, 'arquivo', a.id,
                                       'sha', encode(a.sha256, 'hex'), 'chave', a.storage_key)
               FROM app.product_images pi LEFT JOIN app.assets a ON a.id = pi.asset_id
              WHERE pi.product_id = p.id AND pi.is_primary) AS foto,
            (SELECT jsonb_object_agg(pa.definition_id, pa.value_text)
               FROM app.product_attributes pa WHERE pa.product_id = p.id) AS valores
       FROM app.product_variants v
       JOIN app.products p ON p.id = v.product_id
      WHERE v.store_id = $1 AND v.sku IS NOT NULL AND v.deleted_at IS NULL`,
    [lojaId],
  );
  const catalogo = new Map<string, ProdutoNoBanco>();
  for (const linha of resultado.rows) {
    const precos = (linha.precos ?? {}) as Record<string, { id: string; valor: number | string }>;
    const foto = linha.foto as { imagem: string; arquivo: string | null; sha: string | null; chave: string | null } | null;
    const preco = (kind: string) =>
      precos[kind] === undefined ? null : { id: String(precos[kind].id), valor: Number(precos[kind].valor) };
    catalogo.set(String(linha.sku), {
      produtoId: String(linha.produto_id),
      varianteId: String(linha.variante_id),
      nome: String(linha.name),
      apelido: String(linha.slug),
      descricao: linha.description === null ? null : String(linha.description),
      chamada: linha.short_description === null ? null : String(linha.short_description),
      status: String(linha.status),
      removido: linha.removido === true,
      atributos: (linha.attributes ?? {}) as Record<string, unknown>,
      estoque: linha.stock_quantity === null ? null : Number(linha.stock_quantity),
      controlaEstoque: linha.track_stock === true,
      categoriaId: linha.categoria_id === null ? null : String(linha.categoria_id),
      base: preco("BASE"),
      custo: preco("COST"),
      foto:
        foto === null
          ? null
          : { imagemId: String(foto.imagem), arquivoId: foto.arquivo, sha256: foto.sha, chave: foto.chave },
      valores: new Map(Object.entries((linha.valores ?? {}) as Record<string, string>)),
    });
  }
  return catalogo;
}

// ---------------------------------------------------------------------------
// Decisão por produto
// ---------------------------------------------------------------------------

type SituacaoDaFoto =
  | "nova"
  | "trocada"
  | "igual"
  | "sem-foto-no-fornecedor"
  | "arquivo-faltando"
  | "mantida-sem-arquivo"
  | "invalida";

interface Decisao {
  readonly plano: PlanoDoProduto;
  readonly atual: ProdutoNoBanco | null;
  readonly acao: "criar" | "atualizar" | "sem-mudanca" | "removido-pelo-dono";
  readonly mudancas: readonly string[];
  readonly status: "DRAFT" | "PUBLISHED";
  readonly ocultoPorPreco: boolean;
  readonly categoriaId: string;
  readonly atributos: Record<string, unknown>;
  readonly valores: ReadonlyMap<string, string>;
  readonly foto: FotoLida | null;
  readonly situacaoDaFoto: SituacaoDaFoto;
}

/** A parte do `attributes` que é do importador (o resto é do dono). */
function atributosDoImportador(plano: PlanoDoProduto, ocultoPorPreco: boolean): Record<string, unknown> {
  return {
    marca: plano.marca,
    referencia: plano.referencia,
    similares: [...plano.similares],
    codigoDoFornecedor: plano.codigo,
    origem: "winsis",
    ocultoPorPreco,
  };
}

function valoresDasEspecificacoes(
  plano: PlanoDoProduto,
  definicoes: ReadonlyMap<ChaveDaEspecificacao, string>,
): Map<string, string> {
  const valores = new Map<string, string>();
  const textos: Record<ChaveDaEspecificacao, string> = {
    marca: plano.marca,
    referencia: plano.referencia,
    similares: plano.similares.join(", "),
    codigo: plano.codigo,
  };
  for (const [chave, definicaoId] of definicoes) {
    const texto = textos[chave].slice(0, 500);
    if (texto !== "") valores.set(definicaoId, texto);
  }
  return valores;
}

const mesmoJson = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

function decidir(
  plano: PlanoDoProduto,
  atual: ProdutoNoBanco | null,
  contexto: {
    readonly ramo: string;
    readonly categorias: ReadonlyMap<string, string>;
    readonly especificacoes: ReadonlyMap<string, ReadonlyMap<ChaveDaEspecificacao, string>>;
    readonly todasAsDefinicoes: ReadonlySet<string>;
  },
  foto: FotoLida | null,
  situacaoDoArquivo: "ok" | "faltando" | "invalida",
): Decisao {
  const categoriaId = contexto.categorias.get(plano.categoria.chave)!;
  const situacao = situacaoAoImportar(
    plano.precoCentavos,
    atual === null ? null : { status: atual.status, ocultoPorPreco: atual.atributos.ocultoPorPreco === true },
  );
  // Os campos de autopeças conhecidos (marca) vão como texto, como o painel valida.
  const atributos = {
    ...(atual?.atributos ?? {}),
    ...atributosDoImportador(plano, situacao.ocultoPorPreco),
  };
  const valores = valoresDasEspecificacoes(plano, contexto.especificacoes.get(plano.categoria.chave)!);

  let situacaoDaFoto: SituacaoDaFoto;
  if (situacaoDoArquivo === "invalida") situacaoDaFoto = "invalida";
  else if (foto === null) {
    situacaoDaFoto = atual?.foto != null
      ? "mantida-sem-arquivo"
      : plano.semFotoNoFornecedor
        ? "sem-foto-no-fornecedor"
        : "arquivo-faltando";
  } else if (atual?.foto == null) situacaoDaFoto = "nova";
  else situacaoDaFoto = atual.foto.sha256 === foto.sha256 ? "igual" : "trocada";

  const base = {
    plano,
    atual,
    status: situacao.status,
    ocultoPorPreco: situacao.ocultoPorPreco,
    categoriaId,
    atributos,
    valores,
    foto,
    situacaoDaFoto,
  };
  if (atual === null) return { ...base, acao: "criar", mudancas: [] };
  if (atual.removido) return { ...base, acao: "removido-pelo-dono", mudancas: [] };

  const mudancas: string[] = [];
  if (atual.nome !== plano.nome) mudancas.push("nome");
  if (atual.apelido !== plano.apelido) mudancas.push("endereço");
  if (atual.descricao !== plano.descricao || atual.chamada !== plano.chamada) mudancas.push("descrição");
  if (atual.status !== situacao.status) mudancas.push(situacao.status === "DRAFT" ? "ocultado (preço 0)" : "publicado");
  if (!mesmoJson(atual.atributos, atributos)) mudancas.push("marca/referência");
  if (atual.categoriaId !== categoriaId) mudancas.push("categoria");
  if (atual.base?.valor !== plano.precoCentavos) mudancas.push("preço");
  if (atual.custo?.valor !== plano.precoCentavos) mudancas.push("custo");
  if (atual.estoque !== plano.estoque || !atual.controlaEstoque) mudancas.push("estoque");
  const valoresAtuais = new Map(
    [...atual.valores].filter(([definicao]) => contexto.todasAsDefinicoes.has(definicao)),
  );
  if (!mesmoJson([...valoresAtuais].sort(), [...valores].sort())) mudancas.push("especificações");
  if (situacaoDaFoto === "nova" || situacaoDaFoto === "trocada") mudancas.push("foto");
  return { ...base, acao: mudancas.length === 0 ? "sem-mudanca" : "atualizar", mudancas };
}

// ---------------------------------------------------------------------------
// Gravação
// ---------------------------------------------------------------------------

type Valor = string | number | boolean | Date | Buffer | null;
type Linha = Readonly<Record<string, Valor>>;

/**
 * Insere ou atualiza várias linhas numa instrução só. Na atualização só as
 * colunas de `atualizar` são reescritas: o resto é do dono (ordem, destaque,
 * feed) ou nasce uma vez (criação).
 */
async function gravarVarias(
  cliente: ClienteSql,
  tabela: string,
  linhas: readonly Linha[],
  conflito: { readonly chave: readonly string[]; readonly atualizar: readonly string[] },
): Promise<void> {
  if (linhas.length === 0) return;
  const colunas = Object.keys(linhas[0]!);
  const valores: Valor[] = [];
  const tuplas = linhas.map((linha) => {
    const marcadores = colunas.map((coluna) => {
      valores.push(linha[coluna] ?? null);
      return `$${valores.length}`;
    });
    return `(${marcadores.join(", ")})`;
  });
  const acao =
    conflito.atualizar.length === 0
      ? "DO NOTHING"
      : `DO UPDATE SET ${conflito.atualizar.map((c) => `"${c}" = EXCLUDED."${c}"`).join(", ")}, updated_at = now()`;
  await cliente.query(
    `INSERT INTO app.${tabela} (${colunas.map((c) => `"${c}"`).join(", ")})
     VALUES ${tuplas.join(", ")}
     ON CONFLICT (${conflito.chave.map((c) => `"${c}"`).join(", ")}) ${acao}`,
    valores,
  );
}

interface ContextoDaGravacao {
  readonly cliente: ClienteSql;
  readonly lojaId: string;
  readonly donoId: string | null;
  readonly ramo: string;
  readonly destino: DestinoDasFotos;
  readonly todasAsDefinicoes: readonly string[];
  readonly motivoDoEstoque: string;
  /** Ordem do produto novo na vitrine: a posição no arquivo. */
  readonly ordem: ReadonlyMap<string, number>;
}

interface FotoParaGravar {
  readonly decisao: Decisao;
  readonly guardada: { readonly url: string; readonly chave: string; readonly largura: number | null; readonly altura: number | null };
}

/** Aplica as decisões de um lote (já dentro de uma transação). */
async function aplicar(
  contexto: ContextoDaGravacao,
  decisoes: readonly Decisao[],
  fotos: readonly FotoParaGravar[],
): Promise<void> {
  const { cliente, lojaId } = contexto;
  const idDoProduto = (d: Decisao) => d.atual?.produtoId ?? idWinsis(`produto:${lojaId}:${d.plano.codigo}`);
  const idDaVariante = (d: Decisao) => d.atual?.varianteId ?? idWinsis(`variante:${lojaId}:${d.plano.codigo}`);

  await gravarVarias(
    cliente,
    "products",
    decisoes.map((d) => ({
      id: idDoProduto(d),
      store_id: lojaId,
      name: d.plano.nome,
      slug: d.plano.apelido,
      description: d.plano.descricao,
      short_description: d.plano.chamada,
      product_type: "SIMPLE",
      vertical_code: contexto.ramo,
      vertical_schema_version: 1,
      status: d.status,
      is_available: true,
      unit_label: "un",
      track_stock: true,
      sort_order: 1000 + (contexto.ordem.get(d.plano.codigo) ?? 0),
      is_featured: false,
      publish_to_feed: false,
      attributes: JSON.stringify(d.atributos),
      price_min_cents: d.plano.precoCentavos,
      price_max_cents: d.plano.precoCentavos,
      display_price_cents: d.plano.precoCentavos,
      has_variants: false,
      seo_title: d.plano.nome.slice(0, 160),
      seo_description: d.plano.chamada,
      created_by: contexto.donoId,
    })),
    {
      chave: ["id"],
      atualizar: [
        "name", "slug", "description", "short_description", "status", "track_stock", "attributes",
        "price_min_cents", "price_max_cents", "display_price_cents", "seo_title", "seo_description",
      ],
    },
  );

  // Categoria principal: só quem é novo ou trocou de seção. A principal antiga
  // sai antes, para o índice de "uma principal por produto" nunca ver duas.
  const trocaram = decisoes.filter((d) => d.atual === null || d.atual.categoriaId !== d.categoriaId);
  const comPrincipalAntiga = trocaram.filter((d) => d.atual?.categoriaId != null).map(idDoProduto);
  if (comPrincipalAntiga.length > 0) {
    await cliente.query(
      "DELETE FROM app.product_categories WHERE store_id = $1 AND product_id = ANY($2::uuid[]) AND is_primary",
      [lojaId, comPrincipalAntiga],
    );
  }
  await gravarVarias(
    cliente,
    "product_categories",
    trocaram.map((d) => ({
      id: idWinsis(`produto-categoria:${idDoProduto(d)}:${d.categoriaId}`),
      store_id: lojaId,
      product_id: idDoProduto(d),
      category_id: d.categoriaId,
      sort_order: contexto.ordem.get(d.plano.codigo) ?? 0,
      is_primary: true,
    })),
    { chave: ["store_id", "product_id", "category_id"], atualizar: ["is_primary"] },
  );

  // A variação única guarda o código do fornecedor e o estoque.
  await gravarVarias(
    cliente,
    "product_variants",
    decisoes.map((d) => ({
      id: idDaVariante(d),
      store_id: lojaId,
      product_id: idDoProduto(d),
      name: "Único",
      sku: d.plano.codigo,
      stock_quantity: d.plano.estoque,
      stock_reserved: 0,
      is_default: true,
      is_available: true,
      sort_order: 0,
      deleted_at: null,
    })),
    { chave: ["id"], atualizar: ["stock_quantity"] },
  );
  const movimentos = decisoes
    .map((d) => ({ d, antes: d.atual?.estoque ?? 0 }))
    .filter(({ d, antes }) => antes !== d.plano.estoque);
  await gravarVarias(
    cliente,
    "stock_movements",
    movimentos.map(({ d, antes }) => ({
      store_id: lojaId,
      variant_id: idDaVariante(d),
      quantity_before: antes,
      quantity_delta: d.plano.estoque - antes,
      quantity_after: d.plano.estoque,
      reason: contexto.motivoDoEstoque,
      origin: "IMPORTACAO",
      actor_id: null,
    })),
    { chave: ["id"], atualizar: [] },
  );

  // Preço do fornecedor (BASE) e o mesmo valor como custo (COST).
  await gravarVarias(
    cliente,
    "product_prices",
    decisoes.flatMap((d) => [
      {
        id: d.atual?.base?.id ?? idWinsis(`preco:${idDaVariante(d)}:BASE`),
        store_id: lojaId,
        product_id: idDoProduto(d),
        variant_id: idDaVariante(d),
        kind: "BASE",
        label: "Preço",
        amount_cents: d.plano.precoCentavos,
        min_quantity: 1,
        currency: "BRL",
        sort_order: 0,
        is_active: true,
      },
      {
        id: d.atual?.custo?.id ?? idWinsis(`preco:${idDaVariante(d)}:COST`),
        store_id: lojaId,
        product_id: idDoProduto(d),
        variant_id: idDaVariante(d),
        kind: "COST",
        label: "Preço do fornecedor",
        amount_cents: d.plano.precoCentavos,
        min_quantity: 1,
        currency: "BRL",
        sort_order: 1,
        is_active: true,
      },
    ]),
    { chave: ["id"], atualizar: ["amount_cents"] },
  );

  // Especificações: as do importador são regravadas; as do dono ficam.
  const comValores = decisoes.filter((d) => d.atual === null || d.mudancas.includes("especificações"));
  const existentes = comValores.filter((d) => d.atual !== null).map(idDoProduto);
  if (existentes.length > 0) {
    await cliente.query(
      `DELETE FROM app.product_attributes
        WHERE store_id = $1 AND product_id = ANY($2::uuid[]) AND definition_id = ANY($3::uuid[])`,
      [lojaId, existentes, contexto.todasAsDefinicoes],
    );
  }
  await gravarVarias(
    cliente,
    "product_attributes",
    comValores.flatMap((d) =>
      [...d.valores].map(([definicaoId, texto]) => ({
        id: idWinsis(`atributo:${idDoProduto(d)}:${definicaoId}`),
        store_id: lojaId,
        product_id: idDoProduto(d),
        definition_id: definicaoId,
        value_text: texto,
      })),
    ),
    { chave: ["store_id", "product_id", "definition_id"], atualizar: ["value_text"] },
  );

  // Fotos já guardadas (antes da transação): o acervo e a imagem principal.
  await gravarVarias(
    cliente,
    "assets",
    fotos.map(({ decisao: d, guardada }) => ({
      id: d.atual?.foto?.arquivoId ?? idWinsis(`arquivo:${idDoProduto(d)}`),
      store_id: lojaId,
      kind: "PRODUCT_IMAGE",
      status: "READY",
      storage_key: guardada.chave,
      mime_type: `image/${d.foto!.formato}`,
      width: guardada.largura,
      height: guardada.altura,
      byte_size: d.foto!.bytes.byteLength,
      sha256: Buffer.from(d.foto!.sha256, "hex"),
      alt_text: d.plano.nome,
      uploaded_by: contexto.donoId,
    })),
    {
      chave: ["id"],
      atualizar: ["storage_key", "mime_type", "width", "height", "byte_size", "sha256", "alt_text", "status"],
    },
  );
  await gravarVarias(
    cliente,
    "product_images",
    fotos.map(({ decisao: d, guardada }) => ({
      id: d.atual?.foto?.imagemId ?? idWinsis(`imagem:${idDoProduto(d)}`),
      store_id: lojaId,
      product_id: idDoProduto(d),
      asset_id: d.atual?.foto?.arquivoId ?? idWinsis(`arquivo:${idDoProduto(d)}`),
      url: guardada.url,
      alt_text: d.plano.nome,
      is_primary: true,
      sort_order: 0,
      width: guardada.largura,
      height: guardada.altura,
    })),
    { chave: ["id"], atualizar: ["asset_id", "url", "alt_text", "width", "height"] },
  );
}

// ---------------------------------------------------------------------------
// A importação
// ---------------------------------------------------------------------------

export interface ErroDoProduto {
  readonly codigo: string;
  readonly nome: string;
  readonly motivo: string;
}

export interface ResultadoDaImportacao {
  readonly simulacao: boolean;
  readonly loja: { readonly apelido: string; readonly id: string | null; readonly criada: boolean };
  readonly dono: { readonly email: string; readonly senha: string } | null;
  readonly arquivo: { readonly caminho: string; readonly exportadoEm: string | null; readonly total: number };
  readonly selecionados: number;
  readonly destinoDasFotos: string;
  readonly totais: {
    readonly criados: number;
    readonly atualizados: number;
    readonly semMudanca: number;
    readonly removidosPeloDono: number;
    readonly semFoto: number;
    readonly fotosEnviadas: number;
    readonly fotosIguais: number;
    readonly esgotados: number;
    readonly ocultosPorPreco: number;
    readonly erros: number;
  };
  readonly mudancas: Readonly<Record<string, number>>;
  readonly porCategoria: readonly { readonly nome: string; readonly produtos: number }[];
  readonly ocultosPorPreco: readonly { readonly codigo: string; readonly nome: string }[];
  readonly semFoto: readonly { readonly codigo: string; readonly motivo: string }[];
  readonly erros: readonly ErroDoProduto[];
  readonly avisos: readonly { readonly codigo: string; readonly aviso: string }[];
  readonly sumiramDoArquivo: readonly { readonly codigo: string; readonly nome: string }[] | null;
  readonly removidosPeloDono: readonly string[];
  readonly notas: readonly string[];
  readonly cobertura: CoberturaDoMapa;
  readonly amostra: readonly { readonly codigo: string; readonly nome: string; readonly categoria: string; readonly acao: string; readonly mudancas: string }[];
}

const textoDoErro = (erro: unknown): string => (erro instanceof Error ? erro.message : String(erro));

export async function importarWinsis(
  cliente: ClienteSql,
  opcoes: OpcoesDaImportacao,
  relatar: (linha: string) => void = () => {},
  agora: Date = new Date(),
): Promise<ResultadoDaImportacao> {
  exigirAmbienteQueNaoEProducao(process.env);
  const arquivo = lerArquivoWinsis(await readFile(opcoes.arquivo, "utf8"));
  const mapa: MapaDeCategorias = validarMapa(JSON.parse(await readFile(MAPA, "utf8")));
  const cobertura = coberturaDoMapa(arquivo.produtos.map((p) => p.nome), mapa);

  // Código repetido no arquivo: vale o primeiro, e o resto é erro.
  const erros: ErroDoProduto[] = [];
  const vistos = new Set<string>();
  const ordem = new Map<string, number>();
  const unicos = arquivo.produtos.filter((produto, indice) => {
    if (vistos.has(produto.codigo)) {
      erros.push({ codigo: produto.codigo, nome: produto.nome, motivo: "código repetido no arquivo" });
      return false;
    }
    vistos.add(produto.codigo);
    ordem.set(produto.codigo, indice);
    return true;
  });
  let selecionados = unicos;
  if (opcoes.codigos !== null) {
    const pedidos = new Set(opcoes.codigos);
    selecionados = selecionados.filter((p) => pedidos.has(p.codigo));
    for (const codigo of pedidos) {
      if (!vistos.has(codigo)) erros.push({ codigo, nome: "", motivo: "código não está no arquivo" });
    }
  }
  if (opcoes.limite !== null) selecionados = selecionados.slice(0, opcoes.limite);
  const filtrado = opcoes.codigos !== null || opcoes.limite !== null;

  const planos: PlanoDoProduto[] = [];
  for (const produto of selecionados) {
    try {
      planos.push(planejarProduto(produto, mapa));
    } catch (erro) {
      erros.push({ codigo: produto.codigo, nome: produto.nome, motivo: textoDoErro(erro) });
    }
  }
  relatar(`Arquivo: ${arquivo.produtos.length} produtos; ${planos.length} selecionados${opcoes.simular ? " (simulação, nada será gravado)" : ""}.`);

  // Loja (e dono, limite, categorias). Na simulação só se lê o que existe.
  const notas: string[] = [];
  let lojaId: string | null;
  let donoId: string | null = null;
  let ramo = "AUTO_PARTS";
  let criada = false;
  const ehUniversoKar = opcoes.loja === LOJA_UNIVERSOKAR.apelido;
  if (opcoes.simular) {
    const achada = await acharLoja(cliente, opcoes.loja);
    lojaId = achada?.id ?? null;
    if (achada === null) {
      if (!ehUniversoKar) throw new Error(`A loja "${opcoes.loja}" não existe.`);
      notas.push(`A loja ${LOJA_UNIVERSOKAR.nome} ainda não existe: seria criada, com o dono ${LOJA_UNIVERSOKAR.dono.email}.`);
    } else {
      ramo = achada.ramo;
      donoId = achada.donoId;
    }
  } else {
    await cliente.query("BEGIN");
    try {
      if (ehUniversoKar) {
        const pronta = await garantirUniversoKar(cliente, agora);
        lojaId = pronta.lojaId;
        donoId = pronta.donoId;
        criada = pronta.criada;
        notas.push(...pronta.notas);
      } else {
        const achada = await acharLoja(cliente, opcoes.loja);
        if (achada === null) throw new Error(`A loja "${opcoes.loja}" não existe.`);
        lojaId = achada.id;
        donoId = achada.donoId;
        ramo = achada.ramo;
      }
      await cliente.query("COMMIT");
    } catch (erro) {
      await cliente.query("ROLLBACK");
      throw erro;
    }
  }

  const idDaLoja = lojaId ?? idWinsis(`loja:${LOJA_UNIVERSOKAR.apelido}`);
  if (!opcoes.simular) await cliente.query("BEGIN");
  const { categorias, especificacoes, criadas } = await garantirCategorias(cliente, idDaLoja, mapa, !opcoes.simular);
  if (!opcoes.simular) await cliente.query("COMMIT");
  if (criadas.length > 0) notas.push(`${opcoes.simular ? "Categorias a criar" : "Categorias criadas"}: ${criadas.join(", ")}.`);
  const todasAsDefinicoes = [...especificacoes.values()].flatMap((m) => [...m.values()]);

  const catalogo = lojaId === null ? new Map<string, ProdutoNoBanco>() : await lerCatalogoDaLoja(cliente, lojaId);

  // O limite de produtos, conferido antes de criar (como `exigirLimiteDaLoja`).
  const novos = planos.filter((p) => !catalogo.has(p.codigo)).length;
  if (lojaId !== null && novos > 0) {
    const medida = await cliente.query(
      "SELECT limite::int AS limite, uso::int AS uso FROM app.limites_da_loja($1) WHERE recurso = 'produtos'",
      [lojaId],
    );
    const { limite, uso } = { limite: Number(medida.rows[0]?.limite ?? 0), uso: Number(medida.rows[0]?.uso ?? 0) };
    if (uso + novos > limite) {
      throw new Error(`O limite de produtos da loja (${limite}, ${uso} em uso) não comporta mais ${novos}. Ajuste em /admin/lojas.`);
    }
  }

  const destino = destinoNoDisco(opcoes.loja);
  const fotos = await indiceDeFotos(opcoes.fotos);
  const contextoDeDecisao = {
    ramo,
    categorias,
    especificacoes,
    todasAsDefinicoes: new Set(todasAsDefinicoes),
  };
  const contextoDeGravacao: ContextoDaGravacao = {
    cliente,
    lojaId: idDaLoja,
    donoId,
    ramo,
    destino,
    todasAsDefinicoes,
    motivoDoEstoque: `Importação WinSIS (arquivo de ${arquivo.exportadoEm?.slice(0, 10) ?? "data desconhecida"})`,
    ordem,
  };

  const decisoes: Decisao[] = [];
  const avisosDeFoto: { codigo: string; aviso: string }[] = [];
  const descartar: string[] = [];
  let fotosEnviadas = 0;
  for (let inicio = 0; inicio < planos.length; inicio += opcoes.lote) {
    const lote = planos.slice(inicio, inicio + opcoes.lote);
    // 1) Ler e conferir as fotos do lote (fora da transação).
    const lidas = await emParalelo(lote, opcoes.concorrencia, async (plano) => {
      const caminho = fotos.get(nomeDaFoto(plano.codigo));
      if (caminho === undefined) return { foto: null, situacao: "faltando" as const };
      try {
        return { foto: await lerFoto(caminho), situacao: "ok" as const };
      } catch (erro) {
        return { foto: null, situacao: "invalida" as const, motivo: textoDoErro(erro) };
      }
    });
    const doLote: Decisao[] = [];
    for (const [indice, plano] of lote.entries()) {
      const lida = lidas[indice]!;
      try {
        doLote.push(decidir(plano, catalogo.get(plano.codigo) ?? null, contextoDeDecisao, lida.foto, lida.situacao));
      } catch (erro) {
        erros.push({ codigo: plano.codigo, nome: plano.nome, motivo: textoDoErro(erro) });
      }
      // Foto ruim não segura o produto: ele entra sem foto, e o aviso fica.
      if (lida.situacao === "invalida" && "motivo" in lida) {
        avisosDeFoto.push({ codigo: plano.codigo, aviso: `foto inválida, entrou sem foto: ${lida.motivo}` });
      }
    }
    if (opcoes.simular) {
      decisoes.push(...doLote);
      continue;
    }

    // 2) Guardar as fotos novas ou trocadas (concorrência limitada).
    const aGravar = doLote.filter((d) => d.acao === "criar" || d.acao === "atualizar");
    const comFoto = aGravar.filter((d) => d.situacaoDaFoto === "nova" || d.situacaoDaFoto === "trocada");
    const guardadas = await emParalelo(comFoto, opcoes.concorrencia, async (decisao) => {
      try {
        return { decisao, guardada: await destino.guardar(decisao.foto!, decisao.plano.codigo) };
      } catch (erro) {
        erros.push({ codigo: decisao.plano.codigo, nome: decisao.plano.nome, motivo: `foto não enviada: ${textoDoErro(erro)}` });
        return null;
      }
    });
    const fotosDoLote = guardadas.filter((g): g is FotoParaGravar => g !== null);

    // 3) Uma transação pelo lote; se falhar, um produto por vez.
    const aplicados = new Set<Decisao>();
    try {
      await cliente.query("BEGIN");
      await aplicar(contextoDeGravacao, aGravar, fotosDoLote);
      await cliente.query("COMMIT");
      for (const d of aGravar) aplicados.add(d);
    } catch {
      await cliente.query("ROLLBACK");
      for (const decisao of aGravar) {
        try {
          await cliente.query("BEGIN");
          await aplicar(contextoDeGravacao, [decisao], fotosDoLote.filter((f) => f.decisao === decisao));
          await cliente.query("COMMIT");
          aplicados.add(decisao);
        } catch (erro) {
          await cliente.query("ROLLBACK");
          erros.push({ codigo: decisao.plano.codigo, nome: decisao.plano.nome, motivo: textoDoErro(erro) });
        }
      }
    }
    for (const foto of fotosDoLote) {
      if (!aplicados.has(foto.decisao)) continue;
      fotosEnviadas += 1;
      const anterior = foto.decisao.atual?.foto?.chave;
      if (anterior != null && anterior !== foto.guardada.chave) descartar.push(anterior);
    }
    decisoes.push(...doLote.filter((d) => aplicados.has(d) || d.acao === "sem-mudanca" || d.acao === "removido-pelo-dono"));
    relatar(`  ${Math.min(inicio + opcoes.lote, planos.length)}/${planos.length} conferidos`);
  }
  for (const chave of descartar) await destino.descartar(chave).catch(() => {});

  // O relatório.
  const contar = (filtro: (d: Decisao) => boolean) => decisoes.filter(filtro).length;
  const mudancas: Record<string, number> = {};
  for (const d of decisoes) for (const m of d.mudancas) mudancas[m] = (mudancas[m] ?? 0) + 1;
  const nomeDaCategoria = new Map(mapa.categorias.map((c) => [c.chave, c.nome]));
  const porCategoria = new Map<string, number>();
  for (const d of decisoes) {
    const nome = nomeDaCategoria.get(d.plano.categoria.chave)!;
    porCategoria.set(nome, (porCategoria.get(nome) ?? 0) + 1);
  }
  const vivos = (d: Decisao) => d.acao !== "removido-pelo-dono";
  const semFoto = decisoes
    .filter((d) => vivos(d) && (d.situacaoDaFoto === "sem-foto-no-fornecedor" || d.situacaoDaFoto === "arquivo-faltando" || d.situacaoDaFoto === "invalida"))
    .map((d) => ({
      codigo: d.plano.codigo,
      motivo:
        d.situacaoDaFoto === "sem-foto-no-fornecedor"
          ? "o fornecedor não tem foto"
          : d.situacaoDaFoto === "invalida"
            ? "arquivo de foto inválido"
            : "foto não veio no download",
    }));
  const sumiram =
    filtrado
      ? null
      : [...catalogo.entries()]
          .filter(([codigo, p]) => !vistos.has(codigo) && !p.removido && p.atributos.origem === "winsis")
          .map(([codigo, p]) => ({ codigo, nome: p.nome }));

  return {
    simulacao: opcoes.simular,
    loja: { apelido: opcoes.loja, id: lojaId, criada },
    dono: ehUniversoKar ? { email: LOJA_UNIVERSOKAR.dono.email, senha: LOJA_UNIVERSOKAR.dono.senha } : null,
    arquivo: { caminho: opcoes.arquivo, exportadoEm: arquivo.exportadoEm, total: arquivo.produtos.length },
    selecionados: planos.length,
    destinoDasFotos: `apps/web/public/demo/${opcoes.loja}/`,
    totais: {
      criados: contar((d) => d.acao === "criar"),
      atualizados: contar((d) => d.acao === "atualizar"),
      semMudanca: contar((d) => d.acao === "sem-mudanca"),
      removidosPeloDono: contar((d) => d.acao === "removido-pelo-dono"),
      semFoto: semFoto.length,
      fotosEnviadas: opcoes.simular ? contar((d) => vivos(d) && (d.situacaoDaFoto === "nova" || d.situacaoDaFoto === "trocada")) : fotosEnviadas,
      fotosIguais: contar((d) => d.situacaoDaFoto === "igual"),
      esgotados: contar((d) => vivos(d) && d.plano.estoque === 0),
      ocultosPorPreco: contar((d) => vivos(d) && d.ocultoPorPreco),
      erros: erros.length,
    },
    mudancas,
    porCategoria: [...porCategoria.entries()].map(([nome, produtos]) => ({ nome, produtos })).sort((a, b) => b.produtos - a.produtos),
    ocultosPorPreco: decisoes.filter((d) => vivos(d) && d.ocultoPorPreco).map((d) => ({ codigo: d.plano.codigo, nome: d.plano.nome })),
    semFoto,
    erros,
    avisos: [
      ...decisoes.flatMap((d) => d.plano.avisos.map((aviso) => ({ codigo: d.plano.codigo, aviso }))),
      ...avisosDeFoto,
    ],
    sumiramDoArquivo: sumiram,
    removidosPeloDono: decisoes.filter((d) => d.acao === "removido-pelo-dono").map((d) => d.plano.codigo),
    notas,
    cobertura,
    amostra: decisoes.slice(0, 40).map((d) => ({
      codigo: d.plano.codigo,
      nome: d.plano.nome,
      categoria: nomeDaCategoria.get(d.plano.categoria.chave)!,
      acao: d.acao,
      mudancas: d.mudancas.join(", "),
    })),
  };
}

// ---------------------------------------------------------------------------
// Resumo e relatório
// ---------------------------------------------------------------------------

export function resumoEmTexto(r: ResultadoDaImportacao): string {
  const t = r.totais;
  const linhas = [
    `${r.simulacao ? "SIMULAÇÃO (--dry-run): nada foi gravado." : "Importação concluída."}`,
    `Loja: ${r.loja.apelido}${r.loja.criada ? " (criada agora)" : ""} · fotos: ${r.destinoDasFotos}`,
    `Arquivo: ${r.arquivo.total} produtos (exportado em ${r.arquivo.exportadoEm ?? "?"}) · selecionados: ${r.selecionados}`,
    `Criados: ${t.criados} · Atualizados: ${t.atualizados} · Sem mudança: ${t.semMudanca} · Removidos pelo dono (não recriados): ${t.removidosPeloDono}`,
    `Fotos enviadas: ${t.fotosEnviadas} · Fotos iguais (não reenviadas): ${t.fotosIguais} · Sem foto: ${t.semFoto}`,
    `Esgotados (estoque 0): ${t.esgotados} · Ocultos por preço 0: ${t.ocultosPorPreco} · Erros: ${t.erros}`,
  ];
  if (Object.keys(r.mudancas).length > 0) {
    linhas.push(`O que mudou: ${Object.entries(r.mudancas).map(([m, n]) => `${m} ${n}`).join(" · ")}`);
  }
  for (const nota of r.notas) linhas.push(`• ${nota}`);
  if (r.ocultosPorPreco.length > 0) {
    linhas.push("Ocultos por preço 0 (corrigir o preço no fornecedor ou no painel):");
    for (const o of r.ocultosPorPreco.slice(0, 20)) linhas.push(`  ${o.codigo}  ${o.nome}`);
  }
  if (r.erros.length > 0) {
    linhas.push("Erros:");
    for (const e of r.erros.slice(0, 30)) linhas.push(`  ${e.codigo}  ${e.motivo}${e.nome === "" ? "" : `  (${e.nome})`}`);
  }
  if (r.avisos.length > 0) {
    linhas.push(`Avisos: ${r.avisos.length}`);
    for (const a of r.avisos.slice(0, 10)) linhas.push(`  ${a.codigo}  ${a.aviso}`);
  }
  if (r.sumiramDoArquivo !== null && r.sumiramDoArquivo.length > 0) {
    linhas.push(`Sumiram do arquivo (não apagados): ${r.sumiramDoArquivo.length}`);
  }
  if (r.dono !== null) linhas.push(`Dono: ${r.dono.email} / ${r.dono.senha}`);
  return linhas.join("\n");
}

export function relatorioEmMarkdown(r: ResultadoDaImportacao): string {
  const c = r.cobertura;
  const tabela = (cabecalho: string, linhas: string[][]) =>
    [`| ${cabecalho.split("|").join(" | ")} |`, `|${cabecalho.split("|").map(() => "---").join("|")}|`, ...linhas.map((l) => `| ${l.join(" | ")} |`)].join("\n");
  return [
    `# Importação WinSIS — ${r.simulacao ? "simulação" : "gravação"}`,
    "",
    "```",
    resumoEmTexto(r),
    "```",
    "",
    `## Cobertura do mapa de categorias (arquivo inteiro: ${c.total} produtos)`,
    "",
    tabela("Categoria|Produtos|%", c.porCategoria.map((p) => [p.nome, String(p.produtos), `${((100 * p.produtos) / c.total).toFixed(1)}%`])),
    "",
    "### Palavras iniciais que caíram em Outras peças",
    "",
    c.palavrasEmOutras.map((p) => `${p.palavra} (${p.produtos})`).join(" · ") || "(nenhuma)",
    "",
    `### ${c.nomesEmOutras.length} nomes em Outras peças`,
    "",
    ...c.nomesEmOutras.map((n) => `- ${n}`),
    "",
    "## Produtos desta passada",
    "",
    tabela("Código|Nome|Categoria|Ação|Mudanças", r.amostra.map((a) => [a.codigo, a.nome, a.categoria, a.acao, a.mudancas])),
    r.selecionados > r.amostra.length ? `\n(${r.selecionados - r.amostra.length} a mais no JSON do relatório)` : "",
    "",
    "## Ocultos por preço 0",
    "",
    ...(r.ocultosPorPreco.length === 0 ? ["(nenhum)"] : r.ocultosPorPreco.map((o) => `- ${o.codigo} — ${o.nome}`)),
    "",
    "## Erros",
    "",
    ...(r.erros.length === 0 ? ["(nenhum)"] : r.erros.map((e) => `- ${e.codigo} — ${e.motivo}${e.nome === "" ? "" : ` (${e.nome})`}`)),
    "",
    "## Sumiram do arquivo (não apagados)",
    "",
    r.sumiramDoArquivo === null
      ? "(não conferido: a passada foi filtrada com --limit ou --apenas-codigos)"
      : r.sumiramDoArquivo.length === 0
        ? "(nenhum)"
        : r.sumiramDoArquivo.map((s) => `- ${s.codigo} — ${s.nome}`).join("\n"),
    "",
  ].join("\n");
}

async function gravarRelatorio(r: ResultadoDaImportacao, agora: Date): Promise<string> {
  await mkdir(PASTA_DO_RELATORIO, { recursive: true });
  const carimbo = agora.toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const base = join(PASTA_DO_RELATORIO, `${carimbo}-${r.simulacao ? "simulacao" : "gravacao"}`);
  await writeFile(`${base}.json`, JSON.stringify(r, null, 2));
  await writeFile(`${base}.md`, relatorioEmMarkdown(r));
  return `${base}.md`;
}

async function principal(): Promise<number> {
  let opcoes: OpcoesDaImportacao;
  try {
    opcoes = lerOpcoes(process.argv.slice(2).filter((a) => a !== "--"));
  } catch (erro) {
    process.stderr.write(`${textoDoErro(erro)}\n`);
    return 2;
  }
  const { default: pg } = await import("pg");
  const direta = process.env.DATABASE_URL_DIRETA?.trim();
  const senha = process.env.SENHA_BANCO_ADMINISTRACAO?.trim();
  if (!direta || !senha) {
    process.stderr.write("DATABASE_URL_DIRETA e SENHA_BANCO_ADMINISTRACAO precisam estar no .env da raiz.\n");
    return 1;
  }
  const cliente = new pg.Client({ connectionString: derivarUrlDePapel(direta, "sc_admin", senha) });
  await cliente.connect();
  const agora = new Date();
  try {
    const resultado = await importarWinsis(cliente, opcoes, (linha) => process.stdout.write(`${linha}\n`), agora);
    process.stdout.write(`\n${resumoEmTexto(resultado)}\n`);
    process.stdout.write(`\nRelatório: ${await gravarRelatorio(resultado, agora)}\n`);
    return resultado.erros.length > 0 ? 3 : 0;
  } catch (erro) {
    process.stderr.write(`${textoDoErro(erro)}\n`);
    return 1;
  } finally {
    await cliente.end();
  }
}

const chamadoDiretamente =
  process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (chamadoDiretamente) {
  process.exitCode = await principal();
}
