/**
 * Demonstração: deixa o SimpleClick POPULADO para teste à mão (cards #15 e
 * #50) — 24 lojas abertas em Fortaleza/CE, uma por tipo de negócio, com
 * catálogo e fotos, vídeos, stories de 24 horas, clientes, pedidos em todas
 * as etapas (de hoje e dos últimos 30 dias), curtidas, comentários,
 * favoritos, recentes e as 4 contas de teste (`contas.ts`).
 *
 * O seed original (`seed/index.ts`) só planta em banco vazio. Este roda POR
 * CIMA de um banco que já tem gente, e por isso segue outras regras:
 *
 * - **Idempotente.** Todo id nasce de `idDeExemplo("demo:...")`, e cada linha
 *   entra com `ON CONFLICT (id) DO UPDATE`: rodar de novo atualiza, não
 *   duplica. Pedido e comentário são exceção — não se reescrevem (P-010) —,
 *   então entram com `DO NOTHING` e mantêm as datas da primeira carga. Os
 *   pedidos de HOJE têm a data na chave: num dia novo, o quadro do dia é
 *   plantado de novo. Stories são repostados a cada carga (vencem em 24 h).
 * - **Não apaga ninguém.** Contas, lojas, produtos e pedidos que já existem
 *   ficam. As remoções são as faixas de horário da loja (recriadas), as
 *   exceções de horário que fechariam a loja de hoje em diante e os stories e
 *   vídeos da própria demonstração (repostos).
 * - **Credencial de administração** (`sc_admin`), como o seed original: cada
 *   escrita atravessa uma política escrita, e não o atalho da migração.
 * - **Nunca em produção.**
 *
 * Uso: `pnpm --filter @simpleclick/database demo` (depois de `migrar`). As
 * imagens e vídeos vão para `apps/web/public/demo/` (fora do git).
 */

import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { type ClienteSql, derivarUrlDePapel } from "../../src/migrate.ts";
import {
  idDaCategoria,
  idDaEspecificacao,
  idDaImagem,
  idDoArquivo,
  PRODUTOS,
} from "../catalogo.ts";
import { tokenDeExemplo } from "../deterministico.ts";
import { exigirAmbienteQueNaoEProducao } from "../index.ts";
import { LOJAS } from "../lojas.ts";
import {
  concederAdministracao,
  CONTA_ADMIN,
  CONTA_CLIENTE,
  CONTA_DONO,
  CONTA_EQUIPE,
  CONTAS_DE_TESTE,
  garantirConta,
  PESSOAS_DO_FEED,
  SENHA_DOS_DONOS,
  vincular,
} from "./contas.ts";
import {
  type ClienteDemo,
  type EixoDemo,
  LOJAS_DEMO,
  type LojaDemo,
  type ProdutoDemo,
  type StatusDemo,
} from "./dados.ts";
import { gravar, id, json, sorteio } from "./escrita.ts";
import {
  gravarImagem,
  type Ilustracao,
  type ImagemGravada,
  svgDaCapa,
  svgDoLogo,
  svgDoProduto,
  tom,
} from "./imagens.ts";
import { LOJAS_NOVAS } from "./lojas/index.ts";
import {
  plantarStories,
  plantarVideosDosProdutos,
  videosDaLoja,
} from "./midia.ts";
import {
  CHAVE_DA_CLIENTE_DE_TESTE,
  CLIENTE_DE_TESTE,
  clientesGerados,
  type PedidoDoRoteiro,
  pedidosDeHoje,
  pedidosDoMes,
} from "./roteiro.ts";
import { type LojaPlantada, plantarSocial } from "./social.ts";
import { gravarVideos, type VideoGravado } from "./videos.ts";

/** Todas as lojas da demonstração estão em Fortaleza/CE e arredores. */
const FUSO = "America/Fortaleza";

// ---------------------------------------------------------------------------
// Variantes: produto cartesiano dos eixos
// ---------------------------------------------------------------------------

interface VarianteDemo {
  readonly chave: string;
  readonly nome: string;
  readonly combinacao: readonly (readonly [EixoDemo, string])[];
  readonly preco: number;
  readonly promo: number | null;
}

function variantesDo(produto: ProdutoDemo): VarianteDemo[] {
  const eixos = produto.eixos ?? [];
  if (eixos.length === 0) return [];
  let combinacoes: (readonly [EixoDemo, string])[][] = [[]];
  for (const eixo of eixos) {
    combinacoes = combinacoes.flatMap((parcial) =>
      eixo.opcoes.map((opcao) => [...parcial, [eixo, opcao.chave] as const]),
    );
  }
  return combinacoes.map((combinacao) => {
    const opcoes = combinacao.map(([eixo, chave]) =>
      eixo.opcoes.find((o) => o.chave === chave)!,
    );
    const precoProprio = opcoes.find((o) => o.preco !== undefined)?.preco;
    return {
      chave: combinacao.map(([, chave]) => chave).join("/"),
      nome: opcoes.map((o) => o.nome).join(" / "),
      combinacao,
      preco: precoProprio ?? produto.preco,
      // A promoção vale para a grade toda quando o preço não muda por opção.
      promo: precoProprio === undefined ? (produto.promo ?? null) : null,
    };
  });
}

function sku(produto: ProdutoDemo, variante: string): string {
  const sigla = produto.chave
    .split("-")
    .filter((parte) => parte.length > 2)
    .map((parte) => parte.slice(0, 3))
    .join("")
    .toUpperCase();
  return `${sigla}-${variante.replaceAll("/", "-").toUpperCase()}`;
}

// ---------------------------------------------------------------------------
// Apresentação da loja
// ---------------------------------------------------------------------------

/** A loja em que a carga está trabalhando, e com qual conexão. */
interface Contexto {
  readonly cliente: ClienteSql;
  readonly lojaId: string;
  readonly loja: LojaDemo;
  /** Nome da loja como está no banco (a dona pode ter mudado). */
  readonly nome: string;
  readonly ramo: string;
  readonly donaId: string | null;
  readonly agora: Date;
}

const formasDa = (loja: LojaDemo): readonly ("DELIVERY" | "PICKUP")[] =>
  loja.nova?.formas ?? ["DELIVERY", "PICKUP"];

