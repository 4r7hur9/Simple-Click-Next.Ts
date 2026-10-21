/**
 * Curtidas e comentários com aprovação da loja (card #47).
 *
 * CURTIR é da pessoa logada, num PRODUTO (o post do feed) ou numa LOJA. Curtir
 * de novo não duplica; descurtir o que não estava curtido também responde 200.
 * Os números saem em `GET /v1/feed/produtos` e `GET /v1/feed/lojas`
 * (`curtidas`, `curtiu`, `comentarios`) e, sem o `curtiu`, na vitrine.
 *
 * COMENTAR também exige conta. O comentário NASCE PENDENTE e só aparece para o
 * público depois que a LOJA aprova; o autor vê os seus pendentes na mesma
 * lista, com `meu: true` e o aviso "Aguardando aprovação da loja". A loja pode
 * ligar "aprovar automaticamente" (padrão: moderar).
 *
 * Público (sessão do Bearer ou do cookie do site):
 *   POST|DELETE /v1/feed/produtos/:produtoId/curtida
 *   POST|DELETE /v1/feed/lojas/:apelido/curtida
 *   GET|POST    /v1/feed/produtos/:produtoId/comentarios   (GET é público)
 *   GET|POST    /v1/feed/lojas/:apelido/comentarios        (comentário NA loja)
 *   POST        /v1/feed/comentarios/:comentarioId/denuncia
 *   DELETE      /v1/conta/comentarios/:comentarioId        (o autor apaga o seu)
 *
 * Painel (dono e equipe com `moderar_comentarios`; a configuração é só do dono):
 *   GET    /v1/lojas/:apelido/comentarios                  fila e lista, com contagem
 *   GET    /v1/lojas/:apelido/comentarios/contagem         o selo do menu
 *   POST   /v1/lojas/:apelido/comentarios/:id/aprovar
 *   POST   /v1/lojas/:apelido/comentarios/:id/recusar      { motivo? }
 *   DELETE /v1/lojas/:apelido/comentarios/:id
 *   POST   /v1/lojas/:apelido/comentarios/:id/bloquear-autor { motivo? }
 *   GET    /v1/lojas/:apelido/comentarios/bloqueios
 *   DELETE /v1/lojas/:apelido/comentarios/bloqueios/:bloqueioId
 *   GET|PUT /v1/lojas/:apelido/comentarios/configuracao    { aprovarAutomaticamente } (dono)
 *
 * ANTI-ABUSO: texto de 1 a 500 caracteres; até 5 comentários em 10 minutos e
 * 50 em 24 horas por pessoa (429 `limite_de_comentarios`); pessoa bloqueada
 * pela loja recebe 403 `comentario_bloqueado`; denúncia (uma por pessoa e
 * comentário) aparece no painel. Toda moderação vai para a trilha de auditoria.
 */

import { z } from "zod";

import { definirRota } from "./rota.ts";

// ---------------------------------------------------------------------------
// Regras
// ---------------------------------------------------------------------------

/** As regras do comentário — as mesmas que o banco aplica (migração 0062). */
export const LIMITES_DOS_COMENTARIOS = Object.freeze({
  /** Caracteres do texto. */
  tamanhoMaximo: 500,
  /** Comentários por pessoa na janela curta… */
  porJanela: 5,
  /** …de tantos minutos. */
  janelaEmMinutos: 10,
  /** Comentários por pessoa em 24 horas. */
  porDia: 50,
  /** Caracteres do motivo da recusa, do bloqueio e da denúncia. */
  motivoMaximo: 200,
});

export const SITUACOES_DO_COMENTARIO = [
  "PENDENTE",
  "APROVADO",
  "RECUSADO",
] as const;

export type SituacaoDoComentario = (typeof SITUACOES_DO_COMENTARIO)[number];

export const esquemaDaSituacaoDoComentario = z.enum(SITUACOES_DO_COMENTARIO);

/** O aviso que o autor vê no próprio comentário pendente. */
export const AVISO_DE_COMENTARIO_PENDENTE = "Aguardando aprovação da loja";

export const MENSAGEM_DE_COMENTARIO_BLOQUEADO =
  "Esta loja não está recebendo comentários seus.";

