/**
 * O /explorar como rede social (card #49): cada PRODUTO é um post (fotos e
 * vídeos, curtir, comentar) e os stories são da LOJA (a bolinha é a foto de
 * perfil dela). Aqui mora só o vocabulário e as contas puras — sem rede.
 *
 * Os esquemas leem com folga: a API de vídeo/stories (#46) e a de curtidas e
 * comentários (#47) ainda estão chegando, então campo que não vier vira o
 * padrão e o recurso some da tela em vez de quebrar.
 */
import type { ProdutoDoFeed } from "@simpleclick/contracts";

// ---------------------------------------------------------------------------
// Mídias do post
// ---------------------------------------------------------------------------

export interface MidiaDoPost {
  readonly tipo: "imagem" | "video";
  readonly url: string;
  /** Quadro de capa do vídeo, quando há. */
  readonly capa?: string | undefined;
  /** Descrição da foto (ex.: "Cor: Preta"), para quem não vê. */
  readonly texto?: string | undefined;
}

type Bruto = Readonly<Record<string, unknown>>;

function objeto(valor: unknown): Bruto | null {
  return typeof valor === "object" && valor !== null && !Array.isArray(valor)
    ? (valor as Bruto)
    : null;
}

function texto(valor: unknown): string | undefined {
  return typeof valor === "string" && valor.trim() !== "" ? valor : undefined;
}

function identificador(valor: unknown): string | undefined {
  return typeof valor === "number" && Number.isFinite(valor) ? String(valor) : texto(valor);
}

function tipoDaMidia(valor: unknown): "imagem" | "video" {
  return valor === "video" ? "video" : "imagem";
}

/**
 * As mídias de um produto do feed: `midias` (quando a API mandar) ou, hoje,
 * só a `imagem`. Vídeo pode vir também como `video`/`videoUrl` solto.
 */
export function midiasDoProduto(produto: {
  readonly imagem: string | null;
}): readonly MidiaDoPost[] {
  const bruto = produto as unknown as Record<string, unknown>;
  const lidas: MidiaDoPost[] = [];
  if (Array.isArray(bruto["midias"])) {
    for (const item of bruto["midias"] as unknown[]) {
      const m = objeto(item);
      const url = texto(m?.["url"]);
      if (m === null || url === undefined) continue;
      const capa = texto(m["capa"]) ?? texto(m["capaUrl"]);
      const descricao = texto(m["texto"]);
      lidas.push({
        tipo: tipoDaMidia(m["tipo"]),
        url,
        ...(capa ? { capa } : {}),
        ...(descricao ? { texto: descricao } : {}),
      });
    }
  }
  if (lidas.length > 0) return lidas;
  if (produto.imagem) lidas.push({ tipo: "imagem", url: produto.imagem });
  const video = bruto["videoUrl"] ?? bruto["video"];
  if (typeof video === "string" && video !== "") {
    lidas.push({ tipo: "video", url: video, ...(produto.imagem ? { capa: produto.imagem } : {}) });
  }
  return lidas;
}

// ---------------------------------------------------------------------------
// Curtidas e comentários do post
// ---------------------------------------------------------------------------

export interface SocialDoPost {
  readonly curtidas: number;
  readonly curtiu: boolean;
  readonly comentarios: number;
  readonly favorito: boolean;
}

function inteiro(valor: unknown): number {
  return typeof valor === "number" && Number.isFinite(valor) && valor >= 0
    ? Math.floor(valor)
    : 0;
}

/** Contadores do post, lidos com folga (sem o campo, zero). */
export function socialDoProduto(produto: object): SocialDoPost {
  const b = produto as Record<string, unknown>;
  return {
    curtidas: inteiro(b["curtidas"]),
    curtiu: b["curtiu"] === true,
    comentarios: inteiro(b["comentarios"] ?? b["comentariosAprovados"]),
    favorito: b["favorito"] === true,
  };
}

/** "1 curtida", "12 curtidas", "1,2 mil curtidas". */
export function escreverContagem(n: number, um: string, varios: string): string {
  if (n === 1) return `1 ${um}`;
  return `${resumirNumero(n)} ${varios}`;
}

export function resumirNumero(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) {
    return `${(n / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil`;
  }
  return `${(n / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mi`;
}

export type SituacaoDoComentario = "aprovado" | "pendente";

export interface Comentario {
  readonly id: string;
  readonly autor: string;
  readonly texto: string;
  readonly criadoEm: string;
  readonly situacao: SituacaoDoComentario;
  /** É da pessoa da sessão (só assim um pendente aparece). */
  readonly meu: boolean;
}

