/**
 * Lista FECHADA de origens autorizadas (AC-125 a AC-128).
 *
 * Este arquivo é a defesa contra falsificação de requisição entre sites. A
 * decisão de 17/08 — site e API em dois subdomínios do mesmo domínio — tirou do
 * projeto o token anti-falsificação separado, e o que ficou no lugar dele foi
 * a conferência de origem aqui, junto da restrição de envio do cookie entre
 * sites. Ou seja: enfraquecer este arquivo não deixa o sistema "um pouco menos
 * seguro", deixa o sistema sem a defesa.
 *
 * As quatro regras, e o defeito que cada uma fecha:
 *
 * 1. **A lista é fechada e o cabeçalho sai dela, nunca da requisição.** A
 *    armadilha clássica de CORS é devolver `Access-Control-Allow-Origin` com o
 *    valor do `Origin` recebido: isso autoriza o mundo inteiro com aparência de
 *    lista. Aqui o valor publicado é sempre o item guardado na configuração —
 *    e origem desconhecida não recebe cabeçalho nenhum (AC-125).
 * 2. **Método que muda estado exige origem confiável.** Sem `Origin`, ou com
 *    `Origin` fora da lista, a resposta é 403 antes de a rota existir para a
 *    requisição. É o que impede o formulário de um site de terceiros de agir
 *    com o cookie da vítima, que o navegador anexa sozinho (AC-126, AC-128).
 * 3. **Leitura pública continua livre.** A restrição vale para o que usa
 *    sessão, não para o conteúdo público: `GET` e `HEAD` passam de qualquer
 *    origem, e a vitrine funciona (AC-127).
 * 4. **`Vary: Origin` em toda resposta.** Sem ele, um cache intermediário
 *    entrega a resposta com o cabeçalho de liberação de uma origem autorizada
 *    para a próxima requisição, de origem qualquer — a lista fechada vazaria
 *    pelo cache.
 *
 * Nada aqui substitui a checagem de sessão e de permissão: origem é o primeiro
 * portão, não o único.
 */

import type { NextFunction, Request, RequestHandler, Response } from "express";

// ---------------------------------------------------------------------------
// Tipos e constantes
// ---------------------------------------------------------------------------

/** Ajustes da conferência de origem. Só a lista é obrigatória. */
export interface OpcoesDeCors {
  /** Origens autorizadas: esquema, máquina e porta. Sem caminho. */
  readonly origens: readonly string[];
  /** Cabeçalhos que o navegador pode enviar numa requisição autorizada. */
  readonly cabecalhosPermitidos?: readonly string[];
  /** Quanto o navegador pode guardar a resposta da consulta prévia. */
  readonly duracaoDaConsultaPreviaSegundos?: number;
}

/** Por que a origem foi recusada. Serve a quem está configurando o cliente. */
export type MotivoDaRecusa = "ausente" | "fora_da_lista";

/** Corpo da resposta 403 desta borda. */
export interface RecusaDeOrigem {
  readonly erro: "origem_nao_autorizada";
  readonly motivo: MotivoDaRecusa;
}

/**
 * Métodos que só leem. Todo o resto muda estado e passa a exigir origem
 * confiável — inclusive método que a API ainda não usa, porque a lista de
 * seguros é fechada e a de perigosos não pode depender de alguém lembrar de
 * acrescentar o método novo.
 */
export const METODOS_DE_LEITURA = ["GET", "HEAD"] as const;

/** Cabeçalhos que a nossa própria interface precisa enviar. */
const CABECALHOS_PERMITIDOS_PADRAO = [
  "Content-Type",
  "Authorization",
  "Idempotency-Key",
] as const;

/** Um dia. Consulta prévia repetida a cada requisição é latência à toa. */
const DURACAO_DA_CONSULTA_PREVIA_PADRAO = 86_400;

/** Código HTTP de origem recusada. */
export const STATUS_DE_ORIGEM_RECUSADA = 403;

/** Código HTTP da consulta prévia autorizada, que não tem corpo. */
const STATUS_DA_CONSULTA_PREVIA = 204;

// ---------------------------------------------------------------------------
// Lista de origens
// ---------------------------------------------------------------------------

