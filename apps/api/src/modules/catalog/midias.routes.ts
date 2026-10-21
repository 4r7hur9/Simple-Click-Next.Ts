/**
 * Vídeos do produto e a galeria mista (card #46).
 *
 * O produto é o post da loja: fotos (`imagens.routes.ts`, inalteradas) e
 * vídeos na mesma galeria, numa ordem só. As fotos e os vídeos dividem o
 * `sort_order`; `GET .../midias` devolve os dois juntos e `PUT .../midias/ordem`
 * reescreve a ordem dos dois de uma vez.
 *
 * O ENVIO É O ARQUIVO CRU. A conferência olha os BYTES (mp4/webm de verdade,
 * duração dentro do limite) antes de resolver a loja e antes de gastar o
 * serviço de mídia. O arquivo é guardado FORA da transação (rede lenta não
 * segura conexão) e, se a gravação no banco não acontecer, o arquivo sai.
 *
 * Quem pode: o portão da equipe já conferiu `catalogo.produtos` (a rota mora
 * em `/catalogo/produtos`), e o banco confere o vínculo de novo.
 */

import {
  esquemaDaConsultaDoEnvioDeVideo,
  esquemaDaOrdemDasMidias,
  type MidiaDoProduto,
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
  formatoDaFoto,
  limitesDeMidiaDoAmbiente,
  tamanhoLegivel,
  type LimitesDeMidiaDaApi,
} from "../../core/conferencia-de-midia.ts";
import { executarComoRequisicao } from "../../core/contexto.ts";
import {
  banco,
  type AcessoAoBanco,
  type TransacaoDoBanco,
} from "../../core/db.ts";
import { registrar } from "../../core/log.ts";
import type {
  ChegadaNaLoja,
  IdentificacaoDaLoja,
  UsuarioAutenticado,
} from "./categorias.routes.ts";
import { TAMANHO_MAXIMO_DA_IMAGEM_EM_BYTES } from "./imagens.usecase.ts";

export interface OpcoesDasMidias {
  readonly acesso?: AcessoAoBanco;
  readonly autenticar: (requisicao: Request) => UsuarioAutenticado | null;
  readonly resolverLoja: (
    chegada: ChegadaNaLoja,
  ) => Promise<IdentificacaoDaLoja>;
  /** Onde o vídeo fica. Padrão: o do ambiente (Cloudinary ou disco local). */
  readonly armazenamento?: ArmazenamentoDeMidia;
  /** Limites de tamanho, duração e quantidade. Padrão: os do ambiente. */
  readonly limites?: LimitesDeMidiaDaApi;
}

const BASE = "/:apelido/catalogo/produtos/:produtoId";

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

const selecaoDoVideo = {
  id: true,
  url: true,
  posterUrl: true,
  contentType: true,
  sizeBytes: true,
  durationMs: true,
  width: true,
  height: true,
  sortOrder: true,
  createdAt: true,
} as const;

interface LinhaDoVideo {
  readonly id: string;
  readonly url: string;
  readonly posterUrl: string | null;
  readonly contentType: string;
  readonly sizeBytes: bigint;
  readonly durationMs: number | null;
  readonly width: number | null;
  readonly height: number | null;
  readonly sortOrder: number;
  readonly createdAt: Date;
}

/** Segundos com uma casa: 12345 ms → 12.3. */
export function segundos(ms: number | null): number | null {
  return ms === null ? null : Math.round(ms / 100) / 10;
}

function midiaDoVideo(video: LinhaDoVideo): MidiaDoProduto {
  return {
    id: video.id,
    tipo: "video",
    url: video.url,
    capa: video.posterUrl,
    duracaoSegundos: segundos(video.durationMs),
    largura: video.width,
    altura: video.height,
    texto: null,
    ordem: video.sortOrder,
    principal: false,
    tamanhoBytes: Number(video.sizeBytes),
    formato: video.contentType,
  };
}

