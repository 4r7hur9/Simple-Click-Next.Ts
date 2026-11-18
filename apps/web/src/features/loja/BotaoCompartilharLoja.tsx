"use client";

/**
 * "Compartilhar a loja" (card #107).
 *
 * NASCE DEPOIS DE MONTAR. Sem JavaScript não existe compartilhamento nenhum, e
 * um botão que não faz nada é pior do que a ausência dele: no HTML do servidor
 * o botão não está, e só aparece quando o navegador já pode atendê-lo.
 *
 * Usa o compartilhamento nativo do aparelho. Sem ele, copia o link e avisa que
 * copiou. Nunca compartilha nada além do endereço público da loja.
 */
import { useEffect, useState } from "react";
import { AvisoFlutuante, IconeCompartilhar } from "@simpleclick/ui";

export interface BotaoCompartilharLojaProps {
  readonly apelido: string;
  readonly nome: string;
}

export function BotaoCompartilharLoja({
  apelido,
  nome,
}: BotaoCompartilharLojaProps) {
  const [montado, setMontado] = useState(false);
  const [aviso, setAviso] = useState<{
    readonly texto: string;
    readonly tom: "sucesso" | "erro";
  } | null>(null);

  useEffect(() => setMontado(true), []);

  async function compartilhar() {
    const endereco = `${window.location.origin}/loja/${apelido}`;
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title: nome, url: endereco });
        return;
      } catch (erro) {
        // Fechar a folha de compartilhar não é erro: a pessoa desistiu.
        if (erro instanceof DOMException && erro.name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(endereco);
      setAviso({ texto: "Link da loja copiado.", tom: "sucesso" });
    } catch {
      setAviso({ texto: "Não deu para copiar o link agora.", tom: "erro" });
    }
  }

  if (!montado) return null;

  return (
    <>
      <button
        type="button"
        className="sc-loja__acao"
        aria-label={`Compartilhar ${nome}`}
        title="Compartilhar a loja"
        onClick={() => void compartilhar()}
      >
        <IconeCompartilhar aria-hidden="true" />
      </button>
      <AvisoFlutuante
        mensagem={aviso?.texto ?? null}
        tom={aviso?.tom ?? "sucesso"}
        aoFechar={() => setAviso(null)}
      />
    </>
  );
}
