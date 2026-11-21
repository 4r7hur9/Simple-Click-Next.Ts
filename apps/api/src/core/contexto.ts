/**
 * Contexto da requisição: quem está pedindo, por qual loja e dentro de qual
 * transação (AC-011).
 *
 * Existe para que a resposta a "de qual loja é esta requisição?" não precise
 * descer por doze camadas como parâmetro. Sem ele, cada assinatura de função
 * do domínio carregaria o identificador da loja, e bastaria UM esquecimento
 * numa dessas assinaturas para uma consulta rodar sem contexto — que é
 * exatamente o defeito que o isolamento por linha existe para conter.
 *
 * O transporte é o `AsyncLocalStorage` do Node, e não uma variável de módulo.
 * A diferença é o motivo de este arquivo existir: variável de módulo é uma só
 * para o processo inteiro, e um servidor atende requisições de lojas
 * diferentes ao mesmo tempo — a segunda requisição sobrescreveria o contexto
 * da primeira no meio do trabalho dela. O armazenamento local assíncrono
 * mantém um valor por cadeia de execução, e ele sobrevive a `await`, a
 * `setTimeout` e a qualquer coisa que devolva o controle ao laço de eventos.
 *
 * Este módulo não conhece banco de dados nem framework HTTP de propósito: quem
 * abre a transação é `core/db.ts`, e é lá que o tipo dela é conhecido. Se o
 * contexto importasse a camada de dados, o ponto de troca da camada deixaria
 * de ser um arquivo só (decisão de 17/08).
 */

import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";

/**
 * Papéis que o banco reconhece em `app.role`. São exatamente os nomes que as
 * políticas de isolamento comparam — `app.is_store_staff()` é `OWNER` ou
 * `STAFF`, e a vitrine pública é `PUBLIC`.
 *
 * A ausência de papel vale `PUBLIC`, o menor privilégio possível, nunca o
 * maior: papel desconhecido não pode virar permissão por descuido.
 *
 * `PRINT_AGENT` é o agente de impressão da loja (migração 0034): lê e muda só
 * a fila de impressão da loja dele, e nunca nasce de uma sessão de pessoa —
 * quem o põe no contexto é a autenticação do agente, pela credencial dele.
 */
export const PAPEIS_DE_ACESSO = [
  "PUBLIC",
  "CUSTOMER",
  "OWNER",
  "STAFF",
  "PRINT_AGENT",
] as const;

/** Papel de quem faz a requisição, do ponto de vista das políticas do banco. */
export type PapelDeAcesso = (typeof PAPEIS_DE_ACESSO)[number];

/** Verdadeiro quando o texto é um dos papéis que o banco reconhece. */
export function ehPapelDeAcesso(valor: unknown): valor is PapelDeAcesso {
  return (
    typeof valor === "string" &&
    (PAPEIS_DE_ACESSO as readonly string[]).includes(valor)
  );
}

/** Dados que identificam a requisição em curso. */
export interface DadosDoContexto {
  /** Qual loja. `undefined` em rota que ainda não resolveu a loja. */
  readonly lojaId?: string | undefined;
  /** Quem. `undefined` em requisição pública, sem sessão. */
  readonly usuarioId?: string | undefined;
  /** Papel de acesso; `PUBLIC` quando não informado. */
  readonly papel?: PapelDeAcesso | undefined;
  /**
   * Portador do link de acompanhamento do pedido. O banco decide sozinho o que
   * esse token alcança, por parâmetro dedicado (`app.order_token`).
   */
  readonly tokenDoPedido?: string | undefined;
  /**
   * Chave que o cliente gerou para o fechamento, e que ele repete quando tenta
   * de novo. O banco a usa para deixar a segunda tentativa ENXERGAR o pedido
   * que a primeira criou — sem isso, a política de acompanhamento por token
   * esconderia justamente o pedido que precisa ser devolvido, e a cozinha
   * receberia dois pedidos iguais. Apresentar a chave é, na prática, provar que
   * foi você quem fez a primeira tentativa.
   */
  readonly chaveDoFechamento?: string | undefined;
  /**
   * Sessão do carrinho do visitante. É o que o banco usa para decidir QUAL
   * carrinho a requisição alcança — sem ela, um visitante enxergaria o carrinho
   * de todos os outros da mesma loja (migração 0012).
   */
  readonly sessaoDoCarrinho?: string | undefined;
  /** Identificador da requisição, para correlacionar registro e erro. */
  readonly requisicaoId?: string | undefined;
}