async function prepararLoja(contexto: Contexto): Promise<void> {
  const { cliente, lojaId, loja } = contexto;
  const ilustracoes = loja.produtos.map((p) => p.ilustracao);
  const marca = {
    nome: contexto.nome,
    iniciais: loja.iniciais,
    chamada: loja.chamada,
    primaria: loja.primaria,
    secundaria: loja.secundaria,
    ilustracoes: [...new Set(ilustracoes)],
  };
  const logo = await gravarImagem({
    pasta: loja.pasta,
    arquivo: "logo",
    svg: svgDoLogo(marca),
    largura: 512,
    altura: 512,
  });
  await gravarArquivo(contexto, {
    chave: `${loja.pasta}:LOGO`,
    kind: "LOGO",
    imagem: logo,
    texto: marca.nome,
  });
  // Capa própria só em parte das lojas: as outras mostram a capa padrão do
  // tipo de negócio (apps/web/public/capas-padrao/), que é o que o lojista vê
  // até enviar a dele. `capa: null` apaga a capa de execuções anteriores.
  let capa: string | null = null;
  if (loja.capa === true) {
    const imagem = await gravarImagem({
      pasta: loja.pasta,
      arquivo: "capa",
      svg: svgDaCapa(marca),
      largura: 1600,
      altura: 1000,
    });
    await gravarArquivo(contexto, {
      chave: `${loja.pasta}:CAPA`,
      kind: "BANNER",
      imagem,
      texto: `Capa da ${marca.nome}`,
    });
    capa = imagem.url;
  }
  const formas = formasDa(loja);

  await cliente.query(
    `UPDATE app.stores
        SET status = 'ACTIVE',
            open_state = 'SCHEDULE',
            temporarily_closed_until = NULL,
            fulfillment_modes = $13,
            whatsapp_e164 = $2, phone1 = $3, email = $4,
            street = $5, number = $6, neighborhood = $7, city = $8, uf = $9, zip = $10,
            timezone = $14,
            deleted_at = NULL, purge_after = NULL,
            -- Card #25: aprovada, no feed e com coordenadas para a distância.
            approved_at = coalesce(approved_at, created_at),
            feed_visible = true,
            lat = $11, lng = $12
      WHERE id = $1`,
    [
      lojaId,
      loja.whatsapp,
      loja.telefone,
      loja.email,
      loja.endereco.rua,
      loja.endereco.numero,
      loja.endereco.bairro,
      loja.endereco.cidade,
      loja.endereco.uf,
      loja.endereco.cep,
      loja.coordenadas.lat,
      loja.coordenadas.lng,
      formas,
      FUSO,
    ],
  );

  // `||` mescla: o que a dona configurou e a demonstração não cita continua.
  await cliente.query(
    `INSERT INTO app.store_settings (store_id, theme, landing, checkout, delivery, payment, whatsapp)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (store_id) DO UPDATE SET
       theme    = app.store_settings.theme    || EXCLUDED.theme,
       landing  = app.store_settings.landing  || EXCLUDED.landing,
       checkout = app.store_settings.checkout || EXCLUDED.checkout,
       delivery = app.store_settings.delivery || EXCLUDED.delivery,
       payment  = app.store_settings.payment  || EXCLUDED.payment,
       whatsapp = app.store_settings.whatsapp || EXCLUDED.whatsapp`,
    [
      lojaId,
      json({
        primaria: loja.primaria,
        fundo: "#FFFFFF",
        // Cor de destaque do tema (card #25/#36).
        destaque: (loja.destaque ?? loja.primaria).toLowerCase(),
      }),
      json({
        boasVindas: loja.boasVindas,
        sobre: loja.sobre,
        logo: logo.url,
        capa,
        mostrarDestaques: true,
      }),
      json(loja.checkout),
      json({ ...loja.entrega, retiradaNoLocal: formas.includes("PICKUP") }),
      json(loja.pagamento),
      json({
        numero: loja.whatsapp,
        publico: true,
        saudacao: "Olá! Segue meu pedido:",
      }),
    ],
  );

  // Horário: as mesmas faixas em cada dia aberto; o dia fechado ganha uma
  // linha "fechado". Exceção que fecharia a loja de hoje em diante sai, para o
  // teste não esbarrar num feriado cadastrado.
  await cliente.query("DELETE FROM app.store_hours WHERE store_id = $1", [
    lojaId,
  ]);
  for (let dia = 0; dia < 7; dia++) {
    const fechado = loja.diasFechados?.includes(dia) === true;
    const faixas = fechado ? [["00:00", "00:00"] as const] : loja.horarios;
    for (const [ordem, [abre, fecha]] of faixas.entries()) {
      await gravar(cliente, "store_hours", {
        id: id(`horario:${loja.chave}:${dia}:${ordem}`),
        store_id: lojaId,
        weekday: dia,
        opens_at: abre,
        closes_at: fecha,
        is_closed: fechado,
        sort_order: ordem,
      });
    }
  }
  await cliente.query(
    `DELETE FROM app.store_hour_exceptions
      WHERE store_id = $1 AND is_closed AND on_date >= (now() AT TIME ZONE $2)::date - 1`,
    [lojaId, FUSO],
  );
}

interface ArquivoDoAcervo {
  /** Nome estável do arquivo, de onde sai o id. */
  readonly chave: string;
  readonly kind: "PRODUCT_IMAGE" | "LOGO" | "BANNER";
  readonly imagem: ImagemGravada;
  readonly texto: string;
}

/** Registra a imagem no acervo (`assets`), como o envio pelo painel faria. */
async function gravarArquivo(
  { cliente, lojaId, donaId }: Contexto,
  { chave, kind, imagem, texto }: ArquivoDoAcervo,
): Promise<string> {
  // O mesmo arquivo pode ter entrado por uma carga anterior com outro nome:
  // o endereço é único no acervo, então o registro que já o tem é reaproveitado.
  const existente = await cliente.query(
    "SELECT id FROM app.assets WHERE storage_key = $1",
    [imagem.chave],
  );
  const arquivoId =
    existente.rows[0]?.id === undefined
      ? id(`arquivo:${chave}`)
      : String(existente.rows[0].id);
  await gravar(cliente, "assets", {
    id: arquivoId,
    store_id: lojaId,
    kind,
    status: "READY",
    storage_key: imagem.chave,
    mime_type: "image/webp",
    width: imagem.largura,
    height: imagem.altura,
    byte_size: imagem.bytes,
    variants: json({}),
    alt_text: texto,
    uploaded_by: donaId,
  });
  return arquivoId;
}

// ---------------------------------------------------------------------------
// Catálogo
// ---------------------------------------------------------------------------

async function plantarCatalogo(contexto: Contexto): Promise<number> {
  const { cliente, lojaId, loja } = contexto;
  for (const [ordem, categoria] of loja.categorias.entries()) {
    const categoriaId = idDaCategoria(loja.chave, categoria.chave);
    if (categoria.existente !== true) {
      await gravar(cliente, "categories", {
        id: categoriaId,
        store_id: lojaId,
        name: categoria.nome,
        slug: categoria.chave,
        description: categoria.descricao,
        is_visible: true,
        sort_order: ordem,
        deleted_at: null,
      });
    } else {
      // A categoria do seed original fica como a dona deixou; só a ordem
      // acompanha as novas, para a vitrine não embaralhar.
      await cliente.query(
        "UPDATE app.categories SET sort_order = $2 WHERE id = $1",
        [categoriaId, ordem],
      );
    }
    for (const [posicao, especificacao] of categoria.especificacoes.entries()) {
      await gravar(cliente, "attribute_definitions", {
        id: idDaEspecificacao(loja.chave, categoria.chave, especificacao.chave),
        store_id: lojaId,
        category_id: categoriaId,
        key: especificacao.chave,
        label: especificacao.rotulo,
        data_type: especificacao.tipo,
        unit: especificacao.unidade ?? null,
        allowed_values:
          especificacao.opcoes === undefined
            ? null
            : json(especificacao.opcoes),
        is_required: false,
        is_filterable: especificacao.filtravel ?? false,
        sort_order: posicao,
        created_by_owner: true,
      });
    }
  }

  for (const [ordem, produto] of loja.produtos.entries()) {
    await plantarProduto(contexto, produto, ordem);
  }
  return loja.produtos.length;
}

