/**
 * A conta do cliente, por dentro (card #35): dados cadastrais, senha, sessões
 * abertas, app autenticador e exclusão da conta.
 *
 *   GET    /v1/conta/metricas?de=&ate=      — métricas do cliente em todas as lojas
 *   GET    /v1/conta/dados                  — nome, e-mail, telefone, CPF, ofertas
 *   PATCH  /v1/conta/dados                  — troca nome, telefone, CPF, ofertas
 *   POST   /v1/conta/senha                  — troca a senha (pede a atual)
 *   GET    /v1/conta/sessoes                — onde a conta está conectada
 *   DELETE /v1/conta/sessoes/:id            — encerra uma dessas conexões
 *   POST   /v1/conta/aplicativo/desativar   — desliga o app autenticador (pede a senha)
 *   GET    /v1/conta/aceites                — o que falta aceitar e o histórico (privacidade.ts)
 *   POST   /v1/conta/aceites                — registra o aceite de versão nova
 *   POST   /v1/conta/privacidade/exportar   — arquivo com os dados (pede a senha)
 *   POST   /v1/conta/excluir                — anonimiza a conta (senha + EXCLUIR)
 *
 * O e-mail NÃO muda aqui: ele é a chave da conta e do login, e trocá-lo sem
 * confirmar a posse do novo endereço abriria a conta a quem tem a sessão
 * aberta num aparelho emprestado. A tela explica isso.
 *
 * Tudo corre SEM loja no contexto, com a identidade da sessão: as políticas de
 * `identities` e `sessions` deixam a pessoa ver e mexer só no que é dela.
 */
import { Router, type Request, type Response } from "express";
import { z } from "zod";

import { esquemaDaConsultaDeMetricasDaConta } from "@simpleclick/contracts";

import { executarComoRequisicao } from "../../core/contexto.ts";
import { banco, type AcessoAoBanco, type TransacaoDoBanco } from "../../core/db.ts";

import { montarRotasDaPrivacidade } from "./privacidade.ts";
import {
  calcularMetricasDaConta,
  hojeNasMetricas,
  somarDiasIso,
} from "./metricas.ts";

/** O maior intervalo que a tela pode pedir (um ano e meio). */
const MAXIMO_DE_DIAS_DAS_METRICAS = 550;

export interface ContaDaSessao {
  readonly identidadeId: string;
  /** A família do token de renovação desta sessão: é a "conexão atual". */
  readonly familiaId: string;
}

export interface OpcoesDaContaInterna {
  readonly acesso?: AcessoAoBanco;
  readonly autenticar: (requisicao: Request) => ContaDaSessao | null;
  /** A derivação e a política de senha moram na identidade: chegam daqui de fora. */
  readonly derivarSenha: (senha: string) => Promise<string>;
  readonly senhaConfere: (senha: string, derivada: string) => Promise<boolean>;
  /** Os problemas da senha nova; vazio quando ela serve. */
  readonly problemasDaSenha: (senha: string) => readonly string[];
}

const soDigitos = (valor: string): string => valor.replace(/\D/g, "");

/** CPF: 11 dígitos com os dois verificadores conferidos. */
export function cpfValido(cpf: string): boolean {
  if (!/^\d{11}$/.test(cpf) || /^(\d)\1{10}$/.test(cpf)) return false;
  const digito = (tamanho: number): number => {
    let soma = 0;
    for (let i = 0; i < tamanho; i += 1) {
      soma += Number(cpf[i]) * (tamanho + 1 - i);
    }
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };
  return digito(9) === Number(cpf[9]) && digito(10) === Number(cpf[10]);
}

const esquemaDosDados = z.strictObject({
  nome: z.string().trim().min(2).max(120).optional(),
  telefone: z
    .string()
    .trim()
    .max(32)
    .nullable()
    .optional()
    .transform((v) => (v === undefined || v === null ? v : soDigitos(v))),
  cpf: z
    .string()
    .trim()
    .max(20)
    .nullable()
    .optional()
    .transform((v) => (v === undefined || v === null ? v : soDigitos(v))),
  aceitaOfertas: z.boolean().optional(),
});