function lerSituacao(valor: unknown): SituacaoDoComentario | null {
  const t = (texto(valor) ?? "aprovado").toLowerCase();
  if (t === "aprovado" || t === "approved") return "aprovado";
  if (t === "pendente" || t === "pending") return "pendente";
  return null;
}

/** Um comentário como a API mandar; recusado ou sem forma vira `null`. */
export function lerComentario(valor: unknown): Comentario | null {
  const c = objeto(valor);
  if (c === null) return null;
  const id = identificador(c["id"]);
  const corpo = texto(c["texto"]);
  const criadoEm = texto(c["criadoEm"]);
  if (id === undefined || corpo === undefined || criadoEm === undefined) return null;
  const situacao = lerSituacao(c["situacao"] ?? c["status"]);
  if (situacao === null) return null;
  const autor =
    texto(c["autor"]) ?? texto(objeto(c["autor"])?.["nome"]) ?? texto(c["autorNome"]);
  return {
    id,
    autor: autor?.trim() ?? "Cliente",
    texto: corpo,
    criadoEm,
    situacao,
    meu: c["meu"] === true,
  };
}

/** A lista `{comentarios:[…]}` (ou um array solto). */
export function lerComentarios(valor: unknown): readonly Comentario[] {
  const lista = Array.isArray(valor)
    ? valor
    : Array.isArray((valor as { comentarios?: unknown } | null)?.comentarios)
      ? (valor as { comentarios: unknown[] }).comentarios
      : [];
  return lista.map(lerComentario).filter((c): c is Comentario => c !== null);
}

/**
 * O que a gaveta mostra: os aprovados de todos e os pendentes só da própria
 * pessoa, do mais antigo para o mais novo.
 */
export function comentariosVisiveis(
  lista: readonly Comentario[],
): readonly Comentario[] {
  return lista
    .filter((c) => c.situacao === "aprovado" || c.meu)
    .sort((a, b) => a.criadoEm.localeCompare(b.criadoEm));
}

export const TAMANHO_MAXIMO_DO_COMENTARIO = 500;

// ---------------------------------------------------------------------------
// Stories (da loja)
// ---------------------------------------------------------------------------

export interface Story {
  readonly id: string;
  readonly tipo: "imagem" | "video";
  readonly url: string;
  readonly capa?: string | undefined;
  readonly legenda?: string | undefined;
  readonly criadoEm: string;
  /** Quanto tempo a foto fica na tela; vídeo usa a própria duração. */
  readonly duracaoMs: number;
  /** A API diz que a pessoa (com sessão) já viu. */
  readonly visto?: boolean | undefined;
}

export interface LojaComStories {
  readonly apelido: string;
  readonly nome: string;
  /** A foto de perfil da loja (a logo); sem ela, as iniciais. */
  readonly foto: string | null;
  readonly iniciais: string;
  readonly favorita: boolean;
  readonly stories: readonly Story[];
}

export const DURACAO_DA_FOTO_MS = 5_000;

function iniciaisDe(nome: string): string {
  const palavras = nome
    .split(/\s+/)
    .filter((p) => p !== "" && !["da", "de", "do", "das", "dos", "e"].includes(p.toLowerCase()));
  const letras = palavras.slice(0, 2).map((p) => p.slice(0, 1));
  return (letras.join("") || "?").toLocaleUpperCase("pt-BR");
}

/**
 * Lê `GET /v1/stories` (#46): `{lojas:[{loja:{apelido,nome,fotoDePerfil,
 * iniciais}, favorita, stories:[{id,tipo,url,capa,legenda,criadoEm,expiraEm,
 * duracaoSegundos,visto}]}]}`. Aceita também a loja "achatada" (apelido e
 * logo no próprio item). A API já tira os vencidos (24 h); por garantia, o que
 * tiver `expiraEm` no passado sai aqui.
 */
