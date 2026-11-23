/**
 * A decisão da administração permanente (card #3) SEM banco: um cliente de
 * mentira responde às consultas e anota o que foi gravado. O que acontece de
 * verdade no PostgreSQL (hash que confere, segredo que decifra, concorrência)
 * está em `apps/api/tests/administracao-permanente.test.ts`.
 */
import { describe, expect, it } from "vitest";

import { criarCifradorDeSegredos, CONTEXTO_DO_TOTP } from "../../core/cifra.ts";
import { garantirAdministracaoPermanente } from "./administracao-permanente.ts";

const CHAVE = Buffer.alloc(32, 9).toString("base64");
const SEGREDO = "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP";
const SENHA = "senha-de-prova-grande-1";
const EMAIL = "pessoa.admin@exemplo.invalido";
const cifrador = criarCifradorDeSegredos(CHAVE, CONTEXTO_DO_TOTP);

interface Cenario {
  trava?: boolean;
  conta?: { id: string; ativa: boolean | null; foi_admin: boolean };
  admins?: number;
  marca?: boolean;
  marcaDaConta?: boolean;
  segredoCifrado?: string;
}

function conexaoDeMentira(c: Cenario) {
  const gravou: string[] = [];
  const todas: string[] = [];
  return {
    gravou,
    todas,
    conexao: {
      query: (texto: string) => {
        todas.push(texto.trim().split(/\s+/).slice(0, 3).join(" "));
        if (/^\s*INSERT/i.test(texto))
          gravou.push(texto.trim().split(/\s+/)[2] ?? "");
        if (texto.includes("pg_try_advisory_xact_lock")) {
          return Promise.resolve({ rows: [{ ok: c.trava ?? true }] });
        }
        if (texto.includes("FROM app.identities i WHERE i.email_norm")) {
          return Promise.resolve({ rows: c.conta ? [c.conta] : [] });
        }
        if (texto.includes("AS admins")) {
          return Promise.resolve({
            rows: [{ admins: c.admins ?? 0, marca: c.marca ?? false }],
          });
        }
        if (texto.includes("AND entity_id")) {
          return Promise.resolve({
            rows: c.marcaDaConta ? [{ "?column?": 1 }] : [],
          });
        }
        if (texto.includes("FROM app.totp_credentials")) {
          return Promise.resolve({
            rows: c.segredoCifrado ? [{ secret_enc: c.segredoCifrado }] : [],
          });
        }
        if (texto.includes("RETURNING id")) {
          return Promise.resolve({
            rows: [{ id: "00000000-0000-4000-8000-000000000001" }],
          });
        }
        return Promise.resolve({ rows: [] });
      },
    },
  };
}

async function rodar(c: Cenario, senha = SENHA) {
  const { conexao, gravou, todas } = conexaoDeMentira(c);
  const situacao = await garantirAdministracaoPermanente({
    conexao,
    email: EMAIL,
    senha,
    segredo: SEGREDO,
    nome: "Administração",
    cifrador,
  });
  return { situacao, gravou, todas };
}

describe("garantirAdministracaoPermanente", () => {
  it("[CA-12] sem nenhum admin, sem marca e sem conta: cria identidade, grant, TOTP e auditoria", async () => {
    const { situacao, gravou, todas } = await rodar({});
    expect(situacao).toBe("criada");
    expect(gravou).toEqual([
      "app.identities",
      "app.platform_admins",
      "app.totp_credentials",
      "app.audit_platform",
    ]);
    expect(todas.at(-1)).toBe("COMMIT");
  });

  it("[CA-14] qualquer admin existente (até revogado) ou marca anterior impede criar outro", async () => {
    for (const c of [
      { admins: 1 },
      { marca: true },
      { admins: 1, marca: true },
    ]) {
      const { situacao, gravou, todas } = await rodar(c);
      expect(situacao).toBe("ja_ha_administracao");
      expect(gravou).toEqual([]);
      expect(todas.at(-1)).toBe("ROLLBACK");
    }
  });

  it("[CA-14] conta existente com o e-mail nunca é promovida, reativada nem alterada", async () => {
    const id = "00000000-0000-4000-8000-0000000000aa";
    const comum = await rodar({ conta: { id, ativa: null, foi_admin: false } });
    expect(comum.situacao).toBe("conta_sem_administracao");
    const revogada = await rodar({
      conta: { id, ativa: false, foi_admin: true },
    });
    expect(revogada.situacao).toBe("administracao_revogada");
    const ativa = await rodar({ conta: { id, ativa: true, foi_admin: true } });
    expect(ativa.situacao).toBe("ja_existia");
    for (const r of [comum, revogada, ativa]) expect(r.gravou).toEqual([]);
  });

  it("[CA-26] conta criada pelo bootstrap cujo aplicativo ainda é o do segredo: avisa", async () => {
    const id = "00000000-0000-4000-8000-0000000000aa";
    const situacao = (
      await rodar({
        conta: { id, ativa: true, foi_admin: true },
        marcaDaConta: true,
        segredoCifrado: await cifrador.cifrar(SEGREDO),
      })
    ).situacao;
    expect(situacao).toBe("segredo_de_bootstrap_ainda_ativo");
    const trocado = await rodar({
      conta: { id, ativa: true, foi_admin: true },
      marcaDaConta: true,
      segredoCifrado: await cifrador.cifrar(
        "OUTROSEGREDOOUTROSEGREDOOUTROSEGR",
      ),
    });
    expect(trocado.situacao).toBe("ja_existia");
  });

  it("[CA-13] trava ocupada não cria nada", async () => {
    const { situacao, gravou } = await rodar({ trava: false });
    expect(situacao).toBe("ocupada");
    expect(gravou).toEqual([]);
  });

  it("[CA-14] senha fora da política (curta) nem abre transação", async () => {
    const { situacao, todas } = await rodar({}, "curta");
    expect(situacao).toBe("senha_fraca");
    expect(todas).toEqual([]);
  });
});
