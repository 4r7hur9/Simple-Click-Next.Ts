/**
 * Atalho de login para o ambiente local (nunca montado em produção).
 *
 * A autenticação de verdade está em `auth.routes.ts` (T-112). Este atalho só
 * existe quando o ambiente fornece uma credencial de teste, e só responde
 * pelo e-mail dessa credencial: qualquer outro e-mail — ou ambiente sem a
 * credencial — segue para a rota real de login, montada logo depois em
 * `app.ts`. Assim `pnpm dev` e as montagens do ponta a ponta continuam
 * entrando com o usuário de teste, e contas reais entram pelo banco.
 *
 * O USUÁRIO DE TESTE É UMA IDENTIDADE DE VERDADE, membro de verdade da loja
 * de desenvolvimento. Desde a migração 0041 a equipe só alcança a loja de que
 * é membro — o token dizer OWNER não basta —, então o login local resolve (ou
 * cria) a identidade pelo e-mail configurado e garante o vínculo OWNER com a
 * loja que o painel local usa (`NEXT_PUBLIC_DEV_STORE_SLUG`, a mesma variável
 * do site). Faz isso pela credencial de administração, que é quem cadastra
 * dono e loja em produção. Nada de segredo no código: e-mail, frase e segredo
 * de assinatura vêm do ambiente (P-002).
 */
import { randomUUID } from "node:crypto";

import { VERSAO_DOS_DOCUMENTOS_LEGAIS } from "@simpleclick/contracts";
import { Router } from "express";

import { executarComoRequisicao } from "../../core/contexto.ts";
import {
  bancoDaAdministracao,
  type AcessoAoBanco,
  type TransacaoDoBanco,
} from "../../core/db.ts";
import { registrar } from "../../core/log.ts";
import {
  assinarTokenDeAcesso,
  gerarTokenDeRenovacao,
  type PapelDaSessao,
} from "./token.ts";
import { derivarSenha, senhaConfere } from "./senha.ts";

export const EMAIL_DO_USUARIO_DE_TESTE = "SIMPLECLICK_DEV_TEST_EMAIL";
export const FRASE_DO_USUARIO_DE_TESTE = "SIMPLECLICK_DEV_TEST_PHRASE";
/** A loja do painel local — a mesma variável que o site lê. */
export const APELIDO_DA_LOJA_LOCAL = "NEXT_PUBLIC_DEV_STORE_SLUG";
const LOJA_LOCAL_PADRAO = "pastelaria-da-vila";

interface CredenciaisDaSessaoLocal {
  readonly email: string;
  readonly senha: string;
  readonly segredo: string;
  readonly apelidoDaLoja: string;
}

/** Mesma forma da sessão da rota real, mais o refresh (atalho local). */
interface SessaoParaNavegador {
  readonly status: "SESSAO_CRIADA";
  readonly papel: PapelDaSessao;
  readonly tokenDeAcesso: string;
  readonly tokenDeRenovacao: string;
  readonly acessoExpiraEm: string;
}

/** O que a rota precisa de fora. Tudo tem padrão; a prova troca o acesso. */
export interface DependenciasDoLoginLocal {
  /** Acesso pela credencial de administração. Padrão: o do ambiente. */
  readonly acesso?: () => AcessoAoBanco;
}

function credenciaisDoAmbiente(
  fonte: Readonly<Record<string, string | undefined>>,
): CredenciaisDaSessaoLocal | undefined {
  if (fonte.NODE_ENV === "production") return undefined;

  const email = fonte[EMAIL_DO_USUARIO_DE_TESTE]?.trim().toLowerCase();
  const senha = fonte[FRASE_DO_USUARIO_DE_TESTE];
  const segredo = fonte.JWT_SECRET?.trim();
  if (!email || !senha || !segredo) return undefined;
  const apelidoDaLoja =
    fonte[APELIDO_DA_LOJA_LOCAL]?.trim() || LOJA_LOCAL_PADRAO;
  return { email, senha, segredo, apelidoDaLoja };
}

/**
 * A identidade do usuário de teste, criada na primeira entrada e reaproveitada
 * nas seguintes, já como dona da loja local.
 *
 * Os dois `ON CONFLICT` são o que torna a entrada repetível: o e-mail é único
 * global em `identities`, e o par (loja, identidade) é único em
 * `store_members`. Vínculo revogado ou convite pendente que sobrou de outra
 * execução volta a valer — é o ambiente local, e o objetivo é entrar.
 */
