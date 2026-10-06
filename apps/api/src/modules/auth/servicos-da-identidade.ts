/**
 * A composição da identidade de produção (T-112): repositórios da T-111,
 * casos de uso, e-mail, cifra e relógio, montados uma vez para as rotas de
 * `/v1/auth`.
 *
 * Três decisões que valem para todas as rotas:
 *
 * 1. **Uma transação por requisição.** `naTransacao` abre um contexto de
 *    requisição e UMA transação; os repositórios entram nela (`emTransacao`
 *    reaproveita a que está em curso). Falha no meio desfaz tudo.
 * 2. **E-mail que confirma uma ação vai dentro da transação; aviso vai
 *    depois.** Se o link de verificação não sai, o cadastro não fica pela
 *    metade (AC-133). Já o aviso de reuso, de bloqueio ou de código de
 *    recuperação usado nunca pode desfazer a proteção que ele anuncia: é
 *    agendado e enviado depois do commit, e a falha só vai ao registro.
 * 3. **Contexto de pessoa só para a própria pessoa.** Ler o e-mail de quem
 *    vai ser avisado usa a política "só a própria identidade", num contexto
 *    só daquela identidade — nunca a credencial da administração.
 */
import {
  cifradorDoTotpDoAmbiente,
  type CifradorDeSegredos,
} from "../../core/cifra.ts";
import {
  contextoAtual,
  executarComoRequisicao,
  type DadosDoContexto,
} from "../../core/contexto.ts";
import {
  banco,
  bancoDaAdministracao,
  type AcessoAoBanco,
} from "../../core/db.ts";
import type { CacheDoLimite } from "../../core/limite.ts";
import { registrar } from "../../core/log.ts";
import {
  ErroDeEnvioIndisponivel,
  SAIDA_DE_EMAIL_INDISPONIVEL,
  emailDeContaBloqueada,
  emailDeReusoDeSessao,
  type MensagemDeAcesso,
  type SaidaDeEmail,
} from "./emails-de-acesso.ts";
import { repositorioAuxiliarDaIdentidade } from "./identidade-auxiliar.repo.ts";
import {
  PAPEL_DA_SESSAO,
  codigosRepoNoBanco,
  repositorioDeIdentidadesNoBanco,
  repositorioDeRecuperacaoNoBanco,
  repositorioDoConviteNoBanco,
  repositorioDoLoginNoBanco,
} from "./identidade.repo.ts";
import {
  cacheDoLimiteDoAmbiente,
  limitadoresDaIdentidade,
} from "./limite-da-identidade.ts";
import {
  repositorioDeCodigosDeRecuperacaoNoBanco,
  repositorioDeDesafiosNoBanco,
  repositorioTotpNoBanco,
} from "./segundo-fator.repo.ts";
import { avaliarPoliticaDeSenha } from "./senha.ts";
import {
  iniciarSessao,
  type ClienteDaSessao,
  type DependenciasDaSessao,
} from "./sessao.usecase.ts";
import { repositorioDeSessoesNoBanco } from "./sessoes.repo.ts";
import type { PapelDaSessao } from "./token.ts";

type FonteDeAmbiente = Readonly<Record<string, string | undefined>>;

/** O que a composição precisa de fora. Tudo tem padrão; a prova troca. */
export interface OpcoesDaIdentidade {
  /** De onde vêm NODE_ENV, JWT_SECRET, URL_DO_SITE, CHAVE_CIFRA_TOTP e REDIS_URL. */
  readonly fonte?: FonteDeAmbiente;
  /** Acesso pela credencial que atende requisição. Padrão: o do ambiente. */
  readonly acesso?: () => AcessoAoBanco;
  /** Porta de saída do e-mail. Padrão: indisponível (não finge que enviou). */
  readonly email?: SaidaDeEmail;
  /** Cifra do segredo do aplicativo. Padrão: a chave do ambiente. */
  readonly cifrador?: CifradorDeSegredos;
  /** Cache do limite de tentativas. Padrão: o Redis do ambiente. */
  readonly cacheDoLimite?: CacheDoLimite;
  /** Quantas bordas nossas escrevem `X-Forwarded-For`. Padrão: 1. */
  readonly proxiesConfiaveis?: number;
  readonly agora?: () => Date;
}

/** Ação de aviso agendada para depois do commit. */
type Aviso = { readonly nome: string; readonly enviar: () => Promise<void> };

