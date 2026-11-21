/**
 * Rotas da administração da plataforma: `/v1/admin/*`.
 *
 * DUAS TRAVAS antes de qualquer consulta, e nenhuma delas é o parâmetro da URL:
 *
 * 1. O token de acesso precisa dizer ADMIN. Dono de loja e cliente final param
 *    aqui, com a mesma resposta para qualquer caminho — recusar de um jeito
 *    num endereço e de outro no vizinho contaria quais endereços existem.
 * 2. A identidade precisa estar em `platform_admins`, sem revogação, AGORA. O
 *    token vale quinze minutos e o poder pode ter sido retirado nesse meio.
 *
 * E o banco é a terceira: estas rotas falam pela credencial `sc_admin`, que é
 * a única que enxerga todas as lojas. A rota do lojista não tem essa senha.
 *
 * A composição com os outros módulos (autenticação, envio do convite) é feita
 * em `app.ts` e chega aqui por parâmetro: módulo não importa módulo.
 */

import { createHash, randomBytes } from "node:crypto";

import express, {
  Router,
  type NextFunction,
  type Request,
  type Response,
} from "express";

import {
  armazenamentoPrivadoDoAmbiente,
  ErroDeArmazenamentoPrivadoIndisponivel,
  type ArmazenamentoPrivado,
} from "../../core/arquivo-privado.ts";
import { executarComoRequisicao } from "../../core/contexto.ts";
import { bancoDaAdministracao, type AcessoAoBanco } from "../../core/db.ts";
import { registrar } from "../../core/log.ts";
import { validar } from "../../core/validar.ts";
import {
  esquemaDaConsultaDaAuditoriaDaPlataforma,
  LIMITE_DO_PDF_EM_BYTES,
  MENSAGEM_DE_APELIDO_EM_USO,
  MENSAGEM_DE_CONFIRMACAO_DIFERENTE,
} from "@simpleclick/contracts";

import {
  esquemasDaAuditoria,
  esquemasDaEdicao,
  esquemasDaExclusao,
  esquemasDaFicha,
  esquemasDaListagem,
  esquemasDaReativacao,
  esquemasDaSuspensao,
  esquemasDaTrocaDeApelido,
  esquemasDaTrocaDeTipo,
  esquemasDoArquivo,
  esquemasDoCadastro,
  esquemasDoEnvioDeDocumento,
  esquemasDoLinkDoDocumento,
  esquemasDosDocumentos,
} from "./admin.schema.ts";
import { enviarDocumento } from "./contratos.usecase.ts";
import {
  lerDocumento,
  listarDocumentos,
  registrarAberturaDoDocumento,
  repositorioDosDocumentos,
} from "./documentos.repo.ts";
import {
  assinarLink,
  chaveDosLinks,
  conferirLink,
  PRAZO_DO_LINK_EM_MS,
} from "./link-do-documento.ts";
import {
  alterarApelido,
  ErroDeApelidoTomado,
} from "./alterar-apelido.usecase.ts";
import { alterarTipoDeNegocio } from "./alterar-vertical.usecase.ts";
import {
  cadastrarLoja,
  sugerirApelido,
  type DependenciasDoCadastro,
} from "./criar-loja.usecase.ts";
import { repositorioDaAuditoria } from "./auditoria-consulta.repo.ts";
import { consultarAuditoriaDaPlataforma } from "./auditoria-da-plataforma.repo.ts";
import { consultarAuditoria, lojasDaPagina } from "./auditoria.usecase.ts";
import { editarLoja } from "./editar-loja.usecase.ts";
import { montarRotasDasFuncionalidades } from "./funcionalidades.routes.ts";
import { montarRotasDaAprovacao } from "./aprovacao.routes.ts";
import { montarRotasDaGestao } from "./gestao.routes.ts";
import {
  montarRotasDePessoas,
  type EnviarAcessoDaPessoa,
} from "./pessoas.routes.ts";
import { montarRotasDosVinculos } from "./vinculos.routes.ts";
import { listarLojas } from "./listar-lojas.usecase.ts";
import { repositorioDaSituacao } from "./situacao.repo.ts";
import {
  excluirLoja,
  reativarLoja,
  restaurarLoja,
  suspenderLoja,
} from "./status-loja.usecase.ts";
import {
  administradorAtivo,
  buscarLojas,
  lerFichaDaLoja,
  listarTiposDeNegocio,
  registrarConsultaDaAdministracao,
  repositorioDaEdicao,
  repositorioDoApelido,
  repositorioDoCadastro,
  repositorioDoTipoDeNegocio,
} from "./lojas.repo.ts";

/** Papéis que uma sessão pode carregar, do jeito que o token os declara. */
export type PapelDaSessaoNaAdministracao = "CUSTOMER" | "OWNER" | "ADMIN";