export const MENSAGEM_DE_LIMITE_DE_COMENTARIOS =
  "Você comentou muitas vezes seguidas. Espere alguns minutos e tente de novo.";

// ---------------------------------------------------------------------------
// Curtidas
// ---------------------------------------------------------------------------

/**
 * Os números sociais de um post (produto) ou de uma loja. `curtiu` só é
 * verdadeiro com sessão. `comentarios` conta só os APROVADOS.
 */
export const esquemaDoResumoSocial = z.strictObject({
  curtidas: z.number().int().nonnegative(),
  comentarios: z.number().int().nonnegative(),
  curtiu: z.boolean(),
});

export type ResumoSocial = z.infer<typeof esquemaDoResumoSocial>;

/** Resposta de curtir e descurtir. */
export const esquemaDaCurtida = z.strictObject({
  curtiu: z.boolean(),
  curtidas: z.number().int().nonnegative(),
});

export type Curtida = z.infer<typeof esquemaDaCurtida>;

// ---------------------------------------------------------------------------
// Comentários: lado público
// ---------------------------------------------------------------------------

/** Duas letras do nome curto, para a bolinha do autor. */
export function iniciaisDoAutor(nome: string): string {
  const partes = nome
    .replace(/\./g, "")
    .trim()
    .split(/\s+/)
    .filter((parte) => parte !== "");
  const primeira = partes[0];
  if (primeira === undefined) return "?";
  const segunda = partes[1];
  const letras =
    segunda === undefined
      ? [...primeira].slice(0, 2).join("")
      : `${[...primeira][0] ?? ""}${[...segunda][0] ?? ""}`;
  return letras.toLocaleUpperCase("pt-BR") || "?";
}

export const esquemaDoAutorDoComentario = z.strictObject({
  /** Nome curto ("Ana R."); nunca o e-mail. */
  nome: z.string(),
  iniciais: z.string(),
});

/** Um comentário como o público (e o autor) o vê. */
export const esquemaDoComentarioPublico = z.strictObject({
  id: z.string().uuid(),
  texto: z.string(),
  autor: esquemaDoAutorDoComentario,
  criadoEm: z.string(),
  /** APROVADO para todo mundo; PENDENTE só aparece para o próprio autor. */
  situacao: esquemaDaSituacaoDoComentario,
  /** É da pessoa da sessão. */
  meu: z.boolean(),
  /** "Aguardando aprovação da loja" no pendente; nulo no aprovado. */
  aviso: z.string().nullable(),
});

export type ComentarioPublico = z.infer<typeof esquemaDoComentarioPublico>;

const paginacao = {
  pagina: z.coerce.number().int().min(1).max(10_000).default(1),
  porPagina: z.coerce.number().int().min(1).max(50).default(20),
};

/** Consulta da lista pública de comentários. */
export const esquemaDaConsultaDeComentarios = z.strictObject(paginacao);

export type ConsultaDeComentarios = z.output<
  typeof esquemaDaConsultaDeComentarios
>;

/**
 * `GET .../comentarios`. Na página 1, com sessão, os pendentes da própria
 * pessoa vêm PRIMEIRO; depois os aprovados, do mais novo para o mais antigo.
 * `total` conta só os aprovados (é por ele que se pagina).
 */
export const esquemaDosComentarios = z.strictObject({
  comentarios: z.array(esquemaDoComentarioPublico),
  pagina: z.number().int().min(1),
  porPagina: z.number().int().min(1),
  total: z.number().int().nonnegative(),
  /** Quantos pendentes da pessoa da sessão há neste alvo (sem sessão, 0). */
  meusPendentes: z.number().int().nonnegative(),
});

export type ComentariosNoContrato = z.infer<typeof esquemaDosComentarios>;

/** `POST .../comentarios` */
export const esquemaDoNovoComentario = z.strictObject({
  texto: z
    .string("Escreva o comentário.")
    .trim()
    .min(1, "Escreva o comentário.")
    .max(
      LIMITES_DOS_COMENTARIOS.tamanhoMaximo,
      `O comentário cabe em até ${LIMITES_DOS_COMENTARIOS.tamanhoMaximo} caracteres.`,
    ),
});

