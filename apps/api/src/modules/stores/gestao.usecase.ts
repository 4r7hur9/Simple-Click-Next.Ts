/**
 * Gestão da loja pelo dono (card #25): equipe, uso e limites, tema da vitrine
 * e configuração do feed.
 *
 * Tudo roda na transação da equipe, com a loja no contexto e o vínculo já
 * conferido (`core/db.ts`, regra 7). Quem pode chamar cada caso de uso é a
 * matriz de permissões, conferida antes pelo portão da equipe
 * (`core/equipe-da-loja.ts`); o banco repete a regra onde importa (escrever
 * na equipe é só do dono, migração 0052).
 */

import {
  RECURSOS_LIMITADOS_DA_LOJA,
  temaDaLoja,
  type ConfiguracaoDoFeed,
  type EdicaoDoTema,
  type MembroDaEquipe,
  type RecursoLimitadoDaLoja,
  type TemaDaLoja,
  type UsoELimite,
} from "@simpleclick/contracts";

import { exigirUmaLinhaAfetada, transacaoAtual } from "../../core/db.ts";
import { exigirLimiteDaLoja } from "../../core/limites-da-loja.ts";

// ---------------------------------------------------------------------------
// Trilha
// ---------------------------------------------------------------------------

async function registrar(registro: {
  readonly acao: string;
  readonly entidade: string;
  readonly entidadeId: string | null;
  readonly papel: string;
  readonly antes?: Record<string, unknown> | null;
  readonly depois?: Record<string, unknown> | null;
}): Promise<void> {
  const { acao, entidade, entidadeId, papel } = registro;
  const antes = registro.antes ?? null;
  const depois = registro.depois ?? null;
  await transacaoAtual().$executeRaw`
    INSERT INTO app.audit_log
      (store_id, actor_id, actor_role, action, entity, entity_id,
       before_data, after_data)
    VALUES (app.current_store_id(), app.current_user_id(), ${papel}, ${acao},
            ${entidade}, ${entidadeId},
            ${antes === null ? null : JSON.stringify(antes)}::jsonb,
            ${depois === null ? null : JSON.stringify(depois)}::jsonb)`;
}

// ---------------------------------------------------------------------------
// Uso e limites
// ---------------------------------------------------------------------------

/** O uso e o limite de cada recurso da loja do contexto. */
export async function limitesDaLoja(): Promise<UsoELimite[]> {
  const linhas = await transacaoAtual().$queryRaw<
    { recurso: string; limite: number; uso: number }[]
  >`SELECT recurso, limite, uso FROM app.limites_da_loja(app.current_store_id())`;
  const porRecurso = new Map(linhas.map((linha) => [linha.recurso, linha]));
  return RECURSOS_LIMITADOS_DA_LOJA.map((recurso) => {
    const linha = porRecurso.get(recurso);
    const limite = Number(linha?.limite ?? 0);
    const uso = Number(linha?.uso ?? 0);
    return { recurso, limite, uso, restante: Math.max(limite - uso, 0) };
  });
}

/** Um recurso só. */
export async function limiteDoRecurso(
  recurso: RecursoLimitadoDaLoja,
): Promise<{ limite: number; uso: number }> {
  const todos = await limitesDaLoja();
  const achado = todos.find((item) => item.recurso === recurso);
  return { limite: achado?.limite ?? 0, uso: achado?.uso ?? 0 };
}

// ---------------------------------------------------------------------------
// Equipe
// ---------------------------------------------------------------------------

interface LinhaDaEquipe {
  readonly member_id: string;
  readonly display_name: string | null;
  readonly email: string;
  readonly role: string;
  readonly account_managed: boolean;
  readonly revoked_at: Date | null;
  readonly created_at: Date;
}

function comoMembro(linha: LinhaDaEquipe): MembroDaEquipe {
  return {
    id: linha.member_id,
    nome: linha.display_name,
    email: linha.email,
    papel: linha.role === "OWNER" ? "OWNER" : "STAFF",
    ativo: linha.revoked_at === null,
    contaGerenciada: linha.account_managed,
    desde: linha.created_at.toISOString(),
  };
}

