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
import express, {
  Router,
  type NextFunction,
  type Request,
  type Response,
} from "express";
import { SECOES_DO_DONO, type SecaoDoDono } from "@simpleclick/contracts";

import { executarComoRequisicao } from "../../core/contexto.ts";
import { banco, type AcessoAoBanco } from "../../core/db.ts";
import {
  armazenamentoDoAmbiente,
  ErroDeArmazenamentoIndisponivel,
  type ArmazenamentoDeImagens,
} from "../../core/midia.ts";
import { validar } from "../../core/validar.ts";
import {
  campoDaPlataformaNoCorpo,
  ESQUEMAS_DAS_SECOES,
  esquemaDosParametrosDaImagem,
  esquemaDosParametrosDaSecao,
  explicacaoDaPlataforma,
  rotuloDoEnderecoDaPlataforma,
  type ValorDaSecao,
} from "./configuracoes.schema.ts";
import {
  lerConfiguracao,
  registrarNaTrilha,
  salvarConfiguracao,
  type RegistradorDaTrilha,
} from "./configuracoes.usecase.ts";
import {
  conferirImagemDaLoja,
  fraseDaRecusa,
  orientacaoDaImagem,
  TIPO_DE_CONTEUDO,
} from "./imagem-da-loja.ts";
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

/**
 * Até quanto o corpo de uma imagem é lido. Acima do limite da própria imagem,
 * de propósito: o arquivo de 4 MB precisa chegar à conferência para receber a
 * recusa que ensina, e não um "corpo grande demais" sem orientação.
 */
const LIMITE_DE_LEITURA_DA_IMAGEM = "8mb";

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
  /** Onde a logo e a capa enviadas são guardadas (decisão D2). */
  readonly armazenamento?: ArmazenamentoDeImagens;
}