/** Os avisos de uma requisição, enviados só depois que a transação fechou. */
export class FilaDeAvisos {
  private readonly pendentes: Aviso[] = [];

  agendar(aviso: Aviso): void {
    this.pendentes.push(aviso);
  }

  async despachar(): Promise<void> {
    for (const aviso of this.pendentes.splice(0)) {
      try {
        await aviso.enviar();
      } catch (erro) {
        // Só o tipo do aviso e o nome do erro: nada de endereço (P-009).
        registrar.aviso("auth.aviso.nao_enviado", {
          nome: aviso.nome,
          erro: erro instanceof Error ? erro.name : "desconhecido",
        });
      }
    }
  }
}

/** Erro de configuração: a API não assina sessão sem segredo. */
export class ErroSemSegredoDeAssinatura extends Error {
  constructor() {
    super("JWT_SECRET ausente: a API não assina sessão sem segredo");
    this.name = "ErroSemSegredoDeAssinatura";
  }
}

/**
 * Qualquer falha de entrega vira `ErroDeEnvioIndisponivel`, que a rota
 * responde com o texto fixo de envio indisponível (AC-133). A causa vai ao
 * registro só pelo nome — a mensagem do provedor pode citar o endereço.
 */
function saidaQueFalhaClaro(saida: SaidaDeEmail): SaidaDeEmail {
  return {
    disponivel: saida.disponivel,
    async enviar(mensagem) {
      try {
        await saida.enviar(mensagem);
      } catch (erro) {
        registrar.aviso("auth.email.nao_saiu", {
          nome: mensagem.assunto,
          erro: erro instanceof Error ? erro.name : "desconhecido",
        });
        throw new ErroDeEnvioIndisponivel();
      }
    },
  };
}