/** Quem chamou, segundo o token — ainda sem a conferência no banco. */
export interface SessaoNaAdministracao {
  readonly identidadeId: string;
  readonly papel: PapelDaSessaoNaAdministracao;
}

/** A recusa de quem não é administrador. A mesma frase para todo caminho. */
export const RECUSA_DA_ADMINISTRACAO = {
  erro: "acesso_negado",
  mensagem: "Este ajuste é feito pela administração da plataforma.",
} as const;

export interface OpcoesDaAdministracao {
  /** Acesso pela credencial `sc_admin`. Padrão: o do ambiente. */
  readonly acesso?: AcessoAoBanco;
  /** Lê e confere o token do cabeçalho. `null` quando não há sessão válida. */
  readonly autenticar: (requisicao: Request) => SessaoNaAdministracao | null;
  readonly enviarConvite: DependenciasDoCadastro["enviarConvite"];
  readonly gerarTokenDeConvite: () => string;
  readonly resumirTokenDeConvite: (token: string) => string;
  readonly agora?: () => Date;
  /**
   * Onde moram o contrato e os documentos da loja (T-205). Padrão: o que o
   * ambiente oferece — e, sem configuração, o que responde indisponível.
   */
  readonly armazenamentoPrivado?: ArmazenamentoPrivado;
  /**
   * O segredo das sessões, de que deriva a chave dos links de documento. Lido
   * na hora, como a autenticação o lê. Padrão: `JWT_SECRET` do ambiente.
   */
  readonly segredoDasSessoes?: () => string;
  /**
   * Rotas de outros módulos que moram sob `/v1/admin` (o painel de
   * crescimento, do módulo de métricas). Módulo não importa módulo: quem monta
   * o roteador (`app.ts`) entrega a função, e ela recebe as mesmas duas
   * travas que as rotas daqui usam.
   */
  readonly rotasDeOutrosModulos?: readonly RotasDeOutroModulo[];
  /**
   * Link de acesso de uso único das pessoas (card #170). O token e o resumo
   * seguem o formato da recuperação de senha, que é quem consome o link; a
   * borda passa as funções do módulo de identidade. Padrão: 32 bytes
   * aleatórios e sha256 em hexadecimal, o mesmo formato.
   */
  readonly gerarTokenDeAcesso?: () => string;
  readonly resumirTokenDeAcesso?: (token: string) => string;
  /** Manda o link à pessoa. Padrão: não manda (`false`). */
  readonly enviarAcessoDaPessoa?: EnviarAcessoDaPessoa;
}

/** Como um módulo de fora acrescenta rotas ao roteador da administração. */
export type RotasDeOutroModulo = (
  rotas: Router,
  dependencias: {
    readonly acesso: () => AcessoAoBanco;
    readonly comoAdministrador: (
      resposta: Response,
      trabalho: (administradorId: string) => Promise<void>,
    ) => Promise<void>;
  },
) => void;

function recusar(resposta: Response): void {
  resposta.status(403).json(RECUSA_DA_ADMINISTRACAO);
}

/** Até quanto o corpo de um documento é lido: acima do maior limite (PDF). */
const LIMITE_DE_LEITURA_DO_DOCUMENTO = LIMITE_DO_PDF_EM_BYTES + 1024 * 1024;

/** O leitor dos bytes crus do documento, com o teto de leitura. */
const leitorDoDocumento = express.raw({
  type: () => true,
  limit: LIMITE_DE_LEITURA_DO_DOCUMENTO,
});

/** O corpo passou do teto de leitura: nada foi lido além dele. */
const GRANDE_DEMAIS_PARA_LER = Symbol("grande demais para ler");

/**
 * Lê os bytes do documento. É chamado DENTRO do trabalho da administração,
 * depois das duas travas, e não como middleware da rota: assim nenhum byte
 * do corpo é lido antes de a tabela de administradores confirmar quem envia.
 */
function lerBytesDoDocumento(
  requisicao: Request,
  resposta: Response,
): Promise<Uint8Array | typeof GRANDE_DEMAIS_PARA_LER> {
  return new Promise((resolver, rejeitar) => {
    const aoLer: NextFunction = (falha?: unknown) => {
      if (falha === undefined || falha === null) {
        const corpo: unknown = requisicao.body;
        resolver(
          Buffer.isBuffer(corpo) ? new Uint8Array(corpo) : new Uint8Array(),
        );
        return;
      }
      const grandeDemais =
        typeof falha === "object" &&
        (falha as { type?: unknown }).type === "entity.too.large";
      if (grandeDemais) resolver(GRANDE_DEMAIS_PARA_LER);
      else rejeitar(falha instanceof Error ? falha : new Error(String(falha)));
    };
    void leitorDoDocumento(requisicao, resposta, aoLer);
  });
}

/**
 * O nome do arquivo no cabeçalho de download, nos dois formatos: o simples,
 * só com ASCII, para quem não entende o outro, e o `filename*` codificado.
 */
