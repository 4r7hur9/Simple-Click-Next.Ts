"use client";

/**
 * O link único de acesso de uma pessoa (card #170, T-9, D-3): aparece UMA vez,
 * com o botão de copiar, e some ao fechar. Nada é guardado: nem no endereço da
 * administração, nem em armazenamento do navegador, nem em estado fora deste
 * componente. Quem fecha a janela perde o link e gera outro, se precisar.
 *
 * O caminho chega relativo (`/definir-senha?token=…`); a tela o completa com o
 * endereço do próprio site só para mostrar e copiar.
 */

import type { AcessoGeradoNoContrato } from "@simpleclick/contracts";
import { Aviso, Botao } from "@simpleclick/ui";
import { useId, useState } from "react";

import { dataEHora } from "./apresentacao.ts";
import { JanelaDeConfirmacao } from "./JanelaDeConfirmacao.tsx";

/** O endereço inteiro do link, pronto para entregar à pessoa. */
export function enderecoCompletoDoAcesso(
  caminho: string,
  origem: string | undefined,
): string {
  if (origem === undefined || origem === "") return caminho;
  try {
    return new URL(caminho, origem).toString();
  } catch {
    return caminho;
  }
}

export interface AcessoDeUsoUnicoProps {
  readonly acesso: AcessoGeradoNoContrato;
  readonly nomeDaPessoa: string;
  readonly aoFechar: () => void;
}

export function AcessoDeUsoUnico({
  acesso,
  nomeDaPessoa,
  aoFechar,
}: AcessoDeUsoUnicoProps) {
  const id = useId();
  const [copiado, setCopiado] = useState<"sim" | "falhou" | null>(null);
  const endereco = enderecoCompletoDoAcesso(
    acesso.caminho,
    typeof window === "undefined" ? undefined : window.location.origin,
  );

  async function copiar() {
    try {
      await navigator.clipboard.writeText(endereco);
      setCopiado("sim");
    } catch {
      setCopiado("falhou");
    }
  }

  return (
    <JanelaDeConfirmacao
      id={`${id}-acesso`}
      titulo="Link de acesso gerado"
      aoFechar={aoFechar}
      rodape={<Botao onClick={aoFechar}>Já copiei, fechar</Botao>}
    >
      <div className="grid gap-4 text-sm">
        <p>
          Entregue este link a <strong>{nomeDaPessoa}</strong> por um meio
          seguro. Quem abrir define a própria senha e entra.
        </p>
        <Aviso tom="atencao" titulo="Ele aparece só agora" aoVivo={false}>
          <p>
            Ao fechar esta janela o link não pode ser visto de novo. Vale uma
            vez e até {dataEHora(acesso.expiraEm)}. Se precisar, gere outro: o
            anterior deixa de valer.
          </p>
        </Aviso>
        <div className="grid gap-2">
          <label className="font-medium" htmlFor={`${id}-endereco`}>
            Link de acesso
          </label>
          <input
            id={`${id}-endereco`}
            className="sc-campo__controle"
            type="text"
            readOnly
            spellCheck={false}
            autoComplete="off"
            value={endereco}
            onFocus={(evento) => evento.currentTarget.select()}
          />
          <div className="flex flex-wrap items-center gap-3">
            <Botao variante="secundaria" onClick={() => void copiar()}>
              Copiar link
            </Botao>
            <span role="status" className="text-sm">
              {copiado === "sim" && "Link copiado."}
              {copiado === "falhou" &&
                "Não foi possível copiar. Selecione o link e copie à mão."}
            </span>
          </div>
        </div>
        <p className="text-[var(--cor-tinta-suave)]">
          {acesso.emailEnviado
            ? "O link também foi enviado para o e-mail da pessoa."
            : "O link não foi enviado por e-mail: entregue você mesmo."}
        </p>
      </div>
    </JanelaDeConfirmacao>
  );
}
