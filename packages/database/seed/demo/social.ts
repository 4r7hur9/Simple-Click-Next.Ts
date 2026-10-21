/**
 * A vida social da demonstração (card #50): curtidas, comentários (aprovados,
 * pendentes e um recusado), uma denúncia, favoritos, recentes e quem viu os
 * stories. Tudo previsível (`sorteio` por nome) e idempotente: curtida e
 * favorito são "uma linha por pessoa", comentário tem id fixo e não se
 * reescreve; só os RECENTES e as visualizações acompanham o relógio, para a
 * janela de 30 dias e os stories de 24 horas continuarem fazendo sentido.
 */

import type { ClienteSql } from "../../src/migrate.ts";
import type { LojaDemo, ProdutoDemo } from "./dados.ts";
import { id, sorteio } from "./escrita.ts";
import { idDoStory } from "./midia.ts";

const HORA = 3_600_000;
const DIA = 24 * HORA;

export interface LojaPlantada {
  readonly loja: LojaDemo;
  readonly lojaId: string;
  /** Quem modera (a primeira dona). */
  readonly donaId: string | null;
}

export interface PessoasDaCarga {
  /** A conta de teste do cliente. */
  readonly ana: string;
  /** As pessoas que curtem e comentam. */
  readonly feed: readonly string[];
}

const idDoProduto = (loja: LojaDemo, produto: ProdutoDemo): string =>
  id(`produto:${loja.chave}:${produto.chave}`);

const publicados = (loja: LojaDemo): readonly ProdutoDemo[] =>
  loja.produtos.filter((p) => p.rascunho !== true);

// ---------------------------------------------------------------------------
// Curtidas
// ---------------------------------------------------------------------------