/** Sem escolha explícita: destaque, promoção e dois de cada três dos demais. */
function vaiParaOFeed(produto: ProdutoDemo, ordem: number): boolean {
  if (produto.rascunho === true) return false;
  return (
    produto.feed ??
    (produto.destaque === true || produto.promo !== undefined || ordem % 3 !== 2)
  );
}

const idDoProdutoDemo = (loja: LojaDemo, chave: string): string =>
  id(`produto:${loja.chave}:${chave}`);
const idDoGrupoDemo = (
  loja: LojaDemo,
  produto: string,
  grupo: string,
): string => id(`grupo:${loja.chave}:${produto}:${grupo}`);
const idDaOpcaoDemo = (
  loja: LojaDemo,
  produto: string,
  grupo: string,
  opcao: string,
): string => id(`opcao:${loja.chave}:${produto}:${grupo}:${opcao}`);
const idDaVarianteDemo = (
  loja: LojaDemo,
  produto: string,
  variante: string,
): string => id(`variante:${loja.chave}:${produto}:${variante}`);

async function plantarProduto(
  contexto: Contexto,
  produto: ProdutoDemo,
  ordem: number,
): Promise<void> {
  const { cliente, lojaId, loja, ramo, donaId } = contexto;
  const produtoId = idDoProdutoDemo(loja, produto.chave);
  const variantes = variantesDo(produto);
  const categoria = loja.categorias.find((c) => c.chave === produto.categoria)!;
  const precos =
    variantes.length === 0
      ? [produto.promo ?? produto.preco]
      : variantes.map((v) => v.promo ?? v.preco);
  // Loja que controla estoque precisa de variante para guardar a quantidade,
  // mesmo quando o produto não tem grade.
  const varianteUnica = variantes.length === 0 && !loja.ehComida;

  await gravar(cliente, "products", {
    id: produtoId,
    store_id: lojaId,
    name: produto.nome,
    slug: produto.chave,
    description: produto.descricao,
    short_description: produto.resumo,
    product_type: variantes.length > 0 ? "VARIABLE" : "SIMPLE",
    vertical_code: ramo,
    vertical_schema_version: 1,
    status: produto.rascunho === true ? "DRAFT" : "PUBLISHED",
    is_available: true,
    unavailable_until: null,
    unit_label: "un",
    track_stock: !loja.ehComida,
    sort_order: 100 + ordem,
    is_featured: produto.destaque === true,
    // Feed do SimpleClick (card #25): destaque, promoção e boa parte do resto.
    publish_to_feed: vaiParaOFeed(produto, ordem),
    attributes: json(produto.especificacoes),
    price_min_cents: Math.min(...precos),
    price_max_cents: Math.max(...precos),
    display_price_cents: precos[0] ?? produto.preco,
    compare_at_cents: produto.promo === undefined ? null : produto.preco,
    has_variants: variantes.length > 1,
    prep_time_minutes: produto.preparo ?? null,
    seo_title: `${produto.nome} — ${contexto.nome}`,
    seo_description: produto.resumo,
    deleted_at: null,
    created_by: donaId,
  });

  // Os posts não nascem todos no mesmo segundo: espalhados pelos últimos 20
  // dias, para a ordem "recentes" do feed ter o que mostrar.
  if (vaiParaOFeed(produto, ordem)) {
    await cliente.query(
      "UPDATE app.feed_posts SET published_at = $2 WHERE product_id = $1",
      [
        produtoId,
        new Date(
          contexto.agora.getTime() -
            (1 + sorteio(`feed:${produtoId}`, 20 * 24)) * 3_600_000,
        ),
      ],
    );
  }

  await gravar(cliente, "product_categories", {
    id: id(`produto-categoria:${loja.chave}:${produto.chave}`),
    store_id: lojaId,
    product_id: produtoId,
    category_id: idDaCategoria(loja.chave, produto.categoria),
    sort_order: ordem,
    is_primary: true,
  });

  for (const [chave, valor] of Object.entries(produto.especificacoes)) {
    const definicao = categoria.especificacoes.find((e) => e.chave === chave)!;
    await gravar(cliente, "product_attributes", {
      id: id(`atributo:${loja.chave}:${produto.chave}:${chave}`),
      store_id: lojaId,
      product_id: produtoId,
      definition_id: idDaEspecificacao(loja.chave, produto.categoria, chave),
      value_text:
        definicao.tipo === "TEXT" || definicao.tipo === "ENUM"
          ? String(valor)
          : null,
      value_num: definicao.tipo === "NUMBER" ? Number(valor) : null,
      value_bool: definicao.tipo === "BOOLEAN" ? Boolean(valor) : null,
    });
  }

  // Fotos: a principal, uma por cor do eixo de cor (até 3) e as extras.
  const eixoDeCor = produto.eixos?.find((e) => e.opcoes.some((o) => o.cor));
  const fotos: { selo?: string; cor: string; fundo: string }[] = eixoDeCor
    ? eixoDeCor.opcoes.slice(0, 3).map((opcao) => ({
        selo: `Cor: ${opcao.nome}`,
        cor: opcao.cor ?? produto.cor,
        fundo: produto.fundo,
      }))
    : [{ cor: produto.cor, fundo: produto.fundo }];
  for (const extra of produto.fotos ?? []) {
    if (fotos.length >= 3) break;
    fotos.push({
      selo: extra.selo,
      cor: extra.cor ?? produto.cor,
      fundo: extra.fundo ?? tom(produto.fundo, -0.2),
    });
  }
  for (const [posicao, foto] of fotos.entries()) {
    const imagem = await gravarImagem({
      pasta: loja.pasta,
      arquivo: `${produto.chave}-${posicao + 1}`,
      svg: svgDoProduto({
        ilustracao: produto.ilustracao,
        fundo: foto.fundo,
        cor: foto.cor,
        angulo: posicao,
      }),
      largura: 1200,
      altura: 1200,
    });
    const texto = `${produto.nome}${foto.selo ? ` — ${foto.selo}` : ""}`;
    const arquivoId = await gravarArquivo(contexto, {
      chave: `${loja.chave}:${produto.chave}:${posicao}`,
      kind: "PRODUCT_IMAGE",
      imagem,
      texto,
    });
    await gravar(cliente, "product_images", {
      id: id(`imagem:${loja.chave}:${produto.chave}:${posicao}`),
      store_id: lojaId,
      product_id: produtoId,
      asset_id: arquivoId,
      url: imagem.url,
      alt_text: texto,
      is_primary: posicao === 0,
      // 0, 2, 4…: o vídeo do produto entra no 1, logo depois da principal.
      sort_order: posicao * 2,
      width: 1200,
      height: 1200,
    });
  }

  // Grupos: os eixos de grade primeiro, depois os de escolha livre.
  const grupos = [
    ...(produto.eixos ?? []).map((eixo) => ({
      chave: eixo.chave,
      nome: eixo.nome,
      descricao: null as string | null,
      kind: "VARIATION" as const,
      eixo: true,
      minimo: 1,
      maximo: 1 as number | null,
      opcoes: eixo.opcoes.map((o) => ({
        chave: o.chave,
        nome: o.nome,
        acrescimo: 0,
        marcada: false,
        indisponivel: false,
      })),
    })),
    ...(produto.grupos ?? []).map((grupo) => ({
      ...grupo,
      descricao: grupo.descricao ?? null,
      eixo: false,
    })),
  ];
  for (const [posicao, grupo] of grupos.entries()) {
    const grupoId = idDoGrupoDemo(loja, produto.chave, grupo.chave);
    await gravar(cliente, "option_groups", {
      id: grupoId,
      store_id: lojaId,
      product_id: produtoId,
      name: grupo.nome,
      description: grupo.descricao,
      kind: grupo.kind,
      is_active: true,
      min_select: grupo.minimo,
      max_select: grupo.maximo,
      allow_repeat: false,
      is_variant_axis: grupo.eixo,
      sort_order: posicao,
      deleted_at: null,
    });
    for (const [indice, opcao] of grupo.opcoes.entries()) {
      await gravar(cliente, "option_items", {
        id: idDaOpcaoDemo(loja, produto.chave, grupo.chave, opcao.chave),
        store_id: lojaId,
        group_id: grupoId,
        name: opcao.nome,
        price_delta_cents: opcao.acrescimo ?? 0,
        is_default_selected: opcao.marcada === true,
        is_available: opcao.indisponivel !== true,
        sort_order: indice,
        deleted_at: null,
      });
    }
    await gravar(cliente, "product_option_groups", {
      id: id(`produto-grupo:${loja.chave}:${produto.chave}:${grupo.chave}`),
      store_id: lojaId,
      product_id: produtoId,
      group_id: grupoId,
      sort_order: posicao,
    });
  }

  // Preço no produto quando não há variante; na variante quando há.
  const precosDe = async (
    varianteId: string | null,
    chave: string,
    base: number,
    promo: number | null,
  ): Promise<void> => {
    const linhas: [string, string, number][] = [["BASE", "Balcão", base]];
    if (promo !== null) linhas.push(["PROMO", "Promoção", promo]);
    linhas.push([
      "COST",
      "Custo",
      Math.round((produto.custo * base) / produto.preco),
    ]);
    for (const [posicao, [kind, rotulo, valor]] of linhas.entries()) {
      await gravar(cliente, "product_prices", {
        id: id(`preco:${loja.chave}:${produto.chave}:${chave}:${kind}`),
        store_id: lojaId,
        product_id: produtoId,
        variant_id: varianteId,
        kind,
        label: loja.ehComida ? rotulo : kind === "BASE" ? "Preço" : rotulo,
        amount_cents: valor,
        min_quantity: 1,
        currency: "BRL",
        sort_order: posicao,
        is_active: true,
      });
    }
  };

  if (variantes.length === 0 && !varianteUnica) {
    await precosDe(null, "produto", produto.preco, produto.promo ?? null);
    return;
  }

  const lista: VarianteDemo[] = varianteUnica
    ? [
        {
          chave: "unico",
          nome: "Único",
          combinacao: [],
          preco: produto.preco,
          promo: produto.promo ?? null,
        },
      ]
    : variantes;
  for (const [posicao, variante] of lista.entries()) {
    const varianteId = idDaVarianteDemo(loja, produto.chave, variante.chave);
    const chaves = variante.combinacao.map(([, chave]) => chave);
    await gravar(cliente, "product_variants", {
      id: varianteId,
      store_id: lojaId,
      product_id: produtoId,
      name: variante.nome,
      sku: loja.ehComida ? null : sku(produto, variante.chave),
      stock_quantity: loja.ehComida ? null : (produto.estoque?.(chaves) ?? 8),
      stock_reserved: loja.ehComida ? null : 0,
      stock_min_alert: loja.ehComida ? null : 2,
      is_default: posicao === 0,
      is_available: true,
      sort_order: posicao,
      deleted_at: null,
    });
    for (const [eixo, opcao] of variante.combinacao) {
      await gravar(cliente, "variant_option_values", {
        id: id(
          `combinacao:${loja.chave}:${produto.chave}:${variante.chave}:${eixo.chave}`,
        ),
        store_id: lojaId,
        variant_id: varianteId,
        group_id: idDoGrupoDemo(loja, produto.chave, eixo.chave),
        option_item_id: idDaOpcaoDemo(loja, produto.chave, eixo.chave, opcao),
      });
    }
    await precosDe(varianteId, variante.chave, variante.preco, variante.promo);
  }
}

