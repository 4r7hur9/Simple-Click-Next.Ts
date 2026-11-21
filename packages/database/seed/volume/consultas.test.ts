import { describe, expect, it } from "vitest";

import { cenarioPadrao, contem, ENV_VALIDO, fabricaFalsa } from "./apoio.ts";
import { CATALOGO_DE_CONSULTAS } from "./consultas.ts";
import { abrirTransacaoDeLeitura, gravarArtefatos, SQL_CONTEXTO, textoDoPlano, tiposDeNo, type CenarioExecutado } from "./explicar.ts";
import { abrirConexaoGuardada } from "./guarda.ts";
import { criarSanitizador, descreverErroSeguro } from "./sanitizar.ts";
import { ErroDoVolume, FalhaInduzida } from "./carga.ts";
import { ErroDeGuarda } from "../simulacao/banco.ts";

const TOKEN = "a1b2c3d4e5f60718293a4b5c6d7e8f9012345678"; // gitleaks:allow (valor fictício de teste)

describe("catálogo de consultas", () => {
  it("[CA-6] toda consulta declara origem (literal ou equivalente) e fonte arquivo:linha", () => {
    for (const q of CATALOGO_DE_CONSULTAS) {
      expect(["literal", "equivalente"]).toContain(q.origem);
      expect(q.fonte).toMatch(/^[\w./-]+:\d+$/);
      expect(q.descricao.length).toBeGreaterThan(5);
    }
    const ids = CATALOGO_DE_CONSULTAS.map((q) => q.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const obrigatoria of ["quadro-do-dia", "quadro-de-hoje", "fila", "historico-pedidos", "meus-pedidos-chamada", "meus-pedidos-corpo", "catalogo-resumo", "catalogo-pagina", "token-pedido", "token-loja"]) {
      expect(ids).toContain(obrigatoria);
    }
  });

  it("[CA-6] a fonte em SQL cru é 'literal' e a do Prisma é 'equivalente' (nunca finge captura)", () => {
    const origem = (id: string) => CATALOGO_DE_CONSULTAS.find((q) => q.id === id)!.origem;
    for (const id of ["dia-da-loja", "catalogo-resumo", "catalogo-pagina", "meus-pedidos-corpo", "token-loja"]) expect(origem(id)).toBe("literal");
    for (const id of ["quadro-do-dia", "fila", "historico-pedidos", "token-pedido", "token-itens"]) expect(origem(id)).toBe("equivalente");
  });

  it("[CA-6] os parâmetros são numerados sem buraco e não há DML nem DDL", () => {
    for (const q of CATALOGO_DE_CONSULTAS) {
      const usados = [...new Set([...q.sql.matchAll(/\$(\d+)/g)].map((m) => Number(m[1])))].sort((a, b) => a - b);
      expect(usados, q.id).toEqual(usados.map((_v, i) => i + 1));
      expect(q.sql, q.id).not.toMatch(/\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE|GRANT)\b/i);
    }
  });

  it("[CA-6] o quadro de hoje inclui o ramo de pendências de dias anteriores e o do dia passado não", () => {
    const sql = (id: string) => CATALOGO_DE_CONSULTAS.find((q) => q.id === id)!.sql;
    expect(sql("quadro-de-hoje")).toContain("NOT IN ('COMPLETED', 'CANCELLED')");
    expect(sql("quadro-do-dia")).not.toContain("NOT IN");
    expect(sql("historico-pedidos")).toContain("LIMIT 100");
    expect(sql("fila")).toContain("NOT IN ('COMPLETED', 'CANCELLED')");
  });
});

describe("contexto RLS e transação de leitura", () => {
  it("[CA-6] grava os seis set_config com is_local = true", () => {
    for (const nome of ["app.store_id", "app.user_id", "app.role", "app.order_token", "app.checkout_key", "app.cart_session"]) {
      expect(SQL_CONTEXTO).toContain(`'${nome}'`);
    }
    expect([...SQL_CONTEXTO.matchAll(/set_config/g)]).toHaveLength(6);
    expect([...SQL_CONTEXTO.matchAll(/, true\)/g)]).toHaveLength(6);
  });

  it("[CA-6] abre BEGIN READ ONLY com timeouts e só então grava o contexto", async () => {
    const { fabrica, registro } = fabricaFalsa(cenarioPadrao());
    const app = await abrirConexaoGuardada(ENV_VALIDO, "sc_app", fabrica);
    registro.consultas.length = 0;
    await abrirTransacaoDeLeitura(app, { lojaId: "l", usuarioId: "u", papel: "OWNER", tokenDoPedido: "" });
    const sqls = registro.consultas.map((c) => c.sql.replace(/\s+/g, " ").trim());
    expect(sqls[0]).toBe("BEGIN READ ONLY");
    expect(sqls[1]).toBe("SET LOCAL statement_timeout = '60s'");
    expect(sqls[2]).toBe("SET LOCAL lock_timeout = '5s'");
    expect(sqls[3]).toContain("set_config('app.store_id'");
    expect(registro.consultas[3]!.valores).toEqual(["l", "u", "OWNER", "", "", ""]);
    expect(contem(registro, "enable_seqscan")).toBe(0);
  });
});

