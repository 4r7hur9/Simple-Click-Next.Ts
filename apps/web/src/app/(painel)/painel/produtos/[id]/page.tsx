"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import {
  FormularioProduto,
  type JanelaDeVenda,
} from "../../../../../features/painel-catalogo/FormularioProduto.tsx";
import { EnvioDeImagem } from "../../../../../features/painel-catalogo/EnvioDeImagem.tsx";
import { LinhasDePreco } from "../../../../../features/painel-catalogo/LinhasDePreco.tsx";

interface Props {
  readonly params: Promise<{ id: string }>;
}

interface Produto {
  readonly id: string;
  readonly nome: string;
  readonly descricao: string | null;
  readonly categoriaId: string | null;
  readonly precoCentavos: number | null;
  readonly status: string;
  readonly disponivel: boolean;
  /** A janela semanal de venda gravada (AC-322); ausente em produto antigo. */
  readonly janelas?: readonly JanelaDeVenda[] | undefined;
}

export default function PaginaDeEdicaoDeProduto({ params }: Props) {
  const [produto, setProduto] = useState<Produto | null>(null);
  const [estado, setEstado] = useState<"carregando" | "erro" | "sucesso">(
    "carregando",
  );

  useEffect(() => {
    let ativo = true;
    void params
      .then(({ id }) =>
        fetch("/api/catalogo/produtos", { cache: "no-store" }).then(
          async (resposta) => {
            if (!resposta.ok) throw new Error();
            const dados = (await resposta.json()) as { produtos: Produto[] };
            const encontrado = dados.produtos.find((item) => item.id === id);
            if (encontrado === undefined) throw new Error();
            if (ativo) {
              setProduto(encontrado);
              setEstado("sucesso");
            }
          },
        ),
      )
      .catch(() => {
        if (ativo) setEstado("erro");
      });
    return () => {
      ativo = false;
    };
  }, [params]);

  if (produto === null) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <Link
          className="text-sm font-semibold text-[var(--cor-primaria)]"
          href="/painel/produtos"
        >
          ← Voltar aos produtos
        </Link>
        <p role="status" className="mt-8">
          {estado === "carregando"
            ? "Carregando produto…"
            : "Produto não encontrado."}
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
      <Link
        className="text-sm font-semibold text-[var(--cor-primaria)]"
        href="/painel/produtos"
      >
        ← Voltar aos produtos
      </Link>
      <h1 className="mt-5 text-4xl font-semibold tracking-[-0.04em]">
        Editar produto
      </h1>
      <FormularioProduto produto={produto} />
      <EnvioDeImagem produtoId={produto.id} />
      <LinhasDePreco produtoId={produto.id} />
      <Link
        className="sc-botao sc-botao--primario mt-8"
        href={`/painel/produtos/${produto.id}/opcoes`}
      >
        Configurar escolhas e adicionais
      </Link>
      <Link
        className="sc-botao sc-botao--fantasma ml-3 mt-8"
        href={`/painel/produtos/${produto.id}/variacoes`}
      >
        Configurar variações
      </Link>
      <Link
        className="sc-botao sc-botao--fantasma ml-3 mt-8"
        href={`/painel/produtos/${produto.id}/estoque`}
      >
        Ajustar estoque
      </Link>
    </div>
  );
}
