import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  ErroDeBancoSemEstrutura,
  ErroDeGuardaEstrutural,
  exigirEstruturaIntegra,
  executarGuarda,
  executarGuardas,
  type Guarda,
  lerGuardas,
  tituloDaGuarda,
} from "./guards.ts";
import { aplicarMigracoes } from "./migrate.ts";

/**
 * Prova das nove guardas estruturais, contra PostgreSQL de verdade.
 *
 * A regra que este arquivo existe para cumprir: **guarda que nunca acusou nada
 * não está provada.** Uma consulta ao catálogo que devolve zero linhas parece
 * aprovação e pode ser apenas uma consulta errada — um `JOIN` que nunca casa,
 * um nome de coluna trocado, uma lista de exceções larga demais. Por isso cada
 * guarda é exercitada nos dois sentidos: o esquema que as migrações produzem
 * passa, o defeito criado de propósito é apontado pelo nome do objeto, e o
 * desfazer devolve o esquema ao estado limpo.
 *
 * O defeito é criado no banco de prova, nunca no de desenvolvimento: cada
 * execução cria o próprio banco a partir de molde vazio e o apaga no fim.
 */

const RAIZ_DO_REPOSITORIO = fileURLToPath(
  new URL("../../../", import.meta.url),
);

const ARQUIVO_DE_AMBIENTE = join(RAIZ_DO_REPOSITORIO, ".env");
if (existsSync(ARQUIVO_DE_AMBIENTE)) process.loadEnvFile(ARQUIVO_DE_AMBIENTE);

function exigirVariavel(nome: string): string {
  const valor = process.env[nome]?.trim();
  if (valor === undefined || valor === "") {
    throw new Error(
      [
        `${nome} não está definida, e sem ela não há banco onde provar as guardas.`,
        "Suba o banco descartável e preencha o ambiente:",
        "  bash infra/scripts/up.sh core test",
        "  cp .env.example .env   # e complete as senhas dos papéis de banco",
      ].join("\n"),
    );
  }
  return valor;
}

const URL_ADMINISTRATIVA = exigirVariavel("DATABASE_URL_TEST");
const SEGREDOS_DAS_MIGRACOES = {
  SENHA_BANCO_MIGRADOR: exigirVariavel("SENHA_BANCO_MIGRADOR"),
  SENHA_BANCO_APLICACAO: exigirVariavel("SENHA_BANCO_APLICACAO"),
  SENHA_BANCO_ADMINISTRACAO: exigirVariavel("SENHA_BANCO_ADMINISTRACAO"),
};

const ESPERA_LONGA = 120_000;

// ---------------------------------------------------------------------------
// Apoio
// ---------------------------------------------------------------------------

interface BancoDeProva {
  readonly nome: string;
  readonly url: string;
}

async function comClienteAdministrativo<T>(
  acao: (cliente: pg.Client) => Promise<T>,
): Promise<T> {
  const cliente = new pg.Client({ connectionString: URL_ADMINISTRATIVA });
  await cliente.connect();
  try {
    return await acao(cliente);
  } finally {
    await cliente.end();
  }
}

async function criarBancoDeProva(): Promise<BancoDeProva> {
  const nome = `sc_t005_${Math.random().toString(36).slice(2, 10)}`;
  await comClienteAdministrativo((cliente) =>
    cliente.query(`CREATE DATABASE ${nome} TEMPLATE template0`),
  );
  const url = new URL(URL_ADMINISTRATIVA);
  url.pathname = `/${nome}`;
  return { nome, url: url.toString() };
}

async function apagarBancoDeProva(banco: BancoDeProva): Promise<void> {
  await comClienteAdministrativo((cliente) =>
    cliente.query(`DROP DATABASE IF EXISTS ${banco.nome} WITH (FORCE)`),
  );
}

let banco: BancoDeProva;
let migrador: pg.Client;
const guardas = lerGuardas();

/** Devolve a guarda pelo nome do arquivo, falhando cedo se ela sumir. */
function guarda(arquivo: string): Guarda {
  const encontrada = guardas.find((item) => item.arquivo === arquivo);
  if (encontrada === undefined) {
    throw new Error(`guarda ausente do repositório: ${arquivo}`);
  }
  return encontrada;
}

