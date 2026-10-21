/**
 * Rotas de gestão da loja (card #25), em `/v1/lojas/:apelido`:
 *
 *   GET    /limites                 uso e limites           (loja.ver)
 *   GET    /tema   · PUT /tema      tema da vitrine         (personalizacao)
 *   GET    /feed   · PUT /feed      configuração do feed    (feed)
 *   GET    /equipe · POST /equipe   equipe da loja          (equipe)
 *   PATCH  /equipe/:id              ativar/desativar        (equipe)
 *   DELETE /equipe/:id              remover da equipe       (equipe)
 *   PUT    /equipe/:id/senha        trocar a senha          (equipe)
 *
 * Quem pode o quê é o portão da equipe (`core/equipe-da-loja.ts`) que decide,
 * pela matriz do contrato; aqui chega quem passou, com o papel no vínculo.
 * Derivar e avaliar senha são do módulo de identidade: a borda (`app.ts`)
 * passa as funções.
 */

import {
  esquemaDaEdicaoDaConfiguracaoDoFeed,
  esquemaDaEdicaoDoMembroDaEquipe,
  esquemaDaEdicaoDoTema,
  esquemaDaTrocaDeSenhaDaEquipe,
  esquemaDoNovoMembroDaEquipe,
  MENSAGENS_DA_EQUIPE,
} from "@simpleclick/contracts";
import { Router, type Request, type Response } from "express";
import { z } from "zod";

import { imagensDaLojaDoAmbiente } from "../../core/armazenamento-de-midia.ts";
import { executarComoRequisicao } from "../../core/contexto.ts";
import { banco, type AcessoAoBanco } from "../../core/db.ts";
import type { ArmazenamentoDeImagens } from "../../core/midia.ts";
import { validar } from "../../core/validar.ts";
import {
  ativarNaEquipe,
  cadastrarNaEquipe,
  configuracaoDoFeed,
  equipeDaLoja,
  gravarConfiguracaoDoFeed,
  gravarTema,
  limiteDoRecurso,
  limitesDaLoja,
  removerDaEquipe,
  temaGuardado,
  trocarSenhaDaEquipe,
  type ResultadoDaMudancaNaEquipe,
} from "./gestao.usecase.ts";
import {
  apagarImagensSubstituidas,
  imagensEmUsoDaLoja,
  originaisDosAjustes,
} from "./limpeza-de-imagens.ts";

/** Quem está no painel, com o papel no vínculo com a loja. */
export interface EquipeAutenticada {
  readonly identidadeId: string;
  readonly papel: "OWNER" | "STAFF";
}

export interface OpcoesDaGestaoDaLoja {
  readonly acesso?: AcessoAoBanco;
  readonly autenticar: (requisicao: Request) => EquipeAutenticada | null;
  readonly resolverLoja: (chegada: {
    readonly apelido?: string | null;
  }) => Promise<
    | { readonly encontrada: true; readonly id: string }
    | { readonly encontrada: false }
  >;
  /** Deriva a senha (Argon2id) — do módulo de identidade. */
  readonly derivarSenha: (senha: string) => Promise<string>;
  /** Os problemas da senha pela política da plataforma; vazio = boa. */
  readonly problemasDaSenha: (senha: string) => readonly string[];
  readonly agora?: () => Date;
  /** Onde ficam as imagens da loja (para apagar a antiga ao trocar o fundo/topo). */
  readonly armazenamento?: ArmazenamentoDeImagens;
}

const esquemaDoApelido = z.object({ apelido: z.string().min(1).max(80) });
const esquemaDoMembro = esquemaDoApelido.extend({
  id: z.uuid("Pessoa inválida."),
});