/** Contexto já normalizado, do jeito que o resto da API o consome. */
export interface ContextoDaRequisicao {
  readonly requisicaoId: string;
  readonly lojaId: string | undefined;
  readonly usuarioId: string | undefined;
  readonly papel: PapelDeAcesso;
  readonly tokenDoPedido: string | undefined;
  readonly chaveDoFechamento: string | undefined;
  readonly sessaoDoCarrinho: string | undefined;
  /**
   * Transação aberta por `core/db.ts` para esta requisição, ou `undefined`
   * fora dela.
   *
   * O tipo é opaco aqui de propósito — quem sabe o que é a transação é a
   * camada de dados, e é ela que devolve o valor já tipado. Nenhum módulo de
   * domínio lê este campo direto.
   */
  transacao: unknown;
}

/** Requisição que tentou alcançar algo que só existe dentro de um contexto. */
export class ErroSemContexto extends Error {
  constructor(oQueFaltou: string) {
    super(
      [
        `${oQueFaltou} fora de um contexto de requisição.`,
        "",
        "Todo trabalho da API roda dentro de `executarNoContexto`, que é o que",
        "define de qual loja e de qual papel é a requisição. Sem isso o banco",
        "não devolve nada (AC-009) — e é assim que deve ser.",
      ].join("\n"),
    );
    this.name = "ErroSemContexto";
  }
}

/** Requisição sem loja tentou fazer trabalho que só existe dentro de uma. */
export class ErroSemLojaNoContexto extends Error {
  readonly requisicaoId: string;

  constructor(requisicaoId: string) {
    super(
      `A requisição ${requisicaoId} não tem loja no contexto, e a operação pedida só existe dentro de uma loja.`,
    );
    this.name = "ErroSemLojaNoContexto";
    this.requisicaoId = requisicaoId;
  }
}

/**
 * Um valor por cadeia de execução. É `ContextoDaRequisicao` e não um mapa de
 * chaves soltas para que acrescentar informação de requisição seja mudar um
 * tipo, e não caçar todos os pontos que leem o armazenamento.
 */
const armazenamento = new AsyncLocalStorage<ContextoDaRequisicao>();

/** Normaliza os dados recebidos, preenchendo o que tem padrão seguro. */
export function criarContexto(
  dados: DadosDoContexto = {},
): ContextoDaRequisicao {
  return {
    requisicaoId: dados.requisicaoId ?? randomUUID(),
    lojaId: dados.lojaId,
    usuarioId: dados.usuarioId,
    // Papel ausente é PUBLIC: o menor privilégio, nunca o maior.
    papel: dados.papel ?? "PUBLIC",
    tokenDoPedido: dados.tokenDoPedido,
    chaveDoFechamento: dados.chaveDoFechamento,
    sessaoDoCarrinho: dados.sessaoDoCarrinho,
    transacao: undefined,
  };
}

/**
 * Roda `acao` dentro do contexto informado.
 *
 * Tudo que `acao` disparar — inclusive o que continuar depois de um `await` —
 * enxerga este contexto e nenhum outro, mesmo com dezenas de requisições em
 * andamento no mesmo processo.
 */
export function executarNoContexto<T>(
  contexto: ContextoDaRequisicao,
  acao: () => T,
): T {
  return armazenamento.run(contexto, acao);
}

// ---------------------------------------------------------------------------
// Marcas da requisição (card #139)
// ---------------------------------------------------------------------------

/**
 * O que o registro precisa saber da requisição INTEIRA, e não só do pedaço
 * dela que está rodando agora.
 *
 * A requisição passa por vários contextos aninhados (`executarComoRequisicao`
 * a cada acesso ao banco). O papel real do dono só existe num deles; a linha
 * `requisicao.terminou` sai de fora de todos. As marcas juntam o que cada
 * contexto soube, na raiz.
 *
 * Ficam numa `WeakMap` privada, fora do tipo público: `core/db.ts` nunca as
 * lê, então elas não podem virar papel do banco por descuido.
 */
export interface MarcasDaRequisicao {
  readonly papel: PapelDeAcesso;
  readonly usuarioId: string | undefined;
  readonly lojaId: string | undefined;
  readonly traceId: string | undefined;
  readonly spanId: string | undefined;
}

interface MarcasMutaveis {
  papel: PapelDeAcesso;
  usuarioId: string | undefined;
  lojaId: string | undefined;
  traceId: string | undefined;
  spanId: string | undefined;
}

/** Do menor para o maior privilégio. Vale o maior visto na requisição. */
const ORDEM_DE_PRIVILEGIO: readonly PapelDeAcesso[] = [
  "PUBLIC",
  "CUSTOMER",
  "PRINT_AGENT",
  "STAFF",
  "OWNER",
];

const raizDoContexto = new WeakMap<ContextoDaRequisicao, ContextoDaRequisicao>();
const marcasDaRaiz = new WeakMap<ContextoDaRequisicao, MarcasMutaveis>();

