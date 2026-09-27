"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { centavosDoTexto } from "../../lib/dinheiro.ts";

import {
  CamposDeEspecificacao,
  conferirEspecificacoes,
  type EspecificacaoHerdada,
  type ValoresDasEspecificacoes,
} from "./CamposDeEspecificacao.tsx";

interface Categoria {
  readonly id: string;
  readonly nome: string;
}

interface ProdutoInicial {
  readonly id: string;
  readonly nome: string;
  readonly descricao: string | null;
  readonly categoriaId: string | null;
  readonly precoCentavos: number | null;
  readonly status: string;
  readonly disponivel: boolean;
}

interface Props {
  readonly produto?: ProdutoInicial;
}

function precoInicial(centavos: number | null | undefined): string {
  return centavos === null || centavos === undefined
    ? ""
    : (centavos / 100).toFixed(2).replace(".", ",");
}

export function FormularioProduto({ produto }: Props) {
  const router = useRouter();
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [nome, setNome] = useState(produto?.nome ?? "");
  const [descricao, setDescricao] = useState(produto?.descricao ?? "");
  const [categoriaId, setCategoriaId] = useState(produto?.categoriaId ?? "");
  const [preco, setPreco] = useState(precoInicial(produto?.precoCentavos));
  const [status, setStatus] = useState(
    produto?.status === "PUBLISHED" ? "PUBLISHED" : "DRAFT",
  );
  const [disponivel, setDisponivel] = useState(produto?.disponivel ?? true);
  const [salvando, setSalvando] = useState(false);
  const [mensagem, setMensagem] = useState("Carregando categorias…");
  // As especificações que o produto herda da categoria escolhida (T-301).
  const [especificacoes, setEspecificacoes] = useState<
    readonly EspecificacaoHerdada[]
  >([]);
  const [valoresEsp, setValoresEsp] = useState<ValoresDasEspecificacoes>({});
  const [errosEsp, setErrosEsp] = useState<Readonly<Record<string, string>>>(
    {},
  );
  // Depois do primeiro envio o produto existe: tentar de novo EDITA, não
  // cadastra um segundo igual.
  const [produtoSalvoId, setProdutoSalvoId] = useState(produto?.id);

  /** Grava as especificações; devolve falso quando a API recusou alguma. */
  async function salvarEspecificacoes(produtoId: string): Promise<boolean> {
    if (especificacoes.length === 0) return true;
    const resposta = await fetch(
      `/api/catalogo/produtos/${produtoId}/especificacoes`,
      {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          valores: Object.fromEntries(
            especificacoes.map((item) => [
              item.id,
              valoresEsp[item.id] ?? null,
            ]),
          ),
        }),
      },
    );
    if (resposta.ok) return true;
    const corpo = (await resposta.json().catch(() => ({}))) as {
      erros?: { especificacaoId: string; mensagem: string }[];
    };
    setErrosEsp(
      Object.fromEntries(
        (corpo.erros ?? []).map((item) => [
          item.especificacaoId,
          item.mensagem,
        ]),
      ),
    );
    setMensagem(
      "O produto foi salvo, mas as especificações precisam de ajuste. Corrija e salve de novo.",
    );
    return false;
  }

  useEffect(() => {
    void fetch("/api/catalogo/categorias", { cache: "no-store" })
      .then(async (resposta) => {
        if (!resposta.ok) throw new Error();
        const dados = (await resposta.json()) as { categorias: Categoria[] };
        setCategorias(dados.categorias);
        setCategoriaId((atual) =>
          atual === "" && dados.categorias[0] !== undefined
            ? dados.categorias[0].id
            : atual,
        );
        setMensagem(
          dados.categorias.length === 0
            ? "Crie uma categoria antes de cadastrar o produto."
            : "Preencha os dados do produto.",
        );
      })
      .catch(() => setMensagem("Não foi possível carregar as categorias."));
  }, []);

  async function salvar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    // Centavos lidos como texto (AC-311): a conta antiga apagava o ponto, e
    // "19.90" — o que o teclado numérico do celular oferece — virava R$ 1.990.
    const precoCentavos = centavosDoTexto(preco);
    if (precoCentavos === null || precoCentavos < 0) {
      setMensagem("Informe um preço válido.");
      return;
    }
    if (categoriaId === "") {
      setMensagem("Escolha uma categoria para continuar.");
      return;
    }
    const pendentes = conferirEspecificacoes(especificacoes, valoresEsp);
    setErrosEsp(pendentes);
    if (Object.keys(pendentes).length > 0) {
      setMensagem(
        "Confira as especificações destacadas; o restante do preenchimento foi mantido.",
      );
      return;
    }
    setSalvando(true);
    setMensagem("Salvando produto…");
    const dados = {
      nome,
      descricao: descricao.trim() || null,
      categoriaId,
      precoCentavos,
      status,
      disponivel,
    };
    try {
      const resposta = await fetch(
        produtoSalvoId
          ? `/api/catalogo/produtos/${produtoSalvoId}`
          : "/api/catalogo/produtos",
        {
          method: produtoSalvoId ? "PATCH" : "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(dados),
        },
      );
      if (!resposta.ok) throw new Error();
      const salvo = (await resposta.json()) as { id: string };
      setProdutoSalvoId(salvo.id);
      if (!(await salvarEspecificacoes(salvo.id))) {
        setSalvando(false);
        return;
      }
      router.push("/painel/produtos");
      router.refresh();
    } catch {
      setMensagem("Não foi possível salvar. Confira os dados informados.");
      setSalvando(false);
    }
  }

  return (
    <form
      onSubmit={(evento) => void salvar(evento)}
      className="mt-8 max-w-3xl rounded-2xl border border-[var(--cor-borda)] bg-[var(--cor-superficie)] p-6 sm:p-8"
    >
      <p role="status" className="text-sm text-[var(--cor-tinta-suave)]">
        {mensagem}
      </p>
      <div className="mt-6 grid gap-5 sm:grid-cols-2">
        <label className="sm:col-span-2">
          <span className="text-sm font-medium">Nome do produto</span>
          <input
            className="sc-campo mt-2 w-full"
            value={nome}
            onChange={(evento) => setNome(evento.target.value)}
            maxLength={160}
            required
            placeholder="Ex.: Pastel de queijo"
          />
        </label>
        <label className="sm:col-span-2">
          <span className="text-sm font-medium">Descrição (opcional)</span>
          <textarea
            className="sc-campo mt-2 min-h-28 w-full"
            value={descricao}
            onChange={(evento) => setDescricao(evento.target.value)}
            maxLength={2_000}
            placeholder="Conte o que acompanha o produto."
          />
        </label>
        <label>
          <span className="text-sm font-medium">Categoria</span>
          <select
            className="sc-campo mt-2 w-full"
            value={categoriaId}
            onChange={(evento) => setCategoriaId(evento.target.value)}
            required
          >
            <option value="">Escolha uma categoria</option>
            {categorias.map((categoria) => (
              <option key={categoria.id} value={categoria.id}>
                {categoria.nome}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="text-sm font-medium">Preço (R$)</span>
          <input
            className="sc-campo mt-2 w-full"
            inputMode="decimal"
            value={preco}
            onChange={(evento) => setPreco(evento.target.value)}
            required
            placeholder="19,90"
          />
        </label>
        <label>
          <span className="text-sm font-medium">Visibilidade</span>
          <select
            className="sc-campo mt-2 w-full"
            value={status}
            onChange={(evento) => setStatus(evento.target.value)}
          >
            <option value="DRAFT">Salvar como rascunho</option>
            <option value="PUBLISHED">Publicar na vitrine</option>
          </select>
        </label>
        <label className="flex items-center gap-3 self-end pb-2 text-sm">
          <input
            className="h-5 w-5"
            type="checkbox"
            checked={disponivel}
            onChange={(evento) => setDisponivel(evento.target.checked)}
          />
          Disponível para compra
        </label>
        <CamposDeEspecificacao
          categoriaId={categoriaId}
          produtoId={produtoSalvoId}
          categoriaGravadaId={produto?.categoriaId}
          valores={valoresEsp}
          erros={errosEsp}
          aoMudar={setValoresEsp}
          aoCarregar={setEspecificacoes}
        />
      </div>
      <div className="mt-8 flex flex-wrap gap-3">
        <button
          className="sc-botao sc-botao--primario"
          type="submit"
          disabled={salvando || categorias.length === 0}
        >
          {salvando
            ? "Salvando…"
            : produto
              ? "Salvar alterações"
              : "Cadastrar produto"}
        </button>
        <button
          className="sc-botao sc-botao--fantasma"
          type="button"
          onClick={() => router.back()}
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}
