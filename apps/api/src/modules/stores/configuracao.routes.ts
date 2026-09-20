/**
 * Configuração da loja para o ambiente local (T-904, T-905).
 *
 * A rota já usa o mesmo isolamento das rotas públicas: primeiro resolve o
 * apelido sem contexto e depois abre uma nova transação com loja, identidade e
 * papel definidos. O login de produção ainda será conectado à persistência de
 * sessões; por isso a composição desta primeira fatia é mantida sob a
 * autorização Bearer do usuário de desenvolvimento.
 */
import { Router, type Request, type Response } from "express";
import { z } from "zod";

import { executarComoRequisicao } from "../../core/contexto.ts";
import { banco, type AcessoAoBanco } from "../../core/db.ts";

const esquemaDaAparencia = z.strictObject({
  boasVindas: z.string().trim().max(280).nullable(),
  logo: z.string().trim().url().max(1_000).nullable(),
  capa: z.string().trim().url().max(1_000).nullable(),
  corPrimaria: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .nullable(),
});

const esquemaDoContato = z.strictObject({
  numero: z.string().trim().min(10).max(30),
  saudacao: z.string().trim().min(1).max(280),
});

export interface ChegadaNaLoja {
  readonly host?: string | null;
  readonly apelido?: string | null;
}

export type IdentificacaoDaLoja =
  | { readonly encontrada: true; readonly id: string }
  | { readonly encontrada: false };

function objeto(valor: unknown): Record<string, unknown> {
  return typeof valor === "object" && valor !== null && !Array.isArray(valor)
    ? (valor as Record<string, unknown>)
    : {};
}

function texto(valor: unknown): string | null {
  return typeof valor === "string" && valor.trim() !== "" ? valor : null;
}

function normalizarNumero(numero: string): string {
  const digitos = numero.replace(/\D/g, "");
  if (
    digitos.startsWith("55") &&
    (digitos.length === 12 || digitos.length === 13)
  ) {
    return digitos;
  }
  if (digitos.length === 10 || digitos.length === 11) return `55${digitos}`;
  throw new Error("Informe um WhatsApp brasileiro com DDD válido.");
}

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
}

export function criarRotasDasConfiguracoes(
  opcoes: OpcoesDasConfiguracoes,
): Router {
  const rotas = Router();
  const acesso = opcoes.acesso ?? banco();
  const { autenticar, resolverLoja } = opcoes;

  rotas.use((requisicao, resposta, proximo) => {
    const usuario = autenticar(requisicao);
    if (usuario === null) {
      erro(resposta, 401, "nao_autenticado");
      return;
    }
    resposta.locals.usuario = usuario;
    proximo();
  });

  async function comLoja(
    apelido: string,
    resposta: Response,
    executar: (lojaId: string, usuario: UsuarioAutenticado) => Promise<void>,
  ) {
    const identificacao = await resolver(acesso, { apelido }, resolverLoja);
    if (!identificacao.encontrada) {
      erro(resposta, 404, "nao_encontrado");
      return;
    }
    await executar(identificacao.id, resposta.locals.usuario);
  }

  rotas.get(
    "/:apelido/configuracao/aparencia",
    async (requisicao, resposta, proximo) => {
      try {
        await comLoja(
          requisicao.params.apelido,
          resposta,
          async (lojaId, usuario) => {
            const configuracao = await executarComoRequisicao(
              { lojaId, usuarioId: usuario.identidadeId, papel: usuario.papel },
              () =>
                acesso.emTransacao((tx) =>
                  tx.storeSettings.findUnique({
                    where: { storeId: lojaId },
                    select: { landing: true, theme: true },
                  }),
                ),
            );
            const landing = objeto(configuracao?.landing);
            const theme = objeto(configuracao?.theme);
            resposta.json({
              boasVindas: texto(landing.boasVindas),
              logo: texto(landing.logo),
              capa: texto(landing.capa),
              corPrimaria: texto(theme.primaria),
            });
          },
        );
      } catch (causa) {
        proximo(causa);
      }
    },
  );

  rotas.put(
    "/:apelido/configuracao/aparencia",
    async (requisicao, resposta, proximo) => {
      try {
        const entrada = esquemaDaAparencia.safeParse(requisicao.body);
        if (!entrada.success) {
          erro(resposta, 400, "entrada_invalida");
          return;
        }
        await comLoja(
          requisicao.params.apelido,
          resposta,
          async (lojaId, usuario) => {
            await executarComoRequisicao(
              { lojaId, usuarioId: usuario.identidadeId, papel: usuario.papel },
              () =>
                acesso.emTransacao(
                  (tx) => tx.$executeRaw`
            UPDATE app.store_settings
            SET landing = landing || ${JSON.stringify({ boasVindas: entrada.data.boasVindas, logo: entrada.data.logo, capa: entrada.data.capa })}::jsonb,
                theme = theme || ${JSON.stringify({ primaria: entrada.data.corPrimaria })}::jsonb,
                updated_at = now()
            WHERE store_id = ${lojaId}
          `,
                ),
            );
            resposta.status(204).end();
          },
        );
      } catch (causa) {
        proximo(causa);
      }
    },
  );

  rotas.get(
    "/:apelido/configuracao/contato",
    async (requisicao, resposta, proximo) => {
      try {
        await comLoja(
          requisicao.params.apelido,
          resposta,
          async (lojaId, usuario) => {
            const configuracao = await executarComoRequisicao(
              { lojaId, usuarioId: usuario.identidadeId, papel: usuario.papel },
              () =>
                acesso.emTransacao((tx) =>
                  tx.storeSettings.findUnique({
                    where: { storeId: lojaId },
                    select: { whatsapp: true },
                  }),
                ),
            );
            const whatsapp = objeto(configuracao?.whatsapp);
            resposta.json({
              numero: texto(whatsapp.numero),
              saudacao: texto(whatsapp.saudacao) ?? "Olá! Segue meu pedido:",
            });
          },
        );
      } catch (causa) {
        proximo(causa);
      }
    },
  );

  rotas.put(
    "/:apelido/configuracao/contato",
    async (requisicao, resposta, proximo) => {
      try {
        const entrada = esquemaDoContato.safeParse(requisicao.body);
        if (!entrada.success) {
          erro(resposta, 400, "entrada_invalida");
          return;
        }
        const numero = normalizarNumero(entrada.data.numero);
        await comLoja(
          requisicao.params.apelido,
          resposta,
          async (lojaId, usuario) => {
            await executarComoRequisicao(
              { lojaId, usuarioId: usuario.identidadeId, papel: usuario.papel },
              () =>
                acesso.emTransacao(
                  (tx) => tx.$executeRaw`
            UPDATE app.store_settings
            SET whatsapp = whatsapp || ${JSON.stringify({ numero, saudacao: entrada.data.saudacao })}::jsonb,
                updated_at = now()
            WHERE store_id = ${lojaId}
          `,
                ),
            );
            resposta.status(204).end();
          },
        );
      } catch (causa) {
        if (
          causa instanceof Error &&
          causa.message.includes("WhatsApp brasileiro")
        ) {
          erro(resposta, 400, "whatsapp_invalido");
          return;
        }
        proximo(causa);
      }
    },
  );

  return rotas;
}
