/**
 * Rotas de `/v1/auth` do que vem depois da entrada (T-112): renovar e
 * encerrar sessões, recuperar a senha, aceitar o convite do dono e cuidar do
 * aplicativo autenticador e dos códigos de recuperação.
 *
 * Montadas por `criarRotasDeIdentidade` (auth.routes.ts) sobre a mesma
 * composição. As de quem já está logado leem o Bearer e rodam num contexto
 * só daquela pessoa — as políticas do banco deixam cada uma alcançar apenas
 * as próprias sessões, o próprio aplicativo e os próprios códigos.
 */
import {
  esquemaDaNovaSenha,
  esquemaDoCodigoDoAplicativo,
  esquemaDoPedidoDeRecuperacao,
  esquemaDoTokenDeRenovacao,
} from "@simpleclick/contracts";
import type { Request, Response, Router } from "express";

import { ErroDeRecursoNaoEncontrado } from "../../core/db.ts";
import { validar } from "../../core/validar.ts";
import {
  cookieQueApaga,
  entregarSessao,
  quemEstaLogado,
  responderEnvioIndisponivel,
  responderErro,
  responderSemSessao,
  rota,
  tokenDeRenovacaoDaRequisicao,
} from "./borda-da-sessao.ts";
import {
  definirPrimeiraSenha,
  resumirTokenDeConvite,
} from "./convite.usecase.ts";
import { emailDeRecuperacao, linkDeRecuperacao } from "./emails-de-acesso.ts";
import {
  encerrarSessaoAtual,
  encerrarTodasAsSessoes,
} from "./logout.usecase.ts";
import { criarCodigosDeRecuperacao } from "./recovery-codes.ts";
import {
  definirNovaSenha,
  gerarTokenDeRecuperacao,
  pedirRecuperacaoDeSenha,
  resumirTokenDeRecuperacao,
} from "./recuperar-senha.usecase.ts";
import { avaliarPoliticaDeSenha, derivarSenha } from "./senha.ts";
import type { ServicosDaIdentidade } from "./servicos-da-identidade.ts";
import { renovarSessao } from "./sessao.usecase.ts";
import { resumirTokenDeRenovacao, verificarTokenDeAcesso } from "./token.ts";
import { ativarAplicativoTotp, prepararAtivacaoTotp } from "./totp.usecase.ts";

/** Motivo legível da senha recusada, ou `undefined` quando ela serve. */
function motivoDaSenhaFraca(senha: string): string | undefined {
  const politica = avaliarPoliticaDeSenha(senha);
  return politica.valida
    ? undefined
    : politica.problemas.map((problema) => problema.mensagem).join(" ");
}

