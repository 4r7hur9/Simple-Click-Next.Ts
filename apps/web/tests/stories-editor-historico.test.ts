/**
 * Pilha de desfazer e refazer do editor de Stories (card #84), e as
 * operações sobre o documento.
 */
import { describe, expect, it } from "vitest";

import {
  adicionarCamada,
  adicionarTraco,
  criarEmoji,
  criarEtiqueta,
  criarTexto,
  documentoVazio,
  estenderTraco,
  mudarFundo,
  mudarModoDoFundo,
  mudarTransformacao,
  novoTraco,
  produtoDoStory,
  removerCamada,
  temEdicao,
  textoDoPreco,
  tintaSobre,
  trazerParaFrente,
} from "../src/features/stories/documento";
import {
  alterarAoVivo,
  criarHistorico,
  desfazer,
  fecharAlteracao,
  podeDesfazer,
  podeRefazer,
  refazer,
  registrar,
} from "../src/features/stories/historico";

describe("histórico", () => {
  it("registra, desfaz e refaz na ordem", () => {
    let h = criarHistorico(1);
    h = registrar(h, 2);
    h = registrar(h, 3);
    expect(h.presente).toBe(3);
    expect(podeDesfazer(h)).toBe(true);
    expect(podeRefazer(h)).toBe(false);

    h = desfazer(h);
    expect(h.presente).toBe(2);
    h = desfazer(h);
    expect(h.presente).toBe(1);
    expect(podeDesfazer(h)).toBe(false);
    expect(desfazer(h)).toBe(h);

    h = refazer(h);
    expect(h.presente).toBe(2);
    h = refazer(h);
    expect(h.presente).toBe(3);
    expect(refazer(h)).toBe(h);
  });

  it("uma ação nova depois de desfazer apaga o que seria refeito", () => {
    let h = registrar(registrar(criarHistorico("a"), "b"), "c");
    h = desfazer(h);
    h = registrar(h, "d");
    expect(h.presente).toBe("d");
    expect(podeRefazer(h)).toBe(false);
    expect(desfazer(h).presente).toBe("b");
  });

  it("registrar o mesmo estado não cria passo", () => {
    const h = criarHistorico({ n: 1 });
    expect(registrar(h, h.presente)).toBe(h);
  });

  it("um gesto ao vivo vira UM passo só", () => {
    const inicio = { x: 0 };
    let h = criarHistorico(inicio);
    h = alterarAoVivo(h, { x: 10 });
    h = alterarAoVivo(h, { x: 20 });
    h = alterarAoVivo(h, { x: 30 });
    expect(h.passado).toHaveLength(0);
    h = fecharAlteracao(h, inicio);
    expect(h.passado).toEqual([inicio]);
    expect(desfazer(h).presente).toBe(inicio);
  });

  it("gesto que acabou onde começou não vira passo", () => {
    const inicio = { x: 0 };
    const h = fecharAlteracao(criarHistorico(inicio), inicio);
    expect(podeDesfazer(h)).toBe(false);
  });

  it("respeita o limite de passos", () => {
    let h = criarHistorico(0);
    for (let i = 1; i <= 10; i += 1) h = registrar(h, i, 3);
    expect(h.passado).toHaveLength(3);
    expect(h.passado[0]).toBe(7);
  });
});

describe("documento", () => {
  const t = { x: 540, y: 800, escala: 1, rotacao: 0 };

  it("começa sem edição", () => {
    expect(temEdicao(documentoVazio())).toBe(false);
  });

  it("traço, texto, emoji e etiqueta contam como edição e podem ser desfeitos", () => {
    let h = criarHistorico(documentoVazio());
    const traco = estenderTraco(novoTraco("#fff", 26, false, { x: 1, y: 1 }), {
      x: 50,
      y: 60,
    });
    h = registrar(h, adicionarTraco(h.presente, traco));
    h = registrar(
      h,
      adicionarCamada(
        h.presente,
        criarTexto(
          { texto: "Oi", fonte: "moderno", cor: "#fff", alinhamento: "centro", comFundo: false },
          t,
        ),
      ),
    );
    h = registrar(h, adicionarCamada(h.presente, criarEmoji("🔥", t)));
    expect(h.presente.tracos).toHaveLength(1);
    expect(h.presente.camadas).toHaveLength(2);
    expect(temEdicao(h.presente)).toBe(true);

    h = desfazer(desfazer(desfazer(h)));
    expect(temEdicao(h.presente)).toBe(false);
  });

  it("ignora pontos colados no traço", () => {
    const traco = novoTraco("#fff", 10, false, { x: 0, y: 0 });
    expect(estenderTraco(traco, { x: 0.5, y: 0.5 })).toBe(traco);
    expect(estenderTraco(traco, { x: 10, y: 0 }).pontos).toHaveLength(2);
  });

  it("move, remove e traz para a frente", () => {
    const a = criarEmoji("🔥", t);
    const b = criarEmoji("⭐", t);
    let doc = adicionarCamada(adicionarCamada(documentoVazio(), a), b);
    doc = mudarTransformacao(doc, a.id, { ...t, x: 100 });
    expect(doc.camadas[0]?.t.x).toBe(100);
    doc = trazerParaFrente(doc, a.id);
    expect(doc.camadas.map((c) => c.id)).toEqual([b.id, a.id]);
    expect(trazerParaFrente(doc, a.id)).toBe(doc);
    doc = removerCamada(doc, a.id);
    expect(doc.camadas.map((c) => c.id)).toEqual([b.id]);
    expect(removerCamada(doc, "nao-existe")).toBe(doc);
  });

  it("mexer na foto conta; trocar o modo volta ao centro", () => {
    let doc = mudarFundo(documentoVazio(), { x: 600, y: 900, escala: 2, rotacao: 0.1 });
    expect(temEdicao(doc)).toBe(true);
    doc = mudarModoDoFundo(doc, "ajustar");
    expect(doc.fundo.modo).toBe("ajustar");
    expect(doc.fundo.t.escala).toBe(1);
    expect(mudarModoDoFundo(doc, "ajustar")).toBe(doc);
  });

  it("o produto do story é o da última etiqueta de produto", () => {
    const modelo = { texto: "🛍 Pastel", fundo: "#fff", tinta: "#000" };
    let doc = adicionarCamada(documentoVazio(), criarEtiqueta(modelo, t));
    expect(produtoDoStory(doc)).toBeNull();
    doc = adicionarCamada(doc, criarEtiqueta(modelo, t, { id: "p1", nome: "Pastel" }));
    doc = adicionarCamada(doc, criarEtiqueta(modelo, t, { id: "p2", nome: "Coxinha" }));
    expect(produtoDoStory(doc)).toEqual({ id: "p2", nome: "Coxinha" });
  });

  it("escolhe tinta preta ou branca conforme o fundo", () => {
    expect(tintaSobre("#ffffff")).toBe("#000000");
    expect(tintaSobre("#b7ff00")).toBe("#000000");
    expect(tintaSobre("#000000")).toBe("#ffffff");
    expect(tintaSobre("#0a84ff")).toBe("#ffffff");
    expect(tintaSobre("nada")).toBe("#ffffff");
  });

  it("monta o texto do preço", () => {
    expect(textoDoPreco("19,9")).toContain("19,90");
    expect(textoDoPreco("1.250")).toContain("1.250,00");
    expect(textoDoPreco("")).toBeNull();
    expect(textoDoPreco("abc")).toBeNull();
    expect(textoDoPreco("0")).toBeNull();
  });
});