const motivo = z
  .string()
  .trim()
  .max(
    LIMITES_DOS_COMENTARIOS.motivoMaximo,
    `O motivo cabe em até ${LIMITES_DOS_COMENTARIOS.motivoMaximo} caracteres.`,
  );

/** `POST /v1/feed/comentarios/:comentarioId/denuncia` */
export const esquemaDaDenuncia = z.strictObject({
  motivo: motivo.optional(),
});

export const esquemaDaDenunciaRegistrada = z.strictObject({
  denunciado: z.literal(true),
});

/** Recusas próprias do comentário. */
export const esquemaDaRecusaDoComentario = z.strictObject({
  erro: z.enum(["comentario_bloqueado", "limite_de_comentarios"]),
  mensagem: z.string(),
});

// ---------------------------------------------------------------------------
// Comentários: painel da loja
// ---------------------------------------------------------------------------

export const ALVOS_DO_COMENTARIO = ["produto", "loja"] as const;

/** Um comentário como a loja o vê na moderação. */
export const esquemaDoComentarioDaLoja = z.strictObject({
  id: z.string().uuid(),
  texto: z.string(),
  situacao: esquemaDaSituacaoDoComentario,
  alvo: z.strictObject({
    tipo: z.enum(ALVOS_DO_COMENTARIO),
    /** Nulo quando o comentário é na loja. */
    produtoId: z.string().uuid().nullable(),
    produtoNome: z.string().nullable(),
  }),
  autor: z.strictObject({
    nome: z.string(),
    iniciais: z.string(),
    /** A loja bloqueou esta pessoa de comentar. */
    bloqueado: z.boolean(),
  }),
  criadoEm: z.string(),
  moderadoEm: z.string().nullable(),
  motivoDaRecusa: z.string().nullable(),
  /** Quantas pessoas denunciaram. */
  denuncias: z.number().int().nonnegative(),
});

export type ComentarioDaLoja = z.infer<typeof esquemaDoComentarioDaLoja>;

/** A contagem da loja — `pendentes` é o selo do menu. */
export const esquemaDaContagemDeComentarios = z.strictObject({
  pendentes: z.number().int().nonnegative(),
  aprovados: z.number().int().nonnegative(),
  recusados: z.number().int().nonnegative(),
  /** Comentários com ao menos uma denúncia (em qualquer situação). */
  denunciados: z.number().int().nonnegative(),
});

export type ContagemDeComentarios = z.infer<
  typeof esquemaDaContagemDeComentarios
>;

/** `GET /v1/lojas/:apelido/comentarios` */
export const esquemaDaConsultaDaModeracao = z.strictObject({
  /** Padrão: PENDENTE (a fila). */
  situacao: esquemaDaSituacaoDoComentario.default("PENDENTE"),
  alvo: z.enum(ALVOS_DO_COMENTARIO).optional(),
  produto: z.string().uuid().optional(),
  /** `true`: só os denunciados. */
  denunciados: z.enum(["true", "false"]).optional(),
  ...paginacao,
});

export type ConsultaDaModeracao = z.output<typeof esquemaDaConsultaDaModeracao>;

export const esquemaDaListaDaModeracao = z.strictObject({
  comentarios: z.array(esquemaDoComentarioDaLoja),
  contagem: esquemaDaContagemDeComentarios,
  /** A loja aprova sozinha (só o dono liga e desliga). */
  aprovarAutomaticamente: z.boolean(),
  pagina: z.number().int().min(1),
  porPagina: z.number().int().min(1),
  total: z.number().int().nonnegative(),
});

/** `POST .../:id/recusar` e `POST .../:id/bloquear-autor` */
export const esquemaDoMotivoDaModeracao = z.strictObject({
  motivo: motivo.optional(),
});

/** Uma pessoa bloqueada pela loja. */
export const esquemaDoBloqueio = z.strictObject({
  id: z.string().uuid(),
  nome: z.string(),
  iniciais: z.string(),
  motivo: z.string().nullable(),
  desde: z.string(),
});

export type BloqueioDeComentarios = z.infer<typeof esquemaDoBloqueio>;

export const esquemaDosBloqueios = z.strictObject({
  bloqueios: z.array(esquemaDoBloqueio),
});

/** `GET|PUT /v1/lojas/:apelido/comentarios/configuracao` */
export const esquemaDaConfiguracaoDosComentarios = z.strictObject({
  aprovarAutomaticamente: z.boolean(),
});

