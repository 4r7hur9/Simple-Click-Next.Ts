/**
 * Rotas dos stories (card #46). O story é DA LOJA e dura 24 horas.
 *
 *   Painel (montado em /v1/lojas; o portão da equipe exige catalogo.produtos):
 *     POST   /:apelido/stories              corpo = arquivo (foto ou vídeo)
 *     GET    /:apelido/stories              ativos, com visualizações e limite
 *     DELETE /:apelido/stories/:storyId
 *
 *   Público (montado em /v1):
 *     GET    /stories[?loja=apelido]        ativos agrupados por loja
 *     POST   /stories/:storyId/visto        exige sessão
 *
 *   Administração (dentro do roteador de /v1/admin):
 *     GET/PUT /stories/limite               padrão da plataforma
 *     GET/PUT /lojas/:id/stories/limite     ajuste de uma loja
 *
 * Toda leitura filtra `expires_at > now()`: o story vencido some na hora. O
 * arquivo e a linha saem na limpeza (`core/limpeza-dos-stories.ts`) — ou na
 * hora, quando a loja apaga.
 */

import {
  esquemaDaConsultaDoEnvioDeStory,
  esquemaDaConsultaDosStoriesAtivos,
  esquemaDoAjusteDeStories,
  esquemaDoPadraoDeStories,
  LIMITES_DE_MIDIA_PADRAO,
} from "@simpleclick/contracts";
import express, {
  Router,
  type NextFunction,
  type Request,
  type Response,
} from "express";
import { z } from "zod";

import {
  armazenamentoDeMidiaDoAmbiente,
  responderFalhaDeMidia,
  type ArmazenamentoDeMidia,
} from "../../core/armazenamento-de-midia.ts";
import {
  conferirMidia,
  duracaoDoVideoMs,
  limitesDeMidiaDoAmbiente,
  tamanhoLegivel,
  type LimitesDeMidiaDaApi,
} from "../../core/conferencia-de-midia.ts";
import { executarComoRequisicao } from "../../core/contexto.ts";
import {
  banco,
  transacaoAtual,
  type AcessoAoBanco,
  type TransacaoDoBanco,
} from "../../core/db.ts";
import { registrar } from "../../core/log.ts";
import {
  agruparPorLoja,
  storyDaLoja,
  type LinhaDoStoryAtivo,
} from "./stories.usecase.ts";

/*
 * O que a borda (`app.ts`) entrega a estas rotas. Mesma forma das rotas do
 * catálogo, declarada aqui porque um módulo não importa outro.
 */
interface ChegadaNaLoja {
  readonly host?: string | null;
  readonly apelido?: string | null;
}

type IdentificacaoDaLoja =
  | { readonly encontrada: true; readonly id: string }
  | { readonly encontrada: false };

interface UsuarioAutenticado {
  readonly identidadeId: string;
  readonly papel: "OWNER" | "STAFF";
}

const esquemaDoUuid = z.string().uuid();

function erro(
  resposta: Response,
  status: number,
  codigo: string,
  mensagem?: string,
): void {
  resposta
    .status(status)
    .json(mensagem === undefined ? { erro: codigo } : { erro: codigo, mensagem });
}

const selecaoDoStory = {
  id: true,
  kind: true,
  mediaUrl: true,
  posterUrl: true,
  durationMs: true,
  width: true,
  height: true,
  caption: true,
  link: true,
  viewsCount: true,
  createdAt: true,
  expiresAt: true,
} as const;

/** Mede o limite de stories ativos da loja do contexto (e trava). */
async function limiteDeStories(
  tx: TransacaoDoBanco,
): Promise<{ limite: number; uso: number }> {
  const [linha] = await tx.$queryRaw<{ limite: number; uso: number }[]>`
    SELECT limite, uso FROM app.medir_limite_de_stories()`;
  return {
    limite: Number(linha?.limite ?? LIMITES_DE_MIDIA_PADRAO.storiesAtivosPorLoja),
    uso: Number(linha?.uso ?? 0),
  };
}

// ---------------------------------------------------------------------------
// Painel
// ---------------------------------------------------------------------------

export interface OpcoesDosStoriesDaLoja {
  readonly acesso?: AcessoAoBanco;
  readonly autenticar: (requisicao: Request) => UsuarioAutenticado | null;
  readonly resolverLoja: (
    chegada: ChegadaNaLoja,
  ) => Promise<IdentificacaoDaLoja>;
  readonly armazenamento?: ArmazenamentoDeMidia;
  readonly limites?: LimitesDeMidiaDaApi;
}