function abrir(
  dados: DadosDoContexto,
  raiz: ContextoDaRequisicao | undefined,
): ContextoDaRequisicao {
  const contexto = criarContexto({
    ...dados,
    requisicaoId: dados.requisicaoId ?? raiz?.requisicaoId,
  });
  const dona = raiz ?? contexto;
  raizDoContexto.set(contexto, dona);
  if (raiz === undefined) {
    marcasDaRaiz.set(contexto, {
      papel: contexto.papel,
      usuarioId: contexto.usuarioId,
      lojaId: contexto.lojaId,
      traceId: undefined,
      spanId: undefined,
    });
  } else {
    const marcas = marcasDaRaiz.get(dona);
    if (marcas !== undefined) {
      if (
        ORDEM_DE_PRIVILEGIO.indexOf(contexto.papel) >
        ORDEM_DE_PRIVILEGIO.indexOf(marcas.papel)
      ) {
        marcas.papel = contexto.papel;
      }
      marcas.usuarioId ??= contexto.usuarioId;
      marcas.lojaId ??= contexto.lojaId;
    }
  }
  return contexto;
}

/**
 * Abre o contexto RAIZ de uma requisição HTTP. Não herda nada do que estiver
 * em curso: é o começo da requisição.
 */
export function abrirContextoRaiz(
  dados: DadosDoContexto = {},
): ContextoDaRequisicao {
  return abrir(dados, undefined);
}

/**
 * Atalho para o caso comum: montar o contexto e já rodar dentro dele.
 *
 * Dentro de uma requisição, herda SÓ o identificador dela e a ligação com a
 * raiz — para que as linhas de registro casem e as marcas se acumulem.
 * Transação, tokens, loja e papel nunca são herdados: cada acesso declara os
 * seus.
 */
export function executarComoRequisicao<T>(
  dados: DadosDoContexto,
  acao: (contexto: ContextoDaRequisicao) => T,
): T {
  const atual = armazenamento.getStore();
  const raiz = atual === undefined ? undefined : raizDoContexto.get(atual);
  const contexto = abrir(dados, raiz);
  return executarNoContexto(contexto, () => acao(contexto));
}

/** Cópia congelada das marcas da requisição em curso, ou `undefined` fora dela. */
export function marcasDaRequisicao(): MarcasDaRequisicao | undefined {
  const atual = armazenamento.getStore();
  if (atual === undefined) return undefined;
  const raiz = raizDoContexto.get(atual);
  const marcas = raiz === undefined ? undefined : marcasDaRaiz.get(raiz);
  return marcas === undefined ? undefined : Object.freeze({ ...marcas });
}

/** Marcas da requisição a que o contexto dado pertence. */
export function marcasDoContexto(
  contexto: ContextoDaRequisicao,
): MarcasDaRequisicao | undefined {
  const raiz = raizDoContexto.get(contexto);
  const marcas = raiz === undefined ? undefined : marcasDaRaiz.get(raiz);
  return marcas === undefined ? undefined : Object.freeze({ ...marcas });
}

/** Anota na raiz da requisição o trace em curso, para o registro. */
export function anotarRastreio(
  contexto: ContextoDaRequisicao,
  traceId: string,
  spanId: string,
): void {
  const raiz = raizDoContexto.get(contexto);
  const marcas = raiz === undefined ? undefined : marcasDaRaiz.get(raiz);
  if (marcas === undefined) return;
  marcas.traceId = traceId;
  marcas.spanId = spanId;
}

/** O contexto em curso, ou `undefined` fora de uma requisição. */
export function contextoAtual(): ContextoDaRequisicao | undefined {
  return armazenamento.getStore();
}

/** O contexto em curso; recusa em vez de devolver um contexto vazio. */
export function exigirContexto(): ContextoDaRequisicao {
  const contexto = armazenamento.getStore();
  if (contexto === undefined) {
    throw new ErroSemContexto("Tentativa de usar o contexto da requisição");
  }
  return contexto;
}

/**
 * A loja do contexto em curso.
 *
 * Recusar aqui é melhor do que deixar seguir sem loja: sem loja a consulta
 * devolveria zero linhas e o defeito apareceria como "sumiu o dado", longe da
 * causa. Quem legitimamente não tem loja — a vitrine antes de resolver o
 * apelido, por exemplo — usa `contextoAtual()`.
 */
export function exigirLojaDoContexto(): string {
  const contexto = exigirContexto();
  if (contexto.lojaId === undefined || contexto.lojaId === "") {
    throw new ErroSemLojaNoContexto(contexto.requisicaoId);
  }
  return contexto.lojaId;
}