export function criarRotasDaGestaoDaLoja(opcoes: OpcoesDaGestaoDaLoja): Router {
  const rotas = Router();
  const acesso = (): AcessoAoBanco => opcoes.acesso ?? banco();
  const agora = opcoes.agora ?? (() => new Date());

  /**
   * Resolve a loja, abre a transação da equipe e roda o trabalho. Sem sessão,
   * 401; loja inexistente (ou fora do painel), 404.
   */
  async function naLoja<T>(
    requisicao: Request,
    resposta: Response,
    apelido: string,
    trabalho: (equipe: EquipeAutenticada) => Promise<T>,
  ): Promise<
    { readonly ok: true; readonly valor: T } | { readonly ok: false }
  > {
    const equipe = opcoes.autenticar(requisicao);
    if (equipe === null) {
      resposta.status(401).json({ erro: "nao_autenticado" });
      return { ok: false };
    }
    const loja = await executarComoRequisicao({ papel: "PUBLIC" }, () =>
      acesso().emTransacao(() => opcoes.resolverLoja({ apelido })),
    );
    if (!loja.encontrada) {
      resposta.status(404).json({ erro: "nao_encontrado" });
      return { ok: false };
    }
    const valor = await executarComoRequisicao(
      { lojaId: loja.id, usuarioId: equipe.identidadeId, papel: equipe.papel },
      () => acesso().emTransacao(() => trabalho(equipe)),
    );
    return { ok: true, valor };
  }

  function senhaFraca(resposta: Response, problemas: readonly string[]): void {
    resposta.status(422).json({
      erro: "senha_fraca",
      mensagem: problemas.join(" "),
      campos: [
        { onde: "body", caminho: "senha", mensagem: problemas.join(" ") },
      ],
    });
  }

  function recusaDaEquipe(
    resposta: Response,
    resultado: Extract<ResultadoDaMudancaNaEquipe, { ok: false }>,
  ): void {
    if (resultado.motivo === "NAO_ENCONTRADO") {
      resposta.status(404).json({ erro: "nao_encontrado" });
      return;
    }
    if (resultado.motivo === "DONO_NAO_SAI") {
      resposta
        .status(409)
        .json({
          erro: "dono_nao_sai",
          mensagem: MENSAGENS_DA_EQUIPE.donoNaoSai,
        });
      return;
    }
    resposta.status(409).json({
      erro: "senha_nao_gerenciada",
      mensagem: MENSAGENS_DA_EQUIPE.senhaNaoGerenciada,
    });
  }

  // ── Uso e limites ─────────────────────────────────────────────────────────
  const doApelido = validar({ params: esquemaDoApelido });
  rotas.get(
    "/:apelido/limites",
    doApelido,
    async (requisicao, resposta, proximo) => {
      try {
        const { params } = doApelido.dados(requisicao);
        const r = await naLoja(requisicao, resposta, params.apelido, () =>
          limitesDaLoja(),
        );
        if (r.ok)
          resposta.set("cache-control", "no-store").json({ limites: r.valor });
      } catch (causa) {
        proximo(causa);
      }
    },
  );

  // ── Tema da vitrine ───────────────────────────────────────────────────────
  rotas.get(
    "/:apelido/tema",
    doApelido,
    async (requisicao, resposta, proximo) => {
      try {
        const { params } = doApelido.dados(requisicao);
        const r = await naLoja(requisicao, resposta, params.apelido, () =>
          temaGuardado(),
        );
        if (r.ok) resposta.set("cache-control", "no-store").json(r.valor);
      } catch (causa) {
        proximo(causa);
      }
    },
  );

  const edicaoDoTema = validar({
    params: esquemaDoApelido,
    body: esquemaDaEdicaoDoTema,
  });
  rotas.put(
    "/:apelido/tema",
    edicaoDoTema,
    async (requisicao, resposta, proximo) => {
      try {
        const { params, body } = edicaoDoTema.dados(requisicao);
        const r = await naLoja(requisicao, resposta, params.apelido, async (equipe) => {
          const antes = await temaGuardado();
          const depois = await gravarTema(body, equipe.papel);
          return { antes, depois, emUso: await imagensEmUsoDaLoja() };
        });
        if (r.ok) {
          // A troca já está gravada: o fundo e o topo antigos saem do
          // armazenamento (só os que a própria loja enviou e já ninguém usa).
          await apagarImagensSubstituidas(
            opcoes.armazenamento ?? imagensDaLojaDoAmbiente(),
            r.valor.emUso.lojaId,
            [
              r.valor.antes.fundoVitrine,
              r.valor.antes.topoCardapio,
              r.valor.antes.fundoVitrineCelular,
              r.valor.antes.topoCardapioCelular,
              ...originaisDosAjustes(r.valor.antes.ajustesDasFotos),
            ],
            r.valor.emUso.enderecos,
          );
          resposta.set("cache-control", "no-store").json(r.valor.depois);
        }
      } catch (causa) {
        proximo(causa);
      }
    },
  );

  // ── Configuração do feed ──────────────────────────────────────────────────
  rotas.get(
    "/:apelido/feed",
    doApelido,
    async (requisicao, resposta, proximo) => {
      try {
        const { params } = doApelido.dados(requisicao);
        const r = await naLoja(requisicao, resposta, params.apelido, () =>
          configuracaoDoFeed(),
        );
        if (r.ok) resposta.set("cache-control", "no-store").json(r.valor);
      } catch (causa) {
        proximo(causa);
      }
    },
  );

  const edicaoDoFeed = validar({
    params: esquemaDoApelido,
    body: esquemaDaEdicaoDaConfiguracaoDoFeed,
  });
  rotas.put(
    "/:apelido/feed",
    edicaoDoFeed,
    async (requisicao, resposta, proximo) => {
      try {
        const { params, body } = edicaoDoFeed.dados(requisicao);
        const r = await naLoja(requisicao, resposta, params.apelido, (equipe) =>
          gravarConfiguracaoDoFeed(body, equipe.papel),
        );
        if (r.ok) resposta.set("cache-control", "no-store").json(r.valor);
      } catch (causa) {
        proximo(causa);
      }
    },
  );

  // ── Equipe ────────────────────────────────────────────────────────────────
  rotas.get(
    "/:apelido/equipe",
    doApelido,
    async (requisicao, resposta, proximo) => {
      try {
        const { params } = doApelido.dados(requisicao);
        const r = await naLoja(
          requisicao,
          resposta,
          params.apelido,
          async () => ({
            membros: await equipeDaLoja(),
            limite: await limiteDoRecurso("staff"),
          }),
        );
        if (r.ok) resposta.set("cache-control", "no-store").json(r.valor);
      } catch (causa) {
        proximo(causa);
      }
    },
  );

  const novoMembro = validar({
    params: esquemaDoApelido,
    body: esquemaDoNovoMembroDaEquipe,
  });
  rotas.post(
    "/:apelido/equipe",
    novoMembro,
    async (requisicao, resposta, proximo) => {
      try {
        const { params, body } = novoMembro.dados(requisicao);
        if (body.senha !== undefined) {
          const problemas = opcoes.problemasDaSenha(body.senha);
          if (problemas.length > 0) {
            senhaFraca(resposta, problemas);
            return;
          }
        }
        // Derivar é caro: fora da transação, para não segurar conexão.
        const senhaDerivada =
          body.senha === undefined
            ? null
            : await opcoes.derivarSenha(body.senha);
        const r = await naLoja(requisicao, resposta, params.apelido, () =>
          cadastrarNaEquipe({
            nome: body.nome,
            email: body.email,
            senhaDerivada,
          }),
        );
        if (!r.ok) return;
        resposta.set("cache-control", "no-store");
        if (r.valor.ok) {
          resposta
            .status(201)
            .json({ membro: r.valor.membro, contaCriada: r.valor.contaCriada });
          return;
        }
        if (r.valor.motivo === "SENHA_OBRIGATORIA") {
          resposta.status(422).json({
            erro: "senha_obrigatoria",
            mensagem: MENSAGENS_DA_EQUIPE.senhaObrigatoria,
            campos: [
              {
                onde: "body",
                caminho: "senha",
                mensagem: MENSAGENS_DA_EQUIPE.senhaObrigatoria,
              },
            ],
          });
          return;
        }
        resposta
          .status(409)
          .json({
            erro: "ja_e_membro",
            mensagem: MENSAGENS_DA_EQUIPE.jaEMembro,
          });
      } catch (causa) {
        proximo(causa);
      }
    },
  );

  const edicaoDoMembro = validar({
    params: esquemaDoMembro,
    body: esquemaDaEdicaoDoMembroDaEquipe,
  });
  rotas.patch(
    "/:apelido/equipe/:id",
    edicaoDoMembro,
    async (requisicao, resposta, proximo) => {
      try {
        const { params, body } = edicaoDoMembro.dados(requisicao);
        const r = await naLoja(requisicao, resposta, params.apelido, () =>
          ativarNaEquipe(params.id, body.ativo),
        );
        if (!r.ok) return;
        resposta.set("cache-control", "no-store");
        if (r.valor.ok) resposta.json({ membro: r.valor.membro });
        else recusaDaEquipe(resposta, r.valor);
      } catch (causa) {
        proximo(causa);
      }
    },
  );

  const doMembro = validar({ params: esquemaDoMembro });
  rotas.delete(
    "/:apelido/equipe/:id",
    doMembro,
    async (requisicao, resposta, proximo) => {
      try {
        const { params } = doMembro.dados(requisicao);
        const r = await naLoja(requisicao, resposta, params.apelido, () =>
          removerDaEquipe(params.id),
        );
        if (!r.ok) return;
        resposta.set("cache-control", "no-store");
        if (r.valor.ok) resposta.status(204).end();
        else recusaDaEquipe(resposta, r.valor);
      } catch (causa) {
        proximo(causa);
      }
    },
  );

  const trocaDeSenha = validar({
    params: esquemaDoMembro,
    body: esquemaDaTrocaDeSenhaDaEquipe,
  });
  rotas.put(
    "/:apelido/equipe/:id/senha",
    trocaDeSenha,
    async (requisicao, resposta, proximo) => {
      try {
        const { params, body } = trocaDeSenha.dados(requisicao);
        const problemas = opcoes.problemasDaSenha(body.senha);
        if (problemas.length > 0) {
          senhaFraca(resposta, problemas);
          return;
        }
        const senhaDerivada = await opcoes.derivarSenha(body.senha);
        const r = await naLoja(requisicao, resposta, params.apelido, () =>
          trocarSenhaDaEquipe(params.id, senhaDerivada, agora()),
        );
        if (!r.ok) return;
        resposta.set("cache-control", "no-store");
        if (r.valor.ok) resposta.status(204).end();
        else recusaDaEquipe(resposta, r.valor);
      } catch (causa) {
        proximo(causa);
      }
    },
  );

  return rotas;
}