export function criarRotasDosStoriesDaLoja(
  opcoes: OpcoesDosStoriesDaLoja,
): Router {
  const rotas = Router();
  const acesso = (): AcessoAoBanco => opcoes.acesso ?? banco();
  const armazenamento = (): ArmazenamentoDeMidia =>
    opcoes.armazenamento ?? armazenamentoDeMidiaDoAmbiente();
  const limites = opcoes.limites ?? limitesDeMidiaDoAmbiente();
  const maiorArquivo = Math.max(
    limites.videoTamanhoMaximoBytes,
    limites.imagemDoStoryTamanhoMaximoBytes,
  );

  const autenticado = (
    requisicao: Request,
    resposta: Response,
    proximo: NextFunction,
  ) => {
    const usuario = opcoes.autenticar(requisicao);
    if (usuario === null) {
      erro(resposta, 401, "nao_autenticado");
      return;
    }
    resposta.locals.usuario = usuario;
    proximo();
  };

  async function naLoja<T>(
    requisicao: Request,
    resposta: Response,
    trabalho: (tx: TransacaoDoBanco, lojaId: string) => Promise<T>,
  ): Promise<{ lojaId: string; valor: T } | null> {
    const apelido = String(requisicao.params["apelido"]);
    const identificacao = await executarComoRequisicao(
      { papel: "PUBLIC" },
      () => acesso().emTransacao(() => opcoes.resolverLoja({ apelido })),
    );
    if (!identificacao.encontrada) {
      erro(resposta, 404, "nao_encontrado");
      return null;
    }
    const usuario = resposta.locals.usuario as UsuarioAutenticado;
    const valor = await executarComoRequisicao(
      {
        lojaId: identificacao.id,
        usuarioId: usuario.identidadeId,
        papel: usuario.papel,
      },
      () => acesso().emTransacao((tx) => trabalho(tx, identificacao.id)),
    );
    return { lojaId: identificacao.id, valor };
  }

  async function apagarArquivo(chave: string, lojaId: string) {
    try {
      await armazenamento().apagar(chave);
    } catch {
      registrar.aviso("stories.arquivo_nao_apagado", {
        lojaId,
        recurso: "story",
      });
    }
  }

  rotas.get("/:apelido/stories", autenticado, async (requisicao, resposta, proximo) => {
    try {
      const lido = await naLoja(requisicao, resposta, async (tx, lojaId) => {
        const stories = await tx.story.findMany({
          where: { storeId: lojaId, expiresAt: { gt: new Date() } },
          orderBy: { createdAt: "desc" },
          select: selecaoDoStory,
        });
        const limite = await limiteDeStories(tx);
        return { stories, limite };
      });
      if (lido === null) return;
      const { limite, uso } = lido.valor.limite;
      resposta.set("cache-control", "private, no-store");
      resposta.json({
        stories: lido.valor.stories.map(storyDaLoja),
        limite: { limite, uso, restante: Math.max(0, limite - uso) },
      });
    } catch (causa) {
      proximo(causa);
    }
  });

  const CAMINHO_DO_ENVIO = "/:apelido/stories";
  rotas.post(
    CAMINHO_DO_ENVIO,
    autenticado,
    express.raw({ type: () => true, limit: maiorArquivo }),
    async (requisicao, resposta, proximo) => {
      try {
        const consulta = esquemaDaConsultaDoEnvioDeStory.safeParse(
          requisicao.query,
        );
        if (!consulta.success) {
          erro(
            resposta,
            400,
            "entrada_invalida",
            consulta.error.issues[0]?.message,
          );
          return;
        }
        const bytes = Buffer.isBuffer(requisicao.body)
          ? new Uint8Array(requisicao.body)
          : new Uint8Array();
        const conferida = bytes.length === 0 ? null : conferirMidia(bytes);
        if (conferida === null) {
          erro(
            resposta,
            400,
            "midia_invalida",
            "O story precisa ser uma foto (jpeg, png, webp) ou um vídeo (mp4, webm).",
          );
          return;
        }
        let duracao: number | null = null;
        if (conferida.tipo === "imagem") {
          if (bytes.length > limites.imagemDoStoryTamanhoMaximoBytes) {
            erro(
              resposta,
              413,
              "imagem_grande_demais",
              `A foto do story pode ter até ${tamanhoLegivel(limites.imagemDoStoryTamanhoMaximoBytes)}.`,
            );
            return;
          }
        } else {
          if (bytes.length > limites.videoTamanhoMaximoBytes) {
            erro(
              resposta,
              413,
              "video_grande_demais",
              `O vídeo pode ter até ${tamanhoLegivel(limites.videoTamanhoMaximoBytes)}.`,
            );
            return;
          }
          duracao = duracaoDoVideoMs(
            conferida.duracaoMs,
            consulta.data.duracaoSegundos,
          );
          if (
            duracao !== null &&
            duracao > limites.videoDuracaoMaximaSegundos * 1000
          ) {
            erro(
              resposta,
              400,
              "video_longo_demais",
              `O vídeo pode ter até ${limites.videoDuracaoMaximaSegundos} segundos.`,
            );
            return;
          }
          if (duracao === null && armazenamento().lugar !== "cloudinary") {
            erro(
              resposta,
              400,
              "video_sem_duracao",
              "Não deu para ler a duração do vídeo. Envie de novo informando ?duracaoSegundos=.",
            );
            return;
          }
        }

        // 1) Limite ANTES de enviar.
        const antes = await naLoja(requisicao, resposta, (tx) =>
          limiteDeStories(tx),
        );
        if (antes === null) return;
        if (antes.valor.uso >= antes.valor.limite) {
          responderLimite(resposta, antes.valor);
          return;
        }

        // 2) Guarda FORA da transação.
        const guardada = await armazenamento().guardar({
          lojaId: antes.lojaId,
          pasta: "stories",
          tipo: conferida.tipo,
          bytes,
          tipoDeConteudo: conferida.tipoDeConteudo,
          extensao: conferida.extensao,
        });
        if (conferida.tipo === "video") {
          duracao ??= guardada.duracaoMs;
          if (
            duracao === null ||
            duracao > limites.videoDuracaoMaximaSegundos * 1000
          ) {
            await apagarArquivo(guardada.chave, antes.lojaId);
            erro(
              resposta,
              400,
              duracao === null ? "video_sem_duracao" : "video_longo_demais",
            );
            return;
          }
        }

        // 3) Grava, reconferindo o limite com a trava.
        const usuario = resposta.locals.usuario as UsuarioAutenticado;
        let gravado;
        try {
          gravado = await naLoja(requisicao, resposta, async (tx, lojaId) => {
            const medido = await limiteDeStories(tx);
            if (medido.uso >= medido.limite) return { limite: medido };
            const agora = new Date();
            const criado = await tx.story.create({
              data: {
                storeId: lojaId,
                createdAt: agora,
                expiresAt: new Date(
                  agora.getTime() + limites.duracaoDoStoryHoras * 3_600_000,
                ),
                kind: conferida.tipo === "video" ? "VIDEO" : "IMAGEM",
                mediaUrl: guardada.url,
                storageKey: guardada.chave,
                posterUrl: guardada.capaUrl,
                contentType: conferida.tipoDeConteudo,
                sizeBytes: BigInt(bytes.length),
                durationMs: duracao,
                width:
                  (conferida.tipo === "video" ? conferida.largura : null) ??
                  guardada.largura,
                height:
                  (conferida.tipo === "video" ? conferida.altura : null) ??
                  guardada.altura,
                caption: consulta.data.legenda || null,
                link: consulta.data.link || null,
                createdBy: /^[0-9a-f-]{36}$/i.test(usuario.identidadeId)
                  ? usuario.identidadeId
                  : null,
              },
              select: selecaoDoStory,
            });
            return { criado };
          });
        } catch (causa) {
          await apagarArquivo(guardada.chave, antes.lojaId);
          throw causa;
        }
        if (gravado === null) return;
        if ("limite" in gravado.valor) {
          await apagarArquivo(guardada.chave, antes.lojaId);
          responderLimite(resposta, gravado.valor.limite);
          return;
        }
        resposta.status(201).json(storyDaLoja(gravado.valor.criado));
      } catch (causa) {
        responderFalhaDeMidia(causa, resposta, proximo);
      }
    },
  );

  rotas.delete(
    "/:apelido/stories/:storyId",
    autenticado,
    async (requisicao, resposta, proximo) => {
      try {
        const storyId = esquemaDoUuid.safeParse(requisicao.params["storyId"]);
        if (!storyId.success) {
          erro(resposta, 404, "nao_encontrado");
          return;
        }
        const removido = await naLoja(requisicao, resposta, async (tx, lojaId) => {
          const story = await tx.story.findFirst({
            where: { id: storyId.data, storeId: lojaId },
            select: { id: true, storageKey: true },
          });
          if (story === null) return null;
          await tx.story.delete({ where: { id: story.id } });
          return story;
        });
        if (removido === null) return;
        if (removido.valor === null) {
          erro(resposta, 404, "nao_encontrado");
          return;
        }
        await apagarArquivo(removido.valor.storageKey, removido.lojaId);
        resposta.status(204).end();
      } catch (causa) {
        proximo(causa);
      }
    },
  );

  rotas.use(
    CAMINHO_DO_ENVIO,
    (causa: unknown, _requisicao: Request, resposta: Response, proximo: NextFunction) => {
      if ((causa as { type?: string } | null)?.type !== "entity.too.large") {
        proximo(causa);
        return;
      }
      erro(
        resposta,
        413,
        "arquivo_grande_demais",
        `O story pode ter até ${tamanhoLegivel(maiorArquivo)}.`,
      );
    },
  );

  return rotas;
}