const esquemaDaSenha = z.strictObject({
  atual: z.string().min(1).max(200),
  nova: z.string().min(1).max(200),
});
const esquemaDaConfirmacao = z.strictObject({ senha: z.string().min(1).max(200) });
const esquemaDaSessao = z.object({ id: z.uuid() });

interface LinhaDaIdentidade {
  readonly id: string;
  readonly email_norm: string;
  readonly display_name: string | null;
  readonly phone_e164: string | null;
  readonly cpf: string | null;
  readonly accepts_offers: boolean;
  readonly created_at: Date;
  readonly password_hash: string | null;
}

function erro(resposta: Response, status: number, codigo: string): void {
  resposta.status(status).json({ erro: codigo });
}

async function lerIdentidade(tx: TransacaoDoBanco): Promise<LinhaDaIdentidade | null> {
  const [linha] = await tx.$queryRaw<LinhaDaIdentidade[]>`
    SELECT id::text AS id, email_norm, display_name, phone_e164, cpf,
           accepts_offers, created_at, password_hash
      FROM app.identities
     WHERE id = app.current_user_id() AND anonymized_at IS NULL`;
  return linha ?? null;
}

async function dadosDaConta(tx: TransacaoDoBanco) {
  const linha = await lerIdentidade(tx);
  if (linha === null) return null;
  const [totp] = await tx.$queryRaw<{ ativo: boolean }[]>`
    SELECT EXISTS (
             SELECT 1 FROM app.totp_credentials
              WHERE identity_id = app.current_user_id()
                AND confirmed_at IS NOT NULL AND disabled_at IS NULL) AS ativo`;
  return {
    id: linha.id,
    nome: linha.display_name,
    email: linha.email_norm,
    telefone: linha.phone_e164,
    cpf: linha.cpf,
    aceitaOfertas: linha.accepts_offers,
    criadaEm: linha.created_at.toISOString(),
    temSenha: linha.password_hash !== null,
    aplicativoAutenticador: totp?.ativo === true,
  };
}

