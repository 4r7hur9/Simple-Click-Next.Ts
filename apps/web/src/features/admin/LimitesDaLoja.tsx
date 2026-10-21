"use client";

/**
 * Os limites de uma loja, editáveis pela administração (card #29): equipe,
 * produtos, categorias e clientes. Mostra o uso atual contra o limite, com a
 * barra de progresso, e salva com auditoria — quem registra é a API, na mesma
 * transação, com o valor de antes e o de depois.
 *
 * Campo vazio volta ao padrão da plataforma. O padrão aparece como dica, para
 * a pessoa saber o que está abrindo mão ao ajustar.
 */

import {
  esquemaDaEdicaoDosLimitesDaLoja,
  esquemaDosLimitesDaLoja,
  esquemaDosPadroesDeLimite,
  RECURSOS_LIMITADOS_DA_LOJA,
  ROTULOS_DOS_RECURSOS,
  type LimitesDaLojaNoContrato,
  type PadroesDeLimiteNoContrato,
  type RecursoLimitadoDaLoja,
} from "@simpleclick/contracts";
import {
  Aviso,
  Botao,
  Campo,
  Cartao,
  Info,
  Selo,
  Sucesso,
} from "@simpleclick/ui";
import { useEffect, useState, type FormEvent } from "react";

import {
  inteiro,
  lerDaApi,
  mensagemDaApi,
  type LeituraDaApi,
} from "./apresentacao.ts";
import { BarraDeUso } from "./BarraDeUso.tsx";
import { INFO_DO_LIMITE } from "./explicacoes.ts";

const PADRAO_DO_RECURSO: Readonly<
  Record<RecursoLimitadoDaLoja, keyof PadroesDeLimiteNoContrato>
> = {
  staff: "staffPorLoja",
  produtos: "produtosPorLoja",
  categorias: "categoriasPorLoja",
  clientes: "clientesPorLoja",
};

type Ajustes = NonNullable<LimitesDaLojaNoContrato["ajustes"]>;

const AJUSTES_VAZIOS: Ajustes = {
  staff: null,
  produtos: null,
  categorias: null,
  clientes: null,
};

type Digitado = Readonly<Record<RecursoLimitadoDaLoja, string>>;

function digitadoDe(ajustes: Ajustes | undefined): Digitado {
  const base = ajustes ?? AJUSTES_VAZIOS;
  return {
    staff: base.staff === null ? "" : String(base.staff),
    produtos: base.produtos === null ? "" : String(base.produtos),
    categorias: base.categorias === null ? "" : String(base.categorias),
    clientes: base.clientes === null ? "" : String(base.clientes),
  };
}

/** O que foi digitado, no corpo que a API pede: vazio é `null` (o padrão). */
/** O rótulo do campo de edição já diz a unidade: o número é um máximo. */
const ROTULO_DO_MAXIMO: Readonly<Record<RecursoLimitadoDaLoja, string>> = {
  staff: "Máximo de pessoas na equipe",
  produtos: "Máximo de produtos",
  categorias: "Máximo de categorias",
  clientes: "Máximo de clientes",
};

export function corpoDosLimites(
  digitado: Digitado,
): { readonly corpo: Ajustes } | { readonly erro: string } {
  const corpo: Record<string, number | null> = {};
  for (const recurso of RECURSOS_LIMITADOS_DA_LOJA) {
    const texto = digitado[recurso].trim();
    if (texto === "") {
      corpo[recurso] = null;
      continue;
    }
    if (!/^\d+$/.test(texto)) {
      return {
        erro: `${ROTULOS_DOS_RECURSOS[recurso]}: informe um número inteiro.`,
      };
    }
    corpo[recurso] = Number(texto);
  }
  const lido = esquemaDaEdicaoDosLimitesDaLoja.safeParse(corpo);
  return lido.success
    ? { corpo: lido.data as Ajustes }
    : { erro: lido.error.issues[0]?.message ?? "Limite inválido." };
}