async function plantarCurtidas(
  cliente: ClienteSql,
  { loja, lojaId }: LojaPlantada,
  pessoas: PessoasDaCarga,
  agora: Date,
): Promise<number> {
  let total = 0;
  for (const produto of publicados(loja)) {
    const produtoId = idDoProduto(loja, produto);
    const base = produto.destaque === true ? 4 : 0;
    const quantas = base + sorteio(`curtidas:${produtoId}`, 7);
    const quem = [...pessoas.feed]
      .sort((a, b) => sorteio(`${produtoId}:${a}`, 1000) - sorteio(`${produtoId}:${b}`, 1000))
      .slice(0, quantas);
    if (sorteio(`ana-curte:${produtoId}`, 5) === 0) quem.push(pessoas.ana);
    for (const pessoa of quem) {
      const resultado = await cliente.query(
        `INSERT INTO app.product_likes (identity_id, store_id, product_id, created_at)
         VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`,
        [pessoa, lojaId, produtoId, new Date(agora.getTime() - (1 + sorteio(`${produtoId}:${pessoa}:quando`, 20 * 24)) * HORA)],
      );
      total += resultado.rowCount ?? 0;
    }
  }
  const curtemALoja = 2 + sorteio(`curtidas-loja:${lojaId}`, pessoas.feed.length - 2);
  for (const pessoa of [
    ...pessoas.feed.slice(0, curtemALoja),
    ...(sorteio(`ana-curte-loja:${lojaId}`, 2) === 0 ? [pessoas.ana] : []),
  ]) {
    await cliente.query(
      `INSERT INTO app.store_likes (identity_id, store_id, created_at)
       VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
      [pessoa, lojaId, new Date(agora.getTime() - (2 + sorteio(`${lojaId}:${pessoa}`, 25)) * DIA)],
    );
  }
  return total;
}

// ---------------------------------------------------------------------------
// Comentários
// ---------------------------------------------------------------------------

const ELOGIOS_DE_COMIDA = [
  "Chegou quentinho e muito bem embalado. {produto} nota 10!",
  "Peço toda semana, o {produto} é o melhor do bairro.",
  "Porção caprichada, valeu cada centavo.",
  "Entrega rápida e o sabor é de comida feita em casa.",
  "Experimentei o {produto} hoje e já virei cliente.",
  "Atendimento muito educado pelo WhatsApp, recomendo!",
] as const;

const ELOGIOS_DE_VAREJO = [
  "Produto igualzinho à foto, chegou antes do prazo.",
  "Comprei o {produto} e amei a qualidade.",
  "Preço justo e atendimento atencioso. Voltarei!",
  "Retirei na loja, tudo separado e bem embalado.",
  "Já é a terceira vez que compro aqui, nunca decepciona.",
  "O {produto} superou as expectativas.",
] as const;

const PERGUNTAS = [
  "Vocês entregam no Montese? Queria muito pedir o {produto}.",
  "Tem previsão de chegar mais do {produto}?",
  "Aceitam cartão na entrega?",
] as const;

const DA_ANA = [
  "Pedi ontem e chegou certinho. O {produto} é maravilhoso!",
  "Melhor atendimento de Fortaleza, sempre volto aqui.",
  "Amei o {produto}, já salvei nos favoritos.",
] as const;

function texto(modelo: string, produto: ProdutoDemo | undefined): string {
  return modelo.replaceAll("{produto}", produto?.nome.toLowerCase() ?? "pedido");
}

type Situacao = "APROVADO" | "PENDENTE" | "RECUSADO";

async function plantarComentarios(
  cliente: ClienteSql,
  { loja, lojaId, donaId }: LojaPlantada,
  pessoas: PessoasDaCarga,
  agora: Date,
): Promise<{ aprovados: number; pendentes: number }> {
  const produtos = publicados(loja);
  const elogios = loja.ehComida ? ELOGIOS_DE_COMIDA : ELOGIOS_DE_VAREJO;
  const quantos = 3 + sorteio(`comentarios:${loja.chave}`, 3);
  const roteiro: {
    pessoa: string;
    situacao: Situacao;
    modelo: string;
    produto: ProdutoDemo | undefined;
  }[] = [];
  for (let i = 0; i < quantos; i++) {
    const naLoja = i === quantos - 1;
    const produto = naLoja
      ? undefined
      : produtos[sorteio(`comentario:${loja.chave}:${i}:produto`, produtos.length)];
    roteiro.push({
      pessoa: pessoas.feed[sorteio(`comentario:${loja.chave}:${i}:pessoa`, pessoas.feed.length)]!,
      situacao: "APROVADO",
      modelo: elogios[sorteio(`comentario:${loja.chave}:${i}:texto`, elogios.length)]!,
      produto,
    });
  }
  // Pendentes: a fila da loja (quase toda loja tem uma pergunta esperando).
  if (sorteio(`pendente:${loja.chave}`, 3) !== 0 || loja.nova === undefined) {
    roteiro.push({
      pessoa: pessoas.feed[sorteio(`pendente:${loja.chave}:pessoa`, pessoas.feed.length)]!,
      situacao: "PENDENTE",
      modelo: PERGUNTAS[sorteio(`pendente:${loja.chave}:texto`, PERGUNTAS.length)]!,
      produto: produtos[sorteio(`pendente:${loja.chave}:produto`, produtos.length)],
    });
  }
  // A Ana comenta em parte das lojas: aprovado numas, aguardando noutras.
  const anaComenta = sorteio(`ana-comenta:${loja.chave}`, 3);
  if (anaComenta !== 0) {
    roteiro.push({
      pessoa: pessoas.ana,
      situacao: anaComenta === 1 ? "APROVADO" : "PENDENTE",
      modelo: DA_ANA[sorteio(`ana-comenta:${loja.chave}:texto`, DA_ANA.length)]!,
      produto: produtos[sorteio(`ana-comenta:${loja.chave}:produto`, produtos.length)],
    });
  }
  if (sorteio(`recusado:${loja.chave}`, 4) === 0) {
    roteiro.push({
      pessoa: pessoas.feed[sorteio(`recusado:${loja.chave}:pessoa`, pessoas.feed.length)]!,
      situacao: "RECUSADO",
      modelo: "Visitem meu perfil para ganhar prêmios!!!",
      produto: undefined,
    });
  }

  let aprovados = 0;
  let pendentes = 0;
  for (const [i, item] of roteiro.entries()) {
    const quando = new Date(
      agora.getTime() -
        (item.situacao === "PENDENTE" ? 1 + sorteio(`c:${loja.chave}:${i}`, 20) : 24 + sorteio(`c:${loja.chave}:${i}`, 24 * 20)) * HORA,
    );
    const moderado = item.situacao === "PENDENTE" ? null : new Date(quando.getTime() + 2 * HORA);
    // Comentário não se reescreve: o que a loja moderou à mão fica como está.
    const entrou = await cliente.query(
      `INSERT INTO app.comments
         (id, store_id, product_id, identity_id, author_name, body, status,
          rejection_reason, moderated_by, moderated_at, created_at, updated_at)
       VALUES ($1, $2, $3, $4,
               -- O nome curto do autor, como \`app.nome_curto_da_pessoa\` faz
               -- (a função é só da aplicação): "Ana R.".
               (SELECT CASE WHEN array_length(n.p, 1) > 1
                            THEN n.p[1] || ' ' || upper(left(n.p[array_length(n.p, 1)], 1)) || '.'
                            ELSE n.p[1] END
                  FROM (SELECT regexp_split_to_array(btrim(i.display_name), '\\s+') AS p
                          FROM app.identities i WHERE i.id = $4) n),
               $5, $6, $7, $8, $9, $10, $10)
       -- Só o nome do autor acompanha a conta; o resto não se reescreve.
       ON CONFLICT (id) DO UPDATE SET author_name = EXCLUDED.author_name
       RETURNING (xmax = 0) AS novo`,
      [
        id(`comentario:${loja.chave}:${i}`),
        lojaId,
        item.produto === undefined ? null : idDoProduto(loja, item.produto),
        item.pessoa,
        texto(item.modelo, item.produto),
        item.situacao,
        item.situacao === "RECUSADO" ? "Propaganda não é permitida." : null,
        moderado === null ? null : donaId,
        moderado,
        quando,
      ],
    );
    if (entrou.rows[0]?.novo === true) {
      if (item.situacao === "APROVADO") aprovados++;
      if (item.situacao === "PENDENTE") pendentes++;
    }
  }
  // Uma denúncia num aprovado das lojas do seed original (fila de denúncias).
  if (loja.nova === undefined) {
    await cliente.query(
      `INSERT INTO app.comment_reports (comment_id, store_id, identity_id, reason, created_at)
       SELECT $1, $2, $3, 'Achei o comentário ofensivo.', $4
        WHERE EXISTS (SELECT 1 FROM app.comments WHERE id = $1 AND status = 'APROVADO')
       ON CONFLICT DO NOTHING`,
      [id(`comentario:${loja.chave}:0`), lojaId, pessoas.feed.at(-1)!, new Date(agora.getTime() - 3 * HORA)],
    );
  }
  return { aprovados, pendentes };
}

// ---------------------------------------------------------------------------
// Favoritos, recentes e stories vistos (da Ana)
// ---------------------------------------------------------------------------

async function plantarDaAna(
  cliente: ClienteSql,
  lojas: readonly LojaPlantada[],
  ana: string,
  agora: Date,
): Promise<{ lojasFavoritas: number; produtosFavoritos: number; recentes: number }> {
  let lojasFavoritas = 0;
  let produtosFavoritos = 0;
  let recentes = 0;
  for (const [ordem, { loja, lojaId }] of lojas.entries()) {
    const favorita = sorteio(`ana-favorita:${loja.chave}`, 3) === 0 || loja.chave === "pastelaria";
    if (favorita) {
      await cliente.query(
        `INSERT INTO app.favorite_stores (identity_id, store_id, created_at)
         VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
        [ana, lojaId, new Date(agora.getTime() - (5 + ordem) * DIA)],
      );
      lojasFavoritas++;
    }
    for (const produto of publicados(loja)) {
      const produtoId = idDoProduto(loja, produto);
      if (sorteio(`ana-favorito:${produtoId}`, 9) !== 0) continue;
      await cliente.query(
        `INSERT INTO app.favorite_products (identity_id, store_id, product_id, created_at)
         VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`,
        [ana, lojaId, produtoId, new Date(agora.getTime() - (1 + sorteio(`${produtoId}:fav`, 40)) * DIA)],
      );
      produtosFavoritos++;
    }
    // Recentes: a maioria nos últimos 30 dias; algumas lojas antes disso (a
    // janela de recentes as deixa de fora). Acompanha o relógio a cada carga.
    const visita = sorteio(`ana-visita:${loja.chave}`, 5);
    if (visita === 0) continue;
    const diasAtras = visita === 4 ? 35 + sorteio(`ana-visita:${loja.chave}:longe`, 20) : sorteio(`ana-visita:${loja.chave}:dias`, 26);
    const ultima = new Date(agora.getTime() - diasAtras * DIA - sorteio(`ana-visita:${loja.chave}:hora`, 20) * HORA);
    await cliente.query(
      `INSERT INTO app.store_visits (identity_id, store_id, first_visited_at, last_visited_at, visit_count)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (identity_id, store_id) DO UPDATE
         SET last_visited_at = EXCLUDED.last_visited_at,
             first_visited_at = LEAST(app.store_visits.first_visited_at, EXCLUDED.first_visited_at),
             visit_count = GREATEST(app.store_visits.visit_count, EXCLUDED.visit_count)`,
      [ana, lojaId, new Date(ultima.getTime() - 60 * DIA), ultima, 1 + sorteio(`ana-visita:${loja.chave}:vezes`, 9)],
    );
    recentes++;
  }
  return { lojasFavoritas, produtosFavoritos, recentes };
}

/** Quem viu os stories: a Ana viu os de algumas lojas; o contador sobe junto. */
async function plantarVisualizacoes(
  cliente: ClienteSql,
  lojas: readonly LojaPlantada[],
  pessoas: PessoasDaCarga,
  agora: Date,
): Promise<void> {
  for (const { loja, lojaId } of lojas) {
    const anaViu = sorteio(`ana-viu:${loja.chave}`, 3) === 0;
    for (const story of loja.stories ?? []) {
      const storyId = idDoStory(loja, story);
      const viram = [
        ...pessoas.feed.slice(0, 2 + sorteio(`viram:${storyId}`, pessoas.feed.length - 2)),
        ...(anaViu ? [pessoas.ana] : []),
      ];
      for (const pessoa of viram) {
        await cliente.query(
          `INSERT INTO app.story_views (story_id, identity_id, store_id, viewed_at)
           SELECT $1, $2, $3, $4 WHERE EXISTS (SELECT 1 FROM app.stories WHERE id = $1)
           ON CONFLICT DO NOTHING`,
          [storyId, pessoa, lojaId, new Date(agora.getTime() - 10 * 60_000)],
        );
      }
      // O contador da loja conta também quem viu sem conta.
      await cliente.query(
        `UPDATE app.stories
            SET views_count = (SELECT count(*) FROM app.story_views WHERE story_id = $1) + $2
          WHERE id = $1`,
        [storyId, 15 + sorteio(`visitantes:${storyId}`, 120)],
      );
    }
  }
}

export interface ResumoSocial {
  readonly curtidas: number;
  readonly aprovados: number;
  readonly pendentes: number;
  readonly lojasFavoritas: number;
  readonly produtosFavoritos: number;
  readonly recentes: number;
}

export async function plantarSocial(
  cliente: ClienteSql,
  lojas: readonly LojaPlantada[],
  pessoas: PessoasDaCarga,
  agora: Date,
): Promise<ResumoSocial> {
  let curtidas = 0;
  let aprovados = 0;
  let pendentes = 0;
  for (const plantada of lojas) {
    curtidas += await plantarCurtidas(cliente, plantada, pessoas, agora);
    const comentarios = await plantarComentarios(cliente, plantada, pessoas, agora);
    aprovados += comentarios.aprovados;
    pendentes += comentarios.pendentes;
  }
  const daAna = await plantarDaAna(cliente, lojas, pessoas.ana, agora);
  await plantarVisualizacoes(cliente, lojas, pessoas, agora);
  return { curtidas, aprovados, pendentes, ...daAna };
}
