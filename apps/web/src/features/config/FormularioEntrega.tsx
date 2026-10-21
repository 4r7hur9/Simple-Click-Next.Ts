"use client";
/**
 * Entrega, retirada, taxa e valor mínimo (US-901: AC-905 a AC-908).
 *
 * O DONO DIGITA EM REAIS, e a API guarda em centavos inteiros (P-005). A
 * conversão mora aqui, na borda da tela, e é exata: "8,00" vira 800, sem
 * passar por conta de ponto flutuante que transformaria 0,29 em 28,999….
 * Valor que não é dinheiro ("oito reais", "8,0,0") é apontado no próprio
 * campo antes de ir à rede — e não gravado como nulo em silêncio, que
 * transformaria uma taxa digitada errado em "a combinar".
 *
 * DESLIGAR OS DOIS MODOS É PERMITIDO, e a tela diz o que isso significa: o
 * cliente não consegue finalizar pedido, e o painel continua avisando.
 */
import type { SecaoDeEntrega } from "@simpleclick/contracts";

import { atributosDeErro, ErroDoCampo } from "./ErroDoCampo.tsx";
import { comInfo, InfoDoPainel, RotuloComInfo } from "./RotuloComInfo.tsx";
import { useSecao } from "./useSecao.ts";

type CampoDeDinheiro =
  | "taxaCentavos"
  | "gratisAcimaDeCentavos"
  | "minimoParaEntregaCentavos"
  | "minimoParaRetiradaCentavos";

/** A entrega como a tela a edita: dinheiro em texto, como o dono digita. */
export interface EntregaNaTela {
  readonly aceitaEntrega: boolean;
  readonly aceitaRetirada: boolean;
  readonly taxaCentavos: string;
  readonly nomeDaTaxa: string;
  readonly gratisAcimaDeCentavos: string;
  readonly minimoParaEntregaCentavos: string;
  readonly minimoParaRetiradaCentavos: string;
  readonly prazoMinutos: string;
}

const SEM_ENTREGA: EntregaNaTela = {
  aceitaEntrega: true,
  aceitaRetirada: true,
  taxaCentavos: "",
  nomeDaTaxa: "Taxa de entrega",
  gratisAcimaDeCentavos: "",
  minimoParaEntregaCentavos: "",
  minimoParaRetiradaCentavos: "",
  prazoMinutos: "",
};

const CAMPOS_DE_DINHEIRO: readonly (readonly [
  CampoDeDinheiro,
  string,
  string,
])[] = [
  ["taxaCentavos", "Taxa de entrega (R$)", "Ex.: 8,00"],
  ["gratisAcimaDeCentavos", "Entrega grátis acima de (R$)", "Ex.: 60,00"],
  [
    "minimoParaEntregaCentavos",
    "Pedido mínimo para entrega (R$)",
    "Ex.: 25,00",
  ],
  [
    "minimoParaRetiradaCentavos",
    "Pedido mínimo para retirada (R$)",
    "Ex.: 10,00",
  ],
];

/**
 * "8", "8,5", "8,50", "1.234,56" → centavos. Vazio → nulo ("a combinar").
 * Qualquer outra coisa → `"invalido"`, para a tela apontar o campo.
 */
export function reaisParaCentavos(texto: string): number | null | "invalido" {
  const limpo = texto.trim().replace(/^R\$\s*/i, "");
  if (limpo === "") return null;
  const casa = /^(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d{1,2}))?$/.exec(limpo);
  if (casa === null) return "invalido";
  const inteiros = Number((casa[1] ?? "0").replaceAll(".", ""));
  const centavos = Number((casa[2] ?? "0").padEnd(2, "0"));
  return inteiros * 100 + centavos;
}

/** 800 → "8,00". Nulo → campo vazio. */
export function centavosParaReais(valor: number | null | undefined): string {
  if (typeof valor !== "number") return "";
  const inteiros = Math.trunc(valor / 100);
  const centavos = String(valor % 100).padStart(2, "0");
  return `${inteiros},${centavos}`;
}