// ---------------------------------------------------------------------------
// Fotos para os produtos do seed original
// ---------------------------------------------------------------------------

/**
 * O seed original aponta as fotos para um Cloudinary que não existe em
 * desenvolvimento. Aqui elas ganham arquivo de verdade, no mesmo registro.
 */
const DESENHO_DO_ORIGINAL: Readonly<
  Record<string, { ilustracao: Ilustracao; cor: string; fundo: string }>
> = {
  "pastel-de-carne": { ilustracao: "pastel", cor: "#E9B95A", fundo: "#C0392B" },
  "pastel-de-queijo": {
    ilustracao: "pastel",
    cor: "#F0C96A",
    fundo: "#F4A261",
  },
  "refrigerante-lata": { ilustracao: "lata", cor: "#B3261E", fundo: "#2A9D8F" },
  "pastel-do-chef": { ilustracao: "pastel", cor: "#E3A03F", fundo: "#6D3B8E" },
  "camiseta-basica": {
    ilustracao: "camiseta",
    cor: "#1D6FA3",
    fundo: "#E9DCC6",
  },
  "tenis-urbano": { ilustracao: "tenis", cor: "#2B2B2B", fundo: "#C1663F" },
  "meia-esportiva": { ilustracao: "meia", cor: "#F4F4F4", fundo: "#1B3A6B" },
};