function responderLimite(
  resposta: Response,
  medido: { limite: number; uso: number },
): void {
  resposta.status(409).json({
    erro: "limite_atingido",
    recurso: "stories",
    limite: medido.limite,
    uso: medido.uso,
    mensagem: `A loja pode ter até ${medido.limite} stories no ar ao mesmo tempo. Apague um ou espere algum vencer.`,
  });
}

// ---------------------------------------------------------------------------
// Público
// ---------------------------------------------------------------------------

export interface OpcoesDosStoriesPublicos {
  readonly acesso?: AcessoAoBanco;
  /** A conta da sessão, ou `null`. */
  readonly autenticar: (
    requisicao: Request,
  ) => { readonly identidadeId: string } | null;
}

export function criarRotasDosStoriesPublicos(
  opcoes: OpcoesDosStoriesPublicos,
): Router {
  const rotas = Router();
  const acesso = (): AcessoAoBanco => opcoes.acesso ?? banco();

  function comoQuemPediu<T>(
    requisicao: Request,
    trabalho: () => Promise<T>,
  ): Promise<T> {
    const conta = opcoes.autenticar(requisicao);
    return executarComoRequisicao(
      conta === null
        ? { papel: "PUBLIC" }
        : { usuarioId: conta.identidadeId, papel: "CUSTOMER" },
      () => acesso().emTransacao(trabalho),
    );
  }

  rotas.get("/stories", async (requisicao, resposta, proximo) => {
    try {
      const consulta = esquemaDaConsultaDosStoriesAtivos.safeParse(
        requisicao.query,
      );
      if (!consulta.success) {
        erro(resposta, 400, "entrada_invalida");
        return;
      }
      const linhas = await comoQuemPediu(
        requisicao,
        () => transacaoAtual().$queryRaw<LinhaDoStoryAtivo[]>`
          SELECT * FROM app.stories_ativos(${consulta.data.loja ?? null}::text)`,
      );
      resposta.set("cache-control", "private, no-store");
      resposta.json({ lojas: agruparPorLoja(linhas) });
    } catch (causa) {
      proximo(causa);
    }
  });

  rotas.post("/stories/:storyId/visto", async (requisicao, resposta, proximo) => {
    try {
      if (opcoes.autenticar(requisicao) === null) {
        erro(resposta, 401, "nao_autenticado");
        return;
      }
      const storyId = esquemaDoUuid.safeParse(requisicao.params["storyId"]);
      if (!storyId.success) {
        erro(resposta, 404, "nao_encontrado");
        return;
      }
      const linhas = await comoQuemPediu(
        requisicao,
        () => transacaoAtual().$queryRaw<{ novo: boolean }[]>`
          SELECT novo FROM app.marcar_story_visto(${storyId.data}::uuid)`,
      );
      if (linhas.length === 0) {
        erro(resposta, 404, "nao_encontrado");
        return;
      }
      resposta.json({ id: storyId.data, visto: true });
    } catch (causa) {
      proximo(causa);
    }
  });

  return rotas;
}