/** A equipe inteira da loja (dono e equipe, ativos e desativados). */
export async function equipeDaLoja(): Promise<MembroDaEquipe[]> {
  const linhas = await transacaoAtual().$queryRaw<LinhaDaEquipe[]>`
    SELECT member_id::text AS member_id, display_name, email, role,
           account_managed, revoked_at, created_at
      FROM app.equipe_da_loja()`;
  return linhas.map(comoMembro);
}

async function membroDaLoja(id: string): Promise<MembroDaEquipe | null> {
  const todos = await equipeDaLoja();
  return todos.find((membro) => membro.id === id) ?? null;
}

export type ResultadoDoCadastroNaEquipe =
  | {
      readonly ok: true;
      readonly membro: MembroDaEquipe;
      readonly contaCriada: boolean;
    }
  | {
      readonly ok: false;
      readonly motivo: "SENHA_OBRIGATORIA" | "JA_E_MEMBRO";
    };

/**
 * Cadastra uma pessoa na equipe (STAFF), respeitando o limite. A conta nova
 * nasce com a senha dada (já derivada); a que existe só ganha o vínculo.
 */
export async function cadastrarNaEquipe(dados: {
  readonly nome: string;
  readonly email: string;
  readonly senhaDerivada: string | null;
}): Promise<ResultadoDoCadastroNaEquipe> {
  const tx = transacaoAtual();
  const [conta] = await tx.$queryRaw<
    { identity_id: string | null; created: boolean }[]
  >`SELECT identity_id::text AS identity_id, created
      FROM app.equipe_conta_para_vinculo(${dados.email}, ${dados.nome}, ${dados.senhaDerivada})`;
  if (conta?.identity_id === null || conta === undefined) {
    return { ok: false, motivo: "SENHA_OBRIGATORIA" };
  }

  const [existente] = await tx.$queryRaw<
    { id: string; revoked_at: Date | null }[]
  >`SELECT id::text AS id, revoked_at FROM app.store_members
     WHERE store_id = app.current_store_id()
       AND identity_id = ${conta.identity_id}::uuid`;
  if (existente !== undefined && existente.revoked_at === null) {
    return { ok: false, motivo: "JA_E_MEMBRO" };
  }

  await exigirLimiteDaLoja("staff");

  let vinculoId: string;
  if (existente === undefined) {
    const [criado] = await tx.$queryRaw<{ id: string }[]>`
      INSERT INTO app.store_members
        (store_id, identity_id, role, invited_by, invite_accepted_at, account_managed)
      VALUES (app.current_store_id(), ${conta.identity_id}::uuid, 'STAFF',
              app.current_user_id(), now(), ${conta.created})
      RETURNING id::text AS id`;
    if (criado === undefined) throw new Error("vínculo de equipe não gravado");
    vinculoId = criado.id;
  } else {
    // Quem já foi da loja volta como equipe, sem mexer na conta.
    await exigirUmaLinhaAfetada(
      { recurso: "membro", id: existente.id },
      () => tx.$executeRaw`
        UPDATE app.store_members
           SET revoked_at = NULL, role = 'STAFF',
               invite_accepted_at = coalesce(invite_accepted_at, now())
         WHERE id = ${existente.id}::uuid AND store_id = app.current_store_id()`,
    );
    vinculoId = existente.id;
  }

  await registrar({
    acao: "EQUIPE_ADICIONADA",
    entidade: "store_members",
    entidadeId: vinculoId,
    papel: "OWNER",
    antes: null,
    depois: {
      papel: "STAFF",
      contaCriada: conta.created,
    },
  });
  const membro = await membroDaLoja(vinculoId);
  if (membro === null) throw new Error("vínculo de equipe não encontrado");
  return { ok: true, membro, contaCriada: conta.created };
}

export type ResultadoDaMudancaNaEquipe =
  | { readonly ok: true; readonly membro: MembroDaEquipe | null }
  | {
      readonly ok: false;
      readonly motivo:
        "NAO_ENCONTRADO" | "DONO_NAO_SAI" | "SENHA_NAO_GERENCIADA";
    };

