/**
 * Rotas reais de identidade em `/v1/auth` (T-112, AC-132): cadastro,
 * verificação de e-mail, login, segundo fator e entrada por código de
 * recuperação. Sessão, senha, convite e aplicativo ficam em
 * `conta-segura.routes.ts`, montadas pelo mesmo `criarRotasDeIdentidade`.
 *
 * As rotas só traduzem HTTP: a regra está nos casos de uso, a persistência
 * nos repositórios da T-111, e a composição em `servicos-da-identidade.ts`.
 * Toda entrada passa pela borda de validação com o esquema do contrato
 * (P-007); login e segundo fator passam antes pelo limite de tentativas.
 */
import { randomUUID } from "node:crypto";

import {
  CONFIRMACAO_DE_CADASTRO,
  esquemaDoCadastro,
  esquemaDoCodigoDeRecuperacao,
  esquemaDoCodigoDoDesafio,
  esquemaDoLinkRecebido,
  esquemaDoLogin,
} from "@simpleclick/contracts";
import { Router } from "express";

import { limiteDaRequisicao } from "../../core/limite.ts";
import { validar } from "../../core/validar.ts";
import {
  clienteDaRequisicao,
  entregarSessao,
  responderEnvioIndisponivel,
  responderErro,
  rota,
} from "./borda-da-sessao.ts";
import { montarRotasDaContaSegura } from "./conta-segura.routes.ts";
import {
  ErroDeEnvioIndisponivel,
  emailDeCadastroRepetido,
  emailDeCodigoDeRecuperacaoUsado,
  emailDeVerificacao,
  emailDoCodigoDoLogin,
} from "./emails-de-acesso.ts";
import {
  PAPEL_DA_SESSAO,
  type IdentidadeParaLoginNoBanco,
} from "./identidade.repo.ts";
import { entrarComSenha } from "./login.usecase.ts";
import { usarCodigoDeRecuperacao } from "./recovery-codes.ts";
import { cadastrarClienteFinal } from "./register.usecase.ts";
import {
  PRAZO_DO_DESAFIO_EM_MS,
  gerarCodigoDoDesafio,
} from "./segundo-fator.repo.ts";
import { confirmarSegundoFator } from "./segundo-fator.usecase.ts";
import { avaliarPoliticaDeSenha, derivarSenha, senhaConfere } from "./senha.ts";
import {
  criarServicosDaIdentidade,
  type OpcoesDaIdentidade,
  type ServicosDaIdentidade,
} from "./servicos-da-identidade.ts";
import { iniciarSessao, type SessaoEntregue } from "./sessao.usecase.ts";
import { decidirSegundoFatorObrigatorio } from "./totp.usecase.ts";
import {
  criarCasoDeUsoDeVerificacaoDeEmail,
  gerarTokenDeVerificacao,
  PRAZO_DO_LINK_DE_VERIFICACAO_EM_MS,
  resumirTokenDeVerificacao,
  urlDeVerificacao,
} from "./verificar-email.usecase.ts";

export type { OpcoesDaIdentidade } from "./servicos-da-identidade.ts";

/** A administração sem aplicativo não recebe desafio por e-mail (AC-122). */
class ConfiguracaoDoAplicativoObrigatoria extends Error {}

/** O desafio mudou entre a leitura e o consumo; a pessoa tenta de novo. */
class DesafioOcupado extends Error {}

/**
 * Derivação de uma senha que ninguém tem, para o login de e-mail inexistente
 * levar o mesmo tempo do de senha errada: o relógio não revela quem tem conta.
 */
let derivacaoFicticia: Promise<string> | undefined;
function senhaFicticia(): Promise<string> {
  derivacaoFicticia ??= derivarSenha(randomUUID());
  return derivacaoFicticia;
}

const PASSO_DO_APLICATIVO_EM_MS = 30_000;

/** Monta todas as rotas de `/v1/auth` sobre uma composição só. */
export function criarRotasDeIdentidade(
  opcoes: OpcoesDaIdentidade = {},
): Router {
  const servicos = criarServicosDaIdentidade(opcoes);
  const rotas = Router();
  montarRotasDeEntrada(rotas, servicos);
  montarRotasDaContaSegura(rotas, servicos);
  return rotas;
}

