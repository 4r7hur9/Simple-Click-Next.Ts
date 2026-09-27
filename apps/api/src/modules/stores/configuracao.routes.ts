/**
 * Rotas das configurações da loja (T-900 a T-907).
 *
 * UMA ROTA DE LEITURA E UMA DE GRAVAÇÃO POR SEÇÃO, montadas a partir da lista
 * fechada de `SECOES_DO_DONO` (AC-921). Não existe rota genérica que aceite
 * "qualquer seção": o que não está na lista não tem endereço, e pedir
 * `configuracao/tipo-de-negocio` responde como rota inexistente.
 *
 * A rota usa o mesmo isolamento das rotas públicas: primeiro resolve o apelido
 * sem contexto e depois abre UMA transação com loja, identidade e papel
 * definidos. É essa transação única que torna a gravação atômica (AC-923): a
 * seção, a trilha de auditoria e qualquer coluna da loja que a seção toque
 * entram juntas ou não entram.
 *
 * O login de produção ainda será conectado à persistência de sessões; por isso
 * a composição mantém a autorização Bearer que `app.ts` injeta.
 */
import { Router, type Request, type Response } from "express";
import { SECOES_DO_DONO, type SecaoDoDono } from "@simpleclick/contracts";

import { executarComoRequisicao } from "../../core/contexto.ts";
import { banco, type AcessoAoBanco } from "../../core/db.ts";
import { validar } from "../../core/validar.ts";
import {
  ESQUEMAS_DAS_SECOES,
  esquemaDosParametrosDaSecao,
  type ValorDaSecao,
} from "./configuracoes.schema.ts";
import {
  lerConfiguracao,
  registrarNaTrilha,
  salvarConfiguracao,
  type RegistradorDaTrilha,
} from "./configuracoes.usecase.ts";
import { pendenciasDaLoja } from "./pendencias.usecase.ts";

export interface ChegadaNaLoja {
  readonly host?: string | null;
  readonly apelido?: string | null;
}

export type IdentificacaoDaLoja =
  | { readonly encontrada: true; readonly id: string }
  | { readonly encontrada: false };

export interface UsuarioAutenticado {
  readonly identidadeId: string;
  readonly papel: "OWNER";
}

function erro(res: Response, status: number, mensagem: string) {
  res.status(status).json({ erro: mensagem });
}

async function resolver(
  acesso: AcessoAoBanco,
  chegada: ChegadaNaLoja,
  resolverLoja: (chegada: ChegadaNaLoja) => Promise<IdentificacaoDaLoja>,
) {
  return executarComoRequisicao({ papel: "PUBLIC" }, () =>
    acesso.emTransacao(() => resolverLoja(chegada)),
  );
}

export interface OpcoesDasConfiguracoes {
  readonly acesso?: AcessoAoBanco;
  readonly autenticar: (requisicao: Request) => UsuarioAutenticado | null;
  readonly resolverLoja: (
    chegada: ChegadaNaLoja,
  ) => Promise<IdentificacaoDaLoja>;
  /**
   * Onde a alteração é registrada. Trocável só para a prova de que registro
   * que falha desfaz a gravação inteira (AC-923) — em execução, é a trilha.
   */
  readonly registrarNaTrilha?: RegistradorDaTrilha;
}

export function criarRotasDasConfiguracoes(
  opcoes: OpcoesDasConfiguracoes,
): Router {
  const rotas = Router();
  const acesso = opcoes.acesso ?? banco();
  const { autenticar, resolverLoja } = opcoes;
  const registrar = opcoes.registrarNaTrilha ?? registrarNaTrilha;

  rotas.use((requisicao, resposta, proximo) => {
    const usuario = autenticar(requisicao);
    if (usuario === null) {
      erro(resposta, 401, "nao_autenticado");
      return;
    }
    resposta.locals.usuario = usuario;
    proximo();
  });

  /**
   * Resolve a loja e roda `executar` numa transação com loja, identidade e
   * papel declarados. Loja que não existe responde 404 sem abrir a segunda.
   */
  async function naLoja<T>(
    apelido: string,
    resposta: Response,
    executar: (lojaId: string, usuario: UsuarioAutenticado) => Promise<T>,
  ): Promise<{ readonly valor: T } | null> {
    const identificacao = await resolver(acesso, { apelido }, resolverLoja);
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
      () => acesso.emTransacao(() => executar(identificacao.id, usuario)),
    );
    return { valor };
  }

  const bordaDasPendencias = validar({ params: esquemaDosParametrosDaSecao });
  rotas.get(
    "/:apelido/configuracao/pendencias",
    bordaDasPendencias,
    async (requisicao, resposta, proximo) => {
      try {
        const { params } = bordaDasPendencias.dados(requisicao);
        const lido = await naLoja(params.apelido, resposta, async (lojaId) => ({
          pagamento: await lerConfiguracao("pagamento", lojaId),
          entrega: await lerConfiguracao("entrega", lojaId),
          contato: await lerConfiguracao("contato", lojaId),
          horario: await lerConfiguracao("horario", lojaId),
        }));
        if (lido === null) return;
        resposta.json({ pendencias: pendenciasDaLoja(lido.valor) });
      } catch (causa) {
        proximo(causa);
      }
    },
  );

  /** Monta a leitura e a gravação de UMA seção, com a borda dela. */
  function montarSecao<S extends SecaoDoDono>(secao: S): void {
    const caminho = `/:apelido/configuracao/${secao}`;
    const bordaDeLeitura = validar({ params: esquemaDosParametrosDaSecao });
    const bordaDeGravacao = validar({
      params: esquemaDosParametrosDaSecao,
      body: ESQUEMAS_DAS_SECOES[secao],
    });

    rotas.get(
      caminho,
      bordaDeLeitura,
      async (requisicao, resposta, proximo) => {
        try {
          const { params } = bordaDeLeitura.dados(requisicao);
          const lido = await naLoja(params.apelido, resposta, (lojaId) =>
            lerConfiguracao(secao, lojaId),
          );
          if (lido === null) return;
          resposta.json(lido.valor);
        } catch (causa) {
          proximo(causa);
        }
      },
    );

    rotas.put(
      caminho,
      bordaDeGravacao,
      async (requisicao, resposta, proximo) => {
        try {
          const { params, body } = bordaDeGravacao.dados(requisicao);
          const gravado = await naLoja(
            params.apelido,
            resposta,
            (lojaId, usuario) =>
              salvarConfiguracao(
                secao,
                body as ValorDaSecao<S>,
                {
                  lojaId,
                  autor: {
                    identidadeId: usuario.identidadeId,
                    papel: usuario.papel,
                  },
                },
                registrar,
              ),
          );
          if (gravado === null) return;
          resposta.status(204).end();
        } catch (causa) {
          proximo(causa);
        }
      },
    );
  }

  for (const secao of SECOES_DO_DONO) montarSecao(secao);

  return rotas;
}
