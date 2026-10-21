/**
 * O RASCUNHO da vitrine: o que o dono está editando em /painel/aparencia e
 * ainda não salvou (card #36).
 *
 * A prévia da tela de Aparência é a PRÓPRIA loja pública: as mesmas páginas
 * (`TelaDaLoja` e `TelaDoCatalogo`), com os mesmos componentes e o mesmo CSS,
 * abertas numa moldura com a largura do computador ou do celular. A única
 * diferença é de onde vêm os dados: em vez do que está salvo, a página usa
 * este rascunho por cima da loja — nome, descrição, logo, cor de destaque,
 * fotos (com as versões do celular) e selo.
 *
 * O rascunho viaja num cookie curto (`sc_previa`, só nas rotas da prévia de cada loja, 10
 * minutos), escrito pelo navegador do dono a cada mudança. O servidor confere
 * tudo antes de usar: o texto é cortado no tamanho de cada campo, a cor tem de
 * ser `#rrggbb` e as fotos passam pelo mesmo `ehEnderecoDeImagem` do salvamento
 * — o rascunho nunca leva script nem endereço estranho para a página.
 */
import {
  COR_DE_DESTAQUE_PADRAO,
  COR_DE_FUNDO_DA_VITRINE,
  ehCorHexadecimal,
  ehEnderecoDeImagem,
  PREFERENCIAS_DO_SELO_DE_STATUS,
  type TemaDaLoja,
  type Vitrine,
} from "@simpleclick/contracts";

export const COOKIE_DA_PREVIA = "sc_previa";
/** Por quanto tempo o rascunho vale, em segundos. */
export const VALIDADE_DO_RASCUNHO_EM_SEGUNDOS = 600;
/** As rotas da prévia da loja: `/loja/<loja>/previa/<parte>`. */
export const caminhoDaPrevia = (apelido: string): string =>
  `/loja/${encodeURIComponent(apelido)}/previa`;

export interface RascunhoDaVitrine {
  readonly apelido: string;
  readonly nome: string;
  readonly boasVindas: string;
  readonly logo: string;
  readonly corDestaque: string;
  readonly fundoVitrine: string;
  readonly fundoVitrineCelular: string;
  readonly topoCardapio: string;
  readonly topoCardapioCelular: string;
  readonly seloDeStatus: string;
  readonly coresDasImagens: Readonly<Record<string, string>>;
}

const MAXIMOS = { nome: 80, boasVindas: 280, endereco: 1000 } as const;

/** O texto como o cookie o leva: JSON em UTF-8, em base64 sem `=`, `+` e `/`. */
export function codificarRascunho(rascunho: RascunhoDaVitrine): string {
  const bytes = new TextEncoder().encode(JSON.stringify(rascunho));
  let binario = "";
  for (const byte of bytes) binario += String.fromCharCode(byte);
  return btoa(binario)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

function decodificar(texto: string): unknown {
  const base64 = texto.replaceAll("-", "+").replaceAll("_", "/");
  const binario = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "="));
  const bytes = Uint8Array.from(binario, (letra) => letra.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
}

const texto = (valor: unknown, maximo: number): string =>
  typeof valor === "string" ? valor.slice(0, maximo) : "";

const foto = (valor: unknown): string =>
  typeof valor === "string" &&
  valor.length <= MAXIMOS.endereco &&
  ehEnderecoDeImagem(valor)
    ? valor
    : "";

/**
 * Lê e CONFERE o rascunho do cookie. Nulo quando não há, quando está torto ou
 * quando é de outra loja.
 */
export function lerRascunho(
  valor: string | undefined,
  apelido: string,
): RascunhoDaVitrine | null {
  if (valor === undefined || valor === "") return null;
  let bruto: unknown;
  try {
    bruto = decodificar(valor);
  } catch {
    return null;
  }
  if (typeof bruto !== "object" || bruto === null) return null;
  const lido = bruto as Record<string, unknown>;
  if (lido["apelido"] !== apelido) return null;

  const cores: Record<string, string> = {};
  const bruteCores = lido["coresDasImagens"];
  if (typeof bruteCores === "object" && bruteCores !== null) {
    for (const [endereco, cor] of Object.entries(bruteCores)) {
      if (Object.keys(cores).length >= 6) break;
      if (ehEnderecoDeImagem(endereco) && ehCorHexadecimal(cor)) {
        cores[endereco] = cor.toLowerCase();
      }
    }
  }
  const selo = lido["seloDeStatus"];
  return {
    apelido,
    nome: texto(lido["nome"], MAXIMOS.nome),
    boasVindas: texto(lido["boasVindas"], MAXIMOS.boasVindas),
    logo: foto(lido["logo"]),
    corDestaque: ehCorHexadecimal(lido["corDestaque"])
      ? lido["corDestaque"].toLowerCase()
      : "",
    fundoVitrine: foto(lido["fundoVitrine"]),
    fundoVitrineCelular: foto(lido["fundoVitrineCelular"]),
    topoCardapio: foto(lido["topoCardapio"]),
    topoCardapioCelular: foto(lido["topoCardapioCelular"]),
    seloDeStatus:
      typeof selo === "string" &&
      (PREFERENCIAS_DO_SELO_DE_STATUS as readonly string[]).includes(selo)
        ? selo
        : "",
    coresDasImagens: cores,
  };
}

/**
 * A vitrine com o rascunho por cima. O que o rascunho não diz (loja nova, sem
 * nome ainda) continua como está salvo.
 */
export function vitrineComRascunho(
  vitrine: Vitrine,
  rascunho: RascunhoDaVitrine,
): Vitrine {
  const { loja } = vitrine;
  const temaSalvo = loja.tema;
  const tema: TemaDaLoja = {
    corDestaque:
      rascunho.corDestaque !== ""
        ? rascunho.corDestaque
        : (temaSalvo?.corDestaque ?? COR_DE_DESTAQUE_PADRAO),
    corDeFundo: COR_DE_FUNDO_DA_VITRINE,
    fundoVitrine: rascunho.fundoVitrine || null,
    topoCardapio: rascunho.topoCardapio || null,
    fundoVitrineCelular: rascunho.fundoVitrineCelular || null,
    topoCardapioCelular: rascunho.topoCardapioCelular || null,
    seloDeStatus:
      (rascunho.seloDeStatus as TemaDaLoja["seloDeStatus"]) ||
      temaSalvo?.seloDeStatus,
    coresDasImagens: {
      ...(temaSalvo?.coresDasImagens ?? {}),
      ...rascunho.coresDasImagens,
    },
  };
  return {
    ...vitrine,
    loja: {
      ...loja,
      nome: rascunho.nome.trim() !== "" ? rascunho.nome : loja.nome,
      boasVindas:
        rascunho.boasVindas.trim() !== "" ? rascunho.boasVindas : null,
      logo: rascunho.logo || null,
      // A capa antiga é a foto de fundo do computador (as duas andam juntas).
      capa: rascunho.fundoVitrine || null,
      tema,
    },
  };
}