/** Item da configuração que não é uma origem utilizável. */
export class ErroDeOrigemConfigurada extends Error {
  readonly origem: string;

  constructor(origem: string) {
    super(
      [
        `Origem autorizada inválida na configuração: "${origem}".`,
        "",
        "Origem é esquema, máquina e porta — nunca caminho, nunca barra no fim.",
        "O cabeçalho `Origin` que o navegador envia jamais traz caminho, então",
        "um item com caminho nunca casaria com requisição nenhuma e a lista",
        "passaria a recusar quem deveria autorizar.",
        "",
        "  ORIGENS_PERMITIDAS=https://app.localhost,https://api.localhost",
      ].join("\n"),
    );
    this.name = "ErroDeOrigemConfigurada";
    this.origem = origem;
  }
}

/**
 * Quebra a lista separada por vírgula que vem do ambiente.
 *
 * Ausente vira lista vazia, e lista vazia significa NENHUMA origem autorizada —
 * o padrão fechado. Um ambiente mal configurado deixa de aceitar requisição que
 * muda estado, em vez de aceitar todas; quem garante que a variável exista em
 * produção é `core/env.ts` (AC-002).
 */
export function origensDoAmbiente(bruto: string | undefined): string[] {
  return (bruto ?? "")
    .split(",")
    .map((origem) => origem.trim())
    .filter((origem) => origem.length > 0);
}

/**
 * Forma canônica de uma origem, ou `undefined` quando o texto não é origem.
 *
 * Esquema e máquina não distinguem maiúscula de minúscula, e a porta padrão do
 * esquema não aparece. Comparar texto cru deixaria `HTTPS://App.Localhost` de
 * fora da lista que contém `https://app.localhost` — e a recusa apareceria como
 * "às vezes o navegador é bloqueado", que é o pior tipo de defeito para
 * investigar.
 *
 * O que tem caminho, consulta, âncora ou credencial embutida NÃO é origem, e é
 * recusado em vez de aparado: um item de configuração escrito como endereço de
 * página é engano de quem configurou, e aparar o excesso em silêncio faria a
 * lista aceitar `https://app.localhost/painel` como se fosse a origem inteira.
 */
export function canonizarOrigem(bruto: string): string | undefined {
  let endereco: URL;
  try {
    endereco = new URL(bruto);
  } catch {
    return undefined;
  }

  const temSobra =
    (endereco.pathname !== "" && endereco.pathname !== "/") ||
    endereco.search !== "" ||
    endereco.hash !== "" ||
    endereco.username !== "" ||
    endereco.password !== "";
  if (temSobra) return undefined;

  // `new URL("null").origin` é "null", e o de `data:` também: origem opaca de
  // quadro isolado ou de esquema sem máquina. Não é origem autorizável, e
  // aceitá-la abriria a lista para qualquer página em caixa de areia.
  return endereco.origin === "null" ? undefined : endereco.origin;
}

/**
 * A lista fechada, pronta para consulta.
 *
 * Guarda a forma canônica de cada item e devolve SEMPRE o item guardado — é o
 * ponto onde "nunca refletir a origem recebida" deixa de ser cuidado e vira
 * mecânica: a função não tem acesso ao texto recebido depois de comparar.
 */
export class ListaDeOrigens {
  readonly #autorizadas: ReadonlyMap<string, string>;

  constructor(origens: readonly string[]) {
    const autorizadas = new Map<string, string>();
    for (const bruta of origens) {
      const canonica = canonizarOrigem(bruta);
      if (canonica === undefined) throw new ErroDeOrigemConfigurada(bruta);
      autorizadas.set(canonica, canonica);
    }
    this.#autorizadas = autorizadas;
  }

  /** Quantas origens a lista tem. Zero significa lista fechada para todos. */
  get tamanho(): number {
    return this.#autorizadas.size;
  }

