/**
 * Direitos do titular (LGPD art. 18, card #79), dentro da conta:
 *
 *   GET  /v1/conta/aceites                  — o que falta aceitar e o histórico
 *   POST /v1/conta/aceites                  — registra o aceite de versão nova
 *   POST /v1/conta/privacidade/exportar     — arquivo com os dados da conta
 *   POST /v1/conta/excluir                  — anonimiza a conta
 *
 * Exportar e excluir pedem a senha; excluir pede também a palavra EXCLUIR.
 * Exportar tem limite (3 por hora por conta): o arquivo junta dados de várias
 * lojas e não é para ser baixado em laço. Todo pedido do titular (exportação,
 * exclusão pedida, bloqueada ou concluída) vai para a trilha da plataforma.
 *
 * A exclusão é UMA função do banco (`app.anonimizar_minha_conta`, migração
 * 0073): pedidos ficam como registro fiscal/financeiro da loja, sem dado
 * pessoal; dono de loja não exclui (409 `tem_loja`) — transfere ou encerra a
 * loja antes. É a mesma rota que a tela de segurança já usava.
 */
import {
  esquemaDaExclusaoDaConta,
  esquemaDoNovoAceite,
  esquemaDoPedidoDeExportacao,
  VERSAO_DOS_DOCUMENTOS_LEGAIS,
} from "@simpleclick/contracts";
import type { Request, RequestHandler, Response, Router } from "express";

import type { TransacaoDoBanco } from "../../core/db.ts";

import { origemDoAceite, registrarAceites, situacaoDosAceites } from "../../core/aceites-legais.ts";

/** A conta da sessão, como `criarRotasDaContaInterna` a entrega. */
export interface ContaDaPrivacidade {
  readonly identidadeId: string;
  readonly familiaId: string;
}

/** O que `criarRotasDaContaInterna` empresta a este arquivo. */
export interface ApoioDaPrivacidade {
  readonly comoConta: <T>(
    conta: ContaDaPrivacidade,
    acao: (tx: TransacaoDoBanco) => Promise<T>,
  ) => Promise<T>;
  readonly protegido: (
    manipulador: (
      conta: ContaDaPrivacidade,
      requisicao: Request,
      resposta: Response,
    ) => Promise<void>,
  ) => RequestHandler;
  readonly senhaDaContaConfere: (
    conta: ContaDaPrivacidade,
    senha: string,
    resposta: Response,
  ) => Promise<boolean>;
}

const EXPORTACOES_POR_HORA = 3;
const UMA_HORA_EM_MS = 3_600_000;

/** Exportações recentes por conta (memória do processo, como os outros limites simples da API). */
const exportacoes = new Map<string, number[]>();

/** Registra uma exportação; `false` quando a conta já passou do limite. */
export function podeExportar(identidadeId: string, agora = Date.now()): boolean {
  const recentes = (exportacoes.get(identidadeId) ?? []).filter(
    (t) => agora - t < UMA_HORA_EM_MS,
  );
  if (recentes.length >= EXPORTACOES_POR_HORA) {
    exportacoes.set(identidadeId, recentes);
    return false;
  }
  recentes.push(agora);
  if (exportacoes.size > 5_000) exportacoes.clear();
  exportacoes.set(identidadeId, recentes);
  return true;
}

/** Zera o limite (só os testes usam). */
export function reiniciarLimiteDeExportacao(): void {
  exportacoes.clear();
}

