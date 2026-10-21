import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { CartaoDaLoja } from "../src/features/equipe/CartaoDaLoja.tsx";
import {
  cadastrarMembro,
  lerEquipe,
  mudarAcesso,
  trocarSenhaDoMembro,
} from "../src/lib/equipe-do-painel.ts";

const membro = {
  id: "v1",
  nome: "Ana",
  email: "ana@loja.test",
  papel: "STAFF",
  ativo: true,
  contaGerenciada: true,
  desde: "2026-10-16T10:00:00.000Z",
};

function respostaCom(status: number, corpo?: unknown): typeof fetch {
  return (async () =>
    new Response(corpo === undefined ? null : JSON.stringify(corpo), {
      status,
      headers: { "content-type": "application/json" },
    })) as typeof fetch;
}

describe("equipe do painel: acesso à API", () => {
  it("lê a equipe com limite e uso", async () => {
    const r = await lerEquipe(
      respostaCom(200, { membros: [membro], limite: { limite: 1, uso: 1 } }),
    );
    expect(r.estado).toBe("ok");
  });

  it("403 vira 'sem permissão' e resposta estranha vira erro", async () => {
    expect((await lerEquipe(respostaCom(403, { erro: "sem_permissao" }))).estado).toBe("sem-permissao");
    expect((await lerEquipe(respostaCom(200, { lixo: 1 }))).estado).toBe("erro");
  });

  it("cadastro: 409 limite_atingido traz a frase do suporte", async () => {
    const r = await cadastrarMembro(
      { nome: "Ana", email: "ana@loja.test", senha: "senha-forte-1" },
      respostaCom(409, { erro: "limite_atingido", recurso: "staff" }),
    );
    expect(r).toMatchObject({ estado: "recusado", motivo: "limite_atingido" });
    if (r.estado === "recusado") expect(r.mensagem).toContain("fale com o suporte");
  });

  it("cadastro feito devolve o membro", async () => {
    const r = await cadastrarMembro(
      { nome: "Ana", email: "ana@loja.test", senha: "senha-forte-1" },
      respostaCom(201, { membro, contaCriada: true }),
    );
    expect(r.estado).toBe("ok");
  });

  it("troca de senha e mudança de acesso aceitam 204 e explicam a recusa", async () => {
    expect((await trocarSenhaDoMembro("v1", "nova-senha-1", respostaCom(204))).estado).toBe("ok");
    expect((await mudarAcesso("v1", false, respostaCom(204))).estado).toBe("ok");
    const recusa = await trocarSenhaDoMembro("v1", "x", respostaCom(409, { erro: "senha_nao_gerenciada" }));
    expect(recusa.estado).toBe("recusado");
  });

  it("sem rede, devolve recusa em vez de lançar", async () => {
    const quebrada = (async () => {
      throw new Error("fora");
    }) as typeof fetch;
    expect((await mudarAcesso("v1", true, quebrada)).estado).toBe("recusado");
  });
});

describe("escolha de loja: cartão", () => {
  const acao = async () => {};
  const base = { papel: "OWNER", nome: "Loja X", apelido: "loja-x" } as const;

  it("loja ativa mostra pedidos de hoje e o botão abre", () => {
    const html = renderToStaticMarkup(
      <CartaoDaLoja
        loja={{ ...base, situacao: "ACTIVE" }}
        resumo={{ logo: null, pedidosHoje: 3 }}
        atual={false}
        acao={acao}
      />,
    );
    expect(html).toContain("3 pedidos hoje");
    expect(html).toContain("No ar");
    expect(html).not.toContain("disabled");
  });

  it("loja pendente ou recusada leva selo e botão desligado", () => {
    const pendente = renderToStaticMarkup(
      <CartaoDaLoja loja={{ ...base, situacao: "PENDING_APPROVAL" }} resumo={undefined} atual={false} acao={acao} />,
    );
    expect(pendente).toContain("Aguardando aprovação");
    expect(pendente).toContain("disabled");
    const recusada = renderToStaticMarkup(
      <CartaoDaLoja loja={{ ...base, situacao: "REJECTED" }} resumo={undefined} atual={false} acao={acao} />,
    );
    expect(recusada).toContain("Recusada");
    expect(recusada).toContain("disabled");
  });
});
