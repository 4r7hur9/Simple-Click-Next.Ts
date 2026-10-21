"use client";
/**
 * Formas de pagamento e chave PIX (US-900: AC-900, AC-901, AC-902).
 *
 * O TIPO VEM ANTES DA CHAVE, e a tela mostra o exemplo daquele tipo: CPF com
 * pontos, telefone com DDD, chave aleatória copiada do banco. Quem confere é
 * a API (a regra de `packages/core`), e a recusa chega ao lado do campo da
 * chave, dizendo o formato esperado — com a chave anterior ainda valendo.
 *
 * PIX SEM CHAVE NÃO EXISTE: desligar o PIX tira a chave do envio, e ligar o
 * PIX abre o quadro da chave. O checkout só oferece PIX quando há chave.
 */
import {
  TIPOS_DE_CHAVE_PIX,
  type SecaoDePagamento,
  type TipoDeChavePix,
} from "@simpleclick/contracts";

import { atributosDeErro, ErroDoCampo } from "./ErroDoCampo.tsx";
import { comInfo, InfoDoPainel, RotuloComInfo } from "./RotuloComInfo.tsx";
import { useSecao } from "./useSecao.ts";
import { Seletor } from "@simpleclick/ui";

const FORMAS = [
  ["PIX", "PIX"],
  ["CASH", "Dinheiro"],
  ["CARD_ON_DELIVERY", "Cartão na entrega"],
] as const;

type Forma = (typeof FORMAS)[number][0];

const ROTULO_DO_TIPO: Readonly<Record<TipoDeChavePix, string>> = {
  CPF: "CPF",
  CNPJ: "CNPJ",
  TELEFONE: "Celular",
  EMAIL: "E-mail",
  ALEATORIA: "Chave aleatória",
};

/** O exemplo que o campo mostra, conforme o tipo escolhido. */
export const EXEMPLO_DA_CHAVE: Readonly<Record<TipoDeChavePix, string>> = {
  CPF: "123.456.789-09",
  CNPJ: "12.345.678/0001-95",
  TELEFONE: "(11) 91234-5678",
  EMAIL: "loja@exemplo.com.br",
  ALEATORIA: "123e4567-e89b-12d3-a456-426614174000",
};

/** O pagamento como a tela o edita: o quadro da chave existe sempre. */
interface PagamentoNaTela {
  readonly formas: readonly Forma[];
  readonly pix: {
    readonly tipo: TipoDeChavePix;
    readonly chave: string;
    readonly titular: string;
  };
}

const SEM_PAGAMENTO: PagamentoNaTela = {
  formas: [],
  pix: { tipo: "CPF", chave: "", titular: "" },
};

function pagamentoDaApi(bruto: unknown): PagamentoNaTela {
  const lido = bruto as Partial<SecaoDePagamento> | null;
  return {
    formas: [...(lido?.formas ?? [])],
    pix: lido?.pix ?? SEM_PAGAMENTO.pix,
  };
}

/** O corpo que a API espera: sem PIX ligado, sem chave. */
function pagamentoParaApi(pagamento: PagamentoNaTela): SecaoDePagamento {
  return {
    formas: [...pagamento.formas],
    pix: pagamento.formas.includes("PIX") ? { ...pagamento.pix } : null,
  };
}

const TEXTOS = {
  carregando: "Carregando pagamento…",
  carregada: "Pagamento carregado.",
  salva: "Pagamento salvo. O checkout já usa estas formas.",
};

