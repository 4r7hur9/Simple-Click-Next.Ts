/**
 * Conferência do ambiente do SITE na partida (card #158).
 *
 * A API recusa partir com variável faltando (`apps/api/src/core/env.ts`). O site
 * não tinha essa porta: cada variável é lida onde é usada e, quando falta, cai em
 * um padrão de DESENVOLVIMENTO (`https://simpleclick.localhost`) — em silêncio.
 * Publicado assim, o site sobe saudável e o login falha sem explicação: o cookie
 * de sessão sai com `Domain=simpleclick.localhost`, e o navegador o descarta.
 *
 * Esta conferência só trabalha em `production` e só cobra o conjunto completo
 * quando o ambiente é PUBLICADO (endereço do site em https, fora de localhost).
 * O `docker compose up` local roda o site em `production` por http://localhost
 * e continua subindo sem configurar cookie nem segredo.
 *
 * Pura de propósito: recebe a fonte por parâmetro e não lê `process.env`.
 * Nunca repete o valor de um segredo na mensagem.
 */

export type FonteDoSite = Readonly<Record<string, string | undefined>>;

export interface ProblemaDoSite {
  readonly variavel: string;
  readonly motivo: string;
  readonly esperado: string;
}

/** Abaixo disto o segredo é adivinhável (mesmo piso da API). */
const TAMANHO_MINIMO_DO_SEGREDO = 32;
/** Abaixo disto o segredo é repetição, não sorteio (mesmo piso da API). */
const VARIEDADE_MINIMA_DO_SEGREDO = 10;
/** Marcador público do `.env.example`. */
const MARCADOR_DO_MODELO = "TROQUE_";

const COMO_GERAR = "um segredo gerado só para este ambiente — openssl rand -base64 48";

function valorDe(fonte: FonteDoSite, nome: string): string | undefined {
  const valor = fonte[nome]?.trim();
  return valor === undefined || valor === "" ? undefined : valor;
}

/** Máquina local: `localhost`, endereço de loopback ou qualquer `*.localhost`. */
function ehMaquinaLocal(host: string): boolean {
  return (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host === "127.0.0.1" ||
    host === "[::1]"
  );
}

/** Origem (esquema + máquina + porta) lida de uma URL, ou `undefined`. */
function lerUrl(valor: string): URL | undefined {
  try {
    return new URL(valor);
  } catch {
    return undefined;
  }
}

function problemaDeUrl(
  fonte: FonteDoSite,
  nome: string,
  esperado: string,
): { problema?: ProblemaDoSite; url?: URL } {
  const bruto = valorDe(fonte, nome);
  if (bruto === undefined) {
    return {
      problema: { variavel: nome, motivo: "ausente em production", esperado },
    };
  }
  const url = lerUrl(bruto);
  if (url === undefined || !["http:", "https:"].includes(url.protocol)) {
    return {
      problema: {
        variavel: nome,
        motivo: "não é uma URL http(s) válida",
        esperado,
      },
    };
  }
  return { url };
}

function problemasDoSegredo(
  fonte: FonteDoSite,
  nome: string,
): ProblemaDoSite[] {
  const valor = valorDe(fonte, nome);
  if (valor === undefined) {
    return [{ variavel: nome, motivo: "ausente", esperado: COMO_GERAR }];
  }
  if (valor.includes(MARCADOR_DO_MODELO)) {
    return [
      {
        variavel: nome,
        motivo: "é o marcador TROQUE_ do .env.example, público no repositório",
        esperado: COMO_GERAR,
      },
    ];
  }
  if (valor.length < TAMANHO_MINIMO_DO_SEGREDO) {
    return [
      {
        variavel: nome,
        motivo: `curto demais (mínimo ${TAMANHO_MINIMO_DO_SEGREDO} caracteres)`,
        esperado: COMO_GERAR,
      },
    ];
  }
  if (new Set(valor).size < VARIEDADE_MINIMA_DO_SEGREDO) {
    return [
      {
        variavel: nome,
        motivo: `segredo fraco: menos de ${VARIEDADE_MINIMA_DO_SEGREDO} caracteres distintos`,
        esperado: COMO_GERAR,
      },
    ];
  }
  return [];
}