export function montarRotasDaContaSegura(
  rotas: Router,
  s: ServicosDaIdentidade,
): void {
  /** A pessoa do Bearer, ou responde 401 e devolve `null`. */
  function exigirPessoa(requisicao: Request, resposta: Response) {
    const pessoa = quemEstaLogado(requisicao, s.segredo());
    if (pessoa === null) responderSemSessao(resposta);
    return pessoa;
  }

  /** Transação no contexto da própria pessoa, fora de qualquer loja. */
  function comoPessoa<T>(identidadeId: string, acao: () => Promise<T>) {
    return s.naTransacao({ usuarioId: identidadeId, papel: "CUSTOMER" }, acao);
  }

  // --- Renovar (AC-110, AC-111, AC-113) --------------------------------------
  const renovacao = validar({ body: esquemaDoTokenDeRenovacao });
  rotas.post(
    "/renovar",
    renovacao,
    rota(async (requisicao, resposta) => {
      const { body } = renovacao.dados(requisicao);
      const token = tokenDeRenovacaoDaRequisicao(requisicao, body);
      if (token === undefined) return responderSemSessao(resposta);
      const resultado = await s.naTransacao({}, (avisos) =>
        renovarSessao(token, s.dependenciasDaSessao(avisos)),
      );
      // Reuso e token desconhecido respondem igual: a família já caiu.
      if (resultado.estado !== "renovada") return responderSemSessao(resposta);
      const { papel } = verificarTokenDeAcesso(
        resultado.sessao.tokenDeAcesso,
        s.segredo(),
      );
      entregarSessao(resposta, resultado.sessao, papel);
    }),
  );

  // --- Sair deste dispositivo (AC-112) ----------------------------------------
  rotas.post(
    "/sessoes/atual/encerrar",
    renovacao,
    rota(async (requisicao, resposta) => {
      const { body } = renovacao.dados(requisicao);
      const token = tokenDeRenovacaoDaRequisicao(requisicao, body);
      let encerrada = false;
      if (token !== undefined) {
        encerrada = await s.naTransacao({}, () =>
          s.repos.sessoes.encerrarPeloToken(
            resumirTokenDeRenovacao(token),
            s.agora(),
          ),
        );
      } else {
        const pessoa = quemEstaLogado(requisicao, s.segredo());
        if (pessoa !== null) {
          encerrada = await comoPessoa(pessoa.identidadeId, () =>
            encerrarSessaoAtual(pessoa.sessaoId, s.repos.sessoes).then(
              () => true,
            ),
          ).catch((erro: unknown) => {
            if (erro instanceof ErroDeRecursoNaoEncontrado) return false;
            throw erro;
          });
        }
      }
      resposta.append("set-cookie", cookieQueApaga());
      resposta.set("cache-control", "no-store");
      resposta.json({ encerrada });
    }),
  );

  // --- Encerrar todas (AC-113) -----------------------------------------------
  rotas.post(
    "/sessoes/encerrar-todas",
    rota(async (requisicao, resposta) => {
      const pessoa = exigirPessoa(requisicao, resposta);
      if (pessoa === null) return;
      await comoPessoa(pessoa.identidadeId, () =>
        encerrarTodasAsSessoes(pessoa.identidadeId, s.repos.sessoes),
      );
      resposta.append("set-cookie", cookieQueApaga());
      resposta.set("cache-control", "no-store");
      resposta.json({ encerradas: true });
    }),
  );

  // --- Recuperação de senha (AC-114, AC-115) ---------------------------------
  const pedido = validar({ body: esquemaDoPedidoDeRecuperacao });
  rotas.post(
    "/senha/esqueci",
    pedido,
    rota(async (requisicao, resposta) => {
      const { body } = pedido.dados(requisicao);
      // Antes de olhar o e-mail: a resposta de indisponível é a mesma para
      // conta existente e inexistente (AC-133).
      if (!s.email.disponivel) return responderEnvioIndisponivel(resposta);
      const resultado = await s.naTransacao({}, (avisos) =>
        pedirRecuperacaoDeSenha(body.email, {
          repositorio: s.repos.recuperacao,
          // O link sai depois do commit: o tempo da resposta não depende de
          // a conta existir (AC-114).
          enviarLinkDeRecuperacao: async ({ para, token }) =>
            avisos.agendar({
              nome: "recuperacao_de_senha",
              enviar: () =>
                s.email.enviar(
                  emailDeRecuperacao({
                    para,
                    link: linkDeRecuperacao(s.enderecoDoSite, token),
                  }),
                ),
            }),
          validarNovaSenha: s.validarNovaSenha,
          gerarHashDaSenha: derivarSenha,
          agora: s.agora,
          gerarToken: gerarTokenDeRecuperacao,
          resumirToken: resumirTokenDeRecuperacao,
        }),
      );
      resposta.status(202).json({ confirmacao: resultado.confirmacao });
    }),
  );

  const novaSenha = validar({ body: esquemaDaNovaSenha });
  rotas.post(
    "/senha/redefinir",
    novaSenha,
    rota(async (requisicao, resposta) => {
      const { body } = novaSenha.dados(requisicao);
      const motivo = motivoDaSenhaFraca(body.senha);
      if (motivo !== undefined) {
        return responderErro(resposta, 422, "senha_fraca", motivo);
      }
      const resultado = await s.naTransacao({}, () =>
        definirNovaSenha(body, {
          repositorio: s.repos.recuperacao,
          enviarLinkDeRecuperacao: async () => undefined,
          validarNovaSenha: s.validarNovaSenha,
          gerarHashDaSenha: derivarSenha,
          agora: s.agora,
          gerarToken: gerarTokenDeRecuperacao,
          resumirToken: resumirTokenDeRecuperacao,
        }),
      );
      if (!resultado.ok) {
        return responderErro(
          resposta,
          410,
          "link_invalido",
          "Este link não vale mais. Peça um novo.",
        );
      }
      resposta.json({ redefinida: true });
    }),
  );

  // --- Convite do dono (AC-103, AC-200) ---------------------------------------
  rotas.post(
    "/convite/aceitar",
    novaSenha,
    rota(async (requisicao, resposta) => {
      const { body } = novaSenha.dados(requisicao);
      const motivo = motivoDaSenhaFraca(body.senha);
      if (motivo !== undefined) {
        return responderErro(resposta, 422, "senha_fraca", motivo);
      }
      const resultado = await s.naTransacao({}, () =>
        definirPrimeiraSenha(body, {
          repositorio: s.repos.convite,
          validarNovaSenha: s.validarNovaSenha,
          gerarHashDaSenha: derivarSenha,
          agora: s.agora,
          resumirToken: resumirTokenDeConvite,
        }),
      );
      if (!resultado.ok) {
        return responderErro(
          resposta,
          410,
          "convite_invalido",
          "Este convite não vale mais. Peça um novo à administração.",
        );
      }
      resposta.json({ acessoLiberado: true });
    }),
  );

  // --- Aplicativo autenticador e códigos de recuperação (AC-121, AC-123) -----
  rotas.post(
    "/aplicativo/preparar",
    rota(async (requisicao, resposta) => {
      const pessoa = exigirPessoa(requisicao, resposta);
      if (pessoa === null) return;
      const preparada = await comoPessoa(pessoa.identidadeId, async () => {
        const conta = await s.repos.auxiliar.propriaConta();
        return prepararAtivacaoTotp(
          pessoa.identidadeId,
          conta?.email ?? "conta",
          { repositorio: s.repos.totp, cifrador: s.cifrador },
        );
      });
      resposta.set("cache-control", "no-store");
      resposta.json(preparada);
    }),
  );

  const codigoDoAplicativo = validar({ body: esquemaDoCodigoDoAplicativo });
  rotas.post(
    "/aplicativo/confirmar",
    codigoDoAplicativo,
    rota(async (requisicao, resposta) => {
      const pessoa = exigirPessoa(requisicao, resposta);
      if (pessoa === null) return;
      const { body } = codigoDoAplicativo.dados(requisicao);
      const resultado = await comoPessoa(pessoa.identidadeId, () =>
        ativarAplicativoTotp(pessoa.identidadeId, body.codigo, {
          repositorio: s.repos.totp,
          cifrador: s.cifrador,
          gerarCodigosDeRecuperacao: (id) =>
            criarCodigosDeRecuperacao(id, s.repos.codigosDeRecuperacao),
          agora: s.agora,
        }),
      );
      if (resultado.status !== "ATIVADO") {
        return responderErro(
          resposta,
          422,
          "codigo_invalido",
          "Código não confere. Confira o horário do celular e tente de novo.",
        );
      }
      resposta.set("cache-control", "no-store");
      resposta.json(resultado);
    }),
  );

  rotas.post(
    "/aplicativo/codigos-de-recuperacao",
    rota(async (requisicao, resposta) => {
      const pessoa = exigirPessoa(requisicao, resposta);
      if (pessoa === null) return;
      const codigos = await comoPessoa(pessoa.identidadeId, async () => {
        const credencial = await s.repos.totp.buscar(pessoa.identidadeId);
        if (credencial?.ativo !== true) return null;
        return criarCodigosDeRecuperacao(
          pessoa.identidadeId,
          s.repos.codigosDeRecuperacao,
        );
      });
      if (codigos === null) {
        return responderErro(
          resposta,
          409,
          "aplicativo_inativo",
          "Ative o aplicativo autenticador antes de gerar códigos.",
        );
      }
      resposta.set("cache-control", "no-store");
      resposta.json({ codigosDeRecuperacao: codigos });
    }),
  );
}