// ---------------------------------------------------------------------------
// Parâmetros
// ---------------------------------------------------------------------------

const apelido = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9-]{1,63}$/, "Loja inválida.");

export const esquemaDoProdutoSocial = z.strictObject({
  produtoId: z.string().uuid("Produto inválido."),
});

export const esquemaDaLojaSocial = z.strictObject({ apelido });

export const esquemaDoComentarioSocial = z.strictObject({
  comentarioId: z.string().uuid("Comentário inválido."),
});

export const esquemaDoComentarioNaLoja = z.strictObject({
  apelido,
  comentarioId: z.string().uuid("Comentário inválido."),
});

export const esquemaDoBloqueioNaLoja = z.strictObject({
  apelido,
  bloqueioId: z.string().uuid("Bloqueio inválido."),
});

// ---------------------------------------------------------------------------
// Rotas do contrato publicado
// ---------------------------------------------------------------------------

const ERROS_DE_COMENTAR = [400, 401, 403, 429] as const;

export const rotaDeCurtirProduto = definirRota({
  metodo: "post",
  caminho: "/v1/feed/produtos/:produtoId/curtida",
  etiqueta: "social",
  resumo: "Curtir produto",
  descricao:
    "Curte o produto (post do feed) pela pessoa da sessão. Idempotente: curtir de novo não duplica. Produto fora do ar: 404.",
  parametros: esquemaDoProdutoSocial,
  resposta: esquemaDaCurtida,
  errosPossiveis: [400, 401],
});

export const rotaDeDescurtirProduto = definirRota({
  metodo: "delete",
  caminho: "/v1/feed/produtos/:produtoId/curtida",
  etiqueta: "social",
  resumo: "Descurtir produto",
  descricao: "Tira a curtida da pessoa da sessão. Idempotente.",
  parametros: esquemaDoProdutoSocial,
  resposta: esquemaDaCurtida,
  errosPossiveis: [400, 401],
});

export const rotaDeCurtirLoja = definirRota({
  metodo: "post",
  caminho: "/v1/feed/lojas/:apelido/curtida",
  etiqueta: "social",
  resumo: "Curtir loja",
  descricao: "Curte a loja ativa pela pessoa da sessão. Idempotente.",
  parametros: esquemaDaLojaSocial,
  resposta: esquemaDaCurtida,
  errosPossiveis: [400, 401],
});

export const rotaDeDescurtirLoja = definirRota({
  metodo: "delete",
  caminho: "/v1/feed/lojas/:apelido/curtida",
  etiqueta: "social",
  resumo: "Descurtir loja",
  descricao: "Tira a curtida da loja. Idempotente.",
  parametros: esquemaDaLojaSocial,
  resposta: esquemaDaCurtida,
  errosPossiveis: [400, 401],
});

export const rotaDosComentariosDoProduto = definirRota({
  metodo: "get",
  caminho: "/v1/feed/produtos/:produtoId/comentarios",
  etiqueta: "social",
  resumo: "Comentários do produto",
  descricao:
    "Os comentários APROVADOS, do mais novo para o mais antigo, paginados. Com sessão, a página 1 traz antes os pendentes da própria pessoa (situacao PENDENTE, meu true, aviso 'Aguardando aprovação da loja').",
  parametros: esquemaDoProdutoSocial,
  consulta: esquemaDaConsultaDeComentarios,
  resposta: esquemaDosComentarios,
  errosPossiveis: [400],
});

export const rotaDeComentarProduto = definirRota({
  metodo: "post",
  caminho: "/v1/feed/produtos/:produtoId/comentarios",
  etiqueta: "social",
  resumo: "Comentar produto",
  descricao:
    "Cria o comentário da pessoa da sessão. Nasce PENDENTE (ou APROVADO, se a loja aprova automaticamente). Texto de 1 a 500 caracteres. 403 comentario_bloqueado; 429 limite_de_comentarios (5 em 10 minutos, 50 em 24 horas).",
  parametros: esquemaDoProdutoSocial,
  corpo: esquemaDoNovoComentario,
  resposta: esquemaDoComentarioPublico,
  status: 201,
  errosPossiveis: [...ERROS_DE_COMENTAR],
});

