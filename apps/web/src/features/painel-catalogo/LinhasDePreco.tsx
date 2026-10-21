"use client";

import { useEffect, useId, useState } from "react";

import { centavosDoTexto } from "../../lib/dinheiro.ts";
import { Seletor } from "@simpleclick/ui";

import { EXPLICACOES } from "./explicacoes.ts";
import { CampoComRotulo, descritoDoInfo } from "./RotuloComInfo.tsx";

/** O tipo do preço como o dono lê: nunca o enum em inglês da API. */
const ROTULO_DO_TIPO_DE_PRECO: Readonly<Record<string, string>> = {
  BASE: "Preço normal",
  PROMO: "Promoção",
  WHOLESALE: "Atacado (preço fixo)",
  CLUB: "Clube",
};

function nomeDoPreco(preco: Preco): string {
  return preco.rotulo ?? ROTULO_DO_TIPO_DE_PRECO[preco.tipo] ?? "Preço";
}

interface Preco {
  readonly id: string;
  readonly tipo: "BASE" | "PROMO" | "WHOLESALE" | "CLUB" | string;
  readonly rotulo: string | null;
  readonly valorCentavos: number;
  readonly quantidadeMinima: number;
  readonly ativo: boolean;
}

interface Props {
  readonly produtoId: string;
}