export function criarRotasDasConfiguracoes(
  opcoes: OpcoesDasConfiguracoes,
): Router {
  const rotas = Router();
  const acesso = opcoes.acesso ?? banco();
  const { autenticar, resolverLoja } = opcoes;
  const registrar = opcoes.registrarNaTrilha ?? registrarNaTrilha;
  const armazenamento = opcoes.armazenamento ?? armazenamentoDoAmbiente();

  rotas.use((requisicao, resposta, proximo) => {
    const usuario = autenticar(requisicao);
    if (usuario === null) {
      erro(resposta, 401, "nao_autenticado");
      return;
    }
    resposta.locals.usuario = usuario;
    proximo();
  });

  /** A loja do apelido, ou `null` depois de responder 404. */
  async function identificar(
    apelido: string,
    resposta: Response,
  ): Promise<string | null> {
    const identificacao = await resolver(acesso, { apelido }, resolverLoja);
    if (!identificacao.encontrada) {
      erro(resposta, 404, "nao_encontrado");
      return null;
    }
    return identificacao.id;
  }

  /** Roda `executar` numa transação com loja, identidade e papel declarados. */
  function naTransacaoDaLoja<T>(
    lojaId: string,
    resposta: Response,
    executar: (usuario: UsuarioAutenticado) => Promise<T>,
  ): Promise<T> {
    const usuario = resposta.locals.usuario as UsuarioAutenticado;
    return executarComoRequisicao(
      { lojaId, usuarioId: usuario.identidadeId, papel: usuario.papel },
      () => acesso.emTransacao(() => executar(usuario)),
    );
  }

  /** Resolve a loja e roda `executar` na transação dela. */
  async function naLoja<T>(
    apelido: string,
    resposta: Response,
    executar: (lojaId: string, usuario: UsuarioAutenticado) => Promise<T>,
  ): Promise<{ readonly valor: T } | null> {
    const lojaId = await identificar(apelido, resposta);
    if (lojaId === null) return null;
    const valor = await naTransacaoDaLoja(lojaId, resposta, (usuario) =>
      executar(lojaId, usuario),
    );
    return { valor };
  }

  /** O autor da alteração, como a trilha o registra. */
  function autorDe(usuario: UsuarioAutenticado) {
    return { identidadeId: usuario.identidadeId, papel: usuario.papel };
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

  const bordaDaImagem = validar({ params: esquemaDosParametrosDaImagem });
  rotas.put(
    "/:apelido/configuracao/aparencia/imagem/:tipo",
    bordaDaImagem,
    // Depois da borda: ela troca o corpo pelo validado, e esta rota não
    // declara corpo — os bytes são lidos aqui, crus, e conferidos abaixo.
    express.raw({ type: () => true, limit: LIMITE_DE_LEITURA_DA_IMAGEM }),
    async (requisicao, resposta, proximo) => {
      try {
        const { params } = bordaDaImagem.dados(requisicao);
        const corpo: unknown = requisicao.body;
        const bytes = Buffer.isBuffer(corpo)
          ? new Uint8Array(corpo)
          : new Uint8Array();

        // A conferência vem ANTES de tudo: arquivo recusado não abre
        // transação, não chega ao serviço de mídia e não muda nada no ar.
        const conferencia = conferirImagemDaLoja(params.tipo, bytes);
        if (!conferencia.ok) {
          resposta
            .status(conferencia.motivo === "GRANDE_DEMAIS" ? 413 : 400)
            .json({
              erro: "imagem_invalida",
              mensagem: conferencia.mensagem,
              orientacao: conferencia.orientacao,
            });
          return;
        }

        const lojaId = await identificar(params.apelido, resposta);
        if (lojaId === null) return;

        let url: string;
        try {
          ({ url } = await armazenamento.guardar({
            lojaId,
            nome: params.tipo,
            bytes,
            tipoDeConteudo: TIPO_DE_CONTEUDO[conferencia.formato],
          }));
        } catch (causa) {
          if (!(causa instanceof ErroDeArmazenamentoIndisponivel)) throw causa;
          resposta.status(503).json({
            erro: "envio_indisponivel",
            mensagem:
              "O envio de arquivo não está disponível agora. Cole o endereço https:// de uma imagem já hospedada. A imagem anterior continua no ar.",
            orientacao: orientacaoDaImagem(params.tipo),
          });
          return;
        }

        await naTransacaoDaLoja(lojaId, resposta, async (usuario) => {
          const atual = await lerConfiguracao("aparencia", lojaId);
          await salvarConfiguracao(
            "aparencia",
            { ...atual, [params.tipo]: url },
            { lojaId, autor: autorDe(usuario) },
            registrar,
          );
        });
        resposta.status(200).json({ url });
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
      // Antes da borda: campo da plataforma dentro da seção é recusado do
      // mesmo jeito (400, nada gravado), mas DIZENDO de quem é o ajuste.
      (requisicao, resposta, proximo) => {
        const intruso = campoDaPlataformaNoCorpo(requisicao.body);
        if (intruso === null) {
          proximo();
          return;
        }
        resposta.status(400).json({
          erro: "campo_da_plataforma",
          campo: intruso.campo,
          mensagem: explicacaoDaPlataforma(intruso.rotulo),
        });
      },
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
                { lojaId, autor: autorDe(usuario) },
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

  /*
   * Quem pede o ajuste da plataforma pelo endereço continua sem rota (404,
   * AC-921) — mas recebe a razão (AC-323). Sem ela, "não encontrado" soaria
   * como erro de digitação, e não como "não é com você".
   */
  rotas.all(
    "/:apelido/configuracao/:trecho",
    (requisicao, resposta, proximo) => {
      const rotulo = rotuloDoEnderecoDaPlataforma(
        String(requisicao.params.trecho),
      );
      if (rotulo === null) {
        proximo();
        return;
      }
      resposta.status(404).json({
        erro: "nao_encontrado",
        mensagem: explicacaoDaPlataforma(rotulo),
      });
    },
  );

  /**
   * Imagem acima do limite de leitura: a mesma recusa que ensina, e não o
   * "corpo grande demais" genérico do leitor. Só esta falha é tratada aqui —
   * qualquer outra segue para o tratamento de erros da aplicação.
   */
  rotas.use(
    (
      falha: unknown,
      requisicao: Request,
      resposta: Response,
      proximo: NextFunction,
    ) => {
      const grandeDemais =
        typeof falha === "object" &&
        falha !== null &&
        (falha as { type?: unknown }).type === "entity.too.large";
      // No tratamento de falha do roteador os parâmetros da rota já não estão
      // montados; o tipo sai do próprio caminho.
      const tipo = /\/configuracao\/aparencia\/imagem\/(logo|capa)\/?$/.exec(
        requisicao.path,
      )?.[1];
      if (!grandeDemais || (tipo !== "logo" && tipo !== "capa")) {
        proximo(falha);
        return;
      }
      resposta.status(413).json({
        erro: "imagem_invalida",
        mensagem: fraseDaRecusa(tipo, "O arquivo passa do tamanho permitido."),
        orientacao: orientacaoDaImagem(tipo),
      });
    },
  );

  return rotas;
}