function disposicaoDeAnexo(nome: string): string {
  const simples = nome.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return `attachment; filename="${simples}"; filename*=UTF-8''${encodeURIComponent(nome)}`;
}

export function criarRotasDaAdministracao(
  opcoes: OpcoesDaAdministracao,
): Router {
  const rotas = Router();
  // Preguiçoso: montar a composição não pode abrir conexão, e o teste que não
  // chama rota de administração não deveria precisar da senha dela.
  let acessoMontado: AcessoAoBanco | undefined = opcoes.acesso;
  const acesso = (): AcessoAoBanco =>
    (acessoMontado ??= bancoDaAdministracao());
  const agora = opcoes.agora ?? (() => new Date());
  const armazenamento =
    opcoes.armazenamentoPrivado ?? armazenamentoPrivadoDoAmbiente();
  const segredoDasSessoes =
    opcoes.segredoDasSessoes ?? (() => process.env.JWT_SECRET?.trim() ?? "");

  // Trava 1 — o token. Antes de ler corpo, parâmetro ou banco.
  rotas.use((requisicao, resposta, proximo) => {
    const sessao = opcoes.autenticar(requisicao);
    if (sessao === null) {
      resposta.status(401).json({ erro: "nao_autenticado" });
      return;
    }
    if (sessao.papel !== "ADMIN") {
      recusar(resposta);
      return;
    }
    resposta.locals.administrador = sessao.identidadeId;
    proximo();
  });

  /**
   * Trava 2 — a tabela de administradores, e então o trabalho.
   *
   * O contexto leva quem é o administrador, e cada transação aberta dentro do
   * trabalho é da credencial `sc_admin`. A conferência roda numa transação
   * própria e curta: o cadastro precisa GRAVAR antes de mandar o convite, e
   * isso só acontece se a gravação for uma transação que termina.
   */
  async function comoAdministrador(
    resposta: Response,
    trabalho: (administradorId: string) => Promise<void>,
  ): Promise<void> {
    const administradorId = String(resposta.locals.administrador);
    await executarComoRequisicao({ usuarioId: administradorId }, async () => {
      const ativo = await acesso().emTransacao(() =>
        administradorAtivo(administradorId),
      );
      if (!ativo) {
        recusar(resposta);
        return;
      }
      await trabalho(administradorId);
    });
  }

  rotas.get("/tipos-de-negocio", async (_requisicao, resposta, proximo) => {
    try {
      await comoAdministrador(resposta, async () => {
        const tipos = await acesso().emTransacao(() => listarTiposDeNegocio());
        resposta.json({ tipos });
      });
    } catch (causa) {
      proximo(causa);
    }
  });

  // ── Lista e busca (AC-206) ──────────────────────────────────────────────
  const entradaDaListagem = validar(esquemasDaListagem);
  rotas.get(
    "/lojas",
    entradaDaListagem,
    async (requisicao, resposta, proximo) => {
      try {
        const { query } = entradaDaListagem.dados(requisicao);
        await comoAdministrador(resposta, async () => {
          const lista = await acesso().emTransacao(() =>
            listarLojas(query, { buscarLojas }),
          );
          resposta.setHeader("cache-control", "no-store");
          resposta.json(lista);
        });
      } catch (causa) {
        proximo(causa);
      }
    },
  );

  // ── Histórico de auditoria consultável (AC-215, AC-118) ───────────────
  // A leitura do histórico também é acesso a dados de loja: cada loja que
  // aparece na página ganha o seu registro de consulta, na mesma transação.
  const entradaDaAuditoria = validar(esquemasDaAuditoria);
  rotas.get(
    "/auditoria",
    entradaDaAuditoria,
    async (requisicao, resposta, proximo) => {
      try {
        const { query } = entradaDaAuditoria.dados(requisicao);
        await comoAdministrador(resposta, async (administradorId) => {
          const pagina = await acesso().emTransacao(async () => {
            const encontrada = await consultarAuditoria(
              query,
              repositorioDaAuditoria(),
            );
            for (const lojaId of lojasDaPagina(encontrada)) {
              await registrarConsultaDaAdministracao({
                lojaId,
                atorId: administradorId,
                entidade: "audit_log",
              });
            }
            return encontrada;
          });
          resposta.setHeader("cache-control", "no-store");
          resposta.json(pagina);
        });
      } catch (causa) {
        proximo(causa);
      }
    },
  );

  // ── Trilha da plataforma (card #170) ────────────────────────────────────
  // O que não é de loja nenhuma: atos sobre pessoas, pedidos do titular
  // (LGPD) e limites. Ler a trilha não grava consulta: não há loja nem pessoa
  // lida, só o histórico dos próprios atos da administração.
  const entradaDaAuditoriaDaPlataforma = validar({
    query: esquemaDaConsultaDaAuditoriaDaPlataforma,
  });
  rotas.get(
    "/auditoria/plataforma",
    entradaDaAuditoriaDaPlataforma,
    async (requisicao, resposta, proximo) => {
      try {
        const { query } = entradaDaAuditoriaDaPlataforma.dados(requisicao);
        await comoAdministrador(resposta, async () => {
          const pagina = await acesso().emTransacao(() =>
            consultarAuditoriaDaPlataforma(query),
          );
          resposta.setHeader("cache-control", "no-store");
          resposta.json(pagina);
        });
      } catch (causa) {
        proximo(causa);
      }
    },
  );

  // ── Cadastro de loja (AC-200, AC-201, AC-202) ───────────────────────────
  const entradaDoCadastro = validar(esquemasDoCadastro);
  rotas.post(
    "/lojas",
    entradaDoCadastro,
    async (requisicao, resposta, proximo) => {
      try {
        const { body } = entradaDoCadastro.dados(requisicao);
        await comoAdministrador(resposta, async (administradorId) => {
          const resultado = await cadastrarLoja(body, administradorId, {
            executar: (trabalho) =>
              acesso().emTransacao(() => trabalho(repositorioDoCadastro())),
            enviarConvite: opcoes.enviarConvite,
            gerarToken: opcoes.gerarTokenDeConvite,
            resumirToken: opcoes.resumirTokenDeConvite,
            agora,
            avisarConviteNaoEnviado: (lojaId) =>
              registrar.aviso("admin.convite_nao_enviado", {
                lojaId,
                recurso: "convite",
              }),
          });

          if (resultado.ok) {
            resposta.status(201).json({
              id: resultado.loja.id,
              codigo: resultado.loja.codigo,
              apelido: resultado.loja.apelido,
              status: resultado.loja.status,
              conviteEnviado: resultado.conviteEnviado,
            });
            return;
          }
          if (resultado.motivo === "APELIDO_EM_USO") {
            resposta.status(409).json({
              erro: "apelido_em_uso",
              campos: [
                {
                  onde: "body",
                  caminho: "apelido",
                  mensagem: MENSAGEM_DE_APELIDO_EM_USO,
                },
              ],
              sugestao: resultado.sugestao,
            });
            return;
          }
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
        });
      } catch (causa) {
        proximo(causa);
      }
    },
  );

  // ── Ficha da loja (AC-207, AC-118) ──────────────────────────────────────
  // Abrir a ficha é CONSULTAR dado da loja — documento e contato do
  // responsável aparecem aqui —, e por isso cada abertura entra na trilha na
  // mesma transação da leitura: quem, o quê e quando (AC-118).
  const entradaDaFicha = validar(esquemasDaFicha);
  rotas.get(
    "/lojas/:id",
    entradaDaFicha,
    async (requisicao, resposta, proximo) => {
      try {
        const { params } = entradaDaFicha.dados(requisicao);
        await comoAdministrador(resposta, async (administradorId) => {
          const ficha = await acesso().emTransacao(async () => {
            const lida = await lerFichaDaLoja(params.id);
            if (lida === null) return null;
            await registrarConsultaDaAdministracao({
              lojaId: params.id,
              atorId: administradorId,
              entidade: "stores",
            });
            return lida;
          });
          resposta.setHeader("cache-control", "no-store");
          if (ficha === null) {
            resposta.status(404).json({ erro: "nao_encontrado" });
            return;
          }
          resposta.json(ficha);
        });
      } catch (causa) {
        proximo(causa);
      }
    },
  );

  // ── Edição do cadastro (AC-207) ─────────────────────────────────────────
  const entradaDaEdicao = validar(esquemasDaEdicao);
  rotas.patch(
    "/lojas/:id",
    entradaDaEdicao,
    async (requisicao, resposta, proximo) => {
      try {
        const { params, body } = entradaDaEdicao.dados(requisicao);
        await comoAdministrador(resposta, async (administradorId) => {
          const ficha = await acesso().emTransacao(async () => {
            const resultado = await editarLoja(
              params.id,
              body,
              administradorId,
              repositorioDaEdicao(),
            );
            if (!resultado.ok) return null;
            return lerFichaDaLoja(params.id);
          });
          resposta.setHeader("cache-control", "no-store");
          if (ficha === null) {
            resposta.status(404).json({ erro: "nao_encontrado" });
            return;
          }
          resposta.json(ficha);
        });
      } catch (causa) {
        proximo(causa);
      }
    },
  );

  // ── Tipo de negócio (AC-214, AC-320) ────────────────────────────────────
  // Escrita exclusiva da administração: a credencial das lojas nem tem
  // privilégio sobre a coluna, e a trava 1 já barrou qualquer token de dono.
  const entradaDaTrocaDeTipo = validar(esquemasDaTrocaDeTipo);
  rotas.put(
    "/lojas/:id/tipo-de-negocio",
    entradaDaTrocaDeTipo,
    async (requisicao, resposta, proximo) => {
      try {
        const { params, body } = entradaDaTrocaDeTipo.dados(requisicao);
        await comoAdministrador(resposta, async (administradorId) => {
          const resultado = await acesso().emTransacao(async () => {
            const troca = await alterarTipoDeNegocio(
              params.id,
              body.tipoDeNegocio,
              administradorId,
              repositorioDoTipoDeNegocio(),
            );
            if (!troca.ok) return troca;
            return {
              ok: true as const,
              ficha: await lerFichaDaLoja(params.id),
            };
          });
          resposta.setHeader("cache-control", "no-store");
          if (resultado.ok && resultado.ficha !== null) {
            resposta.json(resultado.ficha);
            return;
          }
          if (!resultado.ok && resultado.motivo === "TIPO_DESCONHECIDO") {
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
          resposta.status(404).json({ erro: "nao_encontrado" });
        });
      } catch (causa) {
        proximo(causa);
      }
    },
  );

  // ── Apelido: o endereço da loja na web (AC-208) ─────────────────────────
  // O antigo fica guardado e continua levando à loja; a vitrine responde, por
  // `endereco-atual`, para onde o link antigo deve ir.
  const entradaDaTrocaDeApelido = validar(esquemasDaTrocaDeApelido);
  rotas.put(
    "/lojas/:id/apelido",
    entradaDaTrocaDeApelido,
    async (requisicao, resposta, proximo) => {
      try {
        const { params, body } = entradaDaTrocaDeApelido.dados(requisicao);
        await comoAdministrador(resposta, async (administradorId) => {
          const sugerir = (base: string) =>
            sugerirApelido(base, repositorioDoCadastro());
          let resultado: Awaited<ReturnType<typeof alterarApelido>>;
          let ficha: Awaited<ReturnType<typeof lerFichaDaLoja>> = null;
          try {
            ({ resultado, ficha } = await acesso().emTransacao(async () => {
              const troca = await alterarApelido(
                params.id,
                body.apelido,
                administradorId,
                { repositorio: repositorioDoApelido(), sugerir },
              );
              return {
                resultado: troca,
                ficha: troca.ok ? await lerFichaDaLoja(params.id) : null,
              };
            }));
          } catch (causa) {
            if (!(causa instanceof ErroDeApelidoTomado)) throw causa;
            // A transação da troca foi desfeita; a sugestão sai de outra.
            const sugestao = await acesso().emTransacao(() =>
              sugerir(body.apelido),
            );
            resultado = { ok: false, motivo: "APELIDO_EM_USO", sugestao };
          }

          resposta.setHeader("cache-control", "no-store");
          if (resultado.ok && ficha !== null) {
            resposta.json(ficha);
            return;
          }
          if (!resultado.ok && resultado.motivo === "APELIDO_EM_USO") {
            resposta.status(409).json({
              erro: "apelido_em_uso",
              campos: [
                {
                  onde: "body",
                  caminho: "apelido",
                  mensagem: MENSAGEM_DE_APELIDO_EM_USO,
                },
              ],
              sugestao: resultado.sugestao,
            });
            return;
          }
          resposta.status(404).json({ erro: "nao_encontrado" });
        });
      } catch (causa) {
        proximo(causa);
      }
    },
  );

  // ── Situação: suspender, reativar, excluir, restaurar (AC-209..AC-211) ─
  // Cada ato muda a situação e entra na trilha numa transação só, e a
  // resposta é a ficha nova — com o ato no topo do histórico. Nada aqui apaga
  // produto ou pedido: é a situação que tira a vitrine do ar (AC-402).

  /** A ficha depois do ato, ou 404 quando a loja não existe. */
  function responderComFicha(
    resposta: Response,
    ficha: Awaited<ReturnType<typeof lerFichaDaLoja>>,
  ): void {
    resposta.setHeader("cache-control", "no-store");
    if (ficha === null) {
      resposta.status(404).json({ erro: "nao_encontrado" });
      return;
    }
    resposta.json(ficha);
  }

  /** Loja excluída não é suspensa nem reativada: ela é restaurada. */
  function recusarExcluida(resposta: Response): void {
    resposta.setHeader("cache-control", "no-store");
    resposta.status(409).json({
      erro: "loja_excluida",
      mensagem:
        "Esta loja está excluída. Para trazê-la de volta, use a restauração, dentro do prazo.",
    });
  }

  const entradaDaSuspensao = validar(esquemasDaSuspensao);
  rotas.put(
    "/lojas/:id/suspensao",
    entradaDaSuspensao,
    async (requisicao, resposta, proximo) => {
      try {
        const { params, body } = entradaDaSuspensao.dados(requisicao);
        await comoAdministrador(resposta, async (administradorId) => {
          const resultado = await acesso().emTransacao(async () => {
            const ato = await suspenderLoja(
              params.id,
              body.motivo,
              administradorId,
              repositorioDaSituacao(),
            );
            return ato.ok
              ? { ato, ficha: await lerFichaDaLoja(params.id) }
              : { ato, ficha: null };
          });
          if (!resultado.ato.ok && resultado.ato.motivo === "EXCLUIDA") {
            recusarExcluida(resposta);
            return;
          }
          responderComFicha(resposta, resultado.ficha);
        });
      } catch (causa) {
        proximo(causa);
      }
    },
  );

  const entradaDaReativacao = validar(esquemasDaReativacao);
  rotas.put(
    "/lojas/:id/reativacao",
    entradaDaReativacao,
    async (requisicao, resposta, proximo) => {
      try {
        const { params } = entradaDaReativacao.dados(requisicao);
        await comoAdministrador(resposta, async (administradorId) => {
          const resultado = await acesso().emTransacao(async () => {
            const ato = await reativarLoja(
              params.id,
              administradorId,
              repositorioDaSituacao(),
              agora(),
            );
            return ato.ok
              ? { ato, ficha: await lerFichaDaLoja(params.id) }
              : { ato, ficha: null };
          });
          if (!resultado.ato.ok && resultado.ato.motivo === "EXCLUIDA") {
            recusarExcluida(resposta);
            return;
          }
          responderComFicha(resposta, resultado.ficha);
        });
      } catch (causa) {
        proximo(causa);
      }
    },
  );

  // A exclusão pede o nome da loja digitado (AC-211): a mesma regra que a
  // tela aplica antes de habilitar o botão, conferida de novo aqui — quem
  // chama a API direto não passa pela tela.
  const entradaDaExclusao = validar(esquemasDaExclusao);
  rotas.delete(
    "/lojas/:id",
    entradaDaExclusao,
    async (requisicao, resposta, proximo) => {
      try {
        const { params, body } = entradaDaExclusao.dados(requisicao);
        await comoAdministrador(resposta, async (administradorId) => {
          const resultado = await acesso().emTransacao(async () => {
            const ato = await excluirLoja(
              {
                lojaId: params.id,
                confirmacao: body.confirmacao,
                administradorId,
              },
              repositorioDaSituacao(),
              agora(),
            );
            return ato.ok
              ? { ato, ficha: await lerFichaDaLoja(params.id) }
              : { ato, ficha: null };
          });
          if (
            !resultado.ato.ok &&
            resultado.ato.motivo === "CONFIRMACAO_DIFERENTE"
          ) {
            resposta.setHeader("cache-control", "no-store");
            resposta.status(422).json({
              erro: "confirmacao_diferente",
              campos: [
                {
                  onde: "body",
                  caminho: "confirmacao",
                  mensagem: MENSAGEM_DE_CONFIRMACAO_DIFERENTE,
                },
              ],
            });
            return;
          }
          responderComFicha(resposta, resultado.ficha);
        });
      } catch (causa) {
        proximo(causa);
      }
    },
  );

  // A restauração devolve a loja excluída, dentro do prazo, à situação de
  // antes da exclusão (AC-211: "reversível por prazo").
  rotas.put(
    "/lojas/:id/restauracao",
    entradaDaReativacao,
    async (requisicao, resposta, proximo) => {
      try {
        const { params } = entradaDaReativacao.dados(requisicao);
        await comoAdministrador(resposta, async (administradorId) => {
          let resultado: {
            readonly ato: Awaited<ReturnType<typeof restaurarLoja>>;
            readonly ficha: Awaited<ReturnType<typeof lerFichaDaLoja>>;
          };
          try {
            resultado = await acesso().emTransacao(async () => {
              const ato = await restaurarLoja(
                params.id,
                administradorId,
                repositorioDaSituacao(),
                agora(),
              );
              return ato.ok
                ? { ato, ficha: await lerFichaDaLoja(params.id) }
                : { ato, ficha: null };
            });
          } catch (causa) {
            if (!(causa instanceof ErroDeApelidoTomado)) throw causa;
            resposta.setHeader("cache-control", "no-store");
            resposta.status(409).json({
              erro: "apelido_em_uso",
              mensagem:
                "O endereço desta loja passou a ser de outra loja. Troque o apelido dela antes de restaurar.",
            });
            return;
          }
          if (!resultado.ato.ok && resultado.ato.motivo === "PRAZO_VENCIDO") {
            resposta.setHeader("cache-control", "no-store");
            resposta.status(409).json({
              erro: "prazo_vencido",
              mensagem:
                "O prazo para restaurar esta loja venceu: os dados dela foram, ou estão sendo, removidos em definitivo.",
            });
            return;
          }
          responderComFicha(resposta, resultado.ficha);
        });
      } catch (causa) {
        proximo(causa);
      }
    },
  );

  // ── Contrato e documentos (AC-203, AC-204, AC-205) ──────────────────────
  // A lista é consulta de dado da loja: fica na trilha como toda consulta
  // (AC-118). O nome, o tamanho, a data e quem enviou aparecem; o arquivo,
  // não — ele só sai pelo link temporário.
  const entradaDosDocumentos = validar(esquemasDosDocumentos);
  rotas.get(
    "/lojas/:id/documentos",
    entradaDosDocumentos,
    async (requisicao, resposta, proximo) => {
      try {
        const { params } = entradaDosDocumentos.dados(requisicao);
        await comoAdministrador(resposta, async (administradorId) => {
          const documentos = await acesso().emTransacao(async () => {
            if ((await lerFichaDaLoja(params.id)) === null) return null;
            await registrarConsultaDaAdministracao({
              lojaId: params.id,
              atorId: administradorId,
              entidade: "store_contracts",
            });
            return listarDocumentos(params.id);
          });
          resposta.setHeader("cache-control", "no-store");
          if (documentos === null) {
            resposta.status(404).json({ erro: "nao_encontrado" });
            return;
          }
          resposta.json({ documentos });
        });
      } catch (causa) {
        proximo(causa);
      }
    },
  );

  // O envio: os bytes chegam crus e são conferidos pelo CONTEÚDO antes de
  // qualquer gravação (AC-204). A leitura do corpo acontece DENTRO do
  // trabalho, depois das duas travas — o token (trava 1) e a tabela de
  // administradores (trava 2): quem não é da administração não faz a API ler
  // dez megabytes.
  const entradaDoEnvio = validar(esquemasDoEnvioDeDocumento);
  rotas.post(
    "/lojas/:id/documentos",
    entradaDoEnvio,
    async (requisicao, resposta, proximo) => {
      try {
        const { params, query } = entradaDoEnvio.dados(requisicao);
        const nome = requisicao.header("x-nome-do-arquivo");
        await comoAdministrador(resposta, async (administradorId) => {
          const lido = await lerBytesDoDocumento(requisicao, resposta);
          if (lido === GRANDE_DEMAIS_PARA_LER) {
            // A mesma recusa que ensina, e não o "corpo grande demais"
            // genérico do leitor.
            resposta.setHeader("cache-control", "no-store");
            resposta.status(413).json({
              erro: "arquivo_recusado",
              motivo: "GRANDE_DEMAIS",
              mensagem: "O arquivo passa do limite de 10 MB. Nada foi gravado.",
            });
            return;
          }
          const bytes = lido;
          let resultado: Awaited<ReturnType<typeof enviarDocumento>>;
          try {
            resultado = await acesso().emTransacao(() =>
              enviarDocumento(
                {
                  lojaId: params.id,
                  tipo: query.tipo,
                  nomeDoArquivo: nome,
                  bytes,
                  administradorId,
                },
                {
                  repositorio: repositorioDosDocumentos(),
                  armazenamento,
                  agora,
                },
              ),
            );
          } catch (causa) {
            if (!(causa instanceof ErroDeArmazenamentoPrivadoIndisponivel)) {
              throw causa;
            }
            resposta.status(503).json({
              erro: "armazenamento_indisponivel",
              mensagem:
                "O envio de documentos ainda não está disponível neste ambiente. Nada foi gravado.",
            });
            return;
          }
          resposta.setHeader("cache-control", "no-store");
          if (resultado.ok) {
            resposta.status(201).json({ documento: resultado.documento });
            return;
          }
          if (resultado.motivo === "NAO_ENCONTRADA") {
            resposta.status(404).json({ erro: "nao_encontrado" });
            return;
          }
          const status = {
            TIPO_NAO_PERMITIDO: 415,
            GRANDE_DEMAIS: 413,
            VAZIO: 400,
          }[resultado.motivo];
          resposta.status(status).json({
            erro: "arquivo_recusado",
            motivo: resultado.motivo,
            mensagem: resultado.mensagem,
          });
        });
      } catch (causa) {
        proximo(causa);
      }
    },
  );

  // O link temporário, gerado no clique (AC-203): diz qual documento, de qual
  // loja, para quem e até quando — e vem assinado.
  const entradaDoLink = validar(esquemasDoLinkDoDocumento);
  rotas.post(
    "/lojas/:id/documentos/:documentoId/link",
    entradaDoLink,
    async (requisicao, resposta, proximo) => {
      try {
        const { params } = entradaDoLink.dados(requisicao);
        await comoAdministrador(resposta, async (administradorId) => {
          const documento = await acesso().emTransacao(() =>
            lerDocumento(params.id, params.documentoId),
          );
          resposta.setHeader("cache-control", "no-store");
          if (documento === null) {
            resposta.status(404).json({ erro: "nao_encontrado" });
            return;
          }
          const expiraEm = agora().getTime() + PRAZO_DO_LINK_EM_MS;
          const link = assinarLink(
            {
              documentoId: documento.id,
              lojaId: params.id,
              administradorId,
              expiraEm,
            },
            chaveDosLinks(segredoDasSessoes()),
          );
          resposta.status(201).json({
            link: `/v1/admin/arquivos/${link}`,
            expiraEm: new Date(expiraEm).toISOString(),
          });
        });
      } catch (causa) {
        proximo(causa);
      }
    },
  );

  // A entrega do arquivo. Só com a sessão da administração (as duas travas
  // valem aqui como em toda rota), só com link válido e no prazo, e só para
  // quem o gerou (AC-205). Toda abertura fica na trilha, destacada.
  const entradaDoArquivo = validar(esquemasDoArquivo);
  rotas.get(
    "/arquivos/:link",
    entradaDoArquivo,
    async (requisicao, resposta, proximo) => {
      try {
        const { params } = entradaDoArquivo.dados(requisicao);
        await comoAdministrador(resposta, async (administradorId) => {
          resposta.setHeader("cache-control", "no-store");
          const conferido = conferirLink(
            params.link,
            chaveDosLinks(segredoDasSessoes()),
            agora().getTime(),
          );
          if (!conferido.ok) {
            if (conferido.motivo === "EXPIRADO") {
              resposta.status(410).json({
                erro: "link_expirado",
                mensagem:
                  "Este link venceu. Abra o documento de novo pela ficha da loja.",
              });
              return;
            }
            resposta.status(404).json({ erro: "nao_encontrado" });
            return;
          }
          const { conteudo } = conferido;
          if (conteudo.administradorId !== administradorId) {
            resposta.status(403).json({
              erro: "acesso_negado",
              mensagem:
                "Este link foi gerado para outra pessoa. Abra o documento pela ficha da loja.",
            });
            return;
          }

          let arquivo: Awaited<ReturnType<ArmazenamentoPrivado["ler"]>>;
          let nomeDoArquivo = "documento";
          try {
            arquivo = await acesso().emTransacao(async () => {
              const documento = await lerDocumento(
                conteudo.lojaId,
                conteudo.documentoId,
              );
              if (documento === null) return null;
              const lido = await armazenamento.ler(documento.chave);
              if (lido === null) return null;
              nomeDoArquivo = documento.nomeDoArquivo;
              await registrarAberturaDoDocumento({
                lojaId: conteudo.lojaId,
                atorId: administradorId,
                documento,
              });
              return lido;
            });
          } catch (causa) {
            if (!(causa instanceof ErroDeArmazenamentoPrivadoIndisponivel)) {
              throw causa;
            }
            resposta.status(503).json({
              erro: "armazenamento_indisponivel",
              mensagem:
                "O armazenamento de documentos não está disponível neste ambiente.",
            });
            return;
          }
          if (arquivo === null) {
            resposta.status(404).json({ erro: "nao_encontrado" });
            return;
          }
          // Sai como ANEXO, com o tipo conferido na entrada, e sem o
          // navegador adivinhar outro: nada deste arquivo roda na página.
          resposta.setHeader("content-type", arquivo.tipoDeConteudo);
          resposta.setHeader(
            "content-disposition",
            disposicaoDeAnexo(nomeDoArquivo),
          );
          resposta.setHeader("x-content-type-options", "nosniff");
          resposta.setHeader(
            "content-security-policy",
            "default-src 'none'; sandbox",
          );
          resposta.status(200).send(Buffer.from(arquivo.bytes));
        });
      } catch (causa) {
        proximo(causa);
      }
    },
  );

  // ── Funcionalidades liberadas por loja (AC-212, AC-213) ─────────────────
  montarRotasDasFuncionalidades(rotas, { acesso, comoAdministrador });
  // Aprovação de loja e limites (card #25).
  montarRotasDaAprovacao(rotas, { acesso, agora, comoAdministrador });
  // Métricas e equipe por loja, e as contas (card #29).
  montarRotasDaGestao(rotas, { acesso, agora, comoAdministrador });
  // Pessoas: lista, ficha, cadastro, edição, desativação e link (card #170).
  montarRotasDePessoas(rotas, {
    acesso,
    agora,
    comoAdministrador,
    gerarToken:
      opcoes.gerarTokenDeAcesso ??
      (() => randomBytes(32).toString("base64url")),
    resumirToken:
      opcoes.resumirTokenDeAcesso ??
      ((token) => createHash("sha256").update(token).digest("hex")),
    enviarAcesso: opcoes.enviarAcessoDaPessoa ?? (() => Promise.resolve(false)),
  });
  // Donos e equipes: pôr, trocar e tirar vínculos (card #170, T-4).
  montarRotasDosVinculos(rotas, { acesso, agora, comoAdministrador });
  for (const montar of opcoes.rotasDeOutrosModulos ?? []) {
    montar(rotas, { acesso, comoAdministrador });
  }

  return rotas;
}
