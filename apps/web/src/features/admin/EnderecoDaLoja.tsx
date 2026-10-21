"use client";

/**
 * A troca do endereço da loja na web — o apelido — na ficha (AC-208).
 *
 * A frase que acompanha o campo é a que importa: o endereço antigo continua
 * funcionando e leva ao novo, porque o link já está no WhatsApp, no Instagram
 * e no cartaz do balcão. O apelido é conferido pelo mesmo contrato da API
 * antes de sair; o apelido ocupado volta com uma variação livre sugerida.
 */

import {
  esquemaDaFichaDaLoja,
  esquemaDaRecusaDeCadastro,
  esquemaDoApelidoDaLoja,
  type FichaDaLojaNoContrato,
} from "@simpleclick/contracts";
import { Botao, Campo, Erro, Sucesso } from "@simpleclick/ui";
import { useState, type FormEvent } from "react";

import { INFO_DO_NOVO_APELIDO } from "./explicacoes.ts";

type EstadoDaTroca =
  | { readonly estado: "parado" }
  | { readonly estado: "trocando" }
  | { readonly estado: "trocado"; readonly antigo: string }
  | { readonly estado: "falhou"; readonly mensagem: string };

/** O endereço da troca no próprio site. */
export function enderecoDaTrocaDeApelido(lojaId: string): string {
  return `/api/admin/lojas/${encodeURIComponent(lojaId)}/apelido`;
}

export function EnderecoDaLoja({
  ficha,
  aoTrocar,
}: {
  readonly ficha: FichaDaLojaNoContrato;
  readonly aoTrocar: (ficha: FichaDaLojaNoContrato) => void;
}) {
  const [apelido, setApelido] = useState("");
  const [erro, setErro] = useState<string | undefined>(undefined);
  const [sugestao, setSugestao] = useState<string | null>(null);
  const [troca, setTroca] = useState<EstadoDaTroca>({ estado: "parado" });

  async function aoEnviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const conferido = esquemaDoApelidoDaLoja.safeParse(apelido);
    if (!conferido.success) {
      setErro(
        conferido.error.issues[0]?.message ?? "Endereço fora do formato.",
      );
      return;
    }
    if (conferido.data === ficha.apelido) {
      setErro("Este já é o endereço atual da loja.");
      return;
    }

    setTroca({ estado: "trocando" });
    try {
      const resposta = await fetch(enderecoDaTrocaDeApelido(ficha.id), {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ apelido: conferido.data }),
      });
      const corpo: unknown = await resposta.json().catch(() => null);
      if (resposta.ok) {
        const nova = esquemaDaFichaDaLoja.parse(corpo);
        setTroca({ estado: "trocado", antigo: ficha.apelido });
        setApelido("");
        setSugestao(null);
        aoTrocar(nova);
        return;
      }
      const recusa = esquemaDaRecusaDeCadastro.safeParse(corpo);
      if (
        (resposta.status === 409 || resposta.status === 400) &&
        recusa.success
      ) {
        setErro(recusa.data.campos[0]?.mensagem ?? "Endereço recusado.");
        setSugestao(recusa.data.sugestao ?? null);
        setTroca({ estado: "parado" });
        return;
      }
      setTroca({
        estado: "falhou",
        mensagem:
          resposta.status === 401 || resposta.status === 403
            ? "Sua sessão não tem acesso à administração. Entre de novo."
            : "O endereço não mudou. A loja continua no endereço de antes; tente de novo.",
      });
    } catch {
      setTroca({
        estado: "falhou",
        mensagem:
          "O endereço não mudou. A loja continua no endereço de antes; tente de novo.",
      });
    }
  }

  return (
    <div className="grid gap-4">
      <p>
        Endereço atual:{" "}
        <strong className="font-mono">/loja/{ficha.apelido}</strong>
      </p>
      {troca.estado === "trocado" && (
        <Sucesso
          titulo={`Endereço trocado para /loja/${ficha.apelido}`}
          descricao={`Quem abrir o link antigo, /loja/${troca.antigo}, é levado ao endereço novo.`}
        />
      )}
      {troca.estado === "falhou" && (
        <Erro titulo="O endereço não mudou" mensagem={troca.mensagem} />
      )}
      <form
        noValidate
        onSubmit={aoEnviar}
        aria-label="Troca do endereço da loja"
        className="grid gap-4"
      >
        <Campo
          id="ficha-apelido"
          name="apelido"
          rotulo="Novo endereço na web"
          info={INFO_DO_NOVO_APELIDO}
          value={apelido}
          erro={erro}
          dica="Só letras minúsculas, números e hífen. Ex.: pastel-da-joi vira /loja/pastel-da-joi. O endereço antigo continua funcionando e leva ao novo."
          autoComplete="off"
          onChange={(evento) => {
            setApelido(evento.target.value);
            setErro(undefined);
          }}
        />
        {sugestao !== null && (
          <p className="text-sm">
            Sugestão livre:{" "}
            <Botao
              variante="discreta"
              tamanho="pequeno"
              onClick={() => {
                setApelido(sugestao);
                setErro(undefined);
                setSugestao(null);
              }}
            >
              usar {sugestao}
            </Botao>
          </p>
        )}
        <div>
          <Botao
            type="submit"
            variante="secundaria"
            carregando={troca.estado === "trocando"}
            rotuloDeEspera="Trocando o endereço…"
          >
            Trocar endereço
          </Botao>
        </div>
      </form>
    </div>
  );
}