async function fotografarOriginais({
  cliente,
  lojaId,
  loja,
}: Contexto): Promise<number> {
  let total = 0;
  for (const produto of PRODUTOS.filter((p) => p.loja.id === lojaId)) {
    const desenho = DESENHO_DO_ORIGINAL[produto.chave];
    if (desenho === undefined) continue;
    for (const [posicao, nome] of produto.imagens.entries()) {
      const imagemId = idDaImagem(produto, nome);
      const existe = await cliente.query(
        "SELECT 1 FROM app.product_images WHERE id = $1",
        [imagemId],
      );
      if (existe.rows.length === 0) continue;
      const imagem = await gravarImagem({
        pasta: loja.pasta,
        arquivo: `${produto.slug}-${nome}`,
        svg: svgDoProduto({
          ilustracao: desenho.ilustracao,
          cor: desenho.cor,
          fundo: posicao === 0 ? desenho.fundo : tom(desenho.fundo, -0.25),
          angulo: posicao,
        }),
        largura: 1200,
        altura: 1200,
      });
      await cliente.query(
        `UPDATE app.assets
            SET storage_key = $2, mime_type = 'image/webp', byte_size = $3,
                width = 1200, height = 1200, variants = '{}'
          WHERE id = $1`,
        [idDoArquivo(produto, nome), imagem.chave, imagem.bytes],
      );
      await cliente.query(
        "UPDATE app.product_images SET url = $2, width = 1200, height = 1200 WHERE id = $1",
        [imagemId, imagem.url],
      );
      total++;
    }
  }
  return total;
}

// ---------------------------------------------------------------------------
// Clientes e pedidos
// ---------------------------------------------------------------------------

const idDoClienteDemo = (loja: LojaDemo, chave: string): string =>
  id(`cliente:${loja.chave}:${chave}`);

/** Os clientes da loja: os escritos à mão ou os gerados (lojas novas). */
const clientesDa = (loja: LojaDemo): readonly ClienteDemo[] =>
  loja.clientes ?? clientesGerados(loja);

async function plantarClientes(
  { cliente, lojaId, loja }: Contexto,
  anaId: string,
): Promise<void> {
  for (const quem of clientesDa(loja)) {
    const daConta = quem.chave === CHAVE_DA_CLIENTE_DE_TESTE;
    await gravar(cliente, "store_customers", {
      id: idDoClienteDemo(loja, quem.chave),
      store_id: lojaId,
      // A conta de teste do cliente vê estes pedidos em /conta/pedidos.
      ...(daConta ? { identity_id: anaId } : {}),
      display_name: quem.nome,
      phone_e164: quem.telefone,
      email: quem.email,
      notes: quem.observacao ?? null,
      address: json({
        logradouro: quem.endereco.logradouro,
        numero: quem.endereco.numero,
        complemento: quem.endereco.complemento,
        bairro: quem.endereco.bairro,
        cidade: "Fortaleza",
        estado: "CE",
        cep: null,
        pontoDeReferencia: null,
      }),
    });
  }
}

function caminhoAte(status: StatusDemo, entrega: "DELIVERY" | "PICKUP" = "DELIVERY"): StatusDemo[] {
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
    // Retirada não passa por "saiu para entrega" (0053).
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
    // A recusa não é status desde a migração 0053: o pedido fica cancelado.
    case "REJECTED":
      return ["PENDING", "CANCELLED"];
  }
}

/** O mesmo código que a API dá (`orders/numero-pedido.ts`): A-0001 a A-9999. */
function codigoDoPedido(numero: number): string {
  return `A-${String(numero).padStart(4, "0")}`;
}

interface EscolhaCongelada {
  readonly grupoId: string;
  readonly opcaoId: string;
  readonly grupo: string;
  readonly opcao: string;
  readonly kind: string;
  readonly acrescimo: number;
}

/** O item do pedido, resolvido como a vitrine o teria vendido. */
function resolverItem(
  loja: LojaDemo,
  produto: ProdutoDemo,
  indiceDaVariante: number,
  extras: readonly string[],
) {
  const variantes = variantesDo(produto);
  const variante = variantes[indiceDaVariante % Math.max(variantes.length, 1)];
  const escolhas: EscolhaCongelada[] = [];
  for (const [eixo, opcao] of variante?.combinacao ?? []) {
    escolhas.push({
      grupoId: idDoGrupoDemo(loja, produto.chave, eixo.chave),
      opcaoId: idDaOpcaoDemo(loja, produto.chave, eixo.chave, opcao),
      grupo: eixo.nome,
      opcao: eixo.opcoes.find((o) => o.chave === opcao)!.nome,
      kind: "VARIATION",
      acrescimo: 0,
    });
  }
  for (const grupo of produto.grupos ?? []) {
    if (grupo.kind === "INGREDIENT") continue;
    const escolhidas = grupo.opcoes.filter((o) => extras.includes(o.chave));
    // Grupo obrigatório sem escolha explícita: a marcada, senão as primeiras.
    if (escolhidas.length < grupo.minimo) {
      const candidatas = grupo.opcoes.filter(
        (o) => o.indisponivel !== true && !escolhidas.includes(o),
      );
      const marcadas = candidatas.filter((o) => o.marcada === true);
      escolhidas.push(
        ...[...marcadas, ...candidatas.filter((o) => o.marcada !== true)].slice(
          0,
          grupo.minimo - escolhidas.length,
        ),
      );
    }
    for (const opcao of escolhidas) {
      escolhas.push({
        grupoId: idDoGrupoDemo(loja, produto.chave, grupo.chave),
        opcaoId: idDaOpcaoDemo(loja, produto.chave, grupo.chave, opcao.chave),
        grupo: grupo.nome,
        opcao: opcao.nome,
        kind: grupo.kind,
        acrescimo: opcao.acrescimo ?? 0,
      });
    }
  }
  const preco = variante
    ? (variante.promo ?? variante.preco)
    : (produto.promo ?? produto.preco);
  const varianteNome = variante?.nome ?? (loja.ehComida ? null : "Único");
  const varianteChave = variante?.chave ?? (loja.ehComida ? null : "unico");
  return {
    varianteId:
      varianteChave === null
        ? null
        : idDaVarianteDemo(loja, produto.chave, varianteChave),
    varianteNome,
    sku:
      varianteChave === null || loja.ehComida
        ? null
        : sku(produto, varianteChave),
    preco,
    precoBase: variante?.preco ?? produto.preco,
    tipoDePreco:
      (variante ? variante.promo : (produto.promo ?? null)) === null
        ? "BASE"
        : "PROMO",
    custo: Math.round(
      (produto.custo * (variante?.preco ?? produto.preco)) / produto.preco,
    ),
    escolhas,
  };
}

/** O roteiro escrito à mão (número fixo 2001…), como na primeira carga. */
function roteiroEscrito(loja: LojaDemo): readonly PedidoDoRoteiro[] {
  return (loja.pedidos ?? []).map((pedido, indice) => ({
    chave: `${loja.chave}:${indice}`,
    pedido,
    numero: 2001 + indice,
  }));
}