/** Uma célula de CSV: aspas dobradas, e sem fórmula (`=`, `+`, `-`, `@`) para planilha. */
export function celulaCsv(valor: unknown): string {
  let texto = valor === null || valor === undefined ? "" : String(valor);
  if (/^[=+\-@\t\r]/.test(texto)) texto = `'${texto}`;
  return /[",\n\r;]/.test(texto) ? `"${texto.replaceAll('"', '""')}"` : texto;
}

interface PedidoExportado {
  readonly loja: string;
  readonly lojaApelido: string;
  readonly numero: number;
  readonly codigo: string;
  readonly status: string;
  readonly entrega: string;
  readonly totalCentavos: number;
  readonly feitoEm: string;
  readonly itens: readonly {
    readonly produto: string;
    readonly quantidade: number;
    readonly totalCentavos: number;
  }[];
}

/** O CSV dos pedidos: uma linha por pedido, separador `;`, com BOM para o Excel. */
export function csvDosPedidos(pedidos: readonly PedidoExportado[]): string {
  const cabecalho = [
    "Pedido", "Código", "Loja", "Situação", "Entrega", "Total (R$)", "Feito em", "Itens",
  ];
  const linhas = pedidos.map((p) =>
    [
      p.numero,
      p.codigo,
      p.loja,
      p.status,
      p.entrega,
      (p.totalCentavos / 100).toFixed(2).replace(".", ","),
      p.feitoEm,
      p.itens.map((i) => `${i.quantidade}x ${i.produto}`).join(" | "),
    ]
      .map(celulaCsv)
      .join(";"),
  );
  return `\uFEFF${[cabecalho.map(celulaCsv).join(";"), ...linhas].join("\r\n")}\r\n`;
}

async function juntarOsDados(tx: TransacaoDoBanco) {
  const [conta] = await tx.$queryRaw<
    {
      id: string; email_norm: string; display_name: string | null;
      phone_e164: string | null; cpf: string | null; accepts_offers: boolean;
      created_at: Date;
    }[]
  >`SELECT id::text AS id, email_norm, display_name, phone_e164, cpf,
           accepts_offers, created_at
      FROM app.identities
     WHERE id = app.current_user_id() AND anonymized_at IS NULL`;
  if (conta === undefined) return null;

  const enderecos = await tx.$queryRaw<
    {
      label: string | null; recipient_name: string | null; street: string;
      number: string | null; complement: string | null; neighborhood: string | null;
      city: string | null; uf: string | null; zip: string | null;
      reference_point: string | null; is_default: boolean; created_at: Date;
    }[]
  >`SELECT label, recipient_name, street, number, complement, neighborhood,
           city, uf::text AS uf, zip, reference_point, is_default, created_at
      FROM app.customer_addresses
     WHERE identity_id = app.current_user_id()
     ORDER BY is_default DESC, created_at`;

  const pedidosBrutos = await tx.$queryRaw<
    {
      order_id: string; store_name: string; store_slug: string; number: bigint | number;
      code: string; status: string; fulfillment: string; total_cents: bigint | number;
      placed_at: Date;
    }[]
  >`SELECT order_id::text AS order_id, store_name, store_slug, number, code, status,
           fulfillment, total_cents, placed_at
      FROM app.meus_pedidos() ORDER BY placed_at DESC`;
  const itens = await tx.$queryRaw<
    { order_id: string; product_name: string; quantity: number; line_total_cents: bigint | number }[]
  >`SELECT order_id::text AS order_id, product_name, quantity, line_total_cents
      FROM app.meus_itens_de_pedidos()`;
  const pedidos: PedidoExportado[] = pedidosBrutos.map((p) => ({
    loja: p.store_name,
    lojaApelido: p.store_slug,
    numero: Number(p.number),
    codigo: p.code,
    status: p.status,
    entrega: p.fulfillment,
    totalCentavos: Number(p.total_cents),
    feitoEm: p.placed_at.toISOString(),
    itens: itens
      .filter((i) => i.order_id === p.order_id)
      .map((i) => ({
        produto: i.product_name,
        quantidade: i.quantity,
        totalCentavos: Number(i.line_total_cents),
      })),
  }));

  const [nasLojas] = await tx.$queryRaw<{ dados: Record<string, unknown> | null }[]>`
    SELECT app.meus_dados_nas_lojas() AS dados`;

  const aceites = await situacaoDosAceites(tx);

  return {
    conta: {
      id: conta.id,
      nome: conta.display_name,
      email: conta.email_norm,
      telefone: conta.phone_e164,
      cpf: conta.cpf,
      aceitaOfertas: conta.accepts_offers,
      criadaEm: conta.created_at.toISOString(),
    },
    enderecos: enderecos.map((e) => ({
      apelido: e.label,
      destinatario: e.recipient_name,
      rua: e.street,
      numero: e.number,
      complemento: e.complement,
      bairro: e.neighborhood,
      cidade: e.city,
      uf: e.uf,
      cep: e.zip,
      referencia: e.reference_point,
      padrao: e.is_default,
      criadoEm: e.created_at.toISOString(),
    })),
    pedidos,
    nasLojas: nasLojas?.dados ?? {},
    aceites: aceites.historico,
    aceitesPendentes: aceites.pendentes,
  };
}

export function montarRotasDaPrivacidade(
  rotas: Router,
  apoio: ApoioDaPrivacidade,
  opcoes: { readonly segredoDaPonte?: string | undefined } = {},
): void {
  const erro = (resposta: Response, status: number, codigo: string, mensagem?: string): void => {
    resposta.status(status).json(mensagem === undefined ? { erro: codigo } : { erro: codigo, mensagem });
  };
  const protegido = apoio.protegido;
  const confere = apoio.senhaDaContaConfere;

  rotas.get(
    "/aceites",
    protegido(async (conta, _requisicao, resposta) => {
      const situacao = await apoio.comoConta(conta, situacaoDosAceites);
      resposta.json(situacao);
    }),
  );

  rotas.post(
    "/aceites",
    protegido(async (conta, requisicao, resposta) => {
      const lido = esquemaDoNovoAceite.safeParse(requisicao.body);
      if (!lido.success) return erro(resposta, 422, "dados_invalidos");
      const origem = origemDoAceite(requisicao, opcoes.segredoDaPonte ?? process.env["SEGREDO_DA_PONTE"]);
      const situacao = await apoio.comoConta(conta, async (tx) => {
        const antes = await situacaoDosAceites(tx);
        // Só o que está pendente é aceito: ninguém grava aceite de documento
        // que a conta não precisa assinar (dono é quem assina o do lojista).
        const aceitaveis = lido.data.documentos.filter((d) =>
          antes.pendentes.some((p) => p.documento === d),
        );
        await registrarAceites(tx, conta.identidadeId, aceitaveis, { origem: "RENEWAL", de: origem });
        return situacaoDosAceites(tx);
      });
      resposta.json({ ...situacao, versoes: VERSAO_DOS_DOCUMENTOS_LEGAIS });
    }),
  );

  rotas.post(
    "/privacidade/exportar",
    protegido(async (conta, requisicao, resposta) => {
      const lido = esquemaDoPedidoDeExportacao.safeParse(requisicao.body);
      if (!lido.success) return erro(resposta, 422, "dados_invalidos");
      if (!(await confere(conta, lido.data.senha, resposta))) return;
      if (!podeExportar(conta.identidadeId)) {
        return erro(
          resposta,
          429,
          "muitas_exportacoes",
          "Você já pediu seus dados algumas vezes agora há pouco. Tente de novo em uma hora.",
        );
      }
      const origem = origemDoAceite(requisicao, opcoes.segredoDaPonte ?? process.env["SEGREDO_DA_PONTE"]);
      const dados = await apoio.comoConta(conta, async (tx) => {
        const juntados = await juntarOsDados(tx);
        if (juntados !== null) {
          await tx.$executeRaw`
            SELECT app.registrar_pedido_do_titular(
              'LGPD_EXPORTACAO',
              ${JSON.stringify({ formato: lido.data.formato, ip: origem.ip, userAgent: origem.agente })}::jsonb)`;
        }
        return juntados;
      });
      if (dados === null) return erro(resposta, 401, "nao_autenticado");
      const dia = new Date().toISOString().slice(0, 10);
      if (lido.data.formato === "csv") {
        resposta
          .status(200)
          .type("text/csv; charset=utf-8")
          .set("content-disposition", `attachment; filename="meus-pedidos-simpleclick-${dia}.csv"`)
          .send(csvDosPedidos(dados.pedidos));
        return;
      }
      resposta
        .status(200)
        .set("content-disposition", `attachment; filename="meus-dados-simpleclick-${dia}.json"`)
        .json({
          geradoEm: new Date().toISOString(),
          formato: 1,
          observacao:
            "Seus dados no SimpleClick. A senha não entra neste arquivo (só guardamos uma versão embaralhada, que não dá para ler).",
          ...dados,
        });
    }),
  );

  rotas.post(
    "/excluir",
    protegido(async (conta, requisicao, resposta) => {
      const lido = esquemaDaExclusaoDaConta.safeParse(requisicao.body);
      if (!lido.success) {
        const faltouAPalavra = lido.error.issues.some((i) => i.path[0] === "confirmacao");
        return erro(resposta, 422, faltouAPalavra ? "confirmacao_invalida" : "dados_invalidos");
      }
      if (!(await confere(conta, lido.data.senha, resposta))) return;
      const origem = origemDoAceite(requisicao, opcoes.segredoDaPonte ?? process.env["SEGREDO_DA_PONTE"]);
      const resultado = await apoio.comoConta(conta, async (tx) => {
        const [linha] = await tx.$queryRaw<{ resultado: string }[]>`
          SELECT app.anonimizar_minha_conta(${origem.ip}, ${origem.agente}) AS resultado`;
        return linha?.resultado ?? "SEM_SESSAO";
      });
      if (resultado === "TEM_LOJA") {
        return erro(
          resposta,
          409,
          "tem_loja",
          "Você é dono de uma loja. Transfira a loja para outra pessoa ou peça o encerramento dela ao SimpleClick antes de excluir a conta.",
        );
      }
      if (resultado === "E_ADMIN") {
        return erro(resposta, 409, "e_administrador", "Contas da administração não são excluídas por aqui.");
      }
      if (resultado !== "OK") return erro(resposta, 401, "nao_autenticado");
      resposta.status(204).end();
    }),
  );
}