/** A galeria inteira do produto, na ordem: fotos e vídeos misturados. */
async function galeria(
  tx: TransacaoDoBanco,
  lojaId: string,
  produtoId: string,
): Promise<MidiaDoProduto[]> {
  const [imagens, videos] = await Promise.all([
    tx.productImage.findMany({
      where: { storeId: lojaId, productId: produtoId, url: { not: null } },
      select: {
        id: true,
        url: true,
        altText: true,
        isPrimary: true,
        sortOrder: true,
        width: true,
        height: true,
        createdAt: true,
      },
    }),
    tx.productVideo.findMany({
      where: { storeId: lojaId, productId: produtoId },
      select: selecaoDoVideo,
    }),
  ]);
  const todas = [
    ...imagens.map((imagem) => ({
      criada: imagem.createdAt,
      midia: {
        id: imagem.id,
        tipo: "imagem",
        url: imagem.url ?? "",
        capa: null,
        duracaoSegundos: null,
        largura: imagem.width,
        altura: imagem.height,
        texto: imagem.altText,
        ordem: imagem.sortOrder,
        principal: imagem.isPrimary,
        tamanhoBytes: null,
        formato: null,
      } satisfies MidiaDoProduto,
    })),
    ...videos.map((video) => ({
      criada: video.createdAt,
      midia: midiaDoVideo(video),
    })),
  ];
  todas.sort(
    (a, b) =>
      a.midia.ordem - b.midia.ordem ||
      Number(b.midia.principal) - Number(a.midia.principal) ||
      a.criada.getTime() - b.criada.getTime(),
  );
  return todas.map((item) => item.midia);
}

/** A próxima posição da galeria (depois da última foto ou vídeo). */
async function proximaOrdem(
  tx: TransacaoDoBanco,
  lojaId: string,
  produtoId: string,
): Promise<number> {
  const [foto, video] = await Promise.all([
    tx.productImage.findFirst({
      where: { storeId: lojaId, productId: produtoId },
      orderBy: { sortOrder: "desc" },
      select: { sortOrder: true },
    }),
    tx.productVideo.findFirst({
      where: { storeId: lojaId, productId: produtoId },
      orderBy: { sortOrder: "desc" },
      select: { sortOrder: true },
    }),
  ]);
  return Math.max(foto?.sortOrder ?? -1, video?.sortOrder ?? -1) + 1;
}

/** `GET /v1/midia/limites` — público. */
export function criarRotaDosLimitesDeMidia(
  limites: LimitesDeMidiaDaApi = limitesDeMidiaDoAmbiente(),
): Router {
  const rotas = Router();
  rotas.get("/limites", (_requisicao, resposta) => {
    resposta.set("cache-control", "public, max-age=300");
    resposta.json({
      videoTamanhoMaximoBytes: limites.videoTamanhoMaximoBytes,
      videoDuracaoMaximaSegundos: limites.videoDuracaoMaximaSegundos,
      videosPorProduto: limites.videosPorProduto,
      imagemDoStoryTamanhoMaximoBytes: limites.imagemDoStoryTamanhoMaximoBytes,
      duracaoDoStoryHoras: limites.duracaoDoStoryHoras,
      formatosDeVideo: limites.formatosDeVideo,
      formatosDeImagem: limites.formatosDeImagem,
    });
  });
  return rotas;
}

