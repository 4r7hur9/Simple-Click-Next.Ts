import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll, describe, expect, it } from "vitest";

/**
 * Prova da regra que torna possível voltar à versão anterior (AC-030).
 *
 * Voltar atrás sem perder dado não é consequência de coragem nem de sorte: é
 * consequência da FORMA das migrações. Quando a versão nova volta para a
 * anterior, o banco não volta junto — ele fica com o esquema que a migração já
 * aplicou. Então a única pergunta que decide se dá para voltar é: a versão
 * anterior continua funcionando neste banco?
 *
 * O verificador é o que transforma essa pergunta em regra mecânica, e este
 * arquivo é o que prova que ele REPROVA de verdade. Um verificador que só
 * aprova é decoração: por isso quase todo caso aqui é de recusa, e cada um
 * confere também o código de saída, que é o que a publicação lê para decidir se
 * interrompe.
 *
 * A prova roda o verificador de verdade, como programa, porque é assim que a
 * publicação o chama — o que interessa é o veredito que chega ao portão, não a
 * forma como ele foi escrito por dentro.
 */

const VERIFICADOR = fileURLToPath(
  new URL("../scripts/check-migracao-compativel.mjs", import.meta.url),
);

/** Códigos de saída combinados com a publicação e com o portão. */
const COMPATIVEL = 0;
const INCOMPATIVEL = 1;
const SEM_MIGRACOES = 2;

interface Veredito {
  readonly codigo: number;
  readonly texto: string;
}

const temporarios: string[] = [];

afterAll(() => {
  for (const pasta of temporarios) {
    rmSync(pasta, { recursive: true, force: true });
  }
});

/** Escreve um conjunto de migrações descartável e devolve o diretório. */
function diretorioDeMigracoes(arquivos: Record<string, string>): string {
  const pasta = mkdtempSync(join(tmpdir(), "simpleclick-migracoes-"));
  temporarios.push(pasta);
  for (const [nome, sql] of Object.entries(arquivos)) {
    writeFileSync(join(pasta, nome), `${sql}\n`, "utf8");
  }
  return pasta;
}

function verificar(diretorio?: string): Veredito {
  const execucao = spawnSync(
    "node",
    diretorio === undefined ? [VERIFICADOR] : [VERIFICADOR, diretorio],
    { encoding: "utf8" },
  );

  return {
    codigo: execucao.status ?? -1,
    texto: `${execucao.stdout ?? ""}${execucao.stderr ?? ""}`,
  };
}

/** Verifica um conjunto de migrações escrito na hora. */
function verificarMigracoes(arquivos: Record<string, string>): Veredito {
  return verificar(diretorioDeMigracoes(arquivos));
}

/**
 * Uma primeira migração que já criou a tabela. Tudo que vier depois mexe numa
 * tabela que a versão anterior CONHECE — que é a única situação em que existe
 * algo para quebrar.
 */
const TABELA_JA_EXISTENTE = `
CREATE TABLE app.stores (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  apelido text
);
`;

