"use client";

import { useEffect, useId, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { centavosDoTexto } from "../../lib/dinheiro.ts";

import {
  CamposDeEspecificacao,
  conferirEspecificacoes,
  type EspecificacaoHerdada,
  type ValoresDasEspecificacoes,
} from "./CamposDeEspecificacao.tsx";
import { PrecoDeAtacado } from "./atacado/PrecoDeAtacado.tsx";
import {
  atacadoInicial,
  lerAtacado,
  problemasNaTela,
  type AtacadoNaTela,
  type FaixaGravada,
} from "./atacado/faixas-na-tela.ts";
import type { ProblemaDaFaixa } from "../../lib/atacado.ts";
import { Seletor } from "@simpleclick/ui";

import { EXPLICACOES } from "./explicacoes.ts";
import {
  CampoComRotulo,
  RotuloComInfo,
  descritoDoInfo,
} from "./RotuloComInfo.tsx";

interface Categoria {
  readonly id: string;
  readonly nome: string;
}

/**
 * Uma faixa semanal em que o produto é vendido (AC-322).
 *
 * As horas são as do relógio da LOJA: quem as avalia é a API, no fuso dela.
 * O dia segue a numeração do JavaScript, com 0 no domingo, para não haver
 * conversão silenciosa entre a tela e a regra.
 */
export interface JanelaDeVenda {
  readonly diaDaSemana: number;
  readonly abre: string;
  readonly fecha: string;
}

/** Os nomes que o dono lê, na ordem em que a regra os numera. */
export const DIAS_DA_SEMANA = [
  "Domingo",
  "Segunda-feira",
  "Terça-feira",
  "Quarta-feira",
  "Quinta-feira",
  "Sexta-feira",
  "Sábado",
] as const;

/** A janela que aparece quando o dono pede mais uma: o sábado do almoço. */
const JANELA_NOVA: JanelaDeVenda = {
  diaDaSemana: 6,
  abre: "09:00",
  fecha: "18:00",
};

interface ProdutoInicial {
  readonly id: string;
  readonly nome: string;
  readonly descricao: string | null;
  readonly categoriaId: string | null;
  readonly precoCentavos: number | null;
  readonly status: string;
  readonly disponivel: boolean;
  /** A janela gravada; ausente no produto de antes dela existir. */
  readonly janelas?: readonly JanelaDeVenda[] | undefined;
  /** Se o produto vai para o feed dos clientes (/explorar). */
  readonly publicarNoFeed?: boolean | undefined;
  /** As faixas de atacado gravadas (card #54); vazio ou ausente = só varejo. */
  readonly faixasDeAtacado?: readonly FaixaGravada[] | undefined;
}

/**
 * O que o formulário sabe do feed da loja. `null` enquanto carrega ou quando
 * a pessoa não pode mexer no feed (a equipe: a API responde 403 e recusaria o
 * campo) — aí o checkbox nem aparece e o campo não vai no envio.
 */
interface FeedDaLoja {
  readonly aparecerNoFeed: boolean;
  readonly publicarProdutosNovos: boolean;
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
  const base = useId();
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [nome, setNome] = useState(produto?.nome ?? "");
  const [descricao, setDescricao] = useState(produto?.descricao ?? "");
  const [categoriaId, setCategoriaId] = useState(produto?.categoriaId ?? "");
  const [preco, setPreco] = useState(precoInicial(produto?.precoCentavos));
  const [status, setStatus] = useState(
    produto?.status === "PUBLISHED" ? "PUBLISHED" : "DRAFT",
  );
  const [disponivel, setDisponivel] = useState(produto?.disponivel ?? true);
  const [feed, setFeed] = useState<FeedDaLoja | null>(null);
  // Produto novo nasce como a loja configurou ("publicar produtos novos").
  const [publicarNoFeed, setPublicarNoFeed] = useState(
    produto?.publicarNoFeed ?? false,
  );
  // A janela de venda (AC-322): sem faixa, vende sempre que a loja abre.
  const [janelas, setJanelas] = useState<readonly JanelaDeVenda[]>(
    produto?.janelas ?? [],
  );
  // Preço de atacado (card #55). Só vai no envio se o dono mexeu: assim a
  // edição de outro campo não regrava as faixas.
  const [atacado, setAtacado] = useState<AtacadoNaTela>(() =>
    atacadoInicial(produto?.faixasDeAtacado),
  );
  const [atacadoMudou, setAtacadoMudou] = useState(false);
  const [problemasDoAtacado, setProblemasDoAtacado] = useState<
    readonly ProblemaDaFaixa[]
  >([]);
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

  useEffect(() => {
    let ativo = true;
    void fetch("/api/loja/feed", { cache: "no-store" })
      .then(async (resposta) => {
        if (!resposta.ok) return;
        const dados = (await resposta.json()) as FeedDaLoja;
        if (!ativo) return;
        setFeed(dados);
        if (produto === undefined)
          setPublicarNoFeed(dados.publicarProdutosNovos);
      })
      .catch(() => undefined);
    return () => {
      ativo = false;
    };
  }, [produto]);

  function mudarJanela(indice: number, mudanca: Partial<JanelaDeVenda>) {
    setJanelas((atuais) =>
      atuais.map((janela, posicao) =>
        posicao === indice ? { ...janela, ...mudanca } : janela,
      ),
    );
  }

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
    // A faixa que fecha antes de abrir nunca abriria, e a API a recusa: é
    // melhor dizer aqui, com o resto do preenchimento ainda na tela.
    if (janelas.some((janela) => janela.abre >= janela.fecha)) {
      setMensagem(
        "Na janela de venda, o horário de fechar precisa vir depois do de abrir.",
      );
      return;
    }
    // As travas do atacado são as do servidor: melhor ouvir aqui que no 422.
    // Confere mesmo sem mexer nas faixas — um preço novo menor que o desconto
    // em reais gravado também é recusado.
    const leituraDoAtacado = lerAtacado(atacado, precoCentavos);
    if (!leituraDoAtacado.ok) {
      setProblemasDoAtacado(leituraDoAtacado.problemas);
      setMensagem(
        "Confira as faixas do preço de atacado; o restante do preenchimento foi mantido.",
      );
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
      janelas: janelas.map((janela) => ({ ...janela })),
      // Só quem pode mexer no feed manda o campo: a API recusa o da equipe.
      ...(feed === null ? {} : { publicarNoFeed }),
      ...(atacadoMudou ? { faixasDeAtacado: leituraDoAtacado.faixas } : {}),
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
      if (resposta.status === 422) {
        const recusa = (await resposta.json().catch(() => ({}))) as {
          erro?: string;
          problemas?: ProblemaDaFaixa[];
        };
        if (recusa.erro === "faixas_invalidas") {
          setProblemasDoAtacado(
            problemasNaTela(recusa.problemas ?? [], leituraDoAtacado.origem),
          );
          setMensagem(
            "Confira as faixas do preço de atacado; o restante do preenchimento foi mantido.",
          );
          setSalvando(false);
          return;
        }
      }
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
      className="mt-8 max-w-3xl rounded-[var(--raio-cartao)] border border-[var(--cor-borda)] bg-[var(--cor-superficie-alta)] shadow-[var(--sombra-larga)] p-6 sm:p-8"
    >
      <p role="status" className="text-sm text-[var(--cor-tinta-suave)]">
        {mensagem}
      </p>
      <div className="mt-6 grid gap-5 sm:grid-cols-2">
        <label className="sm:col-span-2">
          <span className="text-sm font-medium">Nome do produto</span>
          <input
            className="sc-campo__controle mt-2 w-full"
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
            className="sc-campo__controle mt-2 min-h-28 w-full"
            value={descricao}
            onChange={(evento) => setDescricao(evento.target.value)}
            maxLength={2_000}
            placeholder="Conte o que acompanha o produto."
          />
        </label>
        <CampoComRotulo
          id={`${base}-categoria`}
          rotulo="Categoria"
          info={EXPLICACOES.categoria}
        >
          <Seletor
            id={`${base}-categoria`}
            className="w-full"
            value={categoriaId}
            aria-describedby={descritoDoInfo(
              `${base}-categoria`,
              EXPLICACOES.categoria,
            )}
            onChange={(valor) => setCategoriaId(valor)}
            required
          >
            <option value="">Escolha uma categoria</option>
            {categorias.map((categoria) => (
              <option key={categoria.id} value={categoria.id}>
                {categoria.nome}
              </option>
            ))}
          </Seletor>
        </CampoComRotulo>
        <CampoComRotulo
          id={`${base}-preco`}
          rotulo="Preço de venda (R$)"
          info={EXPLICACOES.precoDeVenda}
        >
          <input
            id={`${base}-preco`}
            className="sc-campo__controle w-full"
            inputMode="decimal"
            value={preco}
            aria-describedby={descritoDoInfo(
              `${base}-preco`,
              EXPLICACOES.precoDeVenda,
            )}
            onChange={(evento) => setPreco(evento.target.value)}
            required
            placeholder="Ex.: 19,90"
          />
        </CampoComRotulo>
        <CampoComRotulo
          id={`${base}-visibilidade`}
          rotulo="Visibilidade"
          info={EXPLICACOES.visibilidade}
        >
          <Seletor
            id={`${base}-visibilidade`}
            className="w-full"
            value={status}
            aria-describedby={descritoDoInfo(
              `${base}-visibilidade`,
              EXPLICACOES.visibilidade,
            )}
            onChange={(valor) => setStatus(valor)}
          >
            <option value="DRAFT">Rascunho (só no painel)</option>
            <option value="PUBLISHED">Publicado na vitrine</option>
          </Seletor>
        </CampoComRotulo>
        <span className="flex items-center gap-3 self-end pb-2 text-sm">
          <input
            id={`${base}-disponivel`}
            className="h-5 w-5"
            type="checkbox"
            checked={disponivel}
            aria-describedby={descritoDoInfo(
              `${base}-disponivel`,
              EXPLICACOES.disponivel,
            )}
            onChange={(evento) => setDisponivel(evento.target.checked)}
          />
          <RotuloComInfo
            htmlFor={`${base}-disponivel`}
            nome="Disponível para compra"
            info={EXPLICACOES.disponivel}
          >
            Disponível para compra
          </RotuloComInfo>
        </span>
        {feed === null ? null : (
          <label className="flex items-start gap-3 rounded-[var(--raio-botao)] border border-[var(--cor-borda)] p-4 text-sm sm:col-span-2">
            <input
              className="mt-0.5 h-5 w-5"
              type="checkbox"
              name="publicarNoFeed"
              checked={publicarNoFeed}
              onChange={(evento) => setPublicarNoFeed(evento.target.checked)}
            />
            <span>
              <span className="font-medium">Publicar no feed</span>
              <span className="block text-xs text-[var(--cor-tinta-suave)]">
                O produto aparece em Explorar, o feed dos clientes do
                SimpleClick, quando estiver publicado na vitrine e disponível.
                {feed.aparecerNoFeed ? null : (
                  <>
                    {" "}
                    Hoje a sua loja está fora do feed:{" "}
                    <Link
                      className="font-semibold text-[var(--cor-primaria-texto)] underline"
                      href="/painel/feed"
                    >
                      ajuste em Feed da loja
                    </Link>
                    .
                  </>
                )}
              </span>
            </span>
          </label>
        )}
        {/*
          A JANELA DE VENDA (AC-322): a feijoada de sábado, o brunch de domingo.
          O dono cadastra uma vez e a vitrine liga e desliga o produto sozinha,
          no horário da loja. Esgotado vence a janela: desmarcar acima tira o
          produto de venda mesmo dentro da faixa.
        */}
        <fieldset className="rounded-[var(--raio-botao)] border border-[var(--cor-borda)] p-4 sm:col-span-2">
          <legend className="px-1 text-sm font-medium">Janela de venda</legend>
          <p className="text-sm text-[var(--cor-tinta-suave)]">
            Sem janela, o produto é vendido sempre que a loja está aberta. Com
            janela, ele só aparece comprável nos dias e horários abaixo, no
            horário da loja.
          </p>
          {janelas.length === 0 ? null : (
            <ul className="mt-4 grid gap-3">
              {janelas.map((janela, indice) => (
                <li
                  // A posição é a identidade: a janela não tem chave própria
                  // até ser gravada, e o dono reordena pouco.
                  key={indice}
                  className="grid gap-2 sm:grid-cols-[1fr_auto_auto_auto] sm:items-end"
                >
                  <label>
                    <span className="text-xs font-medium">Dia</span>
                    <Seletor
                      className="mt-1 w-full"
                      aria-label={`Dia da janela ${indice + 1}`}
                      value={janela.diaDaSemana}
                      onChange={(valor) =>
                        mudarJanela(indice, {
                          diaDaSemana: Number(valor),
                        })
                      }
                    >
                      {DIAS_DA_SEMANA.map((nome, dia) => (
                        <option key={nome} value={dia}>
                          {nome}
                        </option>
                      ))}
                    </Seletor>
                  </label>
                  <label>
                    <span className="text-xs font-medium">Abre às</span>
                    <input
                      className="sc-campo__controle mt-1 w-full"
                      type="time"
                      aria-label={`Abre na janela ${indice + 1}`}
                      value={janela.abre}
                      required
                      onChange={(evento) =>
                        mudarJanela(indice, { abre: evento.target.value })
                      }
                    />
                  </label>
                  <label>
                    <span className="text-xs font-medium">Fecha às</span>
                    <input
                      className="sc-campo__controle mt-1 w-full"
                      type="time"
                      aria-label={`Fecha na janela ${indice + 1}`}
                      value={janela.fecha}
                      required
                      onChange={(evento) =>
                        mudarJanela(indice, { fecha: evento.target.value })
                      }
                    />
                  </label>
                  <button
                    className="sc-botao sc-botao--secundaria"
                    type="button"
                    aria-label={`Remover janela ${indice + 1}`}
                    onClick={() =>
                      setJanelas((atuais) =>
                        atuais.filter((_, posicao) => posicao !== indice),
                      )
                    }
                  >
                    Remover
                  </button>
                </li>
              ))}
            </ul>
          )}
          <button
            className="sc-botao sc-botao--secundaria mt-4"
            type="button"
            onClick={() => setJanelas((atuais) => [...atuais, JANELA_NOVA])}
          >
            Adicionar dia e horário
          </button>
        </fieldset>
        <PrecoDeAtacado
          valor={atacado}
          aoMudar={(proximo) => {
            setAtacado(proximo);
            setAtacadoMudou(true);
            setProblemasDoAtacado([]);
          }}
          varejoCentavos={centavosDoTexto(preco)}
          problemas={problemasDoAtacado}
        />
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
          className="sc-botao sc-botao--primaria"
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
          className="sc-botao sc-botao--secundaria"
          type="button"
          onClick={() => router.back()}
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}