/** Ativa ou desativa uma pessoa da equipe. Reativar respeita o limite. */
export async function ativarNaEquipe(
  id: string,
  ativo: boolean,
): Promise<ResultadoDaMudancaNaEquipe> {
  const membro = await membroDaLoja(id);
  if (membro === null) return { ok: false, motivo: "NAO_ENCONTRADO" };
  if (membro.papel === "OWNER") return { ok: false, motivo: "DONO_NAO_SAI" };
  if (membro.ativo === ativo) return { ok: true, membro };

  if (ativo) await exigirLimiteDaLoja("staff");
  const tx = transacaoAtual();
  await exigirUmaLinhaAfetada({ recurso: "membro", id }, () =>
    ativo
      ? tx.$executeRaw`
          UPDATE app.store_members SET revoked_at = NULL
           WHERE id = ${id}::uuid AND store_id = app.current_store_id()`
      : tx.$executeRaw`
          UPDATE app.store_members SET revoked_at = now()
           WHERE id = ${id}::uuid AND store_id = app.current_store_id()`,
  );
  await registrar({
    acao: ativo ? "EQUIPE_REATIVADA" : "EQUIPE_DESATIVADA",
    entidade: "store_members",
    entidadeId: id,
    papel: "OWNER",
    antes: { ativo: !ativo },
    depois: { ativo },
  });
  return { ok: true, membro: await membroDaLoja(id) };
}

/** Tira a pessoa da equipe (o vínculo some; a conta dela continua). */
export async function removerDaEquipe(
  id: string,
): Promise<ResultadoDaMudancaNaEquipe> {
  const membro = await membroDaLoja(id);
  if (membro === null) return { ok: false, motivo: "NAO_ENCONTRADO" };
  if (membro.papel === "OWNER") return { ok: false, motivo: "DONO_NAO_SAI" };
  await exigirUmaLinhaAfetada(
    { recurso: "membro", id },
    () =>
      transacaoAtual().$executeRaw`
      DELETE FROM app.store_members
       WHERE id = ${id}::uuid AND store_id = app.current_store_id() AND role = 'STAFF'`,
  );
  await registrar({
    acao: "EQUIPE_REMOVIDA",
    entidade: "store_members",
    entidadeId: id,
    papel: "OWNER",
    antes: { papel: "STAFF" },
    depois: null,
  });
  return { ok: true, membro: null };
}

/** Troca a senha de quem a loja cadastrou. Derruba as sessões da pessoa. */
export async function trocarSenhaDaEquipe(
  id: string,
  senhaDerivada: string,
  agora: Date,
): Promise<ResultadoDaMudancaNaEquipe> {
  const membro = await membroDaLoja(id);
  if (membro === null) return { ok: false, motivo: "NAO_ENCONTRADO" };
  if (membro.papel === "OWNER")
    return { ok: false, motivo: "SENHA_NAO_GERENCIADA" };
  const [linha] = await transacaoAtual().$queryRaw<{ trocada: boolean }[]>`
    SELECT app.equipe_trocar_senha(${id}::uuid, ${senhaDerivada}, ${agora}::timestamptz) AS trocada`;
  if (linha?.trocada !== true)
    return { ok: false, motivo: "SENHA_NAO_GERENCIADA" };
  await registrar({
    acao: "EQUIPE_SENHA_TROCADA",
    entidade: "store_members",
    entidadeId: id,
    papel: "OWNER",
    antes: null,
    depois: null,
  });
  return { ok: true, membro };
}

// ---------------------------------------------------------------------------
// Tema da vitrine
// ---------------------------------------------------------------------------

function objeto(valor: unknown): Record<string, unknown> {
  return typeof valor === "object" && valor !== null && !Array.isArray(valor)
    ? (valor as Record<string, unknown>)
    : {};
}

/** O tema guardado da loja do contexto, com os padrões. */
export async function temaGuardado(): Promise<TemaDaLoja> {
  const [linha] = await transacaoAtual().$queryRaw<
    { theme: unknown; landing: unknown }[]
  >`SELECT theme, landing FROM app.store_settings WHERE store_id = app.current_store_id()`;
  const tema = objeto(linha?.theme);
  const apresentacao = objeto(linha?.landing);
  return temaDaLoja({
    corDestaque: tema["destaque"],
    fundoVitrine: apresentacao["fundoVitrine"],
    topoCardapio: apresentacao["topoCardapio"],
    fundoVitrineCelular: apresentacao["fundoVitrineCelular"],
    topoCardapioCelular: apresentacao["topoCardapioCelular"],
    seloDeStatus: tema["seloDeStatus"],
    coresDasImagens: tema["coresDasImagens"],
    ajustesDasFotos: apresentacao["ajustesDasFotos"],
  });
}

