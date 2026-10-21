/**
 * Quem está logado, do jeito que a barra do topo precisa (card #22).
 *
 * A fonte é `GET /v1/eu`. A leitura aqui é TOLERANTE de propósito: a barra
 * aparece em todo o site, e um campo novo na resposta (papel efetivo, marca de
 * administração) não pode derrubar a página — no pior caso a pessoa aparece
 * como visitante. Quem decide acesso continua sendo a API, em cada rota; a
 * barra só mostra atalhos.
 */
/** Os cinco jeitos de a barra se apresentar. */
export type PapelNaBarra =
  "visitante" | "cliente" | "dono" | "equipe" | "admin";

export interface LojaNaBarra {
  readonly apelido: string;
  readonly nome: string;
}

export type UsuarioDaBarra =
  | { readonly papel: "visitante" }
  | {
      readonly papel: Exclude<PapelNaBarra, "visitante">;
      readonly nome: string;
      readonly primeiroNome: string;
      readonly iniciais: string;
      readonly email: string;
      /** A loja em uso (a escolhida, ou a única); só para dono e equipe. */
      readonly loja: LojaNaBarra | null;
      /** Administra mais de uma loja: mostra "Trocar de loja". */
      readonly temOutrasLojas: boolean;
    };

export const VISITANTE: UsuarioDaBarra = { papel: "visitante" };

/** Só o que a barra lê de `/v1/eu`; o resto da resposta passa sem conferir. */
interface EuTolerante {
  readonly email: string;
  readonly nome: string | null;
  readonly papel: string | null;
  readonly lojas: readonly {
    readonly apelido: string;
    readonly nome: string;
    readonly papel: string | null;
  }[];
  // Campos que podem chegar depois (outro card): lidos se vierem.
  readonly papelEfetivo: string | null;
  readonly admin: boolean;
}

function registro(valor: unknown): Record<string, unknown> | null {
  return typeof valor === "object" && valor !== null && !Array.isArray(valor)
    ? (valor as Record<string, unknown>)
    : null;
}

function textoOuNulo(valor: unknown): string | null {
  return typeof valor === "string" ? valor : null;
}

function lerEu(corpo: unknown): EuTolerante | null {
  const raiz = registro(corpo);
  const identidade = registro(raiz?.["identidade"]);
  if (raiz === null || identidade === null) return null;
  const email = identidade["email"];
  if (typeof email !== "string") return null;

  // `lojasDaConta` (quando vem) traz todas as lojas da conta; `lojas` só as
  // do papel da sessão.
  const lojasRecebidas = Array.isArray(raiz["lojasDaConta"])
    ? raiz["lojasDaConta"]
    : Array.isArray(raiz["lojas"])
      ? raiz["lojas"]
      : [];
  const lojas = lojasRecebidas.flatMap((item: unknown) => {
    const loja = registro(item);
    const apelido = loja?.["apelido"];
    const nome = loja?.["nome"];
    if (typeof apelido !== "string" || typeof nome !== "string") return [];
    return [{ apelido, nome, papel: textoOuNulo(loja?.["papel"]) }];
  });

  return {
    email,
    nome: textoOuNulo(identidade["nome"]),
    papel: textoOuNulo(identidade["papel"]),
    lojas,
    papelEfetivo: textoOuNulo(raiz["papelEfetivo"]),
    admin: raiz["adminDaPlataforma"] === true || raiz["admin"] === true,
  };
}

/** Normaliza nomes de papel em português ou no código da API. */
function papelDeTexto(texto: string | null | undefined): PapelNaBarra | null {
  switch (texto?.trim().toUpperCase()) {
    case "ADMIN":
    case "ADMINISTRADOR":
      return "admin";
    case "OWNER":
    case "DONO":
      return "dono";
    case "STAFF":
    case "EQUIPE":
      return "equipe";
    case "CUSTOMER":
    case "CLIENTE":
      return "cliente";
    default:
      return null;
  }
}

/** Decide o papel: o efetivo, se a API mandar; senão, deduz das lojas. */
function papelDoEu(eu: EuTolerante): Exclude<PapelNaBarra, "visitante"> {
  if (eu.admin) return "admin";
  const efetivo = papelDeTexto(eu.papelEfetivo);
  if (efetivo !== null && efetivo !== "visitante") return efetivo;
  if (papelDeTexto(eu.papel) === "admin") return "admin";
  if (eu.lojas.length === 0) return "cliente";
  return eu.lojas.some((loja) => papelDeTexto(loja.papel) === "dono")
    ? "dono"
    : "equipe";
}