function entregaDaApi(bruto: unknown): EntregaNaTela {
  const lido = bruto as Partial<SecaoDeEntrega> | null;
  return {
    aceitaEntrega: lido?.aceitaEntrega === true,
    aceitaRetirada: lido?.aceitaRetirada === true,
    taxaCentavos: centavosParaReais(lido?.taxaCentavos),
    nomeDaTaxa: lido?.nomeDaTaxa ?? SEM_ENTREGA.nomeDaTaxa,
    gratisAcimaDeCentavos: centavosParaReais(lido?.gratisAcimaDeCentavos),
    minimoParaEntregaCentavos: centavosParaReais(
      lido?.minimoParaEntregaCentavos,
    ),
    minimoParaRetiradaCentavos: centavosParaReais(
      lido?.minimoParaRetiradaCentavos,
    ),
    prazoMinutos:
      typeof lido?.prazoMinutos === "number" ? String(lido.prazoMinutos) : "",
  };
}

/**
 * O corpo que a API espera, ou os campos que a tela já sabe que estão errados.
 */
export function entregaParaApi(
  entrega: EntregaNaTela,
):
  | { readonly ok: true; readonly corpo: SecaoDeEntrega }
  | { readonly ok: false; readonly erros: Record<string, string> } {
  const erros: Record<string, string> = {};
  const dinheiro = {} as Record<CampoDeDinheiro, number | null>;
  for (const [campo, rotulo] of CAMPOS_DE_DINHEIRO) {
    const valor = reaisParaCentavos(entrega[campo]);
    if (valor === "invalido") {
      erros[campo] =
        `${rotulo.replace(" (R$)", "")}: use um valor em reais, como 8,00.`;
      dinheiro[campo] = null;
    } else {
      dinheiro[campo] = valor;
    }
  }
  const prazo = entrega.prazoMinutos.trim();
  if (prazo !== "" && !/^\d+$/.test(prazo)) {
    erros["prazoMinutos"] =
      "Tempo estimado: informe os minutos em número inteiro, como 40.";
  }
  if (Object.keys(erros).length > 0) return { ok: false, erros };

  return {
    ok: true,
    corpo: {
      aceitaEntrega: entrega.aceitaEntrega,
      aceitaRetirada: entrega.aceitaRetirada,
      ...dinheiro,
      nomeDaTaxa: entrega.nomeDaTaxa.trim() === "" ? null : entrega.nomeDaTaxa,
      prazoMinutos: prazo === "" ? null : Number(prazo),
    },
  };
}

const TEXTOS = {
  carregando: "Carregando entrega…",
  carregada: "Entrega carregada.",
  salva: "Entrega salva. O checkout já usa estes valores.",
};