  /** As origens autorizadas, em forma canônica. */
  get origens(): readonly string[] {
    return [...this.#autorizadas.values()];
  }

  /**
   * A origem autorizada correspondente, ou `undefined`.
   *
   * O valor devolvido vem da lista, e não do argumento. Quem publica o
   * cabeçalho publica este valor.
   */
  autorizada(recebida: string | undefined): string | undefined {
    if (recebida === undefined) return undefined;
    const canonica = canonizarOrigem(recebida);
    if (canonica === undefined) return undefined;
    return this.#autorizadas.get(canonica);
  }
}

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

/** O `Origin` recebido, ou `undefined` quando a requisição não indicou origem. */
function origemRecebida(req: Request): string | undefined {
  const bruto = req.headers.origin;
  const valor = Array.isArray(bruto) ? bruto[0] : bruto;
  return valor === undefined || valor.trim() === "" ? undefined : valor.trim();
}

/** Verdadeiro quando o método só lê e, portanto, não precisa de origem. */
function ehLeitura(metodo: string): boolean {
  return (METODOS_DE_LEITURA as readonly string[]).includes(
    metodo.toUpperCase(),
  );
}

/** Publica a liberação para UMA origem da lista, com credencial. */
function liberarPara(res: Response, autorizada: string): void {
  // Nunca `*`: com `*` o navegador recusa mandar cookie, e a alternativa
  // "refletir a origem recebida" é justamente o buraco que AC-125 fecha.
  res.setHeader("Access-Control-Allow-Origin", autorizada);
  res.setHeader("Access-Control-Allow-Credentials", "true");
}

/** Responde a recusa sem nenhum cabeçalho que liberasse a leitura. */
function recusar(res: Response, motivo: MotivoDaRecusa): void {
  const recusa: RecusaDeOrigem = { erro: "origem_nao_autorizada", motivo };
  res.status(STATUS_DE_ORIGEM_RECUSADA).json(recusa);
}

/** Responde a consulta prévia autorizada, dizendo o que o navegador pode usar. */
function responderConsultaPrevia(
  res: Response,
  autorizada: string,
  cabecalhos: readonly string[],
  duracaoSegundos: number,
): void {
  liberarPara(res, autorizada);
  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS",
  );
  res.setHeader("Access-Control-Allow-Headers", cabecalhos.join(", "));
  res.setHeader("Access-Control-Max-Age", String(duracaoSegundos));
  res.status(STATUS_DA_CONSULTA_PREVIA).end();
}

/**
 * Middleware que aplica a lista fechada de origens (AC-125 a AC-128).
 *
 * Vai montado antes de qualquer leitura de corpo: requisição de origem
 * estranha é recusada sem que a API sequer gaste trabalho lendo o que ela
 * mandou.
 */
export function corsDeOrigensFechadas(opcoes: OpcoesDeCors): RequestHandler {
  const lista = new ListaDeOrigens(opcoes.origens);
  const cabecalhos =
    opcoes.cabecalhosPermitidos ?? CABECALHOS_PERMITIDOS_PADRAO;
  const duracao =
    opcoes.duracaoDaConsultaPreviaSegundos ?? DURACAO_DA_CONSULTA_PREVIA_PADRAO;

  return (req: Request, res: Response, proximo: NextFunction) => {
    // A resposta depende da origem: sem este aviso, cache intermediário
    // entregaria a liberação de uma origem autorizada para outra qualquer.
    res.vary("Origin");

    const recebida = origemRecebida(req);
    const autorizada = lista.autorizada(recebida);

    if (req.method.toUpperCase() === "OPTIONS") {
      if (autorizada === undefined) {
        recusar(res, recebida === undefined ? "ausente" : "fora_da_lista");
        return;
      }
      responderConsultaPrevia(res, autorizada, cabecalhos, duracao);
      return;
    }

    if (autorizada !== undefined) liberarPara(res, autorizada);

    // Leitura passa de qualquer origem — inclusive sem origem nenhuma, que é o
    // caso de aplicativo nativo e de servidor. O conteúdo público é público
    // (AC-127); o que não é público continua protegido pela sessão, e sem
    // cabeçalho de liberação o navegador de outro site não lê a resposta.
    if (ehLeitura(req.method)) {
      proximo();
      return;
    }

    if (autorizada === undefined) {
      recusar(res, recebida === undefined ? "ausente" : "fora_da_lista");
      return;
    }

    proximo();
  };
}