export const rotaDosComentariosDaLoja = definirRota({
  metodo: "get",
  caminho: "/v1/feed/lojas/:apelido/comentarios",
  etiqueta: "social",
  resumo: "Comentários na loja",
  descricao:
    "Os comentários APROVADOS feitos na loja (não nos produtos), como em GET /v1/feed/produtos/:produtoId/comentarios.",
  parametros: esquemaDaLojaSocial,
  consulta: esquemaDaConsultaDeComentarios,
  resposta: esquemaDosComentarios,
  errosPossiveis: [400],
});

export const rotaDeComentarLoja = definirRota({
  metodo: "post",
  caminho: "/v1/feed/lojas/:apelido/comentarios",
  etiqueta: "social",
  resumo: "Comentar na loja",
  descricao: "Como comentar um produto, mas o comentário é na loja.",
  parametros: esquemaDaLojaSocial,
  corpo: esquemaDoNovoComentario,
  resposta: esquemaDoComentarioPublico,
  status: 201,
  errosPossiveis: [...ERROS_DE_COMENTAR],
});

export const rotaDeDenunciarComentario = definirRota({
  metodo: "post",
  caminho: "/v1/feed/comentarios/:comentarioId/denuncia",
  etiqueta: "social",
  resumo: "Denunciar comentário",
  descricao:
    "Registra a denúncia da pessoa da sessão (uma por pessoa; denunciar de novo troca o motivo). Só comentário aprovado; os outros, 404.",
  parametros: esquemaDoComentarioSocial,
  corpo: esquemaDaDenuncia,
  resposta: esquemaDaDenunciaRegistrada,
  errosPossiveis: [400, 401],
});

export const rotaDeApagarMeuComentario = definirRota({
  metodo: "delete",
  caminho: "/v1/conta/comentarios/:comentarioId",
  etiqueta: "social",
  resumo: "Apagar o meu comentário",
  descricao: "O autor apaga o próprio comentário (em qualquer situação).",
  parametros: esquemaDoComentarioSocial,
  resposta: z.null(),
  status: 204,
  errosPossiveis: [400, 401],
});

const parametrosDaLoja = z.strictObject({ apelido: z.string().min(1).max(63) });

export const rotaDaModeracao = definirRota({
  metodo: "get",
  caminho: "/v1/lojas/:apelido/comentarios",
  etiqueta: "social",
  resumo: "Comentários da loja (moderação)",
  descricao:
    "A fila da moderação: por padrão os PENDENTES, do mais antigo para o mais novo; ?situacao=APROVADO|RECUSADO (mais novos primeiro), ?alvo=produto|loja, ?produto=<id>, ?denunciados=true. Traz a contagem por situação e se a loja aprova sozinha. Dono e equipe com moderar_comentarios.",
  parametros: parametrosDaLoja,
  consulta: esquemaDaConsultaDaModeracao,
  resposta: esquemaDaListaDaModeracao,
  errosPossiveis: [400, 401, 403],
});

export const rotaDaContagemDeComentarios = definirRota({
  metodo: "get",
  caminho: "/v1/lojas/:apelido/comentarios/contagem",
  etiqueta: "social",
  resumo: "Contagem de comentários (selo do painel)",
  parametros: parametrosDaLoja,
  resposta: esquemaDaContagemDeComentarios,
  errosPossiveis: [401, 403],
});

const parametrosDoComentarioNaLoja = parametrosDaLoja.extend({
  comentarioId: z.string().uuid(),
});

export const rotaDeAprovarComentario = definirRota({
  metodo: "post",
  caminho: "/v1/lojas/:apelido/comentarios/:comentarioId/aprovar",
  etiqueta: "social",
  resumo: "Aprovar comentário",
  descricao: "Publica o comentário. Vai para a trilha de auditoria.",
  parametros: parametrosDoComentarioNaLoja,
  resposta: esquemaDoComentarioDaLoja,
  errosPossiveis: [401, 403],
});

