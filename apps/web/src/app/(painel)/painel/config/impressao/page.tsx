"use client";

import { useEffect, useState } from "react";

type Configuracao = {
  larguraMm: 58 | 80;
  conteudo: {
    pedido: boolean;
    itens: boolean;
    total: boolean;
    enderecoCliente: boolean;
    totalEmDestaque: boolean;
    observacoes: boolean;
  };
};

const PADRAO: Configuracao = {
  larguraMm: 80,
  conteudo: {
    pedido: true,
    itens: true,
    total: true,
    enderecoCliente: true,
    totalEmDestaque: false,
    observacoes: true,
  },
};

export default function PaginaDeImpressao() {
  const [configuracao, setConfiguracao] = useState(PADRAO);
  const [estado, setEstado] = useState("Carregando impressão…");
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    void fetch("/api/loja/impressao", { cache: "no-store" })
      .then(async (resposta) => {
        if (!resposta.ok) throw new Error();
        return (await resposta.json()) as Configuracao;
      })
      .then((dados) => {
        setConfiguracao({
          ...PADRAO,
          ...dados,
          conteudo: { ...PADRAO.conteudo, ...dados.conteudo },
        });
        setEstado("Impressão carregada.");
      })
      .catch(() => setEstado("Entre novamente para editar a impressão."));
  }, []);

  function mudarConteudo(
    campo: keyof Configuracao["conteudo"],
    valor: boolean,
  ) {
    setConfiguracao((anterior) => ({
      ...anterior,
      conteudo: { ...anterior.conteudo, [campo]: valor },
    }));
  }

  async function salvar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setSalvando(true);
    setEstado("Salvando…");
    try {
      const resposta = await fetch("/api/loja/impressao", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(configuracao),
      });
      if (!resposta.ok) throw new Error();
      setEstado("Configuração de impressão salva.");
    } catch {
      setEstado("Não foi possível salvar a configuração de impressão.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <main className="pt-8">
      <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--cor-primaria)]">
        Configuração da loja
      </p>
      <h1 className="mt-3 text-4xl font-semibold tracking-[-0.04em]">
        Impressão do cupom
      </h1>
      <p className="mt-3 max-w-2xl text-lg leading-8 text-[var(--cor-tinta-suave)]">
        Escolha a largura do papel e as informações opcionais do cupom.
      </p>
      <form
        onSubmit={(evento) => void salvar(evento)}
        className="mt-8 max-w-2xl space-y-6"
      >
        <fieldset className="space-y-3">
          <legend className="font-medium">Largura do papel</legend>
          {[58, 80].map((largura) => (
            <label
              className="mr-5 inline-flex items-center gap-2"
              key={largura}
            >
              <input
                type="radio"
                name="larguraMm"
                checked={configuracao.larguraMm === largura}
                onChange={() =>
                  setConfiguracao((anterior) => ({
                    ...anterior,
                    larguraMm: largura as 58 | 80,
                  }))
                }
              />
              {largura} mm
            </label>
          ))}
        </fieldset>
        <fieldset className="space-y-3">
          <legend className="font-medium">Conteúdo opcional</legend>
          {(
            [
              ["enderecoCliente", "Endereço do cliente"],
              ["totalEmDestaque", "Total em destaque"],
              ["observacoes", "Observações"],
            ] as const
          ).map(([campo, rotulo]) => (
            <label className="flex items-center gap-3" key={campo}>
              <input
                type="checkbox"
                checked={configuracao.conteudo[campo]}
                onChange={(evento) =>
                  mudarConteudo(campo, evento.target.checked)
                }
              />
              {rotulo}
            </label>
          ))}
        </fieldset>
        <p className="text-sm text-[var(--cor-tinta-suave)]">
          Pedido, itens e valor total são obrigatórios e permanecem sempre no
          cupom.
        </p>
        <div className="flex flex-wrap items-center gap-4">
          <button
            className="sc-botao sc-botao--primario"
            type="submit"
            disabled={salvando}
          >
            {salvando ? "Salvando…" : "Salvar impressão"}
          </button>
          <p role="status" className="text-sm text-[var(--cor-tinta-suave)]">
            {estado}
          </p>
        </div>
      </form>
    </main>
  );
}
