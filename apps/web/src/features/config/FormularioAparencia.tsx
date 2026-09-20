"use client";

import { useEffect, useState } from "react";

interface Aparencia {
  readonly boasVindas: string | null;
  readonly sobre: string | null;
  readonly logo: string | null;
  readonly capa: string | null;
  readonly corPrimaria: string | null;
}

const VAZIA: Aparencia = {
  boasVindas: "",
  sobre: "",
  logo: "",
  capa: "",
  corPrimaria: "",
};

export function FormularioAparencia() {
  const [formulario, setFormulario] = useState<Aparencia>(VAZIA);
  const [estado, setEstado] = useState("Carregando configuração…");
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    void fetch("/api/loja/aparencia", { cache: "no-store" })
      .then(async (resposta) => {
        if (!resposta.ok)
          throw new Error("Não foi possível carregar a configuração.");
        return (await resposta.json()) as Aparencia;
      })
      .then((dados) => {
        setFormulario({ ...VAZIA, ...dados });
        setEstado("Configuração carregada.");
      })
      .catch(() => setEstado("Entre novamente para editar a aparência."));
  }, []);

  function mudar(campo: keyof Aparencia, valor: string) {
    setFormulario((anterior) => ({ ...anterior, [campo]: valor }));
  }

  async function salvar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setSalvando(true);
    setEstado("Salvando…");
    try {
      const resposta = await fetch("/api/loja/aparencia", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...formulario,
          boasVindas: formulario.boasVindas || null,
          logo: formulario.logo || null,
          capa: formulario.capa || null,
          corPrimaria: formulario.corPrimaria || null,
        }),
      });
      if (!resposta.ok) throw new Error();
      setEstado("Aparência salva. Abra sua loja para conferir.");
    } catch {
      setEstado("Não foi possível salvar. Confira os endereços das imagens.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <form
      onSubmit={(evento) => void salvar(evento)}
      className="mt-8 max-w-2xl space-y-6"
    >
      <label className="block">
        <span className="font-medium">Mensagem de boas-vindas</span>
        <textarea
          className="sc-campo mt-2 min-h-28 w-full"
          value={formulario.boasVindas ?? ""}
          onChange={(evento) => mudar("boasVindas", evento.target.value)}
          maxLength={280}
        />
      </label>
      <label className="block">
        <span className="font-medium">URL da logo</span>
        <input
          className="sc-campo mt-2 w-full"
          type="url"
          value={formulario.logo ?? ""}
          onChange={(evento) => mudar("logo", evento.target.value)}
          placeholder="https://…"
        />
      </label>
      <label className="block">
        <span className="font-medium">Sobre a loja</span>
        <textarea
          className="sc-campo mt-2 min-h-36 w-full"
          value={formulario.sobre ?? ""}
          onChange={(evento) => mudar("sobre", evento.target.value)}
          maxLength={2_000}
        />
        <span className="mt-2 block text-sm text-[var(--cor-tinta-suave)]">
          Conte a história do negócio para a página pública Sobre.
        </span>
      </label>
      <label className="block">
        <span className="font-medium">URL da capa</span>
        <input
          className="sc-campo mt-2 w-full"
          type="url"
          value={formulario.capa ?? ""}
          onChange={(evento) => mudar("capa", evento.target.value)}
          placeholder="https://…"
        />
      </label>
      <label className="flex items-center gap-3">
        <span className="font-medium">Cor principal</span>
        <input
          className="h-11 w-16 cursor-pointer rounded border border-[var(--cor-borda)]"
          type="color"
          value={formulario.corPrimaria ?? ""}
          onChange={(evento) => mudar("corPrimaria", evento.target.value)}
        />
        <code>{formulario.corPrimaria}</code>
      </label>
      <div className="flex flex-wrap items-center gap-4">
        <button
          className="sc-botao sc-botao--primario"
          type="submit"
          disabled={salvando}
        >
          {salvando ? "Salvando…" : "Salvar aparência"}
        </button>
        <p role="status" className="text-sm text-[var(--cor-tinta-suave)]">
          {estado}
        </p>
      </div>
    </form>
  );
}