export const rotaDeRecusarComentario = definirRota({
  metodo: "post",
  caminho: "/v1/lojas/:apelido/comentarios/:comentarioId/recusar",
  etiqueta: "social",
  resumo: "Recusar comentário",
  descricao:
    "Tira o comentário do público (ou não deixa entrar), com motivo opcional. Vai para a trilha.",
  parametros: parametrosDoComentarioNaLoja,
  corpo: esquemaDoMotivoDaModeracao,
  resposta: esquemaDoComentarioDaLoja,
  errosPossiveis: [400, 401, 403],
});

export const rotaDeApagarComentarioDaLoja = definirRota({
  metodo: "delete",
  caminho: "/v1/lojas/:apelido/comentarios/:comentarioId",
  etiqueta: "social",
  resumo: "Apagar comentário",
  descricao: "Apaga o comentário de vez. Vai para a trilha.",
  parametros: parametrosDoComentarioNaLoja,
  resposta: z.null(),
  status: 204,
  errosPossiveis: [401, 403],
});

export const rotaDeBloquearAutor = definirRota({
  metodo: "post",
  caminho: "/v1/lojas/:apelido/comentarios/:comentarioId/bloquear-autor",
  etiqueta: "social",
  resumo: "Bloquear o autor do comentário",
  descricao:
    "A pessoa que escreveu o comentário deixa de poder comentar na loja, e os pendentes dela são recusados. Idempotente. Vai para a trilha.",
  parametros: parametrosDoComentarioNaLoja,
  corpo: esquemaDoMotivoDaModeracao,
  resposta: esquemaDoBloqueio,
  status: 201,
  errosPossiveis: [400, 401, 403],
});

export const rotaDosBloqueios = definirRota({
  metodo: "get",
  caminho: "/v1/lojas/:apelido/comentarios/bloqueios",
  etiqueta: "social",
  resumo: "Pessoas bloqueadas de comentar",
  parametros: parametrosDaLoja,
  resposta: esquemaDosBloqueios,
  errosPossiveis: [401, 403],
});

export const rotaDeDesbloquear = definirRota({
  metodo: "delete",
  caminho: "/v1/lojas/:apelido/comentarios/bloqueios/:bloqueioId",
  etiqueta: "social",
  resumo: "Desbloquear pessoa",
  parametros: parametrosDaLoja.extend({ bloqueioId: z.string().uuid() }),
  resposta: z.null(),
  status: 204,
  errosPossiveis: [401, 403],
});

export const rotaDaConfiguracaoDosComentarios = definirRota({
  metodo: "get",
  caminho: "/v1/lojas/:apelido/comentarios/configuracao",
  etiqueta: "social",
  resumo: "Configuração dos comentários",
  descricao: "Se a loja aprova os comentários sozinha. Só o dono.",
  parametros: parametrosDaLoja,
  resposta: esquemaDaConfiguracaoDosComentarios,
  errosPossiveis: [401, 403],
});

export const rotaDeGravarConfiguracaoDosComentarios = definirRota({
  metodo: "put",
  caminho: "/v1/lojas/:apelido/comentarios/configuracao",
  etiqueta: "social",
  resumo: "Ligar ou desligar a aprovação automática",
  descricao:
    "Padrão: desligada (a loja modera). Ligada, o comentário novo já nasce APROVADO; os pendentes continuam na fila. Só o dono. Vai para a trilha.",
  parametros: parametrosDaLoja,
  corpo: esquemaDaConfiguracaoDosComentarios,
  resposta: esquemaDaConfiguracaoDosComentarios,
  errosPossiveis: [400, 401, 403],
});

export const ROTAS_DO_SOCIAL = [
  rotaDeCurtirProduto,
  rotaDeDescurtirProduto,
  rotaDeCurtirLoja,
  rotaDeDescurtirLoja,
  rotaDosComentariosDoProduto,
  rotaDeComentarProduto,
  rotaDosComentariosDaLoja,
  rotaDeComentarLoja,
  rotaDeDenunciarComentario,
  rotaDeApagarMeuComentario,
  rotaDaModeracao,
  rotaDaContagemDeComentarios,
  rotaDeAprovarComentario,
  rotaDeRecusarComentario,
  rotaDeApagarComentarioDaLoja,
  rotaDeBloquearAutor,
  rotaDosBloqueios,
  rotaDeDesbloquear,
  rotaDaConfiguracaoDosComentarios,
  rotaDeGravarConfiguracaoDosComentarios,
] as const;