function montarRotasDeEntrada(rotas: Router, s: ServicosDaIdentidade): void {
  const verificacao = criarCasoDeUsoDeVerificacaoDeEmail({
    codigos: s.repos.codigos,
    email: {
      enfileirar: (dados) =>
        s.email.enviar(
          emailDeVerificacao({
            para: dados.destinatario,
            nome: dados.nome,
            link: dados.urlDeVerificacao,
          }),
        ),
    },
    origemDoSite: s.enderecoDoSite,
    agora: s.agora,
  });

  // --- Cadastro (AC-100 a AC-102, AC-133) -----------------------------------
  const cadastro = validar({ body: esquemaDoCadastro });
  rotas.post(
    "/cadastro",
    cadastro,
    rota(async (requisicao, resposta) => {
      const { body } = cadastro.dados(requisicao);
      if (!s.email.disponivel) return responderEnvioIndisponivel(resposta);
      const politica = avaliarPoliticaDeSenha(body.senha);
      if (!politica.valida) {
        const motivos = politica.problemas.map((p) => p.mensagem).join(" ");
        return responderErro(resposta, 422, "senha_fraca", motivos);
      }

      await s.naTransacao({}, () =>
        cadastrarClienteFinal(body, {
          identidades: s.repos.identidades,
          avisos: {
            enviarVerificacao: async ({ email, nome }) => {
              const token = gerarTokenDeVerificacao();
              const agora = s.agora();
              const criado = await s.repos.codigos.criarVerificacaoParaEmail(
                email,
                {
                  id: randomUUID(),
                  resumoDoToken: resumirTokenDeVerificacao(token),
                  enviadoEm: agora,
                  expiraEm: new Date(
                    agora.getTime() + PRAZO_DO_LINK_DE_VERIFICACAO_EM_MS,
                  ),
                },
              );
              if (criado === null) return;
              await s.email.enviar(
                emailDeVerificacao({
                  para: email,
                  nome,
                  link: urlDeVerificacao(s.enderecoDoSite, token),
                }),
              );
            },
            // O nome digitado é de quem tentou, não do dono do endereço: não
            // vai para o e-mail do dono.
            enviarAvisoDeCadastroExistente: ({ email }) =>
              s.email.enviar(
                emailDeCadastroRepetido({ para: email, nome: "" }),
              ),
          },
        }),
      );
      resposta.status(201).json(CONFIRMACAO_DE_CADASTRO);
    }),
  );

  // --- Verificação de e-mail (AC-103, AC-104) -------------------------------
  const link = validar({ body: esquemaDoLinkRecebido });
  rotas.post(
    "/email/verificar",
    link,
    rota(async (requisicao, resposta) => {
      const { body } = link.dados(requisicao);
      const resultado = await s.naTransacao({}, () =>
        verificacao.verificar(body.token),
      );
      resposta.json({ situacao: resultado.situacao });
    }),
  );

  rotas.post(
    "/email/reenviar",
    link,
    rota(async (requisicao, resposta) => {
      const { body } = link.dados(requisicao);
      if (!s.email.disponivel) return responderEnvioIndisponivel(resposta);
      // Autorizar o reenvio e criar o link novo na MESMA transação (T-111).
      const resultado = await s.naTransacao({}, () =>
        verificacao.reenviar(body.token),
      );
      resposta.json(
        resultado.situacao === "limite_atingido"
          ? {
              situacao: resultado.situacao,
              disponivelEm: resultado.disponivelEm.toISOString(),
            }
          : { situacao: resultado.situacao },
      );
    }),
  );

  // --- Login (AC-105, AC-108, AC-119 a AC-122) -------------------------------
  const login = validar({ body: esquemaDoLogin });
  rotas.post(
    "/login",
    s.limitadores.login,
    login,
    rota(async (requisicao, resposta) => {
      const { body } = login.dados(requisicao);
      const cliente = clienteDaRequisicao(requisicao);
      const limite = limiteDaRequisicao(requisicao);
      const lida: { valor?: IdentidadeParaLoginNoBanco | null } = {};
      const aberta: { sessao?: SessaoEntregue } = {};
      let canal: "EMAIL" | "TOTP" = "EMAIL";

      const resultado = await s
        .naTransacao({}, (avisos) =>
          entrarComSenha(body, {
            identidades: {
              buscarPorEmail: async (email) =>
                (lida.valor = await s.repos.login.buscarPorEmail(email)),
            },
            conferirSenha: senhaConfere,
            criarDesafioDeSegundoFator: async ({ identidadeId }) => {
              const identidade = lida.valor!;
              const agora = s.agora();
              const expiraEm = new Date(
                agora.getTime() + PRAZO_DO_DESAFIO_EM_MS,
              );
              // Com o aplicativo ativo, o código por e-mail não vale (AC-121).
              if (identidade.aplicativoAtivo) {
                canal = "TOTP";
                return s.repos.desafios.criar({
                  identidadeId,
                  canal,
                  expiraEm,
                  agora,
                });
              }
              if (identidade.papel === "ADMINISTRADOR") {
                throw new ConfiguracaoDoAplicativoObrigatoria();
              }
              if (!s.email.disponivel) throw new ErroDeEnvioIndisponivel();
              const codigo = gerarCodigoDoDesafio();
              const desafio = await s.repos.desafios.criar({
                identidadeId,
                canal: "EMAIL",
                codigoDerivado: await derivarSenha(codigo),
                expiraEm,
                agora,
              });
              await s.email.enviar(
                emailDoCodigoDoLogin({
                  para: identidade.email,
                  nome: identidade.nome,
                  codigo,
                }),
              );
              return desafio;
            },
            criarSessao: async ({ identidadeId }) => {
              aberta.sessao = await iniciarSessao(
                {
                  identidadeId,
                  papel: PAPEL_DA_SESSAO[lida.valor!.papel],
                  cliente,
                },
                s.dependenciasDaSessao(avisos),
              );
              return { sessaoId: identidadeId };
            },
          }),
        )
        .catch((erro: unknown) => {
          if (erro instanceof ConfiguracaoDoAplicativoObrigatoria) return null;
          throw erro;
        });

      if (resultado === null) {
        await limite.registrarSucesso();
        const decisao = decidirSegundoFatorObrigatorio("ADMINISTRADOR", false);
        resposta.json({
          status: "CONFIGURACAO_DO_APLICATIVO_OBRIGATORIA",
          caminho: decisao.caminho,
        });
        return;
      }
      if (resultado.status === "CREDENCIAIS_INVALIDAS") {
        // Mesmo tempo para e-mail inexistente e senha errada.
        if (!lida.valor) await senhaConfere(body.senha, await senhaFicticia());
        await limite.registrarFalha();
        return responderErro(
          resposta,
          401,
          "credenciais_invalidas",
          "E-mail ou senha incorretos.",
        );
      }
      await limite.registrarSucesso();
      if (resultado.status === "EMAIL_NAO_VERIFICADO") {
        return responderErro(
          resposta,
          403,
          "email_nao_verificado",
          "Confirme seu e-mail antes de entrar.",
        );
      }
      if (resultado.status === "DESAFIO_DE_SEGUNDO_FATOR") {
        resposta.set("cache-control", "no-store");
        resposta.json({
          status: resultado.status,
          desafioId: resultado.desafioId,
          canal,
        });
        return;
      }
      entregarSessao(
        resposta,
        aberta.sessao!,
        PAPEL_DA_SESSAO[lida.valor!.papel],
      );
    }),
  );

  // --- Segundo fator (AC-106, AC-107, AC-121, AC-124) ------------------------
  const codigo = validar({ body: esquemaDoCodigoDoDesafio });
  rotas.post(
    "/segundo-fator",
    s.limitadores.segundoFator,
    codigo,
    rota(async (requisicao, resposta) => {
      const { body } = codigo.dados(requisicao);
      const limite = limiteDaRequisicao(requisicao);
      const aceito: { identidadeId?: string } = {};
      // A conferência e o consumo do código são gravados primeiro; a sessão
      // nasce depois, em `abrirSessao` (ver o porquê lá).
      const resultado = await s.naTransacao({}, () =>
        confirmarSegundoFator(body, {
          desafios: s.repos.desafios,
          criarSessao: async ({ identidadeId }) => {
            aceito.identidadeId = identidadeId;
            return { sessaoId: identidadeId };
          },
        }),
      );

      if (resultado.status === "SESSAO_CRIADA" && aceito.identidadeId) {
        await limite.registrarSucesso();
        const { sessao, papel } = await s.abrirSessao(
          aceito.identidadeId,
          clienteDaRequisicao(requisicao),
        );
        entregarSessao(resposta, sessao, papel);
        return;
      }
      resposta.set("cache-control", "no-store");
      if (resultado.status === "CODIGO_INCORRETO") {
        await limite.registrarFalha();
        resposta.json(resultado);
        return;
      }
      resposta.json({
        status:
          resultado.status === "BLOQUEADO" ? "BLOQUEADO" : resultado.status,
        mensagem:
          resultado.status === "BLOQUEADO"
            ? resultado.mensagem
            : "Este código não está mais válido. Comece o login de novo.",
      });
    }),
  );

  // --- Código de recuperação no lugar do aplicativo (AC-123) -----------------
  const recuperacao = validar({ body: esquemaDoCodigoDeRecuperacao });
  rotas.post(
    "/segundo-fator/recuperacao",
    s.limitadores.segundoFator,
    recuperacao,
    rota(async (requisicao, resposta) => {
      const { body } = recuperacao.dados(requisicao);
      const limite = limiteDaRequisicao(requisicao);
      const agora = s.agora();

      const resultado = await s
        .naTransacao({}, async (avisos) => {
          const desafio = await s.repos.auxiliar.desafioAberto(
            body.desafioId,
            agora,
          );
          if (desafio === null) return { status: "CODIGO_INVALIDO" as const };
          const uso = await usarCodigoDeRecuperacao(
            { identidadeId: desafio.identidadeId, codigo: body.codigo },
            {
              repositorio: s.repos.codigosDeRecuperacao,
              avisador: {
                avisarUso: async ({ identidadeId }) =>
                  s.avisarDepois(
                    avisos,
                    "codigo_de_recuperacao_usado",
                    identidadeId,
                    emailDeCodigoDeRecuperacaoUsado,
                  ),
              },
              // Consome o desafio: ele não serve para uma segunda entrada. No
              // canal do aplicativo o banco só aceita passo que anda para a
              // frente, então o consumo gasta o passo atual (ou o seguinte ao
              // último usado) — quem usa recuperação perdeu o aparelho.
              criarSessao: async (identidadeId) => {
                const atual = Math.floor(
                  agora.getTime() / PASSO_DO_APLICATIVO_EM_MS,
                );
                const passo =
                  desafio.canal === "TOTP"
                    ? Math.max(atual, (desafio.ultimoPasso ?? atual - 1) + 1)
                    : null;
                const status = await s.repos.auxiliar.registrarDesfecho({
                  desafioId: body.desafioId,
                  aceito: true,
                  passo,
                  agora,
                });
                if (status !== "ACEITO") throw new DesafioOcupado();
                return { sessaoId: identidadeId };
              },
            },
          );
          if (uso.status === "CODIGO_INVALIDO") {
            await s.repos.auxiliar.registrarDesfecho({
              desafioId: body.desafioId,
              aceito: false,
              passo: null,
              agora,
            });
            return uso;
          }
          return { ...uso, identidadeId: desafio.identidadeId };
        })
        .catch((erro: unknown) => {
          if (erro instanceof DesafioOcupado) return null;
          throw erro;
        });

      if (resultado === null) {
        return responderErro(
          resposta,
          409,
          "tente_novamente",
          "Aguarde alguns segundos e tente de novo.",
        );
      }
      if (resultado.status === "CODIGO_INVALIDO") {
        await limite.registrarFalha();
        resposta.set("cache-control", "no-store");
        resposta.json({ status: "CODIGO_INVALIDO" });
        return;
      }
      await limite.registrarSucesso();
      const { sessao, papel } = await s.abrirSessao(
        resultado.identidadeId,
        clienteDaRequisicao(requisicao),
      );
      entregarSessao(resposta, sessao, papel, {
        orientarPara: resultado.orientarPara,
      });
    }),
  );
}