export function criarServicosDaIdentidade(opcoes: OpcoesDaIdentidade = {}) {
  const fonte = opcoes.fonte ?? process.env;
  const acesso = opcoes.acesso ?? (() => banco());
  const email = saidaQueFalhaClaro(opcoes.email ?? SAIDA_DE_EMAIL_INDISPONIVEL);
  const cifrador = opcoes.cifrador ?? cifradorDoTotpDoAmbiente(fonte);
  const agora = opcoes.agora ?? (() => new Date());
  const enderecoDoSite = fonte["URL_DO_SITE"] ?? "";

  const repos = {
    identidades: repositorioDeIdentidadesNoBanco(acesso),
    login: repositorioDoLoginNoBanco(acesso),
    codigos: codigosRepoNoBanco(acesso),
    recuperacao: repositorioDeRecuperacaoNoBanco(acesso),
    sessoes: repositorioDeSessoesNoBanco(acesso),
    desafios: repositorioDeDesafiosNoBanco(acesso, { cifrador, agora }),
    totp: repositorioTotpNoBanco(acesso, cifrador),
    codigosDeRecuperacao: repositorioDeCodigosDeRecuperacaoNoBanco(acesso),
    convite: repositorioDoConviteNoBanco({
      aplicacao: acesso,
      // Só o reenvio (ato da administração) usa; aceitar o convite não.
      administracao: () => bancoDaAdministracao(),
    }),
    auxiliar: repositorioAuxiliarDaIdentidade(acesso),
  };

  /** O segredo de assinatura, conferido na hora de assinar. */
  function segredo(): string {
    const valor = fonte["JWT_SECRET"]?.trim();
    if (valor === undefined || valor === "") {
      throw new ErroSemSegredoDeAssinatura();
    }
    return valor;
  }

  /** Abre um contexto de requisição e UMA transação; avisos saem depois. */
  async function naTransacao<T>(
    dados: Omit<DadosDoContexto, "requisicaoId">,
    acao: (avisos: FilaDeAvisos) => Promise<T>,
  ): Promise<T> {
    const avisos = new FilaDeAvisos();
    const resultado = await executarComoRequisicao(
      { ...dados, requisicaoId: contextoAtual()?.requisicaoId },
      () => acesso().emTransacao(() => acao(avisos)),
    );
    await avisos.despachar();
    return resultado;
  }

  /** Roda como a própria pessoa, fora de loja (políticas "só a própria"). */
  function comoAPessoa<T>(identidadeId: string, acao: () => Promise<T>) {
    return executarComoRequisicao(
      {
        usuarioId: identidadeId,
        papel: "CUSTOMER",
        requisicaoId: contextoAtual()?.requisicaoId,
      },
      () => acao(),
    );
  }

  /** E-mail e nome da pessoa, lidos pela política dela mesma. */
  function contaDe(identidadeId: string) {
    return comoAPessoa(identidadeId, () => repos.auxiliar.propriaConta());
  }

  /**
   * O papel real da identidade, depois de um segundo fator aceito: a sessão
   * nasce com ele, e o banco confere de novo ao gravá-la.
   */
  async function papelDe(identidadeId: string): Promise<PapelDaSessao> {
    const conta = await contaDe(identidadeId);
    const identidade =
      conta === null
        ? null
        : await comoAPessoa(identidadeId, () =>
            repos.login.buscarPorEmail(conta.email),
          );
    if (identidade === null) {
      throw new Error("a identidade do desafio aceito não está mais ativa");
    }
    return PAPEL_DA_SESSAO[identidade.papel];
  }

  /** Agenda um aviso por e-mail para a identidade, depois do commit. */
  function avisarDepois(
    avisos: FilaDeAvisos,
    nome: string,
    identidadeId: string,
    montar: (para: string) => MensagemDeAcesso,
  ): void {
    avisos.agendar({
      nome,
      enviar: async () => {
        const conta = await contaDe(identidadeId);
        if (conta !== null) await email.enviar(montar(conta.email));
      },
    });
  }

  /** Dependências da sessão (T-103), com o aviso de reuso agendado. */
  function dependenciasDaSessao(avisos: FilaDeAvisos): DependenciasDaSessao {
    return {
      repositorio: repos.sessoes,
      avisador: {
        avisarReusoDeToken: async ({ identidadeId }) => {
          avisarDepois(avisos, "reuso_de_sessao", identidadeId, (para) =>
            emailDeReusoDeSessao(para),
          );
        },
      },
      segredoDeAssinatura: segredo(),
      agora,
    };
  }

  /**
   * Abre a sessão DEPOIS de o segundo fator ter sido aceito e gravado.
   *
   * Fica fora da transação do desafio de propósito: descobrir o papel lê a
   * conta numa transação da própria pessoa, e fazer isso com a transação do
   * desafio ainda aberta seguraria duas conexões por requisição — com o
   * agrupador cheio, as requisições esperariam umas pelas outras. Se a
   * sessão falhar aqui, o código já foi gasto e a pessoa recomeça o login.
   */
  async function abrirSessao(identidadeId: string, cliente: ClienteDaSessao) {
    const papel = await papelDe(identidadeId);
    const sessao = await naTransacao({}, (avisos) =>
      iniciarSessao(
        { identidadeId, papel, cliente },
        dependenciasDaSessao(avisos),
      ),
    );
    return { sessao, papel };
  }

  /** A política de senha como a borda de recuperação e convite espera. */
  async function validarNovaSenha(senha: string): Promise<void> {
    if (!avaliarPoliticaDeSenha(senha).valida) {
      throw new Error("senha fora da política");
    }
  }

  const limitadores = limitadoresDaIdentidade({
    cache: opcoes.cacheDoLimite ?? cacheDoLimiteDoAmbiente(fonte["REDIS_URL"]),
    ...(opcoes.proxiesConfiaveis === undefined
      ? {}
      : { proxiesConfiaveis: opcoes.proxiesConfiaveis }),
    // AC-119: o dono da conta bloqueada é avisado. Só se a conta existe —
    // e-mail sem conta não recebe nada, e quem tenta não fica sabendo.
    aoBloquearConta: async (aviso) => {
      const fila = new FilaDeAvisos();
      fila.agendar({
        nome: "conta_bloqueada",
        enviar: async () => {
          const conta = await executarComoRequisicao({}, () =>
            repos.login.buscarPorEmail(aviso.identificador),
          );
          if (conta === null) return;
          await email.enviar(
            emailDeContaBloqueada({
              para: conta.email,
              esperaMs: aviso.esperaMs,
            }),
          );
        },
      });
      await fila.despachar();
    },
  });

  return {
    fonte,
    producao: fonte["NODE_ENV"] === "production",
    email,
    cifrador,
    agora,
    enderecoDoSite,
    repos,
    limitadores,
    segredo,
    naTransacao,
    comoAPessoa,
    contaDe,
    papelDe,
    avisarDepois,
    dependenciasDaSessao,
    abrirSessao,
    validarNovaSenha,
  };
}

export type ServicosDaIdentidade = ReturnType<typeof criarServicosDaIdentidade>;