export function lerStories(valor: unknown, agora = Date.now()): readonly LojaComStories[] {
  const lojas = objeto(valor)?.["lojas"];
  if (!Array.isArray(lojas)) return [];
  const saida: LojaComStories[] = [];
  for (const item of lojas as unknown[]) {
    const grupo = objeto(item);
    const perfil = objeto(grupo?.["loja"]) ?? grupo;
    const apelido = texto(perfil?.["apelido"]);
    if (grupo === null || perfil === null || apelido === undefined) continue;
    if (!Array.isArray(grupo["stories"])) continue;
    const stories: Story[] = [];
    for (const bruto of grupo["stories"] as unknown[]) {
      const s = objeto(bruto);
      const id = identificador(s?.["id"]);
      const url = texto(s?.["url"]);
      const criadoEm = texto(s?.["criadoEm"]);
      if (s === null || id === undefined || url === undefined || criadoEm === undefined) continue;
      const expiraEm = texto(s["expiraEm"]);
      if (expiraEm !== undefined && Date.parse(expiraEm) <= agora) continue;
      const tipo = tipoDaMidia(s["tipo"]);
      const segundos =
        typeof s["duracaoSegundos"] === "number" && s["duracaoSegundos"] > 0
          ? s["duracaoSegundos"]
          : 15;
      const capa = texto(s["capa"]);
      const legenda = texto(s["legenda"]);
      stories.push({
        id,
        tipo,
        url,
        ...(capa ? { capa } : {}),
        ...(legenda ? { legenda } : {}),
        criadoEm,
        duracaoMs: tipo === "imagem" ? DURACAO_DA_FOTO_MS : Math.round(segundos * 1000),
        ...(s["visto"] === true ? { visto: true } : {}),
      });
    }
    if (stories.length === 0) continue;
    const nome = texto(perfil["nome"]) ?? apelido;
    saida.push({
      apelido,
      nome,
      foto:
        texto(perfil["fotoDePerfil"]) ??
        texto(perfil["foto"]) ??
        texto(perfil["logo"]) ??
        texto(perfil["logoUrl"]) ??
        null,
      iniciais: texto(perfil["iniciais"]) ?? iniciaisDe(nome),
      favorita: grupo["favorita"] === true,
      stories: [...stories].sort((a, b) => a.criadoEm.localeCompare(b.criadoEm)),
    });
  }
  return saida;
}

/** Onde este navegador guarda o último story visto de cada loja. */
export const CHAVE_DOS_STORIES_VISTOS = "sc:feed:stories-vistos";

export type StoriesVistos = Readonly<Record<string, string>>;

/** A loja tem story que a pessoa ainda não viu (anel verde). */
export function temStoryNovo(loja: LojaComStories, vistos: StoriesVistos): boolean {
  const visto = vistos[loja.apelido];
  return loja.stories.some(
    (s) => s.visto !== true && (visto === undefined || visto < s.criadoEm),
  );
}

/** Por onde começar: o primeiro story ainda não visto (ou o primeiro). */
export function primeiroNaoVisto(loja: LojaComStories, vistos: StoriesVistos): number {
  const visto = vistos[loja.apelido];
  const i = loja.stories.findIndex(
    (s) => s.visto !== true && (visto === undefined || s.criadoEm > visto),
  );
  return i === -1 ? 0 : i;
}

/** A fileira: não vistos antes; dentro de cada grupo, favoritas primeiro. */
export function ordenarStories(
  lojas: readonly LojaComStories[],
  vistos: StoriesVistos,
): readonly LojaComStories[] {
  const peso = (l: LojaComStories) =>
    (temStoryNovo(l, vistos) ? 0 : 2) + (l.favorita ? 0 : 1);
  return lojas
    .map((loja, i) => ({ loja, i }))
    .sort((a, b) => peso(a.loja) - peso(b.loja) || a.i - b.i)
    .map((x) => x.loja);
}

// ---------------------------------------------------------------------------
// Tempo
// ---------------------------------------------------------------------------