/** Grava só o que veio. A cor mora em `theme`; as imagens, em `landing`. */
export async function gravarTema(
  edicao: EdicaoDoTema,
  papel: string,
): Promise<TemaDaLoja> {
  const antes = await temaGuardado();
  const tema: Record<string, unknown> = {};
  const apresentacao: Record<string, unknown> = {};
  if (edicao.corDestaque !== undefined) tema["destaque"] = edicao.corDestaque;
  if (edicao.seloDeStatus !== undefined)
    tema["seloDeStatus"] = edicao.seloDeStatus;
  if (edicao.coresDasImagens !== undefined)
    tema["coresDasImagens"] = edicao.coresDasImagens;
  // Os ajustes (original + enquadramento) moram junto das fotos, em `landing`.
  if (edicao.ajustesDasFotos !== undefined)
    apresentacao["ajustesDasFotos"] = edicao.ajustesDasFotos;
  if (edicao.fundoVitrine !== undefined)
    apresentacao["fundoVitrine"] = edicao.fundoVitrine;
  if (edicao.topoCardapio !== undefined)
    apresentacao["topoCardapio"] = edicao.topoCardapio;
  if (edicao.fundoVitrineCelular !== undefined)
    apresentacao["fundoVitrineCelular"] = edicao.fundoVitrineCelular;
  if (edicao.topoCardapioCelular !== undefined)
    apresentacao["topoCardapioCelular"] = edicao.topoCardapioCelular;

  await exigirUmaLinhaAfetada(
    { recurso: "configuração", id: "tema" },
    () =>
      transacaoAtual().$executeRaw`
      UPDATE app.store_settings
         SET theme = theme || ${JSON.stringify(tema)}::jsonb,
             landing = landing || ${JSON.stringify(apresentacao)}::jsonb
       WHERE store_id = app.current_store_id()`,
  );
  const depois = await temaGuardado();
  await registrar({
    acao: "TEMA_ALTERADO",
    entidade: "store_settings",
    entidadeId: "tema",
    papel: papel,
    antes: { ...antes },
    depois: { ...depois },
  });
  return depois;
}

// ---------------------------------------------------------------------------
// Configuração do feed
// ---------------------------------------------------------------------------

export async function configuracaoDoFeed(): Promise<ConfiguracaoDoFeed> {
  const [linha] = await transacaoAtual().$queryRaw<
    { feed_visible: boolean; feed_auto_publish_new: boolean }[]
  >`SELECT feed_visible, feed_auto_publish_new FROM app.stores WHERE id = app.current_store_id()`;
  return {
    aparecerNoFeed: linha?.feed_visible ?? true,
    publicarProdutosNovos: linha?.feed_auto_publish_new ?? false,
  };
}

export async function gravarConfiguracaoDoFeed(
  edicao: {
    readonly aparecerNoFeed?: boolean | undefined;
    readonly publicarProdutosNovos?: boolean | undefined;
  },
  papel: string,
): Promise<ConfiguracaoDoFeed> {
  const antes = await configuracaoDoFeed();
  const depois: ConfiguracaoDoFeed = {
    aparecerNoFeed: edicao.aparecerNoFeed ?? antes.aparecerNoFeed,
    publicarProdutosNovos:
      edicao.publicarProdutosNovos ?? antes.publicarProdutosNovos,
  };
  await exigirUmaLinhaAfetada(
    { recurso: "loja", id: "feed" },
    () =>
      transacaoAtual().$executeRaw`
      UPDATE app.stores
         SET feed_visible = ${depois.aparecerNoFeed},
             feed_auto_publish_new = ${depois.publicarProdutosNovos}
       WHERE id = app.current_store_id()`,
  );
  await registrar({
    acao: "FEED_CONFIGURADO",
    entidade: "stores",
    entidadeId: null,
    papel: papel,
    antes: { ...antes },
    depois: { ...depois },
  });
  return depois;
}