/**
 * Cria o defeito, deixa a prova olhar para ele e o desfaz — mesmo quando a
 * prova falha, porque um defeito esquecido no banco faria as guardas seguintes
 * acusarem um problema que não é delas.
 */
async function comDefeito<T>(
  criar: readonly string[],
  desfazer: readonly string[],
  provar: () => Promise<T>,
): Promise<T> {
  for (const comando of criar) await migrador.query(comando);
  try {
    return await provar();
  } finally {
    for (const comando of desfazer) await migrador.query(comando);
  }
}

/** Os objetos que uma guarda apontou, para comparar por nome. */
async function objetosApontadosPor(arquivo: string): Promise<string[]> {
  const achados = await executarGuarda(migrador, guarda(arquivo));
  return achados.map((achado) => achado.objeto).sort();
}

/** O texto inteiro do que uma guarda apontou, para conferir a explicação. */
async function problemasApontadosPor(arquivo: string): Promise<string> {
  const achados = await executarGuarda(migrador, guarda(arquivo));
  return achados.map((achado) => achado.problema).join("\n");
}

beforeAll(async () => {
  banco = await criarBancoDeProva();
  migrador = new pg.Client({ connectionString: banco.url });
  await migrador.connect();
  await aplicarMigracoes({
    cliente: migrador,
    segredos: SEGREDOS_DAS_MIGRACOES,
  });
}, ESPERA_LONGA);

afterAll(async () => {
  await migrador?.end();
  if (banco) await apagarBancoDeProva(banco);
});

// ---------------------------------------------------------------------------
// O conjunto das guardas
// ---------------------------------------------------------------------------

describe("conjunto das guardas estruturais", () => {
  it("lê as nove guardas do repositório, cada uma com título próprio", () => {
    expect(guardas.map((item) => item.codigo)).toEqual([
      "g1",
      "g2",
      "g3",
      "g4",
      "g5",
      "g6",
      "g7",
      "g8",
      "g9",
    ]);
    for (const item of guardas) {
      expect(item.titulo.length).toBeGreaterThan(20);
    }
  });

  it("tira o título do cabeçalho do arquivo, sem segunda fonte de verdade", () => {
    const sql = [
      "-- ====================",
      "-- G0 — Um defeito qualquer",
      "-- que continua na linha seguinte.",
      "--",
      "-- Parágrafo que não é o título.",
      "-- ====================",
      "SELECT 1;",
    ].join("\n");
    expect(tituloDaGuarda(sql)).toBe(
      "G0 — Um defeito qualquer que continua na linha seguinte.",
    );
  });

  it(
    "aprova o esquema que as migrações produzem, sem nenhum achado",
    async () => {
      const relatorio = await executarGuardas(migrador, guardas);
      expect(relatorio.achados).toEqual([]);
      expect(relatorio.guardasExecutadas).toHaveLength(9);
    },
    ESPERA_LONGA,
  );

  it(
    "recusa o banco sem estrutura em vez de aprovar por vacuidade",
    async () => {
      // Guarda que não olhou nada devolve zero linhas, que é indistinguível de
      // aprovação. Um portão verde por banco vazio é pior do que portão nenhum.
      const vazio = await criarBancoDeProva();
      const cliente = new pg.Client({ connectionString: vazio.url });
      await cliente.connect();
      try {
        const recusa = await exigirEstruturaIntegra(cliente, {
          alvo: "de prova",
        }).then(
          () => null,
          (erro: unknown) => erro,
        );
        expect(recusa).toBeInstanceOf(ErroDeBancoSemEstrutura);
      } finally {
        await cliente.end();
        await apagarBancoDeProva(vazio);
      }
    },
    ESPERA_LONGA,
  );
});

// ---------------------------------------------------------------------------
// AC-008 · AC-035 — cada guarda acusa o defeito que existe para acusar
// ---------------------------------------------------------------------------

