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
  MENSAGEM_DE_APELIDO_EM_USO,
  MENSAGEM_DE_CONTA_CRIADA,
  esquemaDaLojaSolicitada,
  esquemaDoApelidoDaLoja,
  mensagemDoLimiteAtingido,
  esquemaDoCadastro,
  esquemaDoCodigoDeRecuperacao,
  esquemaDoCodigoDoDesafio,
  esquemaDoLinkRecebido,
  esquemaDoLogin,
} from "@simpleclick/contracts";
import { Router } from "express";
import { z } from "zod";

import { transacaoAtual } from "../../core/db.ts";
import { limiteDaRequisicao } from "../../core/limite.ts";
import { validar } from "../../core/validar.ts";
import {
  clienteDaRequisicao,
  entregarSessao,
  responderEnvioIndisponivel,
  responderErro,
  rota,
} from "./borda-da-sessao.ts";
import { origemDoAceite, registrarAceites } from "../../core/aceites-legais.ts";
import { clienteDaCompra } from "./cliente-da-compra.ts";
import { montarRotasDaContaSegura } from "./conta-segura.routes.ts";
import {
  conferirApelido,
  corrigirLojaEmAnalise,
  lerLojaEmAnalise,
  reenviarLojaRecusada,
  solicitarLoja,
} from "./loja-solicitada.ts";
import {
  ErroDeEnvioIndisponivel,
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
import { derivarSenha, senhaConfere } from "./senha.ts";
import {
  criarServicosDaIdentidade,
  type OpcoesDaIdentidade,
  type ServicosDaIdentidade,
} from "./servicos-da-identidade.ts";
import { iniciarSessao, type SessaoEntregue } from "./sessao.usecase.ts";
import { decidirSegundoFatorObrigatorio } from "./totp.usecase.ts";
import { criarCasoDeUsoDeVerificacaoDeEmail } from "./verificar-email.usecase.ts";

export type { OpcoesDaIdentidade } from "./servicos-da-identidade.ts";

/** Consultas de endereço por origem: no máximo 30 por minuto. */
const consultasDeApelido = new Map<string, { inicio: number; total: number }>();
function podeConsultarApelido(origem: string): boolean {
  const agora = Date.now();
  const atual = consultasDeApelido.get(origem);
  if (atual === undefined || agora - atual.inicio > 60_000) {
    if (consultasDeApelido.size > 5_000) consultasDeApelido.clear();
    consultasDeApelido.set(origem, { inicio: agora, total: 1 });
    return true;
  }
  atual.total += 1;
  return atual.total <= 30;
}

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

  // --- Cadastro (AC-100, AC-102): conta verificada e sessão já aberta -------
  const cadastro = validar({ body: esquemaDoCadastro });
  rotas.post(
    "/cadastro",
    cadastro,
    rota(async (requisicao, resposta) => {
      const { body } = cadastro.dados(requisicao);
      const resultado = await s.naTransacao({}, () =>
        cadastrarClienteFinal(body, { identidades: s.repos.identidades }),
      );
      if (resultado.status === "SENHA_FRACA") {
        const motivos = resultado.campos
          .map((c) => c.problema.mensagem)
          .join(" ");
        return responderErro(resposta, 422, "senha_fraca", motivos);
      }
      if (resultado.status === "EMAIL_EM_USO") {
        return responderErro(
          resposta,
          409,
          "email_em_uso",
          "Já existe uma conta com este e-mail. Entre com a sua senha.",
        );
      }
      // O aceite (card #79): a conta já existe, então o registro corre como
      // ela mesma. Se falhar, a conta fica com o aceite pendente e a janela
      // de novo aceite pede de novo no primeiro acesso.
      await s.naTransacao(
        { usuarioId: resultado.identidadeId, papel: "CUSTOMER" },
        () =>
          registrarAceites(
            transacaoAtual(),
            resultado.identidadeId,
            ["TERMS_OF_USE", "PRIVACY_POLICY"],
            { origem: "SIGNUP", de: origemDoAceite(requisicao) },
          ),
      );
      const { sessao, papel } = await s.abrirSessao(
        resultado.identidadeId,
        clienteDaRequisicao(requisicao),
      );
      resposta.status(201);
      entregarSessao(resposta, sessao, papel, {
        cadastrado: true,
        mensagem: MENSAGEM_DE_CONTA_CRIADA,
      });
    }),
  );

  // --- Loja aberta pelo próprio lojista (card #25) --------------------------
  // Qualquer conta logada pede; a loja nasce aguardando aprovação e a resposta
  // já traz a sessão nova, com o papel de dono.
  const lojaPedida = validar({ body: esquemaDaLojaSolicitada });
  rotas.post(
    "/lojas",
    // Sem sessão, 401 antes de olhar o corpo.
    (requisicao, resposta, proximo) => {
      if (clienteDaCompra(requisicao, process.env.JWT_SECRET?.trim()) === null) {
        responderErro(resposta, 401, "nao_autenticado");
        return;
      }
      proximo();
    },
    lojaPedida,
    rota(async (requisicao, resposta) => {
      const pessoa = clienteDaCompra(requisicao, process.env.JWT_SECRET?.trim());
      if (pessoa === null) {
        return responderErro(resposta, 401, "nao_autenticado");
      }
      const { body } = lojaPedida.dados(requisicao);
      const pedido = await s.naTransacao(
        { usuarioId: pessoa.identidadeId, papel: "CUSTOMER" },
        async () => {
          const criada = await solicitarLoja(body);
          // Quem abre loja aceita os Termos do Lojista (card #79), na mesma
          // transação: sem loja criada, sem aceite gravado.
          if (criada.resultado === "CRIADA") {
            await registrarAceites(
              transacaoAtual(),
              pessoa.identidadeId,
              ["MERCHANT_TERMS"],
              { origem: "SIGNUP", de: origemDoAceite(requisicao) },
            );
          }
          return criada;
        },
      );
      if (pedido.resultado === "SEM_SESSAO") {
        return responderErro(resposta, 401, "nao_autenticado");
      }
      if (pedido.resultado === "TIPO_DESCONHECIDO") {
        resposta.set("cache-control", "no-store");
        resposta.status(400).json({
          erro: "tipo_desconhecido",
          campos: [
            {
              onde: "body",
              caminho: "tipoDeNegocio",
              mensagem: "Escolha um tipo de negócio da lista.",
            },
          ],
        });
        return;
      }
      if (pedido.resultado === "APELIDO_EM_USO") {
        resposta.set("cache-control", "no-store");
        resposta.status(409).json({
          erro: "apelido_em_uso",
          campos: [
            {
              onde: "body",
              caminho: "apelido",
              mensagem: MENSAGEM_DE_APELIDO_EM_USO,
            },
          ],
          sugestao: pedido.sugestao,
        });
        return;
      }
      if (pedido.resultado === "LIMITE_ATINGIDO") {
        resposta.set("cache-control", "no-store");
        resposta.status(409).json({
          erro: "limite_atingido",
          recurso: "lojas",
          limite: pedido.limite,
          uso: pedido.uso,
          mensagem: mensagemDoLimiteAtingido("lojas", pedido.limite),
        });
        return;
      }
      const { sessao, papel } = await s.abrirSessao(
        pessoa.identidadeId,
        clienteDaRequisicao(requisicao),
      );
      resposta.status(201);
      entregarSessao(resposta, sessao, papel, {
        mensagem: "Loja criada! Ela fica aguardando a aprovação do SimpleClick.",
        loja: {
          codigo: pedido.codigo,
          apelido: pedido.apelido,
          status: "PENDING_APPROVAL",
        },
      });
    }),
  );

  // --- Endereço da loja livre? (público, para o cadastro de dono) -----------
  const apelidoConsultado = validar({
    query: z.strictObject({ valor: esquemaDoApelidoDaLoja }),
  });
  rotas.get(
    "/lojas/apelido",
    (requisicao, resposta, proximo) => {
      if (!podeConsultarApelido(requisicao.ip ?? "")) {
        responderErro(resposta, 429, "muitas_tentativas");
        return;
      }
      proximo();
    },
    apelidoConsultado,
    rota(async (requisicao, resposta) => {
      const { query } = apelidoConsultado.dados(requisicao);
      const resultado = await s.naTransacao({}, () =>
        conferirApelido(query.valor),
      );
      resposta.set("cache-control", "no-store");
      resposta.json(resultado);
    }),
  );

  // --- Loja em análise: corrigir dados e reenviar (card #28) ----------------
  const apelidoDaLoja = validar({
    params: z.strictObject({ apelido: esquemaDoApelidoDaLoja }),
  });
  const correcaoDaLoja = validar({
    params: z.strictObject({ apelido: esquemaDoApelidoDaLoja }),
    body: esquemaDaLojaSolicitada.omit({
      apelido: true,
      aceitouTermosDoLojista: true,
    }),
  });
  const responderLojaEmAnalise = (
    resposta: Parameters<typeof responderErro>[0],
    resultado: Awaited<ReturnType<typeof corrigirLojaEmAnalise>>,
  ): boolean => {
    if (resultado === "OK") return false;
    if (resultado === "SEM_SESSAO") {
      responderErro(resposta, 401, "nao_autenticado");
    } else if (resultado === "ESTADO_INVALIDO") {
      responderErro(
        resposta,
        409,
        "estado_invalido",
        "Esta loja não está em análise nem foi recusada.",
      );
    } else if (resultado === "TIPO_DESCONHECIDO") {
      responderErro(
        resposta,
        400,
        "tipo_desconhecido",
        "Escolha um tipo de negócio da lista.",
      );
    } else {
      responderErro(resposta, 404, "loja_nao_encontrada");
    }
    return true;
  };
  rotas.get(
    "/lojas/:apelido",
    apelidoDaLoja,
    rota(async (requisicao, resposta) => {
      const pessoa = clienteDaCompra(requisicao, process.env.JWT_SECRET?.trim());
      if (pessoa === null) {
        return responderErro(resposta, 401, "nao_autenticado");
      }
      const { params } = apelidoDaLoja.dados(requisicao);
      const loja = await s.naTransacao(
        { usuarioId: pessoa.identidadeId, papel: "CUSTOMER" },
        () => lerLojaEmAnalise(params.apelido),
      );
      if (loja === null) return responderErro(resposta, 404, "loja_nao_encontrada");
      resposta.set("cache-control", "no-store");
      resposta.json(loja);
    }),
  );
  rotas.put(
    "/lojas/:apelido",
    correcaoDaLoja,
    rota(async (requisicao, resposta) => {
      const pessoa = clienteDaCompra(requisicao, process.env.JWT_SECRET?.trim());
      if (pessoa === null) {
        return responderErro(resposta, 401, "nao_autenticado");
      }
      const { params, body } = correcaoDaLoja.dados(requisicao);
      const resultado = await s.naTransacao(
        { usuarioId: pessoa.identidadeId, papel: "CUSTOMER" },
        () => corrigirLojaEmAnalise(params.apelido, body),
      );
      if (responderLojaEmAnalise(resposta, resultado)) return;
      resposta.set("cache-control", "no-store");
      resposta.json({ atualizada: true });
    }),
  );
  rotas.post(
    "/lojas/:apelido/reenviar",
    apelidoDaLoja,
    rota(async (requisicao, resposta) => {
      const pessoa = clienteDaCompra(requisicao, process.env.JWT_SECRET?.trim());
      if (pessoa === null) {
        return responderErro(resposta, 401, "nao_autenticado");
      }
      const { params } = apelidoDaLoja.dados(requisicao);
      const resultado = await s.naTransacao(
        { usuarioId: pessoa.identidadeId, papel: "CUSTOMER" },
        () => reenviarLojaRecusada(params.apelido),
      );
      if (responderLojaEmAnalise(resposta, resultado)) return;
      resposta.set("cache-control", "no-store");
      resposta.json({ reenviada: true, situacao: "PENDING_APPROVAL" });
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
            semSegundoFator: process.env["NODE_ENV"] === "development",
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
      // O erro que bloqueia o desafio também é erro: conta na conta (AC-107).
      if (resultado.status === "BLOQUEADO") await limite.registrarFalha();
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
