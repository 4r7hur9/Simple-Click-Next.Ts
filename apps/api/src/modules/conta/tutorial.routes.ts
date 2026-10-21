/**
 * O tutorial de primeiro acesso (card #39): quais a conta já viu ou pulou.
 *
 *   GET  /v1/conta/tutorial   — { vistos: ["cliente" | "dono" | "equipe"] }
 *   POST /v1/conta/tutorial   — { papel, como: "concluiu" | "pulou" } → 204
 *
 * Há um tutorial por papel: quem já é cliente e depois abre uma loja vê o do
 * painel na primeira vez que entrar nele. Concluir e pular dão no mesmo (não
 * aparece sozinho de novo); "Ver tutorial" no menu abre de novo sem perguntar
 * nada aqui. Marcar duas vezes não duplica.
 *
 * Corre sem loja no contexto, com a identidade da sessão: a política de
 * `identities` deixa a pessoa ler e mudar só a própria linha.
 */
import { Router, type Request, type Response } from "express";
import { z } from "zod";

import { executarComoRequisicao } from "../../core/contexto.ts";
import { banco, type AcessoAoBanco, type TransacaoDoBanco } from "../../core/db.ts";

export const PAPEIS_DO_TUTORIAL = ["cliente", "dono", "equipe"] as const;
export type PapelDoTutorial = (typeof PAPEIS_DO_TUTORIAL)[number];

export interface OpcoesDoTutorial {
  readonly acesso?: AcessoAoBanco;
  /** A identidade da sessão; `null` sem sessão válida. */
  readonly autenticar: (requisicao: Request) => string | null;
}

export const esquemaDaMarcacao = z.strictObject({
  papel: z.enum(PAPEIS_DO_TUTORIAL),
  como: z.enum(["concluiu", "pulou"]),
});

/** Só os papéis conhecidos, sem repetição, na ordem da lista. */
export function vistosConhecidos(valor: readonly string[] | null | undefined): PapelDoTutorial[] {
  const recebidos = new Set(valor ?? []);
  return PAPEIS_DO_TUTORIAL.filter((papel) => recebidos.has(papel));
}

export function criarRotasDoTutorial(opcoes: OpcoesDoTutorial): Router {
  const rotas = Router();
  const acesso = (): AcessoAoBanco => opcoes.acesso ?? banco();

  function comoConta<T>(identidadeId: string, acao: (tx: TransacaoDoBanco) => Promise<T>) {
    return executarComoRequisicao({ usuarioId: identidadeId, papel: "CUSTOMER" }, () =>
      acesso().emTransacao(acao),
    );
  }

  function exigir(requisicao: Request, resposta: Response): string | null {
    resposta.set("cache-control", "no-store");
    const identidadeId = opcoes.autenticar(requisicao);
    if (identidadeId === null) {
      resposta.status(401).json({ erro: "nao_autenticado" });
      return null;
    }
    return identidadeId;
  }

  rotas.get("/tutorial", async (requisicao, resposta, proximo) => {
    try {
      const identidadeId = exigir(requisicao, resposta);
      if (identidadeId === null) return;
      const [linha] = await comoConta(identidadeId, (tx) =>
        tx.$queryRaw<{ vistos: string[] }[]>`
          SELECT tutorials_seen AS vistos
            FROM app.identities
           WHERE id = app.current_user_id() AND anonymized_at IS NULL`,
      );
      if (linha === undefined) {
        resposta.status(401).json({ erro: "nao_autenticado" });
        return;
      }
      resposta.json({ vistos: vistosConhecidos(linha.vistos) });
    } catch (causa) {
      proximo(causa);
    }
  });

  rotas.post("/tutorial", async (requisicao, resposta, proximo) => {
    try {
      const identidadeId = exigir(requisicao, resposta);
      if (identidadeId === null) return;
      const lido = esquemaDaMarcacao.safeParse(requisicao.body);
      if (!lido.success) {
        resposta.status(422).json({ erro: "dados_invalidos" });
        return;
      }
      const { papel } = lido.data;
      await comoConta(identidadeId, (tx) =>
        tx.$executeRaw`
          UPDATE app.identities
             SET tutorials_seen = array_append(tutorials_seen, ${papel}::text)
           WHERE id = app.current_user_id()
             AND anonymized_at IS NULL
             AND NOT (${papel}::text = ANY (tutorials_seen))`,
      );
      resposta.status(204).end();
    } catch (causa) {
      proximo(causa);
    }
  });

  return rotas;
}