describe("guardas estruturais do banco", () => {
  it(
    "@spec:AC-008 g1 acusa a tabela de loja sem o isolamento ligado e forçado",
    async () => {
      expect(await objetosApontadosPor("g1_isolamento_ativo.sql")).toEqual([]);

      await comDefeito(
        [
          `CREATE TABLE app.orcamentos (
             id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
             store_id uuid NOT NULL REFERENCES app.stores (id),
             nota     text)`,
          // O gatilho de evento já liga e força o isolamento em tabela nova; o
          // defeito é justamente alguém desfazer uma das duas metades depois.
          "ALTER TABLE app.orcamentos NO FORCE ROW LEVEL SECURITY",
        ],
        ["DROP TABLE app.orcamentos"],
        async () => {
          expect(await objetosApontadosPor("g1_isolamento_ativo.sql")).toEqual([
            "app.orcamentos",
          ]);
          expect(
            await problemasApontadosPor("g1_isolamento_ativo.sql"),
          ).toContain("forçado=não");

          await migrador.query(
            "ALTER TABLE app.orcamentos DISABLE ROW LEVEL SECURITY",
          );
          expect(
            await problemasApontadosPor("g1_isolamento_ativo.sql"),
          ).toContain("ativado=não");
        },
      );

      expect(await objetosApontadosPor("g1_isolamento_ativo.sql")).toEqual([]);
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-035 g2 acusa a tabela sem política para algum dos quatro comandos",
    async () => {
      expect(await objetosApontadosPor("g2_politica_por_comando.sql")).toEqual(
        [],
      );

      await comDefeito(
        [
          `CREATE TABLE app.avisos_da_loja (
             id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
             store_id uuid NOT NULL REFERENCES app.stores (id),
             texto    text)`,
          `CREATE POLICY avisos_select ON app.avisos_da_loja FOR SELECT TO sc_app
             USING (store_id = (SELECT app.current_store_id()))`,
        ],
        ["DROP TABLE app.avisos_da_loja"],
        async () => {
          const problemas = await problemasApontadosPor(
            "g2_politica_por_comando.sql",
          );
          // Uma linha por comando que ficou sem política: os três que faltam.
          expect(
            await objetosApontadosPor("g2_politica_por_comando.sql"),
          ).toEqual([
            "app.avisos_da_loja",
            "app.avisos_da_loja",
            "app.avisos_da_loja",
          ]);
          expect(problemas).toContain("inserção");
          expect(problemas).toContain("alteração");
          expect(problemas).toContain("remoção");
          expect(problemas).not.toContain("sem política de leitura");

          // Política restritiva não concede nada: só corta o que a permissiva
          // concedeu. Uma restritiva `FOR ALL` não pode calar a guarda.
          await migrador.query(
            `CREATE POLICY avisos_ctx ON app.avisos_da_loja AS RESTRICTIVE FOR ALL TO sc_app
               USING      ((SELECT app.current_store_id()) IS NOT NULL)
               WITH CHECK ((SELECT app.current_store_id()) IS NOT NULL)`,
          );
          expect(
            await objetosApontadosPor("g2_politica_por_comando.sql"),
          ).toHaveLength(3);
        },
      );

      expect(await objetosApontadosPor("g2_politica_por_comando.sql")).toEqual(
        [],
      );
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-035 g3 acusa a chave única global onde deveria ser única por loja",
    async () => {
      expect(await objetosApontadosPor("g3_unica_por_loja.sql")).toEqual([]);

      await comDefeito(
        [
          `CREATE TABLE app.itens_de_estoque (
             id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
             store_id uuid NOT NULL REFERENCES app.stores (id),
             sku      text NOT NULL)`,
          // O canal encoberto: cadastrar um código que já existe em OUTRA loja
          // devolve "chave duplicada" e revela a linha invisível do vizinho.
          "CREATE UNIQUE INDEX itens_de_estoque_sku_uk ON app.itens_de_estoque (sku)",
        ],
        ["DROP TABLE app.itens_de_estoque"],
        async () => {
          expect(await objetosApontadosPor("g3_unica_por_loja.sql")).toEqual([
            "app.itens_de_estoque_sku_uk",
          ]);
          expect(
            await problemasApontadosPor("g3_unica_por_loja.sql"),
          ).toContain("app.itens_de_estoque");

          // A mesma chave, agora liderada pela loja, deixa de ser problema.
          await migrador.query("DROP INDEX app.itens_de_estoque_sku_uk");
          await migrador.query(
            "CREATE UNIQUE INDEX itens_de_estoque_sku_uk ON app.itens_de_estoque (store_id, sku)",
          );
          expect(await objetosApontadosPor("g3_unica_por_loja.sql")).toEqual(
            [],
          );
        },
      );

      expect(await objetosApontadosPor("g3_unica_por_loja.sql")).toEqual([]);
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-035 g4 acusa a política permissiva de tabela quente que não cita a loja",
    async () => {
      expect(await objetosApontadosPor("g4_politica_cita_loja.sql")).toEqual(
        [],
      );

      await comDefeito(
        [
          // O achado medido: uma única política assim faz o planejador desistir
          // de fatorar store_id, e o acesso ordenado morre.
          `CREATE POLICY products_destaques_select ON app.products FOR SELECT TO sc_app
             USING (is_featured AND status = 'PUBLISHED')`,
        ],
        ["DROP POLICY products_destaques_select ON app.products"],
        async () => {
          expect(
            await objetosApontadosPor("g4_politica_cita_loja.sql"),
          ).toEqual(["app.products / products_destaques_select"]);
        },
      );

      // A mesma política citando a loja passa: o que a guarda cobra é o
      // conjunto, não a existência da política.
      await comDefeito(
        [
          `CREATE POLICY products_destaques_select ON app.products FOR SELECT TO sc_app
             USING (store_id = (SELECT app.current_store_id()) AND is_featured)`,
        ],
        ["DROP POLICY products_destaques_select ON app.products"],
        async () => {
          expect(
            await objetosApontadosPor("g4_politica_cita_loja.sql"),
          ).toEqual([]);
        },
      );

      // Política de inserção só tem conjunto de escrita: olhar apenas o de
      // leitura acusaria toda inserção correta como se fosse defeito.
      await comDefeito(
        [
          `CREATE POLICY products_terceiro_insert ON app.products FOR INSERT TO sc_app
             WITH CHECK (store_id = (SELECT app.current_store_id()))`,
        ],
        ["DROP POLICY products_terceiro_insert ON app.products"],
        async () => {
          expect(
            await objetosApontadosPor("g4_politica_cita_loja.sql"),
          ).toEqual([]);
        },
      );

      expect(await objetosApontadosPor("g4_politica_cita_loja.sql")).toEqual(
        [],
      );
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-035 g5 acusa o índice de agregação que ignora as colunas das políticas",
    async () => {
      expect(await objetosApontadosPor("g5_indice_cobre_politica.sql")).toEqual(
        [],
      );

      await comDefeito(
        [
          // Cobre as colunas da CONSULTA e nenhuma das políticas: é exatamente
          // o índice que parece cobridor e não permite leitura direta, porque a
          // reconferência do isolamento vai buscar status e deleted_at no disco.
          `CREATE INDEX products_agregacao_ix
             ON app.products (store_id, sort_order) INCLUDE (display_price_cents)`,
        ],
        ["DROP INDEX app.products_agregacao_ix"],
        async () => {
          const objetos = await objetosApontadosPor(
            "g5_indice_cobre_politica.sql",
          );
          expect(
            objetos.every((o) => o === "app.products / products_agregacao_ix"),
          ).toBe(true);
          const problemas = await problemasApontadosPor(
            "g5_indice_cobre_politica.sql",
          );
          expect(problemas).toContain("status");
          expect(problemas).toContain("deleted_at");
        },
      );

      // Com as colunas das políticas dentro do índice, a guarda se cala — e é
      // esse índice que a medição mostrou virar leitura direta, sem ida ao disco.
      await comDefeito(
        [
          `CREATE INDEX products_agregacao_ix
             ON app.products (store_id, sort_order)
             INCLUDE (display_price_cents, status, deleted_at, is_available)`,
        ],
        ["DROP INDEX app.products_agregacao_ix"],
        async () => {
          expect(
            await objetosApontadosPor("g5_indice_cobre_politica.sql"),
          ).toEqual([]);
        },
      );

      expect(await objetosApontadosPor("g5_indice_cobre_politica.sql")).toEqual(
        [],
      );
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-035 g6 acusa a visão materializada sobre tabela de loja",
    async () => {
      expect(
        await objetosApontadosPor("g6_sem_matview_multi_loja.sql"),
      ).toEqual([]);

      await comDefeito(
        [
          `CREATE MATERIALIZED VIEW app.metricas_do_dia AS
             SELECT store_id, count(*) AS produtos FROM app.products GROUP BY store_id`,
        ],
        ["DROP MATERIALIZED VIEW app.metricas_do_dia"],
        async () => {
          expect(
            await objetosApontadosPor("g6_sem_matview_multi_loja.sql"),
          ).toEqual(["app.metricas_do_dia"]);
          expect(
            await problemasApontadosPor("g6_sem_matview_multi_loja.sql"),
          ).toContain("app.products");
        },
      );

      expect(
        await objetosApontadosPor("g6_sem_matview_multi_loja.sql"),
      ).toEqual([]);
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-035 g7 acusa a visão de loja que não executa com os direitos de quem consulta",
    async () => {
      expect(await objetosApontadosPor("g7_view_com_invocador.sql")).toEqual(
        [],
      );

      await comDefeito(
        [
          `CREATE VIEW app.catalogo_publico AS
             SELECT store_id, name, display_price_cents FROM app.products
              WHERE status = 'PUBLISHED'`,
        ],
        ["DROP VIEW app.catalogo_publico"],
        async () => {
          expect(
            await objetosApontadosPor("g7_view_com_invocador.sql"),
          ).toEqual(["app.catalogo_publico"]);
        },
      );

      // Com a opção ligada, a mesma visão passa: ela deixa de rodar com os
      // direitos de quem a definiu e volta a sofrer o isolamento.
      await comDefeito(
        [
          `CREATE VIEW app.catalogo_publico WITH (security_invoker = true) AS
             SELECT store_id, name, display_price_cents FROM app.products
              WHERE status = 'PUBLISHED'`,
        ],
        ["DROP VIEW app.catalogo_publico"],
        async () => {
          expect(
            await objetosApontadosPor("g7_view_com_invocador.sql"),
          ).toEqual([]);
        },
      );

      expect(await objetosApontadosPor("g7_view_com_invocador.sql")).toEqual(
        [],
      );
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-035 g8 acusa a política de alteração ou remoção em tabela de pedido",
    async () => {
      expect(await objetosApontadosPor("g8_pedido_imutavel.sql")).toEqual([]);

      await comDefeito(
        [
          `CREATE TABLE app.order_items (
             id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
             store_id uuid NOT NULL REFERENCES app.stores (id),
             product_name     text   NOT NULL,
             unit_price_cents bigint NOT NULL)`,
          `CREATE POLICY oi_staff_select ON app.order_items FOR SELECT TO sc_app
             USING (store_id = (SELECT app.current_store_id()))`,
          `CREATE POLICY oi_staff_insert ON app.order_items FOR INSERT TO sc_app
             WITH CHECK (store_id = (SELECT app.current_store_id()))`,
          // O defeito: item de pedido é cópia congelada da compra (P-010), e
          // alterar produto depois nunca pode mudar pedido já feito.
          `CREATE POLICY oi_staff_update ON app.order_items FOR UPDATE TO sc_app
             USING      (store_id = (SELECT app.current_store_id()))
             WITH CHECK (store_id = (SELECT app.current_store_id()))`,
        ],
        ["DROP TABLE app.order_items"],
        async () => {
          expect(await objetosApontadosPor("g8_pedido_imutavel.sql")).toEqual([
            "app.order_items / oi_staff_update",
          ]);
          expect(
            await problemasApontadosPor("g8_pedido_imutavel.sql"),
          ).toContain("cópia congelada");

          // Remoção é o outro lado do mesmo defeito, e vale também para a
          // credencial de administração: enxergar todas as lojas não é licença
          // para reescrever o passado de um pedido.
          await migrador.query(
            "DROP POLICY oi_staff_update ON app.order_items",
          );
          await migrador.query(
            `CREATE POLICY oi_admin_all ON app.order_items FOR ALL TO sc_admin
               USING (true) WITH CHECK (true)`,
          );
          const objetos = await objetosApontadosPor("g8_pedido_imutavel.sql");
          expect(objetos).toContain("app.order_items / oi_admin_all");
        },
      );

      expect(await objetosApontadosPor("g8_pedido_imutavel.sql")).toEqual([]);
    },
    ESPERA_LONGA,
  );

  it(
    "@spec:AC-035 g9 acusa a trilha de auditoria que aceite alteração ou remoção",
    async () => {
      expect(
        await objetosApontadosPor("g9_auditoria_sem_alteracao.sql"),
      ).toEqual([]);

      // Camada 1 — política de alteração, que é a negação por omissão sendo
      // desfeita por alguém.
      await comDefeito(
        [
          `CREATE POLICY audit_corrige ON app.audit_log FOR UPDATE TO sc_app
             USING      (store_id = (SELECT app.current_store_id()))
             WITH CHECK (store_id = (SELECT app.current_store_id()))`,
        ],
        ["DROP POLICY audit_corrige ON app.audit_log"],
        async () => {
          expect(
            await objetosApontadosPor("g9_auditoria_sem_alteracao.sql"),
          ).toEqual(["app.audit_log / audit_corrige"]);
        },
      );

      // Camada 2 — o privilégio, que barra antes de a política ser consultada.
      await comDefeito(
        ["GRANT DELETE ON app.audit_log TO sc_app"],
        ["REVOKE DELETE ON app.audit_log FROM sc_app"],
        async () => {
          expect(
            await objetosApontadosPor("g9_auditoria_sem_alteracao.sql"),
          ).toEqual(["app.audit_log / sc_app"]);
          expect(
            await problemasApontadosPor("g9_auditoria_sem_alteracao.sql"),
          ).toContain("delete");
        },
      );

      // Camada 3 — o gatilho, a única que alcança a credencial de migração,
      // que contorna o isolamento e passaria pelas duas primeiras.
      await comDefeito(
        ["DROP TRIGGER audit_log_append_only ON app.audit_log"],
        [
          `CREATE TRIGGER audit_log_append_only BEFORE UPDATE OR DELETE ON app.audit_log
             FOR EACH ROW EXECUTE FUNCTION app.deny_mutation()`,
        ],
        async () => {
          expect(
            await objetosApontadosPor("g9_auditoria_sem_alteracao.sql"),
          ).toEqual(["app.audit_log"]);
        },
      );

      expect(
        await objetosApontadosPor("g9_auditoria_sem_alteracao.sql"),
      ).toEqual([]);
    },
    ESPERA_LONGA,
  );
});

// ---------------------------------------------------------------------------
// AC-035 — o portão reprova, e a recusa diz o que consertar
// ---------------------------------------------------------------------------

describe("portão de qualidade diante de estrutura fora do padrão", () => {
  it(
    "@spec:AC-035 reprova nomeando a guarda que falhou e o objeto errado do banco",
    async () => {
      await expect(exigirEstruturaIntegra(migrador)).resolves.toBeDefined();

      await comDefeito(
        [
          // Migração nova que cria tabela de loja e esquece tudo: isolamento
          // pela metade, chave única global e política sem a loja no conjunto.
          `CREATE TABLE app.reservas (
             id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
             store_id uuid NOT NULL REFERENCES app.stores (id),
             codigo   text NOT NULL)`,
          "ALTER TABLE app.reservas NO FORCE ROW LEVEL SECURITY",
          "CREATE UNIQUE INDEX reservas_codigo_uk ON app.reservas (codigo)",
        ],
        ["DROP TABLE app.reservas"],
        async () => {
          const recusa = await exigirEstruturaIntegra(migrador).then(
            () => null,
            (erro: unknown) => erro,
          );

          expect(recusa).toBeInstanceOf(ErroDeGuardaEstrutural);
          const mensagem = (recusa as Error).message;

          // A recusa precisa dizer QUAL guarda e QUAL objeto: sem isso quem
          // recebeu o portão vermelho vai caçar sozinho, e é aí que ele começa
          // a ser contornado.
          expect(mensagem).toContain("g1_isolamento_ativo.sql");
          expect(mensagem).toContain("app.reservas");
          expect(mensagem).toContain("g2_politica_por_comando.sql");
          expect(mensagem).toContain("g3_unica_por_loja.sql");
          expect(mensagem).toContain("app.reservas_codigo_uk");

          const achados = (recusa as ErroDeGuardaEstrutural).achados;
          expect(
            new Set(achados.map((achado) => achado.guarda.codigo)),
          ).toEqual(new Set(["g1", "g2", "g3"]));
        },
      );

      await expect(exigirEstruturaIntegra(migrador)).resolves.toBeDefined();
    },
    ESPERA_LONGA,
  );
});