describe("plano", () => {
  const plano = {
    Plan: { "Node Type": "Limit", "Startup Cost": 0.4, "Total Cost": 9.1, "Plan Rows": 3, "Actual Startup Time": 0.05, "Actual Total Time": 0.09, "Actual Rows": 3, "Actual Loops": 1, "Shared Hit Blocks": 4, "Shared Read Blocks": 0,
      Plans: [{ "Node Type": "Index Scan", "Relation Name": "orders", "Index Name": "orders_painel_idx", "Index Cond": "(public_token = 'x')", "Startup Cost": 0.4, "Total Cost": 8, "Plan Rows": 3, "Actual Startup Time": 0.04, "Actual Total Time": 0.08, "Actual Rows": 3, "Actual Loops": 1, "Shared Hit Blocks": 4 }] },
    "Planning Time": 0.2, "Execution Time": 0.12,
  };

  it("[CA-6] lista os nós e deriva o texto do JSON (uma execução só)", () => {
    expect(tiposDeNo(plano.Plan)).toEqual(["Limit", "Index Scan [orders_painel_idx]"]);
    const texto = textoDoPlano(plano);
    expect(texto).toContain("Index Scan em orders usando orders_painel_idx");
    expect(texto).toContain("Buffers: shared hit=4 read=0");
    expect(texto).toContain("Execution Time: 0.12 ms");
  });
});

describe("sanitização", () => {
  it("[CA-7] redige token, e-mail, telefone, JWT e os valores ligados (igualdade exata), inclusive em JSON aninhado e chaves", () => {
    const s = criarSanitizador([TOKEN, "11111111-2222-4333-8444-555555555555", "maria"]);
    const bruto = { Plan: { "Index Cond": `(public_token = '${TOKEN}')`, Filter: "(identity_id = '11111111-2222-4333-8444-555555555555'::uuid)", Extra: ["contato maria@exemplo.com", "tel +5585988887777", "eyJhbGciOi.payload.assinatura"] }, [TOKEN]: 1 };
    const limpo = JSON.stringify(s.json(bruto));
    for (const proibido of [TOKEN, "maria", "@exemplo", "+5585988887777", "eyJ", "11111111-2222"]) expect(limpo.includes(proibido)).toBe(false);
    expect(s.varrer(limpo)).toEqual([]);
    expect(s.texto(`x ${TOKEN} y`)).toBe("x <token> y");
    expect(s.texto("contato maria@exemplo.com")).toBe("contato <email>");
    expect(s.texto("só maria aqui")).toBe("só <valor> aqui");
  });

  it("[CA-7] a varredura final acusa o que sobrou", () => {
    const s = criarSanitizador(["segredo-ligado"]);
    expect(s.varrer("tudo limpo")).toEqual([]);
    expect(s.varrer("há segredo-ligado aqui")).toContain("valor ligado na execução");
    expect(s.varrer("Set-Cookie: x")).toContain("Set-Cookie");
  });

  it("[CA-7] erros do driver nunca vão para a saída: só etapa/código, ou o motivo da guarda sem URL", () => {
    const bruto = Object.assign(new Error(`duplicate key ... Key (public_token)=(${TOKEN}) postgresql://sc_admin:senha@localhost:5432/x`), { code: "23505" });
    expect(descreverErroSeguro(bruto)).toBe("Falha inesperada (detalhe omitido por segurança).");
    expect(descreverErroSeguro(new ErroDoVolume("loja 3", "23505"))).toBe('Falha na etapa "loja 3" (código 23505).');
    expect(descreverErroSeguro(new FalhaInduzida(2))).toContain("Falha induzida na loja 2");
    const guarda = descreverErroSeguro(new ErroDeGuarda("Não consegui conectar em postgresql://localhost:5432/simpleclick_simulacao: ECONNREFUSED"));
    expect(guarda).not.toMatch(/localhost|5432/);
  });

  it("[CA-7] os artefatos do EXPLAIN saem sem token e recusam gravar se algo sensível sobrar", async () => {
    const registro = (plano: unknown) => ({ consulta: "token-pedido", passada: 1 as const, linhas: 1, planejamentoMs: 0.1, execucaoMs: 0.2, compartilhadosEmCache: 1, compartilhadosLidos: 0, nosPrincipais: ["Index Scan"], plano });
    const cenario = (plano: unknown): CenarioExecutado => ({ id: "pedido-pelo-token", descricao: "Pedido pelo token", loja: "SIM-abcdef01-001 (menor do volume)", papel: "PUBLIC", conexao: "sc_app", parametros: {}, registros: [registro(plano)], vazio: false });
    const com = { Plan: { "Node Type": "Index Scan", "Index Cond": `(public_token = '${TOKEN}')` }, "Planning Time": 0.1, "Execution Time": 0.2 };
    const nomes = await gravarArtefatos([cenario(com)], [], [], criarSanitizador([TOKEN]), null);
    expect(nomes).toEqual(["pedido-pelo-token-SIM-abcdef01-001.json", "pedido-pelo-token-SIM-abcdef01-001.txt", "negativas.json", "autoanalyze.json"]);
    const ruim = { Plan: { "Node Type": "Result", Extra: "Set-Cookie: sessao=1" }, "Planning Time": 0.1, "Execution Time": 0.2 };
    await expect(gravarArtefatos([cenario(ruim)], [], [], criarSanitizador([TOKEN]), null)).rejects.toThrow(/nada foi gravado/);
  });
});