/**
 * O domínio do cookie precisa cobrir o site E a API: é o ancestral comum dos
 * dois. `staging.exemplo.com` cobre `staging.exemplo.com` e
 * `api.staging.exemplo.com`.
 */
function cobre(dominio: string, host: string): boolean {
  return host === dominio || host.endsWith(`.${dominio}`);
}

/**
 * Lista o que está errado no ambiente do site. Vazia = pode partir.
 * Fora de `production`, ou em `production` local (http/localhost), só confere
 * que os dois endereços existem.
 */
export function problemasDoAmbienteDoSite(fonte: FonteDoSite): ProblemaDoSite[] {
  if (valorDe(fonte, "NODE_ENV") !== "production") return [];

  const site = problemaDeUrl(
    fonte,
    "URL_DO_SITE",
    "endereço público do site — https://seudominio.com.br",
  );
  const api = problemaDeUrl(
    fonte,
    "NEXT_PUBLIC_API_URL",
    "endereço público da API — https://api.seudominio.com.br (argumento de construção da imagem)",
  );
  const problemas: ProblemaDoSite[] = [
    ...(site.problema ? [site.problema] : []),
    ...(api.problema ? [api.problema] : []),
  ];
  if (site.url === undefined || api.url === undefined) return problemas;

  // Ambiente local em production (docker compose): nada além dos endereços.
  const publicado =
    site.url.protocol === "https:" && !ehMaquinaLocal(site.url.hostname);
  if (!publicado) return problemas;

  if (api.url.protocol !== "https:" || ehMaquinaLocal(api.url.hostname)) {
    problemas.push({
      variavel: "NEXT_PUBLIC_API_URL",
      motivo:
        "o site está publicado, mas a API aponta para http ou para uma máquina local (provável argumento de construção esquecido)",
      esperado: "https://api.seudominio.com.br — e construir a imagem de novo",
    });
  }

  const dominio = valorDe(fonte, "NEXT_PUBLIC_SESSION_COOKIE_DOMAIN")?.replace(
    /^\.+/,
    "",
  );
  if (dominio === undefined) {
    problemas.push({
      variavel: "NEXT_PUBLIC_SESSION_COOKIE_DOMAIN",
      motivo:
        "ausente em ambiente publicado — o cookie de sessão sairia com o domínio de desenvolvimento e o login não funcionaria",
      esperado: `o domínio que cobre o site e a API, sem esquema — ${site.url.hostname}`,
    });
  } else if (
    !cobre(dominio, site.url.hostname) ||
    !cobre(dominio, api.url.hostname)
  ) {
    problemas.push({
      variavel: "NEXT_PUBLIC_SESSION_COOKIE_DOMAIN",
      motivo: `não cobre ao mesmo tempo o site (${site.url.hostname}) e a API (${api.url.hostname})`,
      esperado: "o ancestral comum dos dois endereços, sem esquema",
    });
  }

  problemas.push(
    ...problemasDoSegredo(fonte, "SEGREDO_DE_REVALIDACAO"),
    ...problemasDoSegredo(fonte, "SEGREDO_DA_PONTE"),
  );
  return problemas;
}

/** Recusa de partida do site por ambiente mal configurado. */
export class ErroDeAmbienteDoSite extends Error {
  readonly variaveis: readonly string[];

  constructor(problemas: readonly ProblemaDoSite[]) {
    super(
      [
        `O site não inicia: ${problemas.length} variável(is) de ambiente inválida(s) ou ausente(s).`,
        "",
        ...problemas.map(
          (p) => `  ✘ ${p.variavel} — ${p.motivo}\n      esperado: ${p.esperado}`,
        ),
        "",
        "Veja docs/deploy-railway.md (tabela de variáveis do serviço web).",
      ].join("\n"),
    );
    this.name = "ErroDeAmbienteDoSite";
    this.variaveis = problemas.map((p) => p.variavel);
  }
}

/** Lança `ErroDeAmbienteDoSite` quando algo está errado. */
export function exigirAmbienteDoSite(fonte: FonteDoSite): void {
  const problemas = problemasDoAmbienteDoSite(fonte);
  if (problemas.length > 0) throw new ErroDeAmbienteDoSite(problemas);
}
