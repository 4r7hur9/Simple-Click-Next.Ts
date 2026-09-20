"use client";

import { useEffect, useState } from "react";

const FORMAS = [
  ["PIX", "PIX"],
  ["CASH", "Dinheiro"],
  ["CARD_ON_DELIVERY", "Cartão na entrega"],
] as const;

interface Pix {
  tipo: "CPF" | "CNPJ" | "TELEFONE" | "EMAIL" | "ALEATORIA";
  chave: string;
  titular: string;
}

export function FormularioPagamento() {
  const [formas, setFormas] = useState<string[]>([]);
  const [pix, setPix] = useState<Pix | null>(null);
  const [estado, setEstado] = useState("Carregando pagamento…");
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    void fetch("/api/loja/pagamento", { cache: "no-store" })
      .then(async (resposta) => {
        if (!resposta.ok) throw new Error();
        return (await resposta.json()) as { formas: string[]; pix: Pix | null };
      })
      .then((dados) => {
        setFormas(dados.formas);
        setPix(dados.pix);
        setEstado("Pagamento carregado.");
      })
      .catch(() => setEstado("Entre novamente para editar o pagamento."));
  }, []);

  function alternarForma(forma: string, ativa: boolean) {
    setFormas((anteriores) =>
      ativa
        ? [...new Set([...anteriores, forma])]
        : anteriores.filter((valor) => valor !== forma),
    );
    if (forma === "PIX" && ativa && pix === null) {
      setPix({ tipo: "ALEATORIA", chave: "", titular: "" });
    }
  }

  async function salvar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setSalvando(true);
    setEstado("Salvando…");
    try {
      const resposta = await fetch("/api/loja/pagamento", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          formas,
          pix: formas.includes("PIX") ? pix : null,
        }),
      });
      if (!resposta.ok) throw new Error();
      setEstado("Pagamento salvo. O checkout já usará esta configuração.");
    } catch {
      setEstado("Não foi possível salvar. Confira a chave PIX.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <form
      onSubmit={(evento) => void salvar(evento)}
      className="mt-8 max-w-2xl space-y-6"
    >
      <fieldset className="space-y-3">
        <legend className="font-medium">Formas aceitas</legend>
        {FORMAS.map(([valor, rotulo]) => (
          <label className="flex items-center gap-3" key={valor}>
            <input
              className="h-5 w-5"
              type="checkbox"
              checked={formas.includes(valor)}
              onChange={(evento) => alternarForma(valor, evento.target.checked)}
            />
            <span>{rotulo}</span>
          </label>
        ))}
      </fieldset>
      {formas.includes("PIX") && pix ? (
        <fieldset className="space-y-4 rounded-2xl border border-[var(--cor-borda)] p-5">
          <legend className="px-2 font-medium">Chave PIX</legend>
          <label className="block">
            <span>Tipo</span>
            <select
              className="sc-campo mt-2 w-full"
              value={pix.tipo}
              onChange={(evento) =>
                setPix({ ...pix, tipo: evento.target.value as Pix["tipo"] })
              }
            >
              {["CPF", "CNPJ", "TELEFONE", "EMAIL", "ALEATORIA"].map((tipo) => (
                <option key={tipo}>{tipo}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span>Chave</span>
            <input
              className="sc-campo mt-2 w-full"
              value={pix.chave}
              onChange={(evento) =>
                setPix({ ...pix, chave: evento.target.value })
              }
              required
            />
          </label>
          <label className="block">
            <span>Nome do recebedor</span>
            <input
              className="sc-campo mt-2 w-full"
              value={pix.titular}
              onChange={(evento) =>
                setPix({ ...pix, titular: evento.target.value })
              }
              required
            />
          </label>
        </fieldset>
      ) : null}
      <div className="flex flex-wrap items-center gap-4">
        <button
          className="sc-botao sc-botao--primario"
          type="submit"
          disabled={salvando}
        >
          {salvando ? "Salvando…" : "Salvar pagamento"}
        </button>
        <p role="status" className="text-sm text-[var(--cor-tinta-suave)]">
          {estado}
        </p>
      </div>
    </form>
  );
}