async function garantirDonoLocal(
  tx: TransacaoDoBanco,
  credenciais: CredenciaisDaSessaoLocal,
): Promise<string> {
  const [identidade] = await tx.$queryRaw<{ id: string }[]>`
    INSERT INTO app.identities (email_norm, display_name, email_verified_at)
    VALUES (${credenciais.email}, 'Usuário de teste local', now())
    ON CONFLICT (email_norm) DO UPDATE SET updated_at = now()
    RETURNING id`;
  if (identidade === undefined) {
    throw new Error("a identidade do usuário de teste local não foi criada");
  }
  // O dono local entra sem passar pelo cadastro: já tem o aceite vigente
  // (card #79), senão o freio de aceite barraria as ações de criação dele.
  await tx.$executeRaw`
    INSERT INTO app.legal_acceptances (identity_id, document, version, origin)
    SELECT ${identidade.id}::uuid, d, ${VERSAO_DOS_DOCUMENTOS_LEGAIS.TERMS_OF_USE}, 'SIGNUP'
      FROM unnest(ARRAY['TERMS_OF_USE', 'PRIVACY_POLICY', 'MERCHANT_TERMS']) AS d
    ON CONFLICT (identity_id, document, version) DO NOTHING`;

  const [loja] = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM app.stores
     WHERE lower(slug) = lower(${credenciais.apelidoDaLoja})
       AND deleted_at IS NULL
     LIMIT 1`;
  if (loja === undefined) {
    // Sem a loja não há o que vincular: a sessão sai, e o painel vai
    // responder "não encontrado" até a carga de exemplo existir.
    registrar.aviso("auth.local.loja_ausente", {
      recurso: "stores",
      recursoId: credenciais.apelidoDaLoja,
    });
    return identidade.id;
  }

  await tx.$executeRaw`
    INSERT INTO app.store_members (store_id, identity_id, role, invite_accepted_at)
    VALUES (${loja.id}::uuid, ${identidade.id}::uuid, 'OWNER', now())
    ON CONFLICT (store_id, identity_id) DO UPDATE
      SET role = 'OWNER',
          revoked_at = NULL,
          invite_accepted_at = coalesce(store_members.invite_accepted_at, now())`;
  return identidade.id;
}

/** Monta o login local apenas quando a credencial de teste foi explicitada. */
export function criarRotasDeAutenticacaoDeDesenvolvimento(
  fonte: Readonly<Record<string, string | undefined>> = process.env,
  dependencias: DependenciasDoLoginLocal = {},
): Router {
  const router = Router();
  const credenciais = credenciaisDoAmbiente(fonte);
  // Preguiçoso: montar a rota não abre conexão, e quem nunca entra pelo
  // login local nunca precisa da credencial de administração.
  const acesso = dependencias.acesso ?? (() => bancoDaAdministracao());
  let hashDaSenha: Promise<string> | undefined;

  router.post("/login", async (requisicao, resposta, proximo) => {
    try {
      const corpo = (requisicao.body ?? {}) as {
        email?: unknown;
        senha?: unknown;
      };
      const email =
        typeof corpo.email === "string" ? corpo.email.trim().toLowerCase() : "";

      // Sem credencial de teste, ou outro e-mail: é login de verdade, e quem
      // responde é a rota real montada depois desta.
      if (credenciais === undefined || email !== credenciais.email) {
        proximo();
        return;
      }

      const senha = typeof corpo.senha === "string" ? corpo.senha : "";
      hashDaSenha ??= derivarSenha(credenciais.senha);
      const senhaValida = await senhaConfere(senha, await hashDaSenha);
      if (!senhaValida) {
        resposta.status(401).json({ erro: "nao_autenticado" });
        return;
      }

      // Sem loja no contexto: a credencial de administração enxerga por
      // política própria, e o vínculo é justamente o que ainda não existe.
      const identidadeId = await executarComoRequisicao({}, () =>
        acesso().emTransacao((tx) => garantirDonoLocal(tx, credenciais)),
      );

      const agora = new Date();
      const sessaoId = randomUUID();
      const familiaId = randomUUID();
      const acessoExpiraEm = new Date(agora.getTime() + 15 * 60 * 1_000);

      const sessao: SessaoParaNavegador = {
        status: "SESSAO_CRIADA",
        papel: "OWNER",
        tokenDeAcesso: assinarTokenDeAcesso(
          {
            identidadeId,
            papel: "OWNER" satisfies PapelDaSessao,
            sessaoId,
            familiaId,
          },
          credenciais.segredo,
          agora,
        ),
        tokenDeRenovacao: gerarTokenDeRenovacao(),
        acessoExpiraEm: acessoExpiraEm.toISOString(),
      };

      resposta.status(200).json(sessao);
    } catch (causa) {
      proximo(causa);
    }
  });

  return router;
}