/** "2026-10-17" e os minutos desde a meia-noite, no relógio de Fortaleza. */
function relogioDaLoja(agora: Date): { dia: string; minutos: number } {
  const partes = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: FUSO,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(agora)
      .map((parte) => [parte.type, parte.value]),
  );
  return {
    dia: `${partes["year"]}-${partes["month"]}-${partes["day"]}`,
    minutos: Number(partes["hour"]) * 60 + Number(partes["minute"]),
  };
}

/** O próximo número da loja, pela mesma sequência que a API usa. */
async function proximoNumero(cliente: ClienteSql, lojaId: string): Promise<number> {
  const resultado = await cliente.query(
    `INSERT INTO app.store_sequences (store_id, kind, prefix, last_value)
     VALUES ($1, 'order', '', 1001)
     ON CONFLICT (store_id, kind) DO UPDATE
       SET last_value = app.store_sequences.last_value + 1
     RETURNING last_value`,
    [lojaId],
  );
  return Number(resultado.rows[0]!.last_value);
}

async function plantarPedidos(
  { cliente, lojaId, loja, donaId }: Contexto,
  agora: Date,
  roteiro: readonly PedidoDoRoteiro[],
): Promise<number> {
  const taxa = Number(loja.entrega["taxaPadraoCents"] ?? 0);
  const gratisAcima = loja.entrega["gratisAcimaDeCents"] as number | null;
  const pix = loja.pagamento["pix"] as {
    chave: string;
    tipo: string;
    titular: string;
  };
  let novos = 0;

  // A numeração da loja não pode devolver um número já usado: nem pelos
  // pedidos que existem nem pelos de número fixo do roteiro escrito à mão.
  await cliente.query(
    `INSERT INTO app.store_sequences (store_id, kind, prefix, last_value)
     SELECT $1, 'order', '', GREATEST($2::bigint, coalesce(max(number), 0))
       FROM app.orders WHERE store_id = $1
     ON CONFLICT (store_id, kind) DO UPDATE
       SET last_value = GREATEST(app.store_sequences.last_value, EXCLUDED.last_value)`,
    [lojaId, Math.max(1000, ...roteiro.map((r) => r.numero ?? 0))],
  );

  const clientes = clientesDa(loja);
  for (const { chave, pedido, numero: numeroFixo } of roteiro) {
    const pedidoId = id(`pedido:${chave}`);
    // Pedido gerado só tira número da sequência quando é novo de verdade.
    if (numeroFixo === undefined) {
      const existe = await cliente.query(
        "SELECT 1 FROM app.orders WHERE id = $1",
        [pedidoId],
      );
      if (existe.rows.length > 0) continue;
    }
    const numero = numeroFixo ?? (await proximoNumero(cliente, lojaId));
    const quem = clientes.find((c) => c.chave === pedido.cliente)!;
    const feitoEm = new Date(agora.getTime() - pedido.minutosAtras * 60_000);
    const passo = (n: number): Date =>
      new Date(feitoEm.getTime() + n * 6 * 60_000);
    const caminho = caminhoAte(pedido.status, pedido.entrega);

    const itens = pedido.itens.map(
      ([chaveDoProduto, quantidade, variante, extras]) => {
        const produto = loja.produtos.find((p) => p.chave === chaveDoProduto)!;
        const resolvido = resolverItem(
          loja,
          produto,
          variante ?? 0,
          extras ?? [],
        );
        const acrescimo = resolvido.escolhas.reduce(
          (s, e) => s + e.acrescimo,
          0,
        );
        return {
          produto,
          quantidade,
          ...resolvido,
          acrescimo,
          total: (resolvido.preco + acrescimo) * quantidade,
        };
      },
    );
    const subtotal = itens.reduce((s, i) => s + i.total, 0);
    const frete =
      pedido.entrega === "PICKUP" ||
      (gratisAcima !== null && subtotal >= gratisAcima)
        ? 0
        : taxa;
    const comPix = pedido.pagamento === "PIX";

    const entrou = await gravar(
      cliente,
      "orders",
      {
        id: pedidoId,
        store_id: lojaId,
        number: numero,
        code: codigoDoPedido(numero),
        public_token: tokenDeExemplo(`demo:${chave}`),
        store_customer_id: idDoClienteDemo(loja, quem.chave),
        status: pedido.status,
        channel: "ONLINE",
        fulfillment: pedido.entrega,
        payment_method: pedido.pagamento,
        change_for_cents:
          pedido.pagamento === "CASH"
            ? Math.ceil((subtotal + frete) / 5000) * 5000
            : null,
        pix_key_snapshot: comPix ? pix.chave : null,
        pix_holder_snapshot: comPix ? pix.titular : null,
        pix_key_type_snapshot: comPix ? pix.tipo : null,
        pix_account_name_snapshot: comPix ? pix.titular : null,
        subtotal_cents: subtotal,
        items_total_cents: subtotal,
        delivery_fee_cents: frete,
        delivery_fee_mode: frete === 0 ? "FREE" : "VALUE",
        total_cents: subtotal + frete,
        currency: "BRL",
        payment_status:
          pedido.status === "COMPLETED"
            ? "CONFIRMED"
            : comPix && pedido.status !== "CANCELLED"
              ? "AWAITING_PROOF"
              : "PENDING",
        cost_total_cents: itens.reduce((s, i) => s + i.custo * i.quantidade, 0),
        customer_note: pedido.observacao ?? null,
        idempotency_key: `demo-${chave}`,
        whatsapp_message_chars: 300 + itens.length * 60,
        whatsapp_clicked_at: passo(0.1),
        whatsapp_confirmed_at: passo(0.2),
        store_timezone: FUSO,
        placed_at: feitoEm,
        accepted_at: caminho.includes("ACCEPTED") ? passo(1) : null,
        completed_at:
          pedido.status === "COMPLETED" ? passo(caminho.length) : null,
        cancelled_at:
          pedido.status === "CANCELLED" ? passo(caminho.length) : null,
        cancel_reason:
          pedido.status === "CANCELLED"
            ? (pedido.observacao ?? "Cancelado")
            : null,
        created_at: feitoEm,
        updated_at: passo(caminho.length - 1),
      },
      { atualizar: false },
    );
    // Pedido não se reescreve: se já existia, itens e histórico também. Só o
    // código acompanha a regra da API (a primeira carga usou "B-" na moda).
    if (entrou === 0) {
      await cliente.query(
        "UPDATE app.orders SET code = $2 WHERE id = $1 AND code <> $2",
        [pedidoId, codigoDoPedido(numero)],
      );
      continue;
    }
    novos++;

    await gravar(
      cliente,
      "order_contacts",
      {
        order_id: pedidoId,
        store_id: lojaId,
        name: quem.nome,
        phone_e164: quem.telefone,
        email: quem.email,
        recipient_name: quem.nome,
        street: pedido.entrega === "DELIVERY" ? quem.endereco.logradouro : null,
        number: pedido.entrega === "DELIVERY" ? quem.endereco.numero : null,
        complement:
          pedido.entrega === "DELIVERY" ? quem.endereco.complemento : null,
        neighborhood:
          pedido.entrega === "DELIVERY" ? quem.endereco.bairro : null,
        city: pedido.entrega === "DELIVERY" ? "Fortaleza" : null,
        uf: pedido.entrega === "DELIVERY" ? "CE" : null,
        created_at: feitoEm,
        updated_at: feitoEm,
      },
      { chave: ["order_id"], atualizar: false },
    );

    for (const [posicao, item] of itens.entries()) {
      const itemId = id(`item:${chave}:${posicao}`);
      await gravar(
        cliente,
        "order_items",
        {
          id: itemId,
          store_id: lojaId,
          order_id: pedidoId,
          product_id: idDoProdutoDemo(loja, item.produto.chave),
          variant_id: item.varianteId,
          product_name: item.produto.nome,
          variant_name: item.varianteNome,
          sku_snapshot: item.sku,
          quantity: item.quantidade,
          unit_price_cents: item.preco,
          compare_at_cents:
            item.preco === item.precoBase ? null : item.precoBase,
          unit_cost_cents: item.custo,
          price_kind_snapshot: item.tipoDePreco,
          options_total_cents: item.acrescimo * item.quantidade,
          line_total_cents: item.total,
          sort_order: posicao,
          created_at: feitoEm,
        },
        { atualizar: false },
      );
      for (const [ordem, escolha] of item.escolhas.entries()) {
        await gravar(
          cliente,
          "order_item_options",
          {
            id: id(`escolha:${chave}:${posicao}:${ordem}`),
            store_id: lojaId,
            order_item_id: itemId,
            option_group_id: escolha.grupoId,
            option_item_id: escolha.opcaoId,
            group_name_snapshot: escolha.grupo,
            option_name_snapshot: escolha.opcao,
            kind_snapshot: escolha.kind,
            action: "ADD",
            quantity: 1,
            price_delta_cents: escolha.acrescimo,
            sort_order: ordem,
            created_at: feitoEm,
          },
          { atualizar: false },
        );
      }
    }

    for (const [n, estado] of caminho.entries()) {
      await gravar(
        cliente,
        "order_status_history",
        {
          id: id(`historico:${chave}:${estado}`),
          store_id: lojaId,
          order_id: pedidoId,
          from_status: n === 0 ? null : caminho[n - 1]!,
          to_status: estado,
          changed_by_identity_id: n === 0 ? null : donaId,
          actor_role: n === 0 ? "CUSTOMER" : "OWNER",
          reason: estado === "CANCELLED" ? (pedido.observacao ?? null) : null,
          occurred_at: passo(n),
          created_at: passo(n),
        },
        { atualizar: false },
      );
    }
  }

  return novos;
}