export function LimitesDaLoja({ lojaId }: { readonly lojaId: string }) {
  const base = `/api/admin/lojas/${encodeURIComponent(lojaId)}/limites`;
  const [leitura, setLeitura] = useState<
    LeituraDaApi<LimitesDaLojaNoContrato> | { readonly fase: "carregando" }
  >({ fase: "carregando" });
  const [padroes, setPadroes] = useState<PadroesDeLimiteNoContrato | null>(
    null,
  );
  const [tentativa, setTentativa] = useState(0);
  const [editando, setEditando] = useState(false);
  const [digitado, setDigitado] = useState<Digitado>(digitadoDe(undefined));
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [salvo, setSalvo] = useState(false);

  useEffect(() => {
    let vivo = true;
    setLeitura({ fase: "carregando" });
    void lerDaApi(
      base,
      (corpo) => esquemaDosLimitesDaLoja.parse(corpo),
      "Não foi possível carregar os limites.",
    ).then((lida) => {
      if (vivo) setLeitura(lida);
    });
    void lerDaApi("/api/admin/limites", (corpo) =>
      esquemaDosPadroesDeLimite.parse(corpo),
    ).then((lida) => {
      if (vivo && lida.fase === "pronta") setPadroes(lida.dados);
    });
    return () => {
      vivo = false;
    };
  }, [base, tentativa]);

  function comecarAEditar(atuais: LimitesDaLojaNoContrato) {
    setDigitado(digitadoDe(atuais.ajustes));
    setErro(null);
    setSalvo(false);
    setEditando(true);
  }

  async function salvar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const montado = corpoDosLimites(digitado);
    if ("erro" in montado) {
      setErro(montado.erro);
      return;
    }
    setErro(null);
    setSalvando(true);
    try {
      const resposta = await fetch(base, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(montado.corpo),
      });
      const lido: unknown = await resposta.json().catch(() => null);
      if (!resposta.ok) {
        setErro(
          resposta.status === 401 || resposta.status === 403
            ? "Sua sessão não tem acesso à administração. Entre de novo."
            : mensagemDaApi(
                lido,
                "Os limites não foram salvos; tente de novo.",
              ),
        );
        return;
      }
      setLeitura({
        fase: "pronta",
        dados: esquemaDosLimitesDaLoja.parse(lido),
      });
      setEditando(false);
      setSalvo(true);
    } catch {
      setErro("Os limites não foram salvos; tente de novo.");
    } finally {
      setSalvando(false);
    }
  }

  const dados = leitura.fase === "pronta" ? leitura.dados : null;
  return (
    <Cartao
      titulo="Limites da loja"
      nivelDoTitulo={2}
      descricao="Quanto esta loja pode ter. Passou do limite, o painel avisa o dono."
      estado={
        leitura.fase === "carregando"
          ? "carregando"
          : leitura.fase !== "pronta"
            ? "erro"
            : "pronto"
      }
      esperaComEsqueleto
      rotuloDeEspera="Carregando os limites…"
      mensagemDeErro={
        leitura.fase === "erro"
          ? leitura.mensagem
          : "Não foi possível carregar os limites."
      }
      rodape={
        leitura.fase === "erro" ? (
          <Botao
            variante="secundaria"
            onClick={() => setTentativa((n) => n + 1)}
          >
            Tentar de novo
          </Botao>
        ) : undefined
      }
    >
      {dados !== null && !editando && (
        <div className="grid gap-5 pt-4">
          {salvo && (
            <Sucesso titulo="Limites salvos e registrados na auditoria." />
          )}
          <ul className="grid gap-4">
            {dados.limites
              .filter((linha) => linha.recurso !== "lojas")
              .map((linha) => {
                const recurso = linha.recurso as RecursoLimitadoDaLoja;
                const ajustado = dados.ajustes?.[recurso] != null;
                return (
                  <li key={linha.recurso} className="grid gap-2">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="flex items-center gap-1 font-medium">
                        {ROTULOS_DOS_RECURSOS[linha.recurso]}
                        <Info
                          id={`uso-${recurso}`}
                          rotulo={ROTULOS_DOS_RECURSOS[linha.recurso]}
                          conteudo={INFO_DO_LIMITE[recurso]}
                        />
                      </span>
                      <span className="flex items-center gap-2 text-sm tabular-nums">
                        {inteiro(linha.uso)} de {inteiro(linha.limite)}
                        <Selo tom={ajustado ? "info" : "neutro"} semBolinha>
                          {ajustado ? "Ajustado" : "Padrão"}
                        </Selo>
                      </span>
                    </div>
                    <BarraDeUso
                      uso={linha.uso}
                      limite={linha.limite}
                      rotulo={ROTULOS_DOS_RECURSOS[linha.recurso]}
                    />
                  </li>
                );
              })}
          </ul>
          <div>
            <Botao variante="secundaria" onClick={() => comecarAEditar(dados)}>
              Editar limites
            </Botao>
          </div>
        </div>
      )}

      {dados !== null && editando && (
        <form noValidate onSubmit={salvar} className="grid gap-4 pt-4">
          <p className="max-w-prose text-sm text-[var(--cor-tinta-suave)]">
            Deixe o campo vazio para usar o padrão da plataforma. Cada mudança
            fica na auditoria, com o valor de antes e o de depois.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            {RECURSOS_LIMITADOS_DA_LOJA.map((recurso) => {
              const padrao =
                padroes === null ? null : padroes[PADRAO_DO_RECURSO[recurso]];
              return (
                <Campo
                  key={recurso}
                  id={`limite-${recurso}`}
                  rotulo={ROTULO_DO_MAXIMO[recurso]}
                  info={INFO_DO_LIMITE[recurso]}
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  dica={
                    padrao === null
                      ? "Número inteiro. Vazio usa o padrão da plataforma."
                      : `Número inteiro. Vazio usa o padrão: ${inteiro(padrao)}.`
                  }
                  value={digitado[recurso]}
                  onChange={(evento) => {
                    const valor = evento.target.value;
                    setDigitado((antes) => ({ ...antes, [recurso]: valor }));
                    setErro(null);
                  }}
                />
              );
            })}
          </div>
          {erro !== null && (
            <Aviso tom="erro" titulo="Nada mudou">
              <p>{erro}</p>
            </Aviso>
          )}
          <div className="flex flex-wrap gap-3">
            <Botao
              type="submit"
              carregando={salvando}
              rotuloDeEspera="Salvando…"
            >
              Salvar limites
            </Botao>
            <Botao
              variante="secundaria"
              desabilitado={salvando}
              onClick={() => {
                setEditando(false);
                setErro(null);
              }}
            >
              Cancelar
            </Botao>
          </div>
        </form>
      )}
    </Cartao>
  );
}