/** "Ana Ribeiro" → "AR"; sem nome, a primeira letra do e-mail. */
export function iniciaisDe(nome: string): string {
  // Só palavras que começam com letra: "Cliente Janela 23" vira "CJ".
  const partes = nome
    .trim()
    .split(/\s+/)
    .filter((parte) => /^\p{L}/u.test(parte));
  const primeira = partes[0]?.[0] ?? "";
  const ultima = partes.length > 1 ? (partes.at(-1)?.[0] ?? "") : "";
  return (primeira + ultima).toUpperCase() || "?";
}

/**
 * Monta o usuário da barra a partir do corpo de `/v1/eu`. Corpo fora do
 * esperado vira visitante, e não erro.
 */
export function usuarioDoEu(
  corpo: unknown,
  lojaEscolhida?: string,
): UsuarioDaBarra {
  const eu = lerEu(corpo);
  if (eu === null) return VISITANTE;

  const papel = papelDoEu(eu);
  const nomeInformado = eu.nome?.trim() ?? "";
  const nome =
    nomeInformado !== "" ? nomeInformado : (eu.email.split("@")[0] ?? "");
  const primeiroNome = nome.split(/\s+/)[0] ?? nome;

  const lojas = papel === "dono" || papel === "equipe" ? eu.lojas : [];
  const escolhida = lojas.find((loja) => loja.apelido === lojaEscolhida);
  const unica = lojas.length === 1 ? lojas[0] : undefined;
  const loja = escolhida ?? unica;

  return {
    papel,
    nome,
    primeiroNome,
    iniciais: iniciaisDe(nome),
    email: eu.email,
    loja:
      loja === undefined ? null : { apelido: loja.apelido, nome: loja.nome },
    temOutrasLojas: lojas.length > 1,
  };
}

/** Rótulo do selo de cada papel logado; o visitante não leva selo. */
export const SELO_DO_PAPEL: Readonly<Record<PapelNaBarra, string | null>> = {
  visitante: null,
  cliente: "Cliente",
  dono: "Dono",
  equipe: "Equipe",
  admin: "Admin",
};

/**
 * Para onde a pessoa volta depois de sair. Página da loja é pública: volta
 * para ela. Painel, administração e conta pedem sessão: volta ao início.
 * Só caminho interno — nunca `//outro-site`.
 */
export function destinoDepoisDeSair(caminho: unknown): string {
  if (typeof caminho !== "string") return "/";
  if (!caminho.startsWith("/") || caminho.startsWith("//")) return "/";
  if (caminho.includes("\\")) return "/";
  return caminho.startsWith("/loja/") ? caminho : "/";
}

/** O endereço de entrar ou cadastrar que traz a pessoa de volta aqui. */
export function enderecoComRetorno(
  destino: "/entrar" | "/cadastrar",
  caminho: string | null,
): string {
  if (caminho === null || caminho === "/" || !caminho.startsWith("/")) {
    return destino;
  }
  if (caminho.startsWith("//") || caminho === destino) return destino;
  return `${destino}?proximo=${encodeURIComponent(caminho)}`;
}

/** Telas sem barra: o cardápio na TV ocupa a tela inteira, sem pessoa. */
export function caminhoSemBarra(caminho: string | null): boolean {
  if (caminho === null) return false;
  return /^(?:\/loja\/[^/]+)?\/tv(?:\/|$)/.test(caminho);
}

/** O desenho de cada item; quem desenha (features) troca o nome pelo ícone. */
export type IconeDoItem =
  | "entrar"
  | "criar-conta"
  | "loja"
  | "inicio"
  | "pedidos"
  | "dados"
  | "enderecos"
  | "favoritos"
  | "explorar"
  | "seguranca"
  | "painel"
  | "ver-loja"
  | "conta"
  | "trocar"
  | "admin"
  | "auditoria";

export interface ItemDoUsuario {
  readonly id: string;
  readonly rotulo: string;
  readonly href: string;
  readonly icone: IconeDoItem;
  /** A ação principal do papel, pintada no verde da marca. */
  readonly destaque?: boolean;
  /** Ativo só no endereço exato (a Visão geral da conta não vale para /conta/*). */
  readonly exato?: boolean;
}