// ---------------------------------------------------------------------------
// Administração
// ---------------------------------------------------------------------------

interface DependenciasDaAdministracao {
  readonly acesso: () => AcessoAoBanco;
  readonly comoAdministrador: (
    resposta: Response,
    trabalho: (administradorId: string) => Promise<void>,
  ) => Promise<void>;
}

/** Monta o limite de stories dentro do roteador de `/v1/admin`. */
export function montarRotasDoLimiteDeStories(
  rotas: Router,
  { acesso, comoAdministrador }: DependenciasDaAdministracao,
): void {
  async function padrao(tx: TransacaoDoBanco): Promise<number> {
    const [linha] = await tx.$queryRaw<{ padrao: number }[]>`
      SELECT max_active_stories_per_store AS padrao
        FROM app.platform_limit_defaults WHERE id = 1`;
    return Number(linha?.padrao ?? LIMITES_DE_MIDIA_PADRAO.storiesAtivosPorLoja);
  }

  async function daLoja(tx: TransacaoDoBanco, lojaId: string) {
    const [linha] = await tx.$queryRaw<
      { ajuste: number | null; ativos: number }[]
    >`
      SELECT (SELECT max_active_stories FROM app.store_limits WHERE store_id = ${lojaId}::uuid) AS ajuste,
             (SELECT count(*)::integer FROM app.stories
               WHERE store_id = ${lojaId}::uuid AND expires_at > now()) AS ativos`;
    const valorPadrao = await padrao(tx);
    const ajuste = linha?.ajuste ?? null;
    return {
      padrao: valorPadrao,
      ajuste,
      limite: ajuste ?? valorPadrao,
      ativos: Number(linha?.ativos ?? 0),
    };
  }

  async function lojaExiste(tx: TransacaoDoBanco, lojaId: string) {
    const [linha] = await tx.$queryRaw<{ existe: boolean }[]>`
      SELECT EXISTS (SELECT 1 FROM app.stores WHERE id = ${lojaId}::uuid) AS existe`;
    return linha?.existe === true;
  }

  rotas.get("/stories/limite", async (_requisicao, resposta, proximo) => {
    try {
      await comoAdministrador(resposta, async () => {
        const valor = await acesso().emTransacao((tx) => padrao(tx));
        resposta.json({ padrao: valor });
      });
    } catch (causa) {
      proximo(causa);
    }
  });

  rotas.put("/stories/limite", async (requisicao, resposta, proximo) => {
    try {
      const entrada = esquemaDoPadraoDeStories.safeParse(requisicao.body);
      if (!entrada.success) {
        erro(resposta, 400, "entrada_invalida");
        return;
      }
      await comoAdministrador(resposta, async (administradorId) => {
        await acesso().emTransacao(
          (tx) => tx.$executeRaw`
            UPDATE app.platform_limit_defaults
               SET max_active_stories_per_store = ${entrada.data.padrao},
                   updated_by = ${administradorId}::uuid
             WHERE id = 1`,
        );
        resposta.json({ padrao: entrada.data.padrao });
      });
    } catch (causa) {
      proximo(causa);
    }
  });

  rotas.get("/lojas/:id/stories/limite", async (requisicao, resposta, proximo) => {
    try {
      const lojaId = esquemaDoUuid.safeParse(requisicao.params["id"]);
      if (!lojaId.success) {
        erro(resposta, 404, "nao_encontrado");
        return;
      }
      await comoAdministrador(resposta, async () => {
        const lido = await acesso().emTransacao(async (tx) =>
          (await lojaExiste(tx, lojaId.data)) ? daLoja(tx, lojaId.data) : null,
        );
        if (lido === null) {
          erro(resposta, 404, "nao_encontrado");
          return;
        }
        resposta.json(lido);
      });
    } catch (causa) {
      proximo(causa);
    }
  });

  rotas.put("/lojas/:id/stories/limite", async (requisicao, resposta, proximo) => {
    try {
      const lojaId = esquemaDoUuid.safeParse(requisicao.params["id"]);
      const entrada = esquemaDoAjusteDeStories.safeParse(requisicao.body);
      if (!lojaId.success) {
        erro(resposta, 404, "nao_encontrado");
        return;
      }
      if (!entrada.success) {
        erro(resposta, 400, "entrada_invalida");
        return;
      }
      await comoAdministrador(resposta, async (administradorId) => {
        const lido = await acesso().emTransacao(async (tx) => {
          if (!(await lojaExiste(tx, lojaId.data))) return null;
          await tx.$executeRaw`
            INSERT INTO app.store_limits (store_id, max_active_stories, updated_by)
            VALUES (${lojaId.data}::uuid, ${entrada.data.limite}, ${administradorId}::uuid)
            ON CONFLICT (store_id) DO UPDATE
               SET max_active_stories = excluded.max_active_stories,
                   updated_by = excluded.updated_by,
                   updated_at = now()`;
          return daLoja(tx, lojaId.data);
        });
        if (lido === null) {
          erro(resposta, 404, "nao_encontrado");
          return;
        }
        resposta.json(lido);
      });
    } catch (causa) {
      proximo(causa);
    }
  });
}