export function criarRotasDasMidias(opcoes: OpcoesDasMidias): Router {
  const rotas = Router();
  const acesso = (): AcessoAoBanco => opcoes.acesso ?? banco();
  const armazenamento = (): ArmazenamentoDeMidia =>
    opcoes.armazenamento ?? armazenamentoDeMidiaDoAmbiente();
  const limites = opcoes.limites ?? limitesDeMidiaDoAmbiente();

  // Só as rotas daqui exigem sessão: o roteador é montado em `/v1/lojas` ao
  // lado de outros, e um portão geral responderia por eles.
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

  /** Roda o trabalho na loja do apelido, como a equipe dela. */
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

  function produtoDaLoja(tx: TransacaoDoBanco, lojaId: string, id: string) {
    return tx.product.findFirst({
      where: { id, storeId: lojaId, deletedAt: null },
      select: { id: true },
    });
  }

  /** Apaga sem derrubar a resposta: arquivo que não sai fica registrado. */
  async function apagarArquivo(chave: string | null, lojaId: string) {
    if (chave === null) return;
    try {
      await armazenamento().apagar(chave);
    } catch {
      registrar.aviso("midia.arquivo_nao_apagado", {
        lojaId,
        recurso: "video",
      });
    }
  }

  function idsValidos(requisicao: Request, resposta: Response): boolean {
    const ok = ["produtoId", "videoId"].every(
      (nome) =>
        requisicao.params[nome] === undefined ||
        esquemaDoUuid.safeParse(requisicao.params[nome]).success,
    );
    if (!ok) erro(resposta, 404, "nao_encontrado");
    return ok;
  }

  // -------------------------------------------------------------------------
  // A galeria
  // -------------------------------------------------------------------------
  rotas.get(`${BASE}/midias`, autenticado, async (requisicao, resposta, proximo) => {
    try {
      if (!idsValidos(requisicao, resposta)) return;
      const produtoId = String(requisicao.params["produtoId"]);
      const lido = await naLoja(requisicao, resposta, async (tx, lojaId) => {
        if ((await produtoDaLoja(tx, lojaId, produtoId)) === null) return null;
        return galeria(tx, lojaId, produtoId);
      });
      if (lido === null) return;
      if (lido.valor === null) {
        erro(resposta, 404, "nao_encontrado");
        return;
      }
      resposta.json({ midias: lido.valor });
    } catch (causa) {
      proximo(causa);
    }
  });

  rotas.put(
    `${BASE}/midias/ordem`,
    autenticado,
    async (requisicao, resposta, proximo) => {
      try {
        if (!idsValidos(requisicao, resposta)) return;
        const entrada = esquemaDaOrdemDasMidias.safeParse(requisicao.body);
        if (!entrada.success) {
          erro(resposta, 400, "entrada_invalida");
          return;
        }
        const produtoId = String(requisicao.params["produtoId"]);
        const feito = await naLoja(requisicao, resposta, async (tx, lojaId) => {
          if ((await produtoDaLoja(tx, lojaId, produtoId)) === null) {
            return "nao_encontrado" as const;
          }
          const atual = await galeria(tx, lojaId, produtoId);
          const chave = (tipo: string, id: string) => `${tipo}:${id}`;
          const existentes = new Set(atual.map((m) => chave(m.tipo, m.id)));
          const pedidas = entrada.data.ordem.map((m) => chave(m.tipo, m.id));
          if (
            pedidas.some((item) => !existentes.has(item)) ||
            new Set(pedidas).size !== pedidas.length
          ) {
            return "desconhecida" as const;
          }
          const restantes = atual
            .map((m) => chave(m.tipo, m.id))
            .filter((item) => !pedidas.includes(item));
          const agora = new Date();
          for (const [posicao, item] of [...pedidas, ...restantes].entries()) {
            const [tipo, id] = item.split(":") as [string, string];
            if (tipo === "video") {
              await tx.productVideo.update({
                where: { id },
                data: { sortOrder: posicao, updatedAt: agora },
              });
            } else {
              await tx.productImage.update({
                where: { id },
                data: { sortOrder: posicao, updatedAt: agora },
              });
            }
          }
          return galeria(tx, lojaId, produtoId);
        });
        if (feito === null) return;
        if (feito.valor === "nao_encontrado") {
          erro(resposta, 404, "nao_encontrado");
          return;
        }
        if (feito.valor === "desconhecida") {
          erro(
            resposta,
            400,
            "midia_desconhecida",
            "A ordem tem mídia que não é deste produto (ou repetida).",
          );
          return;
        }
        resposta.json({ midias: feito.valor });
      } catch (causa) {
        proximo(causa);
      }
    },
  );

  // -------------------------------------------------------------------------
  // Envio do vídeo
  // -------------------------------------------------------------------------
  const CAMINHO_DO_VIDEO = `${BASE}/videos`;
  rotas.post(
    CAMINHO_DO_VIDEO,
    autenticado,
    express.raw({ type: () => true, limit: limites.videoTamanhoMaximoBytes }),
    async (requisicao, resposta, proximo) => {
      try {
        if (!idsValidos(requisicao, resposta)) return;
        const consulta = esquemaDaConsultaDoEnvioDeVideo.safeParse(
          requisicao.query,
        );
        if (!consulta.success) {
          erro(resposta, 400, "entrada_invalida");
          return;
        }
        const bytes = Buffer.isBuffer(requisicao.body)
          ? new Uint8Array(requisicao.body)
          : new Uint8Array();
        const conferida = bytes.length === 0 ? null : conferirMidia(bytes);
        if (conferida?.tipo !== "video") {
          erro(
            resposta,
            400,
            "video_invalido",
            "O arquivo enviado não é um vídeo aceito. Envie mp4 ou webm.",
          );
          return;
        }
        const maximoMs = limites.videoDuracaoMaximaSegundos * 1000;
        const duracaoAntes = duracaoDoVideoMs(
          conferida.duracaoMs,
          consulta.data.duracaoSegundos,
        );
        const longo = () =>
          erro(
            resposta,
            400,
            "video_longo_demais",
            `O vídeo pode ter até ${limites.videoDuracaoMaximaSegundos} segundos.`,
          );
        if (duracaoAntes !== null && duracaoAntes > maximoMs) {
          longo();
          return;
        }
        // Sem duração no arquivo nem na consulta, só segue se o serviço de
        // mídia medir (Cloudinary mede; o disco local não).
        if (duracaoAntes === null && armazenamento().lugar !== "cloudinary") {
          erro(
            resposta,
            400,
            "video_sem_duracao",
            "Não deu para ler a duração do vídeo. Envie de novo informando ?duracaoSegundos=.",
          );
          return;
        }
        const produtoId = String(requisicao.params["produtoId"]);

        // 1) Produto e limite ANTES de enviar: não se gasta o serviço à toa.
        const antes = await naLoja(requisicao, resposta, async (tx, lojaId) => {
          if ((await produtoDaLoja(tx, lojaId, produtoId)) === null) {
            return "nao_encontrado" as const;
          }
          const quantos = await tx.productVideo.count({
            where: { storeId: lojaId, productId: produtoId },
          });
          return quantos >= limites.videosPorProduto
            ? ("limite" as const)
            : ("pode" as const);
        });
        if (antes === null) return;
        if (antes.valor === "nao_encontrado") {
          erro(resposta, 404, "nao_encontrado");
          return;
        }
        if (antes.valor === "limite") {
          erro(
            resposta,
            400,
            "limite_de_videos",
            `O produto pode ter até ${limites.videosPorProduto} vídeo(s).`,
          );
          return;
        }

        // 2) Guarda FORA da transação.
        const guardada = await armazenamento().guardar({
          lojaId: antes.lojaId,
          pasta: "produtos",
          tipo: "video",
          bytes,
          tipoDeConteudo: conferida.tipoDeConteudo,
          extensao: conferida.extensao,
        });
        const duracao = duracaoAntes ?? guardada.duracaoMs;
        if (duracao === null || duracao > maximoMs) {
          await apagarArquivo(guardada.chave, antes.lojaId);
          if (duracao === null) {
            erro(resposta, 400, "video_sem_duracao");
          } else {
            longo();
          }
          return;
        }

        // 3) Grava, reconferindo o limite: outro envio pode ter chegado.
        let gravado;
        try {
          gravado = await naLoja(requisicao, resposta, async (tx, lojaId) => {
            const quantos = await tx.productVideo.count({
              where: { storeId: lojaId, productId: produtoId },
            });
            if (quantos >= limites.videosPorProduto) return null;
            return tx.productVideo.create({
              data: {
                storeId: lojaId,
                productId: produtoId,
                url: guardada.url,
                storageKey: guardada.chave,
                posterUrl: guardada.capaUrl,
                contentType: conferida.tipoDeConteudo,
                sizeBytes: BigInt(bytes.length),
                durationMs: duracao,
                width: conferida.largura ?? guardada.largura,
                height: conferida.altura ?? guardada.altura,
                sortOrder: await proximaOrdem(tx, lojaId, produtoId),
              },
              select: selecaoDoVideo,
            });
          });
        } catch (causa) {
          await apagarArquivo(guardada.chave, antes.lojaId);
          throw causa;
        }
        if (gravado === null) return;
        if (gravado.valor === null) {
          await apagarArquivo(guardada.chave, antes.lojaId);
          erro(resposta, 400, "limite_de_videos");
          return;
        }
        resposta.status(201).json(midiaDoVideo(gravado.valor));
      } catch (causa) {
        responderFalhaDeMidia(causa, resposta, proximo);
      }
    },
  );

  // -------------------------------------------------------------------------
  // Capa do vídeo
  // -------------------------------------------------------------------------
  const CAMINHO_DA_CAPA = `${BASE}/videos/:videoId/capa`;
  rotas.post(
    CAMINHO_DA_CAPA,
    autenticado,
    express.raw({ type: () => true, limit: TAMANHO_MAXIMO_DA_IMAGEM_EM_BYTES }),
    async (requisicao, resposta, proximo) => {
      try {
        if (!idsValidos(requisicao, resposta)) return;
        const bytes = Buffer.isBuffer(requisicao.body)
          ? new Uint8Array(requisicao.body)
          : new Uint8Array();
        const formato = bytes.length === 0 ? null : formatoDaFoto(bytes);
        if (formato === null) {
          erro(
            resposta,
            400,
            "imagem_invalida",
            "A capa precisa ser uma foto jpeg, png ou webp.",
          );
          return;
        }
        const produtoId = String(requisicao.params["produtoId"]);
        const videoId = String(requisicao.params["videoId"]);
        const existe = await naLoja(requisicao, resposta, (tx, lojaId) =>
          tx.productVideo.findFirst({
            where: { id: videoId, storeId: lojaId, productId: produtoId },
            select: { id: true },
          }),
        );
        if (existe === null) return;
        if (existe.valor === null) {
          erro(resposta, 404, "nao_encontrado");
          return;
        }
        const guardada = await armazenamento().guardar({
          lojaId: existe.lojaId,
          pasta: "produtos",
          tipo: "imagem",
          bytes,
          tipoDeConteudo: `image/${formato}`,
          extensao: formato === "jpeg" ? "jpg" : formato,
        });
        const trocado = await naLoja(requisicao, resposta, async (tx, lojaId) => {
          const atual = await tx.productVideo.findFirst({
            where: { id: videoId, storeId: lojaId, productId: produtoId },
            select: { posterKey: true },
          });
          if (atual === null) return null;
          const video = await tx.productVideo.update({
            where: { id: videoId },
            data: {
              posterUrl: guardada.url,
              posterKey: guardada.chave,
              updatedAt: new Date(),
            },
            select: selecaoDoVideo,
          });
          return { video, chaveAntiga: atual.posterKey };
        });
        if (trocado === null) return;
        if (trocado.valor === null) {
          await apagarArquivo(guardada.chave, existe.lojaId);
          erro(resposta, 404, "nao_encontrado");
          return;
        }
        await apagarArquivo(trocado.valor.chaveAntiga, existe.lojaId);
        resposta.json(midiaDoVideo(trocado.valor.video));
      } catch (causa) {
        responderFalhaDeMidia(causa, resposta, proximo);
      }
    },
  );

  // -------------------------------------------------------------------------
  // Apagar o vídeo
  // -------------------------------------------------------------------------
  rotas.delete(
    `${BASE}/videos/:videoId`,
    autenticado,
    async (requisicao, resposta, proximo) => {
      try {
        if (!idsValidos(requisicao, resposta)) return;
        const produtoId = String(requisicao.params["produtoId"]);
        const videoId = String(requisicao.params["videoId"]);
        const removido = await naLoja(requisicao, resposta, async (tx, lojaId) => {
          const video = await tx.productVideo.findFirst({
            where: { id: videoId, storeId: lojaId, productId: produtoId },
            select: { id: true, storageKey: true, posterKey: true },
          });
          if (video === null) return null;
          await tx.productVideo.delete({ where: { id: video.id } });
          return video;
        });
        if (removido === null) return;
        if (removido.valor === null) {
          erro(resposta, 404, "nao_encontrado");
          return;
        }
        // Depois de a transação confirmar: a linha já não aponta para nada.
        await apagarArquivo(removido.valor.storageKey, removido.lojaId);
        await apagarArquivo(removido.valor.posterKey, removido.lojaId);
        resposta.status(204).end();
      } catch (causa) {
        proximo(causa);
      }
    },
  );

  // Arquivo acima do limite nem chega à rota: quem recusa é o leitor do corpo.
  rotas.use(
    [CAMINHO_DO_VIDEO, CAMINHO_DA_CAPA],
    (causa: unknown, requisicao: Request, resposta: Response, proximo: NextFunction) => {
      if ((causa as { type?: string } | null)?.type !== "entity.too.large") {
        proximo(causa);
        return;
      }
      const ehCapa = requisicao.path.endsWith("/capa");
      erro(
        resposta,
        413,
        ehCapa ? "imagem_grande_demais" : "video_grande_demais",
        ehCapa
          ? `A capa pode ter até ${tamanhoLegivel(TAMANHO_MAXIMO_DA_IMAGEM_EM_BYTES)}.`
          : `O vídeo pode ter até ${tamanhoLegivel(limites.videoTamanhoMaximoBytes)}.`,
      );
    },
  );

  return rotas;
}