function escreverDinheiro(centavos: number): string {
  return (centavos / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

const VAZIO = {
  tipo: "PROMO",
  rotulo: "",
  valor: "",
  quantidade: "1",
  ativo: true,
};

export function LinhasDePreco({ produtoId }: Props) {
  const base = useId();
  const [precos, setPrecos] = useState<Preco[]>([]);
  const [formulario, setFormulario] = useState(VAZIO);
  const [mensagem, setMensagem] = useState("Carregando preços…");
  const [salvando, setSalvando] = useState(false);

  async function carregar() {
    try {
      const resposta = await fetch(
        `/api/catalogo/produtos/${produtoId}/precos`,
        {
          cache: "no-store",
        },
      );
      if (!resposta.ok) throw new Error();
      const dados = (await resposta.json()) as { precos: Preco[] };
      setPrecos(dados.precos);
      setMensagem(
        dados.precos.length === 0
          ? "Nenhum preço nomeado cadastrado."
          : `${dados.precos.length} preço(s) cadastrado(s).`,
      );
    } catch {
      setMensagem("Não foi possível carregar os preços.");
    }
  }

  useEffect(() => {
    void carregar();
  }, [produtoId]);

  async function adicionar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    // Lido como TEXTO até virar centavos: "19,99" é 1999, e nunca passa pelo
    // 1998.9999999999998 que a conta em ponto flutuante daria (AC-311).
    const centavos = centavosDoTexto(formulario.valor);
    const quantidade = Number(formulario.quantidade);
    if (
      centavos === null ||
      centavos < 0 ||
      !Number.isInteger(quantidade) ||
      quantidade < 1
    ) {
      setMensagem("Informe valor e quantidade válidos.");
      return;
    }
    if (formulario.tipo === "WHOLESALE" && quantidade < 2) {
      setMensagem("O atacado começa a partir de duas unidades.");
      return;
    }
    setSalvando(true);
    setMensagem("Salvando preço…");
    try {
      const resposta = await fetch(
        `/api/catalogo/produtos/${produtoId}/precos`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            tipo: formulario.tipo,
            rotulo: formulario.rotulo.trim() || null,
            valorCentavos: centavos,
            quantidadeMinima: quantidade,
            inicio: null,
            fim: null,
            ativo: formulario.ativo,
          }),
        },
      );
      if (!resposta.ok) throw new Error();
      setFormulario(VAZIO);
      await carregar();
    } catch {
      setMensagem("Não foi possível cadastrar esse preço.");
    } finally {
      setSalvando(false);
    }
  }

  async function alternar(preco: Preco) {
    const resposta = await fetch(
      `/api/catalogo/produtos/${produtoId}/precos/${preco.id}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ativo: !preco.ativo }),
      },
    );
    if (resposta.ok) await carregar();
    else setMensagem("Não foi possível alterar o preço.");
  }

  async function remover(preco: Preco) {
    if (!window.confirm(`Remover ${nomeDoPreco(preco)}?`)) return;
    const resposta = await fetch(
      `/api/catalogo/produtos/${produtoId}/precos/${preco.id}`,
      { method: "DELETE" },
    );
    if (resposta.ok) await carregar();
    else setMensagem("Não foi possível remover o preço.");
  }

  return (
    <section
      className="mt-8 max-w-3xl rounded-[var(--raio-cartao)] border border-[var(--cor-borda)] bg-[var(--cor-superficie-alta)] shadow-[var(--sombra-larga)] p-6 sm:p-8"
      aria-labelledby="precos-do-produto"
    >
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="precos-do-produto" className="text-2xl font-semibold">
            Preços
          </h2>
          <p className="mt-2 text-sm leading-6 text-[var(--cor-tinta-suave)]">
            Promoção, atacado de preço fixo e outros preços além do normal. Na
            promoção, o preço normal aparece riscado.
          </p>
        </div>
        <p role="status" className="text-sm text-[var(--cor-tinta-suave)]">
          {mensagem}
        </p>
      </div>

      <ul className="mt-6 space-y-3">
        {precos.map((preco) => (
          <li
            key={preco.id}
            className="flex flex-wrap items-center gap-3 rounded-[var(--raio-botao)] border border-[var(--cor-borda)] p-4"
          >
            <div className="min-w-0 flex-1">
              <p className="font-semibold">
                {nomeDoPreco(preco)}
                {preco.rotulo !== null &&
                ROTULO_DO_TIPO_DE_PRECO[preco.tipo] !== undefined ? (
                  <span className="ml-2 text-sm font-normal text-[var(--cor-tinta-suave)]">
                    {ROTULO_DO_TIPO_DE_PRECO[preco.tipo]}
                  </span>
                ) : null}
              </p>
              <p className="text-sm text-[var(--cor-tinta-suave)]">
                {escreverDinheiro(preco.valorCentavos)} · a partir de{" "}
                {preco.quantidadeMinima}{" "}
                {preco.quantidadeMinima === 1 ? "unidade" : "unidades"} ·{" "}
                {preco.ativo ? "ativo" : "inativo"}
              </p>
            </div>
            <button
              className="sc-botao sc-botao--secundaria"
              type="button"
              onClick={() => void alternar(preco)}
            >
              {preco.ativo ? "Desativar" : "Ativar"}
            </button>
            {preco.tipo !== "BASE" ? (
              <button
                className="sc-botao sc-botao--secundaria"
                type="button"
                onClick={() => void remover(preco)}
              >
                Remover
              </button>
            ) : null}
          </li>
        ))}
      </ul>

      <form
        onSubmit={(evento) => void adicionar(evento)}
        className="mt-6 grid gap-5 border-t border-[var(--cor-borda)] pt-6 sm:grid-cols-2"
      >
        <CampoComRotulo
          id={`${base}-tipo`}
          rotulo="Tipo de preço"
          info={EXPLICACOES.tipoDePreco}
        >
          <Seletor
            id={`${base}-tipo`}
            className="w-full"
            value={formulario.tipo}
            aria-describedby={descritoDoInfo(
              `${base}-tipo`,
              EXPLICACOES.tipoDePreco,
            )}
            onChange={(valor) =>
              setFormulario((anterior) => ({
                ...anterior,
                tipo: valor,
              }))
            }
          >
            <option value="PROMO">Promoção</option>
            <option value="WHOLESALE">Atacado (preço fixo)</option>
            <option value="CLUB">Clube</option>
            <option value="BASE">Preço normal</option>
          </Seletor>
        </CampoComRotulo>
        <CampoComRotulo
          id={`${base}-rotulo`}
          rotulo="Nome do preço (opcional)"
          info={EXPLICACOES.nomeDoPreco}
        >
          <input
            id={`${base}-rotulo`}
            className="sc-campo__controle w-full"
            value={formulario.rotulo}
            aria-describedby={descritoDoInfo(
              `${base}-rotulo`,
              EXPLICACOES.nomeDoPreco,
            )}
            onChange={(evento) =>
              setFormulario((anterior) => ({
                ...anterior,
                rotulo: evento.target.value,
              }))
            }
            placeholder="Ex.: Promoção de sexta"
            maxLength={100}
          />
        </CampoComRotulo>
        <CampoComRotulo id={`${base}-valor`} rotulo="Preço por unidade (R$)">
          <input
            id={`${base}-valor`}
            className="sc-campo__controle w-full"
            inputMode="decimal"
            value={formulario.valor}
            onChange={(evento) =>
              setFormulario((anterior) => ({
                ...anterior,
                valor: evento.target.value,
              }))
            }
            placeholder="Ex.: 15,00"
            required
          />
        </CampoComRotulo>
        <CampoComRotulo
          id={`${base}-quantidade`}
          rotulo="Quantidade mínima (unidades)"
          info={EXPLICACOES.quantidadeMinimaDoPreco}
        >
          <input
            id={`${base}-quantidade`}
            className="sc-campo__controle w-full"
            type="number"
            inputMode="numeric"
            min={1}
            value={formulario.quantidade}
            aria-describedby={descritoDoInfo(
              `${base}-quantidade`,
              EXPLICACOES.quantidadeMinimaDoPreco,
            )}
            onChange={(evento) =>
              setFormulario((anterior) => ({
                ...anterior,
                quantidade: evento.target.value,
              }))
            }
            required
          />
        </CampoComRotulo>
        <label className="flex items-center gap-3 text-sm sm:col-span-2">
          <input
            className="h-5 w-5"
            type="checkbox"
            checked={formulario.ativo}
            onChange={(evento) =>
              setFormulario((anterior) => ({
                ...anterior,
                ativo: evento.target.checked,
              }))
            }
          />
          Ativar este preço imediatamente
        </label>
        <button
          className="sc-botao sc-botao--primaria w-fit"
          type="submit"
          disabled={salvando}
        >
          {salvando ? "Salvando…" : "Adicionar preço"}
        </button>
      </form>
    </section>
  );
}