// ---------------------------------------------------------------------------
// Lojas novas (card #50)
// ---------------------------------------------------------------------------

/**
 * Cria (ou atualiza) a loja que o seed original não tem, com a dona dela. O
 * resto da apresentação é de `prepararLoja`, igual às do seed original.
 */
async function criarLojaNova(
  cliente: ClienteSql,
  loja: LojaDemo,
  ordem: number,
): Promise<{ lojaId: string; donaId: string }> {
  const nova = loja.nova!;
  const ehAdmin = nova.dono.email.toLowerCase() === CONTA_ADMIN.email;
  const donaId = await garantirConta(cliente, {
    email: nova.dono.email,
    nome: ehAdmin ? CONTA_ADMIN.nome : nova.dono.nome,
    senha: ehAdmin ? CONTA_ADMIN.senha : SENHA_DOS_DONOS,
  });
  const lojaId = id(`loja:${loja.chave}`);
  // Aprovadas aos poucos desde agosto: a administração vê lojas "novas".
  const aprovadaEm = new Date(Date.UTC(2026, 7, 1 + ordem * 3, 13));
  await gravar(cliente, "stores", {
    id: lojaId,
    code: `DEMO-${loja.chave.toUpperCase()}`,
    name: nova.nome,
    slug: nova.apelido,
    status: "ACTIVE",
    vertical_code: nova.ramo,
    vertical_schema_version: 1,
    timezone: FUSO,
    created_by: donaId,
    created_at: new Date(aprovadaEm.getTime() - 2 * 86_400_000),
    approved_at: aprovadaEm,
  });
  await vincular(cliente, lojaId, donaId, "OWNER");
  return { lojaId, donaId };
}

// ---------------------------------------------------------------------------
// A carga
// ---------------------------------------------------------------------------

export interface OpcoesDaDemonstracao {
  readonly cliente: ClienteSql;
  readonly agora?: Date;
  readonly relatar?: (linha: string) => void;
  /**
   * Não grava vídeo novo (mais rápido; os testes usam): só reaproveita os
   * que já estão na pasta.
   */
  readonly semVideos?: boolean;
}

/** O que a carga deixou, para o resumo e para os testes. */
export interface ResumoDaDemonstracao {
  readonly lojas: readonly { readonly apelido: string; readonly nome: string; readonly ramo: string }[];
}

/** As 24 lojas da demonstração, na ordem da carga. */
export const TODAS_AS_LOJAS_DEMO: readonly LojaDemo[] = [...LOJAS_DEMO, ...LOJAS_NOVAS];