describe("compatibilidade das migrações com a versão anterior", () => {
  it("@spec:AC-030 aprova as migrações que o repositório tem hoje", () => {
    const veredito = verificar();

    expect(veredito.codigo).toBe(COMPATIVEL);
    expect(veredito.texto).toContain("versão anterior");
  });

  it("@spec:AC-030 reprova remover coluna que a versão anterior ainda usa", () => {
    const veredito = verificarMigracoes({
      "0001_lojas.sql": TABELA_JA_EXISTENTE,
      "0002_remove.sql": "ALTER TABLE app.stores DROP COLUMN apelido;",
    });

    expect(veredito.codigo).toBe(INCOMPATIVEL);
    expect(veredito.texto).toContain("0002_remove.sql");
    expect(veredito.texto).toContain("versão anterior ainda usa");
    // Recusa que não diz o caminho vira pressão para desligar a verificação.
    expect(veredito.texto).toContain("duas etapas");
  });

  it("@spec:AC-030 reprova remover a tabela inteira que a versão anterior lê", () => {
    const veredito = verificarMigracoes({
      "0001_lojas.sql": TABELA_JA_EXISTENTE,
      "0002_remove.sql": "DROP TABLE app.stores;",
    });

    expect(veredito.codigo).toBe(INCOMPATIVEL);
    expect(veredito.texto).toContain("app.stores");
  });

  it("@spec:AC-030 aprova a remoção que é segunda etapa, com a primeira publicação citada", () => {
    const veredito = verificarMigracoes({
      "0001_lojas.sql": TABELA_JA_EXISTENTE,
      "0002_para_de_usar_apelido.sql":
        "CREATE INDEX stores_name_ix ON app.stores (name);",
      "0003_remove_apelido.sql": [
        "-- @janela-cumprida: 0002_para_de_usar_apelido.sql",
        "ALTER TABLE app.stores DROP COLUMN apelido;",
      ].join("\n"),
    });

    expect(veredito.codigo).toBe(COMPATIVEL);
  });

  it("@spec:AC-030 reprova a declaração de janela que cita migração inexistente", () => {
    const veredito = verificarMigracoes({
      "0001_lojas.sql": TABELA_JA_EXISTENTE,
      "0002_remove_apelido.sql": [
        "-- @janela-cumprida: 0001_nao_existe.sql",
        "ALTER TABLE app.stores DROP COLUMN apelido;",
      ].join("\n"),
    });

    // Declaração que aponta para o vazio não prova nada, e o que ela cobriria
    // volta a reprovar junto.
    expect(veredito.codigo).toBe(INCOMPATIVEL);
    expect(veredito.texto).toContain("0001_nao_existe.sql");
    expect(veredito.texto).toContain("versão anterior ainda usa");
  });

  it("@spec:AC-030 reprova a janela que cita uma migração que só vem depois", () => {
    const veredito = verificarMigracoes({
      "0001_lojas.sql": TABELA_JA_EXISTENTE,
      "0002_remove_apelido.sql": [
        "-- @janela-cumprida: 0003_para_de_usar.sql",
        "ALTER TABLE app.stores DROP COLUMN apelido;",
      ].join("\n"),
      "0003_para_de_usar.sql": "SELECT 1;",
    });

    // A primeira etapa precisa ter sido PUBLICADA antes; citar o futuro é citar
    // algo que nunca esteve no ar sozinho.
    expect(veredito.codigo).toBe(INCOMPATIVEL);
    expect(veredito.texto).toContain("0003_para_de_usar.sql");
  });

  it("@spec:AC-030 reprova tornar obrigatória uma coluna que já existe", () => {
    const veredito = verificarMigracoes({
      "0001_lojas.sql": TABELA_JA_EXISTENTE,
      "0002_obriga.sql":
        "ALTER TABLE app.stores ALTER COLUMN apelido SET NOT NULL;",
    });

    expect(veredito.codigo).toBe(INCOMPATIVEL);
    expect(veredito.texto).toContain("versão anterior grava linha sem ela");
  });

  it("@spec:AC-030 reprova coluna nova obrigatória sem valor padrão", () => {
    const veredito = verificarMigracoes({
      "0001_lojas.sql": TABELA_JA_EXISTENTE,
      "0002_coluna.sql":
        "ALTER TABLE app.stores ADD COLUMN cnpj text NOT NULL;",
    });

    expect(veredito.codigo).toBe(INCOMPATIVEL);
    expect(veredito.texto).toContain("não sabe preenchê-la");
  });

  it("@spec:AC-030 aprova coluna nova que aceita nulo", () => {
    const veredito = verificarMigracoes({
      "0001_lojas.sql": TABELA_JA_EXISTENTE,
      "0002_coluna.sql": "ALTER TABLE app.stores ADD COLUMN cnpj text;",
    });

    expect(veredito.codigo).toBe(COMPATIVEL);
  });

  it("@spec:AC-030 aprova coluna nova obrigatória quando ela tem valor padrão", () => {
    const veredito = verificarMigracoes({
      "0001_lojas.sql": TABELA_JA_EXISTENTE,
      "0002_coluna.sql":
        "ALTER TABLE app.stores ADD COLUMN ativa boolean NOT NULL DEFAULT true;",
    });

    expect(veredito.codigo).toBe(COMPATIVEL);
  });

  it("@spec:AC-030 reprova renomear coluna mesmo com a janela declarada", () => {
    const veredito = verificarMigracoes({
      "0001_lojas.sql": TABELA_JA_EXISTENTE,
      "0002_para_de_usar.sql":
        "CREATE INDEX stores_name_ix ON app.stores (name);",
      "0003_renomeia.sql": [
        "-- @janela-cumprida: 0002_para_de_usar.sql",
        "ALTER TABLE app.stores RENAME COLUMN apelido TO nickname;",
      ].join("\n"),
    });

    // Renomear não tem segunda etapa: não existe instante em que as duas
    // versões concordem sobre o nome, então nenhuma janela cobre isso.
    expect(veredito.codigo).toBe(INCOMPATIVEL);
    expect(veredito.texto).toContain("concordem sobre o nome");
  });

  it("@spec:AC-030 reprova trocar o tipo de uma coluna que já existe", () => {
    const veredito = verificarMigracoes({
      "0001_lojas.sql": TABELA_JA_EXISTENTE,
      "0002_tipo.sql":
        "ALTER TABLE app.stores ALTER COLUMN apelido TYPE varchar(40);",
    });

    expect(veredito.codigo).toBe(INCOMPATIVEL);
    expect(veredito.texto).toContain("troca o tipo");
  });

  it("@spec:AC-030 reprova remoção escondida em bloco dinâmico, e a janela não a perdoa", () => {
    const veredito = verificarMigracoes({
      "0001_lojas.sql": TABELA_JA_EXISTENTE,
      "0002_para_de_usar.sql":
        "CREATE INDEX stores_name_ix ON app.stores (name);",
      "0003_bloco.sql": [
        "-- @janela-cumprida: 0002_para_de_usar.sql",
        "DO $$ BEGIN",
        "  EXECUTE 'ALTER TABLE app.stores DROP COLUMN apelido';",
        "END $$;",
      ].join("\n"),
    });

    // Dentro do bloco o alvo é texto montado em tempo de execução: nem a
    // declaração de janela pode responder pelo que ele vai fazer.
    expect(veredito.codigo).toBe(INCOMPATIVEL);
    expect(veredito.texto).toContain("bloco");
  });

  it("@spec:AC-030 aprova mexer à vontade na tabela que a própria migração cria", () => {
    const veredito = verificarMigracoes({
      "0001_lojas.sql": TABELA_JA_EXISTENTE,
      "0002_nova.sql": [
        "CREATE TABLE app.cupons (id uuid PRIMARY KEY, codigo text);",
        "ALTER TABLE app.cupons DROP COLUMN codigo;",
        "ALTER TABLE app.cupons ADD COLUMN code text NOT NULL;",
      ].join("\n"),
    });

    // A versão anterior não conhece tabela que não existia quando ela estava no
    // ar: não há o que quebrar.
    expect(veredito.codigo).toBe(COMPATIVEL);
  });

  it("@spec:AC-030 não confunde comentário nem texto entre aspas com comando", () => {
    const veredito = verificarMigracoes({
      "0001_lojas.sql": TABELA_JA_EXISTENTE,
      "0002_conversa.sql": [
        "-- um dia vamos precisar de ALTER TABLE app.stores DROP COLUMN apelido",
        "/* nem RENAME COLUMN apelido TO nickname aqui dentro */",
        "COMMENT ON COLUMN app.stores.apelido IS 'não usar: DROP COLUMN apelido';",
      ].join("\n"),
    });

    expect(veredito.codigo).toBe(COMPATIVEL);
  });

  it("@spec:AC-030 reprova quando não há migração nenhuma para verificar", () => {
    const veredito = verificar(diretorioDeMigracoes({}));

    // Silêncio não é aprovação: um diretório errado no comando faria a
    // publicação passar sem nada ter sido conferido.
    expect(veredito.codigo).toBe(SEM_MIGRACOES);
    expect(veredito.texto).toContain("não é aprovação");
  });
});
