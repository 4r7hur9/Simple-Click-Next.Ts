/**
 * As travas de destino das cargas de exemplo (seed original, demo e admin
 * local). Moram aqui, e não em `index.ts`, para o módulo do administrador local
 * poder usá-las sem importar o seed (evita ciclo); `index.ts` e `demo/index.ts`
 * reexportam os mesmos nomes.
 */

/** O ambiente indica produção, e dado fictício não alcança loja real. */
export class ErroDeAmbienteDeProducao extends Error {
  readonly motivo: string;

  constructor(motivo: string) {
    super(
      [
        `A carga de dados de exemplo se recusa a rodar: ${motivo}.`,
        "",
        "Estes dados são fictícios — lojas, clientes e pedidos inventados. Em",
        "produção eles apareceriam na vitrine de uma loja real, misturados ao",
        "catálogo de verdade, e não há como desfazer isso sem perder o que era",
        "legítimo.",
        "",
        "Para carregar o exemplo, aponte para o banco de desenvolvimento ou de",
        "teste e rode de novo.",
      ].join("\n"),
    );
    this.name = "ErroDeAmbienteDeProducao";
    this.motivo = motivo;
  }
}

/** De onde a carga lê a configuração — normalmente `process.env`. */
export type FonteDeAmbiente = Readonly<Record<string, string | undefined>>;

/**
 * Recusa rodar quando o ambiente diz produção.
 *
 * A checagem é pelo rótulo declarado, que é o que o operador controla. Ela não
 * é a única defesa: `exigirBancoSemDadoProprio` cobre o caso em que o rótulo
 * está errado — que é o caso perigoso de verdade, porque ninguém digita
 * `NODE_ENV=production` por engano, mas todo mundo já esqueceu de defini-lo.
 */
export function exigirAmbienteQueNaoEProducao(ambiente: FonteDeAmbiente): void {
  const rotulo = ambiente.NODE_ENV?.trim().toLowerCase();
  if (rotulo === "production") {
    throw new ErroDeAmbienteDeProducao(
      "NODE_ENV=production indica ambiente de produção",
    );
  }
}

// ---------------------------------------------------------------------------
// Destino local (demo e administração local)
// ---------------------------------------------------------------------------

/**
 * Variáveis que só existem quando o processo roda num provedor de hospedagem.
 * A MESMA lista do CLI `administracao:local` (apps/api/src/administracao-local.ts);
 * um teste da API compara as duas.
 */
export const MARCADORES_DE_HOSPEDAGEM = [
  "RAILWAY_ENVIRONMENT",
  "RAILWAY_ENVIRONMENT_NAME",
  "RAILWAY_PROJECT_ID",
  "RAILWAY_SERVICE_ID",
  "VERCEL",
  "VERCEL_ENV",
  "RENDER",
  "FLY_APP_NAME",
  "HEROKU_APP_NAME",
] as const;

/** Máquinas aceitas como "esta máquina" na URL do banco. */
const HOSTS_LOCAIS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

/**
 * A trava de produção da carga de demonstração e do administrador local (M-2
 * da revisão #149; card #3). Só o rótulo `NODE_ENV=production` não basta: o
 * caso perigoso é o rótulo ESQUECIDO num servidor. Por isso três camadas: o
 * rótulo, nenhum marcador de provedor de hospedagem no processo e, quando a
 * URL é conhecida, banco só nesta máquina, sem `?host=`/`?hostaddr=` (que
 * trocam o destino por baixo do host). A recusa nunca repete a URL, que leva
 * usuário e senha.
 */
export function exigirDestinoLocalDaDemonstracao(
  ambiente: FonteDeAmbiente,
  urlDoBanco?: string,
): void {
  exigirAmbienteQueNaoEProducao(ambiente);
  for (const marcador of MARCADORES_DE_HOSPEDAGEM) {
    if (ambiente[marcador]?.trim()) {
      throw new ErroDeAmbienteDeProducao(
        `${marcador} está definida, sinal de que este processo roda num provedor de hospedagem`,
      );
    }
  }
  if (urlDoBanco === undefined) return;
  let destino: URL;
  try {
    destino = new URL(urlDoBanco);
  } catch {
    throw new ErroDeAmbienteDeProducao("a URL do banco não pôde ser lida");
  }
  if (
    !HOSTS_LOCAIS.has(destino.hostname.toLowerCase()) ||
    destino.searchParams.has("host") ||
    destino.searchParams.has("hostaddr")
  ) {
    throw new ErroDeAmbienteDeProducao(
      "o banco de destino não é local (a demonstração só roda contra localhost ou 127.0.0.1)",
    );
  }
}

/** Nomes de banco de desenvolvimento local aceitos pelo administrador local. */
export function ehBancoLocalDeDesenvolvimento(nome: string): boolean {
  return /^simpleclick(_dev|_local)?$/.test(nome) || /_(dev|local)$/.test(nome);
}

/** Banco de teste ou do e2e (só os testes do passo os aceitam). */
export function ehBancoDeTeste(nome: string): boolean {
  return (
    nome === "simpleclick_test" ||
    nome.startsWith("sc_e2e_") ||
    nome.startsWith("sc_teste_") ||
    nome.startsWith("sc_molde_")
  );
}