export function FormularioEntrega() {
  const secao = useSecao("entrega", SEM_ENTREGA, entregaDaApi, TEXTOS);
  const { dados, mudar, erros } = secao;
  const nenhumModo = !dados.aceitaEntrega && !dados.aceitaRetirada;

  function mudarCampo(campo: keyof EntregaNaTela, valor: string | boolean) {
    mudar((anterior) => ({ ...anterior, [campo]: valor }));
  }

  if (secao.fase !== "pronta") {
    return (
      <p className="mt-8" role={secao.fase === "falhou" ? "alert" : "status"}>
        {secao.mensagem}
      </p>
    );
  }

  return (
    <form
      onSubmit={(evento) => {
        evento.preventDefault();
        const convertido = entregaParaApi(dados);
        if (!convertido.ok) {
          secao.apontar(convertido.erros);
          return;
        }
        void secao.salvar(convertido.corpo);
      }}
      className="mt-8 max-w-2xl space-y-6"
      noValidate
    >
      <fieldset className="space-y-3">
        <legend className="flex items-center gap-1.5 font-medium">
          Modos de recebimento
          <InfoDoPainel
            explicacao="modosDeRecebimento"
            nome="Modos de recebimento"
          />
        </legend>
        {(
          [
            ["aceitaEntrega", "Entrega"],
            ["aceitaRetirada", "Retirada no local"],
          ] as const
        ).map(([campo, rotulo]) => (
          <label className="flex items-center gap-3" key={campo}>
            <input
              className="h-5 w-5"
              type="checkbox"
              name={campo}
              checked={dados[campo]}
              onChange={(evento) => mudarCampo(campo, evento.target.checked)}
            />
            <span>{rotulo}</span>
          </label>
        ))}
        {nenhumModo ? (
          <p className="text-sm font-medium text-[var(--cor-atencao)]">
            Com os dois desligados, o cliente não consegue finalizar pedido. O
            painel vai avisar até você ativar entrega ou retirada.
          </p>
        ) : null}
      </fieldset>

      {CAMPOS_DE_DINHEIRO.map(([campo, rotulo, exemplo]) => (
        <div key={campo}>
          <RotuloComInfo
            para={`entrega-${campo}`}
            explicacao={campo}
            nome={rotulo}
          >
            {rotulo}
          </RotuloComInfo>
          <input
            id={`entrega-${campo}`}
            className="sc-campo mt-2 w-full"
            type="text"
            inputMode="decimal"
            name={campo}
            value={dados[campo]}
            onChange={(evento) => mudarCampo(campo, evento.target.value)}
            placeholder={exemplo}
            {...comInfo(`entrega-${campo}`, atributosDeErro(campo, erros))}
          />
          {campo === "taxaCentavos" ? (
            <p className="mt-2 text-sm text-[var(--cor-tinta-suave)]">
              Vazio aparece como “a combinar”; 0,00 é entrega grátis.
            </p>
          ) : null}
          <ErroDoCampo campo={campo} erros={erros} />
        </div>
      ))}
      <div>
        <RotuloComInfo
          para="entrega-nomeDaTaxa"
          explicacao="nomeDaTaxa"
          nome="Nome da taxa"
        >
          Nome da taxa
        </RotuloComInfo>
        <input
          id="entrega-nomeDaTaxa"
          className="sc-campo mt-2 w-full"
          name="nomeDaTaxa"
          value={dados.nomeDaTaxa}
          maxLength={80}
          placeholder="Ex.: Motoboy"
          onChange={(evento) => mudarCampo("nomeDaTaxa", evento.target.value)}
          {...comInfo(
            "entrega-nomeDaTaxa",
            atributosDeErro("nomeDaTaxa", erros),
          )}
        />
        <p className="mt-2 text-sm text-[var(--cor-tinta-suave)]">
          É como a linha aparece no resumo do cliente: “Motoboy”, “Frete”.
        </p>
        <ErroDoCampo campo="nomeDaTaxa" erros={erros} />
      </div>
      <div>
        <RotuloComInfo
          para="entrega-prazoMinutos"
          explicacao="prazoMinutos"
          nome="Tempo estimado de entrega"
        >
          Tempo estimado de entrega (minutos)
        </RotuloComInfo>
        <input
          id="entrega-prazoMinutos"
          className="sc-campo mt-2 w-full"
          type="text"
          inputMode="numeric"
          name="prazoMinutos"
          value={dados.prazoMinutos}
          placeholder="Ex.: 40"
          onChange={(evento) => mudarCampo("prazoMinutos", evento.target.value)}
          {...comInfo(
            "entrega-prazoMinutos",
            atributosDeErro("prazoMinutos", erros),
          )}
        />
        <ErroDoCampo campo="prazoMinutos" erros={erros} />
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <button
          className="sc-botao sc-botao--primaria"
          type="submit"
          disabled={secao.salvando}
        >
          {secao.salvando ? "Salvando…" : "Salvar entrega"}
        </button>
        <p role="status" className="text-sm text-[var(--cor-tinta-suave)]">
          {secao.mensagem}
        </p>
      </div>
    </form>
  );
}