export function criarRotasDaContaInterna(opcoes: OpcoesDaContaInterna): Router {
  const rotas = Router();
  const acesso = (): AcessoAoBanco => opcoes.acesso ?? banco();

  function comoConta<T>(conta: ContaDaSessao, acao: (tx: TransacaoDoBanco) => Promise<T>) {
    return executarComoRequisicao(
      { usuarioId: conta.identidadeId, papel: "CUSTOMER" },
      () => acesso().emTransacao(acao),
    );
  }

  /** Dado pessoal: sem cache; sem sessão, 401. */
  function exigir(requisicao: Request, resposta: Response): ContaDaSessao | null {
    resposta.set("cache-control", "no-store");
    const conta = opcoes.autenticar(requisicao);
    if (conta === null) {
      erro(resposta, 401, "nao_autenticado");
      return null;
    }
    return conta;
  }

  const protegido = (
    manipulador: (
      conta: ContaDaSessao,
      requisicao: Request,
      resposta: Response,
    ) => Promise<void>,
  ) =>
    async (requisicao: Request, resposta: Response, proximo: (e?: unknown) => void) => {
      try {
        const conta = exigir(requisicao, resposta);
        if (conta === null) return;
        await manipulador(conta, requisicao, resposta);
      } catch (causa) {
        proximo(causa);
      }
    };

  /** Confere a senha da própria conta; responde o erro e devolve false se não bater. */
  async function senhaDaContaConfere(
    conta: ContaDaSessao,
    senha: string,
    resposta: Response,
  ): Promise<boolean> {
    const linha = await comoConta(conta, lerIdentidade);
    if (linha === null) {
      erro(resposta, 401, "nao_autenticado");
      return false;
    }
    if (linha.password_hash === null || !(await opcoes.senhaConfere(senha, linha.password_hash))) {
      erro(resposta, 403, "senha_incorreta");
      return false;
    }
    return true;
  }

  rotas.get(
    "/dados",
    protegido(async (conta, _requisicao, resposta) => {
      const dados = await comoConta(conta, dadosDaConta);
      if (dados === null) return erro(resposta, 401, "nao_autenticado");
      resposta.json(dados);
    }),
  );

  rotas.patch(
    "/dados",
    protegido(async (conta, requisicao, resposta) => {
      const lido = esquemaDosDados.safeParse(requisicao.body);
      if (!lido.success) return erro(resposta, 422, "dados_invalidos");
      const { nome, telefone, cpf, aceitaOfertas } = lido.data;
      if (telefone !== undefined && telefone !== null && telefone !== "" && !/^\d{10,13}$/.test(telefone)) {
        return erro(resposta, 422, "telefone_invalido");
      }
      if (cpf !== undefined && cpf !== null && cpf !== "" && !cpfValido(cpf)) {
        return erro(resposta, 422, "cpf_invalido");
      }
      const dados = await comoConta(conta, async (tx) => {
        if (nome !== undefined) {
          await tx.$executeRaw`
            UPDATE app.identities SET display_name = ${nome}
             WHERE id = app.current_user_id()`;
        }
        if (telefone !== undefined) {
          const valor = telefone === null || telefone === "" ? null : `+${telefone.startsWith("55") ? telefone : `55${telefone}`}`;
          await tx.$executeRaw`
            UPDATE app.identities SET phone_e164 = ${valor}
             WHERE id = app.current_user_id()`;
        }
        if (cpf !== undefined) {
          const valor = cpf === null || cpf === "" ? null : cpf;
          await tx.$executeRaw`
            UPDATE app.identities SET cpf = ${valor}
             WHERE id = app.current_user_id()`;
        }
        if (aceitaOfertas !== undefined) {
          await tx.$executeRaw`
            UPDATE app.identities SET accepts_offers = ${aceitaOfertas}
             WHERE id = app.current_user_id()`;
        }
        return dadosDaConta(tx);
      });
      if (dados === null) return erro(resposta, 401, "nao_autenticado");
      resposta.json(dados);
    }),
  );

  rotas.get(
    "/metricas",
    protegido(async (conta, requisicao, resposta) => {
      const consulta = esquemaDaConsultaDeMetricasDaConta.safeParse(requisicao.query);
      if (!consulta.success) return erro(resposta, 422, "periodo_invalido");
      const ate = consulta.data.ate ?? hojeNasMetricas(new Date());
      const de = consulta.data.de ?? somarDiasIso(ate, -29);
      const dias = (Date.parse(ate) - Date.parse(de)) / 86_400_000;
      if (Number.isNaN(dias) || dias < 0 || dias > MAXIMO_DE_DIAS_DAS_METRICAS) {
        return erro(resposta, 422, "periodo_invalido");
      }
      const { pedidos, itens } = await comoConta(conta, async (tx) => ({
        pedidos: await tx.$queryRaw<
          { order_id: string; store_slug: string; store_name: string; status: string; fulfillment: string; total_cents: bigint | number; placed_at: Date }[]
        >`SELECT order_id::text AS order_id, store_slug, store_name, status,
                 fulfillment, total_cents, placed_at FROM app.meus_pedidos()`,
        itens: await tx.$queryRaw<
          { order_id: string; product_name: string; quantity: number; line_total_cents: bigint | number }[]
        >`SELECT order_id::text AS order_id, product_name, quantity,
                 line_total_cents FROM app.meus_itens_de_pedidos()`,
      }));
      resposta.json(
        calcularMetricasDaConta(
          pedidos.map((p) => ({
            id: p.order_id,
            lojaApelido: p.store_slug,
            lojaNome: p.store_name,
            status: p.status,
            entrega: p.fulfillment,
            totalCentavos: Number(p.total_cents),
            criadoEm: p.placed_at,
          })),
          itens.map((i) => ({
            pedidoId: i.order_id,
            produto: i.product_name,
            quantidade: i.quantity,
            totalCentavos: Number(i.line_total_cents),
          })),
          de,
          ate,
        ),
      );
    }),
  );

  rotas.post(
    "/senha",
    protegido(async (conta, requisicao, resposta) => {
      const lido = esquemaDaSenha.safeParse(requisicao.body);
      if (!lido.success) return erro(resposta, 422, "dados_invalidos");
      if (!(await senhaDaContaConfere(conta, lido.data.atual, resposta))) return;
      const problemas = opcoes.problemasDaSenha(lido.data.nova);
      if (problemas.length > 0) {
        resposta
          .status(422)
          .json({ erro: "senha_fraca", mensagem: problemas.join(" ") });
        return;
      }
      const derivada = await opcoes.derivarSenha(lido.data.nova);
      await comoConta(conta, async (tx) => {
        await tx.$executeRaw`
          UPDATE app.identities SET password_hash = ${derivada}
           WHERE id = app.current_user_id()`;
        // As outras conexões caem; a atual continua.
        await tx.$executeRaw`
          UPDATE app.sessions
             SET revoked_at = now(), revoked_reason = 'PASSWORD_CHANGED'
           WHERE identity_id = app.current_user_id()
             AND revoked_at IS NULL
             AND family_id <> ${conta.familiaId}::uuid`;
      });
      resposta.status(204).end();
    }),
  );

  rotas.get(
    "/sessoes",
    protegido(async (conta, _requisicao, resposta) => {
      const linhas = await comoConta(conta, (tx) =>
        tx.$queryRaw<
          { family_id: string; client_kind: string; issued_at: Date; first_at: Date }[]
        >`
          SELECT s.family_id::text AS family_id, s.client_kind, s.issued_at,
                 (SELECT min(f.issued_at) FROM app.sessions f
                   WHERE f.family_id = s.family_id) AS first_at
            FROM app.sessions s
           WHERE s.identity_id = app.current_user_id()
             AND s.revoked_at IS NULL AND s.used_at IS NULL
             AND s.expires_at > now()
           ORDER BY s.issued_at DESC`,
      );
      resposta.json({
        sessoes: linhas.map((l) => ({
          id: l.family_id,
          tipo: l.client_kind === "NATIVE" ? "aplicativo" : "navegador",
          iniciadaEm: l.first_at.toISOString(),
          ultimoAcessoEm: l.issued_at.toISOString(),
          atual: l.family_id === conta.familiaId,
        })),
      });
    }),
  );

  rotas.delete(
    "/sessoes/:id",
    protegido(async (conta, requisicao, resposta) => {
      const parametros = esquemaDaSessao.safeParse(requisicao.params);
      if (!parametros.success) return erro(resposta, 404, "nao_encontrado");
      const { id } = parametros.data;
      if (id === conta.familiaId) return erro(resposta, 409, "sessao_atual");
      const encerradas = await comoConta(conta, (tx) =>
        tx.$executeRaw`
          UPDATE app.sessions
             SET revoked_at = now(), revoked_reason = 'LOGOUT'
           WHERE family_id = ${id}::uuid AND revoked_at IS NULL`,
      );
      if (encerradas === 0) return erro(resposta, 404, "nao_encontrado");
      resposta.status(204).end();
    }),
  );

  rotas.post(
    "/aplicativo/desativar",
    protegido(async (conta, requisicao, resposta) => {
      const lido = esquemaDaConfirmacao.safeParse(requisicao.body);
      if (!lido.success) return erro(resposta, 422, "dados_invalidos");
      if (!(await senhaDaContaConfere(conta, lido.data.senha, resposta))) return;
      await comoConta(conta, (tx) =>
        tx.$executeRaw`
          UPDATE app.totp_credentials SET disabled_at = now()
           WHERE identity_id = app.current_user_id() AND disabled_at IS NULL`,
      );
      resposta.status(204).end();
    }),
  );

  // Aceites, exportação e exclusão da conta (card #79).
  montarRotasDaPrivacidade(rotas, { comoConta, protegido, senhaDaContaConfere });

  return rotas;
}