/** O feed (/explorar) é público: todo papel tem o caminho para ele. */
const EXPLORAR: ItemDoUsuario = {
  id: "explorar",
  rotulo: "Explorar",
  href: "/explorar",
  icone: "explorar",
};

const MINHA_CONTA: ItemDoUsuario = {
  id: "conta",
  rotulo: "Minha conta",
  href: "/conta",
  icone: "conta",
};

/**
 * Os itens de cada papel. `caminho` é a página atual (para o "Entrar" trazer
 * a pessoa de volta) e `loja`, a loja aberta, quando há uma.
 */
export function itensDoUsuario(
  usuario: UsuarioDaBarra,
  caminho: string | null,
  loja?: LojaNaBarra,
): ItemDoUsuario[] {
  switch (usuario.papel) {
    case "visitante":
      return [
        EXPLORAR,
        {
          id: "entrar",
          rotulo: "Entrar",
          href: enderecoComRetorno("/entrar", caminho),
          icone: "entrar",
        },
        {
          id: "criar-conta",
          rotulo: "Criar conta",
          href: enderecoComRetorno("/cadastrar", caminho),
          icone: "criar-conta",
          destaque: true,
        },
      ];
    case "cliente":
      return [
        ...(loja === undefined
          ? []
          : [
              {
                id: "loja",
                rotulo: "Voltar à loja",
                href: `/loja/${loja.apelido}`,
                icone: "loja",
              } satisfies ItemDoUsuario,
            ]),
        EXPLORAR,
        { id: "inicio", rotulo: "Visão geral", href: "/conta", icone: "inicio", exato: true },
        { id: "pedidos", rotulo: "Pedidos", href: "/conta/pedidos", icone: "pedidos" },
        { id: "dados", rotulo: "Dados", href: "/conta/dados", icone: "dados" },
        { id: "enderecos", rotulo: "Endereços", href: "/conta/enderecos", icone: "enderecos" },
        { id: "seguranca", rotulo: "Segurança", href: "/conta/seguranca", icone: "seguranca" },
        { id: "favoritos", rotulo: "Favoritos", href: "/conta/favoritos", icone: "favoritos" },
      ];
    case "dono":
    case "equipe":
      return [
        {
          id: "painel",
          rotulo: "Painel da loja",
          href: "/painel",
          icone: "painel",
        },
        ...(usuario.loja === null
          ? []
          : [
              {
                id: "ver-loja",
                rotulo: "Ver minha loja",
                href: `/loja/${usuario.loja.apelido}`,
                icone: "ver-loja",
              } satisfies ItemDoUsuario,
            ]),
        EXPLORAR,
        MINHA_CONTA,
        ...(usuario.temOutrasLojas
          ? [
              {
                id: "trocar",
                rotulo: "Trocar de loja",
                href: "/escolher-loja",
                icone: "trocar",
              } satisfies ItemDoUsuario,
            ]
          : []),
      ];
    case "admin":
      return [
        {
          id: "admin",
          rotulo: "Administração",
          href: "/admin/lojas",
          icone: "admin",
        },
        {
          id: "auditoria",
          rotulo: "Auditoria",
          href: "/admin/auditoria",
          icone: "auditoria",
        },
        EXPLORAR,
        MINHA_CONTA,
      ];
  }
}

/** O item é a página atual: o mesmo endereço ou uma página dentro dele. */
export function itemAtivo(
  caminho: string | null,
  href: string,
  exato = false,
): boolean {
  if (caminho === null) return false;
  const semBusca = href.split("?")[0] ?? href;
  if (exato) return caminho === semBusca;
  return caminho === semBusca || caminho.startsWith(`${semBusca}/`);
}

/**
 * O nome como se lê: se veio todo em maiúsculas ("ARTHUR BRUNO"), vira
 * capitalização normal ("Arthur Bruno"); nome já misturado fica como está.
 */
export function nomeLegivel(nome: string): string {
  if (nome !== nome.toLocaleUpperCase("pt-BR") || nome === nome.toLocaleLowerCase("pt-BR")) {
    return nome;
  }
  const ligacoes = new Set(["da", "de", "do", "das", "dos", "e"]);
  return nome
    .toLocaleLowerCase("pt-BR")
    .split(/(\s+)/)
    .map((parte, i) =>
      i > 0 && ligacoes.has(parte)
        ? parte
        : parte.charAt(0).toLocaleUpperCase("pt-BR") + parte.slice(1),
    )
    .join("");
}
