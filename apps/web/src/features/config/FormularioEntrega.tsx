"use client";

import { useEffect, useState } from "react";

interface Entrega {
  aceitaEntrega: boolean;
  aceitaRetirada: boolean;
  taxaCentavos: string;
  nomeDaTaxa: string;
  gratisAcimaDeCentavos: string;
  minimoParaEntregaCentavos: string;
  minimoParaRetiradaCentavos: string;
  prazoMinutos: string;
}

const VAZIA: Entrega = {
  aceitaEntrega: true,
  aceitaRetirada: true,
  taxaCentavos: "",
  nomeDaTaxa: "Taxa de entrega",
  gratisAcimaDeCentavos: "",
  minimoParaEntregaCentavos: "",
  minimoParaRetiradaCentavos: "",
  prazoMinutos: "",
};

function reaisParaCentavos(valor: string): number | null {
  if (valor.trim() === "") return null;
  const numero = Number(valor.replace(",", "."));
  return Number.isFinite(numero) && numero >= 0
    ? Math.round(numero * 100)
    : null;
}

function centavosParaReais(valor: unknown): string {
  return typeof valor === "number" ? (valor / 100).toFixed(2) : "";
}

export function FormularioEntrega() {
  const [formulario, setFormulario] = useState(VAZIA);
  const [estado, setEstado] = useState("Carregando entrega…");
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    void fetch("/api/loja/entrega", { cache: "no-store" })
      .then(async (resposta) => {
        if (!resposta.ok) throw new Error();
        return (await resposta.json()) as Record<string, unknown>;
      })
      .then((dados) => {
        setFormulario({
          aceitaEntrega: dados.aceitaEntrega === true,
          aceitaRetirada: dados.aceitaRetirada === true,
          taxaCentavos: centavosParaReais(dados.taxaCentavos),
          nomeDaTaxa:
            typeof dados.nomeDaTaxa === "string"
              ? dados.nomeDaTaxa
              : VAZIA.nomeDaTaxa,
          gratisAcimaDeCentavos: centavosParaReais(dados.gratisAcimaDeCentavos),
          minimoParaEntregaCentavos: centavosParaReais(
            dados.minimoParaEntregaCentavos,
          ),
          minimoParaRetiradaCentavos: centavosParaReais(
            dados.minimoParaRetiradaCentavos,
          ),
          prazoMinutos:
            typeof dados.prazoMinutos === "number"
              ? String(dados.prazoMinutos)
              : "",
        });
        setEstado("Entrega carregada.");
      })
      .catch(() => setEstado("Entre novamente para editar a entrega."));
  }, []);

  function mudar(campo: keyof Entrega, valor: string | boolean) {
    setFormulario((anterior) => ({ ...anterior, [campo]: valor }));
  }

  async function salvar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setSalvando(true);
    setEstado("Salvando…");
    try {
      const resposta = await fetch("/api/loja/entrega", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          aceitaEntrega: formulario.aceitaEntrega,
          aceitaRetirada: formulario.aceitaRetirada,
          taxaCentavos: reaisParaCentavos(formulario.taxaCentavos),
          nomeDaTaxa: formulario.nomeDaTaxa || null,
          gratisAcimaDeCentavos: reaisParaCentavos(
            formulario.gratisAcimaDeCentavos,
          ),
          minimoParaEntregaCentavos: reaisParaCentavos(
            formulario.minimoParaEntregaCentavos,
          ),
          minimoParaRetiradaCentavos: reaisParaCentavos(
            formulario.minimoParaRetiradaCentavos,
          ),
          prazoMinutos:
            formulario.prazoMinutos.trim() === ""
              ? null
              : Number(formulario.prazoMinutos),
        }),
      });
      if (!resposta.ok) throw new Error();
      setEstado("Entrega salva. O checkout já usará estes valores.");
    } catch {
      setEstado("Não foi possível salvar. Confira os valores informados.");
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
        <legend className="font-medium">Modos de recebimento</legend>
        {[
          ["aceitaEntrega", "Entrega"],
          ["aceitaRetirada", "Retirada no local"],
        ].map(([campo, rotulo]) => (
          <label className="flex items-center gap-3" key={campo}>
            <input
              className="h-5 w-5"
              type="checkbox"
              checked={formulario[campo as keyof Entrega] as boolean}
              onChange={(evento) =>
                mudar(campo as keyof Entrega, evento.target.checked)
              }
            />
            <span>{rotulo}</span>
          </label>
        ))}
      </fieldset>
      {[
        ["taxaCentavos", "Taxa de entrega (R$)", "0,00"],
        ["gratisAcimaDeCentavos", "Entrega grátis acima de (R$)", "60,00"],
        ["minimoParaEntregaCentavos", "Mínimo para entrega (R$)", "25,00"],
        ["minimoParaRetiradaCentavos", "Mínimo para retirada (R$)", "0,00"],
      ].map(([campo, rotulo, placeholder]) => (
        <label className="block" key={campo}>
          <span>{rotulo}</span>
          <input
            className="sc-campo mt-2 w-full"
            type="text"
            inputMode="decimal"
            value={formulario[campo as keyof Entrega] as string}
            onChange={(evento) =>
              mudar(campo as keyof Entrega, evento.target.value)
            }
            placeholder={placeholder}
          />
        </label>
      ))}
      <label className="block">
        <span>Nome da taxa</span>
        <input
          className="sc-campo mt-2 w-full"
          value={formulario.nomeDaTaxa}
          onChange={(evento) => mudar("nomeDaTaxa", evento.target.value)}
        />
      </label>
      <label className="block">
        <span>Prazo estimado (minutos)</span>
        <input
          className="sc-campo mt-2 w-full"
          type="number"
          min="0"
          value={formulario.prazoMinutos}
          onChange={(evento) => mudar("prazoMinutos", evento.target.value)}
        />
      </label>
      <div className="flex flex-wrap items-center gap-4">
        <button
          className="sc-botao sc-botao--primario"
          type="submit"
          disabled={salvando}
        >
          {salvando ? "Salvando…" : "Salvar entrega"}
        </button>
        <p role="status" className="text-sm text-[var(--cor-tinta-suave)]">
          {estado}
        </p>
      </div>
    </form>
  );
}