/** "agora", "5 min", "3 h", "2 d", "4 sem" ou "12 de out.". */
export function tempoRelativo(iso: string, agora = Date.now()): string {
  const quando = Date.parse(iso);
  if (!Number.isFinite(quando)) return "";
  const s = Math.max(0, Math.round((agora - quando) / 1000));
  if (s < 60) return "agora";
  const min = Math.floor(s / 60);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d} d`;
  if (d < 35) return `${Math.floor(d / 7)} sem`;
  return new Date(quando).toLocaleDateString("pt-BR", {
    day: "numeric",
    month: "short",
    timeZone: "America/Fortaleza",
  });
}

// ---------------------------------------------------------------------------
// O que a tela pede ao servidor (as ações moram em app/(explorar))
// ---------------------------------------------------------------------------

/** Uma página de itens vinda do servidor (rolagem infinita). */
export interface PaginaDeItens {
  readonly itens: readonly unknown[];
  readonly total: number;
  /** A sessão venceu e esta página veio sem os favoritos (card #106). */
  readonly sessaoVencida?: true | undefined;
}

export type ResultadoDaAcao<T> =
  | { readonly ok: true; readonly dados: T }
  | { readonly ok: false; readonly motivo: "precisa-entrar" | "indisponivel" | "recusado"; readonly mensagem?: string };

/** As ações do servidor que o feed usa, passadas por propriedade. */
export interface AcoesDoFeed {
  /** A próxima página de posts, com os mesmos filtros do endereço. */
  readonly maisPosts: (
    parametros: Readonly<Record<string, string>>,
    pagina: number,
  ) => Promise<ResultadoDaAcao<PaginaDeItens>>;
  readonly curtir: (
    produtoId: string,
    quer: boolean,
  ) => Promise<ResultadoDaAcao<{ readonly curtidas: number | null; readonly curtiu: boolean }>>;
  readonly favoritarProduto: (
    produtoId: string,
    quer: boolean,
  ) => Promise<ResultadoDaAcao<{ readonly favorito: boolean }>>;
  readonly comentarios: (produtoId: string) => Promise<ResultadoDaAcao<readonly Comentario[]>>;
  readonly comentar: (
    produtoId: string,
    texto: string,
  ) => Promise<ResultadoDaAcao<Comentario>>;
  /** Conta a visualização do story para a loja (só com sessão). */
  readonly storyVisto?: (storyId: string) => Promise<void>;
  /** A próxima página de lojas (aba Lojas), com os mesmos filtros. */
  readonly maisLojas?: (
    parametros: Readonly<Record<string, string>>,
    pagina: number,
  ) => Promise<ResultadoDaAcao<{ readonly itens: readonly unknown[]; readonly total: number }>>;
  /** Curtir a loja (o brilho no post da loja). */
  readonly curtirLoja?: (
    apelido: string,
    quer: boolean,
  ) => Promise<ResultadoDaAcao<{ readonly curtidas: number | null; readonly curtiu: boolean }>>;
}

// ---------------------------------------------------------------------------
// A vitrine da loja (perfil) mostra os produtos do catálogo como posts
// ---------------------------------------------------------------------------

/** O produto como o catálogo da vitrine o manda (só o que o post usa). */
export interface ProdutoDoCatalogo {
  readonly id: string;
  readonly nome: string;
  readonly chamada?: string | null;
  readonly precoCentavos: number | null;
  readonly precoAnteriorCentavos?: number | null;
  readonly imagem: string | null;
  readonly disponivel?: boolean;
  /** O atacado do produto (card #56); nulo ou ausente = só varejo. */
  readonly atacado?: ProdutoDoFeed["atacado"];
}

/** A loja da vitrine, para o topo do post. */
export interface LojaDaVitrineNoPost {
  readonly apelido: string;
  readonly nome: string;
  readonly ramo?: string | null;
  readonly logo: string | null;
  readonly formasDeEntrega?: readonly string[];
}

/**
 * Produto do catálogo no formato do post do feed (o mesmo `Post` desenha os
 * dois). Sem data de publicação: o topo do post não mostra "há quanto tempo".
 */
export function produtoDoCatalogoComoPost(
  produto: ProdutoDoCatalogo,
  loja: LojaDaVitrineNoPost,
  categoria: string | null,
): ProdutoDoFeed {
  return {
    id: produto.id,
    nome: produto.nome,
    descricao: produto.chamada ?? null,
    precoCentavos: produto.precoCentavos,
    precoOriginalCentavos: produto.precoAnteriorCentavos ?? null,
    imagem: produto.imagem,
    categoria,
    loja: {
      apelido: loja.apelido,
      nome: loja.nome,
      tipoDeNegocio: loja.ramo ?? "",
      logo: loja.logo,
      cidade: null,
      bairro: null,
      formasDeEntrega: [...(loja.formasDeEntrega ?? [])],
    },
    distanciaKm: null,
    publicadoEm: "",
    atacado: produto.atacado ?? null,
  };
}

/** Os posts do perfil: cada produto à venda uma vez, na ordem do catálogo. */
export function postsDoCatalogo(
  secoes: readonly { readonly nome: string; readonly produtos: readonly ProdutoDoCatalogo[] }[],
  loja: LojaDaVitrineNoPost,
): readonly ProdutoDoFeed[] {
  const vistos = new Set<string>();
  const posts: ProdutoDoFeed[] = [];
  for (const secao of secoes) {
    for (const produto of secao.produtos) {
      if (vistos.has(produto.id) || produto.disponivel === false) continue;
      vistos.add(produto.id);
      posts.push(produtoDoCatalogoComoPost(produto, loja, secao.nome));
    }
  }
  return posts;
}