export async function carregarDemonstracao({
  cliente,
  agora = new Date(),
  relatar = () => {},
  semVideos = false,
}: OpcoesDaDemonstracao): Promise<ResumoDaDemonstracao> {
  exigirAmbienteQueNaoEProducao(process.env);

  // Vídeos antes da transação: gravar é lento (tempo real) e não mexe no banco.
  const videos: ReadonlyMap<string, VideoGravado> = await gravarVideos(
    TODAS_AS_LOJAS_DEMO.flatMap(videosDaLoja),
    relatar,
    !semVideos,
  );
  const relogio = relogioDaLoja(agora);

  await cliente.query("BEGIN");
  try {
    // As contas de teste primeiro: a Ana é cliente das lojas.
    const adminId = await garantirConta(cliente, CONTA_ADMIN);
    await concederAdministracao(cliente, adminId);
    const donoId = await garantirConta(cliente, CONTA_DONO);
    const equipeId = await garantirConta(cliente, CONTA_EQUIPE);
    const anaId = await garantirConta(cliente, {
      ...CONTA_CLIENTE,
      telefone: CLIENTE_DE_TESTE.telefone,
    });
    await plantarEnderecoDaAna(cliente, anaId);
    const feed: string[] = [];
    for (const pessoa of PESSOAS_DO_FEED) {
      feed.push(await garantirConta(cliente, pessoa));
    }

    const plantadas: LojaPlantada[] = [];
    const resumo: { apelido: string; nome: string; ramo: string }[] = [];
    for (const [ordem, loja] of TODAS_AS_LOJAS_DEMO.entries()) {
      const lojaId =
        loja.nova === undefined
          ? LOJAS.find((l) => l.chave === loja.chave)?.id
          : (await criarLojaNova(cliente, loja, ordem)).lojaId;
      if (lojaId === undefined) continue;
      const encontrada = await cliente.query(
        `SELECT s.id, s.name, s.slug, s.vertical_code,
                (SELECT m.identity_id FROM app.store_members m
                  WHERE m.store_id = s.id AND m.role = 'OWNER' AND m.revoked_at IS NULL
                  ORDER BY m.created_at LIMIT 1) AS dona
           FROM app.stores s WHERE s.id = $1`,
        [lojaId],
      );
      const linha = encontrada.rows[0];
      if (linha === undefined) {
        relatar(
          `✘ loja ${loja.chave} não existe neste banco — rode o seed original primeiro (pnpm --filter @simpleclick/database seed)`,
        );
        continue;
      }
      const contexto: Contexto = {
        cliente,
        lojaId,
        loja,
        nome: String(linha.name),
        ramo: String(linha.vertical_code),
        donaId: linha.dona === null ? null : String(linha.dona),
        agora,
      };
      await prepararLoja(contexto);
      const produtos = await plantarCatalogo(contexto);
      const fotos = await fotografarOriginais(contexto);
      const comVideo = await plantarVideosDosProdutos(contexto, videos);
      await plantarClientes(contexto, anaId);
      const roteiro = [
        ...roteiroEscrito(loja),
        ...(loja.nova === undefined ? [] : pedidosDoMes(loja)),
        ...pedidosDeHoje(loja, relogio.dia, relogio.minutos, clientesDa(loja)),
      ];
      const pedidos = await plantarPedidos(contexto, agora, roteiro);
      await atualizarTotaisDosClientes(cliente, lojaId);
      const stories = await plantarStories(contexto, agora, videos);
      plantadas.push({ loja, lojaId, donaId: contexto.donaId });
      resumo.push({ apelido: String(linha.slug), nome: contexto.nome, ramo: contexto.ramo });
      relatar(
        `✔ ${contexto.nome} [${contexto.ramo}] /loja/${String(linha.slug)}: ${produtos} produtos${fotos > 0 ? ` (+${fotos} fotos do seed original)` : ""}, ${comVideo} com vídeo, ${stories} stories, ${clientesDa(loja).length} clientes, ${pedidos} pedido(s) novo(s)`,
      );
    }

    // Vínculos das contas de teste.
    const pastelaria = LOJAS.find((l) => l.chave === "pastelaria")!.id;
    const moda = LOJAS.find((l) => l.chave === "moda")!.id;
    await vincular(cliente, pastelaria, adminId, "OWNER");
    await vincular(cliente, pastelaria, donoId, "OWNER");
    await vincular(cliente, moda, donoId, "OWNER");
    await vincular(cliente, pastelaria, equipeId, "STAFF");

    const social = await plantarSocial(cliente, plantadas, { ana: anaId, feed }, agora);
    relatar(
      `✔ social: ${social.curtidas} curtida(s) nova(s), ${social.aprovados} comentário(s) aprovado(s) e ${social.pendentes} pendente(s) novos; Ana com ${social.lojasFavoritas} lojas e ${social.produtosFavoritos} produtos favoritos, ${social.recentes} lojas recentes`,
    );
    await cliente.query("COMMIT");

    for (const conta of CONTAS_DE_TESTE) {
      relatar(`✔ conta ${conta.papel.padEnd(7)} ${conta.email} / ${conta.senha}`);
    }
    return { lojas: resumo };
  } catch (erro) {
    await cliente.query("ROLLBACK");
    throw erro;
  }
}

/** Contagem de pedidos e total gasto, como a ficha do cliente mostra. */
async function atualizarTotaisDosClientes(
  cliente: ClienteSql,
  lojaId: string,
): Promise<void> {
  await cliente.query(
    `UPDATE app.store_customers c
        SET orders_count = t.pedidos,
            total_spent_cents = t.gasto,
            last_order_at = t.ultimo
       FROM (SELECT o.store_customer_id AS id,
                    count(*) FILTER (WHERE o.status <> 'CANCELLED')::int AS pedidos,
                    coalesce(sum(o.total_cents) FILTER (WHERE o.status = 'COMPLETED'), 0) AS gasto,
                    max(o.placed_at) AS ultimo
               FROM app.orders o
              WHERE o.store_id = $1 AND o.store_customer_id IS NOT NULL
              GROUP BY o.store_customer_id) t
      WHERE c.id = t.id AND c.store_id = $1`,
    [lojaId],
  );
}

/** A Ana mora em Fortaleza, como as lojas: o endereço principal dela. */
async function plantarEnderecoDaAna(
  cliente: ClienteSql,
  anaId: string,
): Promise<void> {
  const enderecoId = id("endereco:ana:fortaleza");
  await cliente.query(
    "UPDATE app.customer_addresses SET is_default = false WHERE identity_id = $1 AND id <> $2",
    [anaId, enderecoId],
  );
  await gravar(cliente, "customer_addresses", {
    id: enderecoId,
    identity_id: anaId,
    label: "Casa",
    recipient_name: CLIENTE_DE_TESTE.nome,
    street: CLIENTE_DE_TESTE.endereco.logradouro,
    number: CLIENTE_DE_TESTE.endereco.numero,
    complement: CLIENTE_DE_TESTE.endereco.complemento,
    neighborhood: CLIENTE_DE_TESTE.endereco.bairro,
    city: "Fortaleza",
    uf: "CE",
    zip: "60192070",
    reference_point: "Perto do Shopping Iguatemi",
    is_default: true,
    anonymized_at: null,
  });
}

async function principal(): Promise<number> {
  const { default: pg } = await import("pg");
  const direta = process.env.DATABASE_URL_DIRETA?.trim();
  const senha = process.env.SENHA_BANCO_ADMINISTRACAO?.trim();
  if (!direta || !senha) {
    process.stderr.write(
      "DATABASE_URL_DIRETA e SENHA_BANCO_ADMINISTRACAO precisam estar no .env da raiz.\n",
    );
    return 1;
  }
  const cliente = new pg.Client({
    connectionString: derivarUrlDePapel(direta, "sc_admin", senha),
  });
  await cliente.connect();
  try {
    await carregarDemonstracao({
      cliente,
      relatar: (linha) => process.stdout.write(`${linha}\n`),
      semVideos: process.argv.includes("--sem-videos"),
    });
    process.stdout.write(
      "Pronto. Imagens e vídeos em apps/web/public/demo/. Rodar de novo atualiza sem duplicar.\n",
    );
    return 0;
  } catch (erro) {
    process.stderr.write(
      `${erro instanceof Error ? erro.message : String(erro)}\n`,
    );
    return 1;
  } finally {
    await cliente.end();
  }
}

const chamadoDiretamente =
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (chamadoDiretamente) {
  process.exitCode = await principal();
}
