"use client";

/**
 * Campos do endereço de entrega (AC-505, AC-508, AC-509).
 *
 * ESTE BLOCO SÓ EXISTE NA ENTREGA. Quem escolheu retirada não o vê — e o
 * servidor RECUSA endereço num pedido de retirada, em vez de ignorá-lo. As duas
 * pontas dizem a mesma coisa de propósito: a tela poupa a digitação, a borda
 * garante que dado pessoal não entre num pedido que ninguém vai entregar.
 *
 * A ordem dos campos segue a ordem em que a pessoa sabe as coisas: rua, número,
 * complemento, bairro. O CEP fica DEPOIS, e é opcional, porque no bairro que a
 * loja atende quase ninguém lembra dele — e um CEP obrigatório no começo trava
 * o formulário logo na primeira linha.
 */
import { Campo } from "@simpleclick/ui";

/** O endereço como a tela o mantém enquanto é digitado. */
export interface EnderecoNaTela {
  readonly logradouro: string;
  readonly numero: string;
  readonly complemento: string;
  readonly bairro: string;
  readonly cidade: string;
  readonly cep: string;
  readonly pontoDeReferencia: string;
}

export const ENDERECO_EM_BRANCO: EnderecoNaTela = {
  logradouro: "",
  numero: "",
  complemento: "",
  bairro: "",
  cidade: "",
  cep: "",
  pontoDeReferencia: "",
};

export interface CamposDeEnderecoProps {
  readonly valor: EnderecoNaTela;
  readonly aoMudar: (campo: keyof EnderecoNaTela, valor: string) => void;
  /** Mensagem por campo, quando a borda ou a tela recusou. */
  readonly erros?: Partial<Record<keyof EnderecoNaTela, string>> | undefined;
  readonly desabilitado?: boolean | undefined;
}

export function CamposDeEndereco({
  valor,
  aoMudar,
  erros,
  desabilitado = false,
}: CamposDeEnderecoProps) {
  function campo(
    nome: keyof EnderecoNaTela,
    rotulo: string,
    extras: { obrigatorio?: boolean; dica?: string; modo?: string } = {},
  ) {
    return (
      <Campo
        id={`endereco-${nome}`}
        name={nome}
        rotulo={rotulo}
        value={valor[nome]}
        onChange={(evento) => aoMudar(nome, evento.target.value)}
        obrigatorio={extras.obrigatorio ?? false}
        desabilitado={desabilitado}
        {...(erros?.[nome] ? { erro: erros[nome] } : {})}
        {...(extras.dica ? { dica: extras.dica } : {})}
        {...(extras.modo ? { inputMode: extras.modo as "numeric" } : {})}
      />
    );
  }

  return (
    <fieldset className="sc-endereco">
      <legend className="sc-endereco__titulo">Endereço de entrega</legend>

      {campo("logradouro", "Rua ou avenida", { obrigatorio: true })}
      {campo("numero", "Número", {
        obrigatorio: true,
        dica: "Se não tiver, escreva 'sem número'.",
      })}
      {campo("complemento", "Complemento", {
        dica: "Apartamento, bloco, casa dos fundos.",
      })}
      {campo("bairro", "Bairro", {
        obrigatorio: true,
        dica: "É o bairro que define a taxa de entrega.",
      })}
      {campo("cidade", "Cidade")}
      {campo("cep", "CEP", { modo: "numeric" })}
      {campo("pontoDeReferencia", "Ponto de referência", {
        dica: "Ajuda quem entrega a achar mais rápido.",
      })}
    </fieldset>
  );
}