export function FormularioPagamento() {
  const secao = useSecao("pagamento", SEM_PAGAMENTO, pagamentoDaApi, TEXTOS);
  const { dados, mudar, erros } = secao;
  const aceitaPix = dados.formas.includes("PIX");

  function alternarForma(forma: Forma, ativa: boolean) {
    mudar((anterior) => ({
      ...anterior,
      // A ordem é a da lista, e não a do clique: é a ordem do checkout.
      formas: FORMAS.map(([valor]) => valor).filter((valor) =>
        valor === forma ? ativa : anterior.formas.includes(valor),
      ),
    }));
  }

  function mudarPix(campo: keyof PagamentoNaTela["pix"], valor: string) {
    mudar((anterior) => ({
      ...anterior,
      pix: { ...anterior.pix, [campo]: valor },
    }));
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
        void secao.salvar(
          pagamentoParaApi(dados),
          aceitaPix
            ? `Pagamento salvo. O PIX já aparece no seu checkout, com a chave e o nome de ${dados.pix.titular.trim()}.`
            : undefined,
        );
      }}
      className="mt-8 max-w-2xl space-y-6"
      noValidate
    >
      <fieldset className="space-y-3">
        <legend className="flex items-center gap-1.5 font-medium">
          Formas aceitas
          <InfoDoPainel explicacao="formasDePagamento" nome="Formas aceitas" />
        </legend>
        {FORMAS.map(([valor, rotulo]) => (
          <label className="flex items-center gap-3" key={valor}>
            <input
              className="h-5 w-5"
              type="checkbox"
              name={`forma-${valor}`}
              checked={dados.formas.includes(valor)}
              onChange={(evento) => alternarForma(valor, evento.target.checked)}
            />
            <span>{rotulo}</span>
          </label>
        ))}
        <ErroDoCampo campo="formas" erros={erros} />
        {dados.formas.length === 0 ? (
          <p className="text-sm text-[var(--cor-tinta-suave)]">
            Sem nenhuma forma marcada, o checkout não tem como receber o
            pagamento — o painel continua avisando até você escolher uma.
          </p>
        ) : null}
      </fieldset>

      {aceitaPix ? (
        <fieldset className="space-y-4 rounded-2xl border border-[var(--cor-borda)] p-5">
          <legend className="px-2 font-medium">Dados do Pix</legend>
          <div className="block">
            <RotuloComInfo
              para="pix-tipo"
              explicacao="tipoDaChavePix"
              nome="Tipo da chave"
            >
              Tipo da chave
            </RotuloComInfo>
            <Seletor
              id="pix-tipo"
              className="mt-2 w-full"
              name="pix.tipo"
              value={dados.pix.tipo}
              onChange={(valor) => mudarPix("tipo", valor)}
              {...comInfo("pix-tipo", atributosDeErro("pix.tipo", erros))}
            >
              {TIPOS_DE_CHAVE_PIX.map((tipo) => (
                <option key={tipo} value={tipo}>
                  {ROTULO_DO_TIPO[tipo]}
                </option>
              ))}
            </Seletor>
          </div>
          <ErroDoCampo campo="pix.tipo" erros={erros} />
          <div className="block">
            <RotuloComInfo
              para="pix-chave"
              explicacao="chavePix"
              nome="Chave Pix"
            >
              Chave Pix
            </RotuloComInfo>
            <input
              id="pix-chave"
              className="sc-campo mt-2 w-full"
              name="pix.chave"
              value={dados.pix.chave}
              placeholder={EXEMPLO_DA_CHAVE[dados.pix.tipo]}
              autoComplete="off"
              onChange={(evento) => mudarPix("chave", evento.target.value)}
              {...comInfo("pix-chave", atributosDeErro("pix.chave", erros))}
            />
          </div>
          <ErroDoCampo campo="pix.chave" erros={erros} />
          <div className="block">
            <RotuloComInfo
              para="pix-titular"
              explicacao="titularPix"
              nome="Nome de quem recebe"
            >
              Nome de quem recebe
            </RotuloComInfo>
            <input
              id="pix-titular"
              className="sc-campo mt-2 w-full"
              name="pix.titular"
              value={dados.pix.titular}
              onChange={(evento) => mudarPix("titular", evento.target.value)}
              {...comInfo("pix-titular", atributosDeErro("pix.titular", erros))}
            />
            <p className="mt-2 text-sm text-[var(--cor-tinta-suave)]">
              É o nome que o cliente confere antes de pagar. Use o mesmo que o
              banco mostra.
            </p>
          </div>
          <ErroDoCampo campo="pix.titular" erros={erros} />
        </fieldset>
      ) : null}

      <div className="flex flex-wrap items-center gap-4">
        <button
          className="sc-botao sc-botao--primaria"
          type="submit"
          disabled={secao.salvando}
        >
          {secao.salvando ? "Salvando…" : "Salvar pagamento"}
        </button>
        <p role="status" className="text-sm text-[var(--cor-tinta-suave)]">
          {secao.mensagem}
        </p>
      </div>
    </form>
  );
}
