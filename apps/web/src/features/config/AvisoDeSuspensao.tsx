"use client";

/**
 * O aviso de suspensão do painel do dono (AC-209).
 *
 * Quando a administração suspende a loja, a vitrine some — e, sem este aviso,
 * o dono descobriria pela reclamação de um cliente. O painel pergunta a
 * situação ao abrir e, se a loja está suspensa, diz desde quando, o motivo
 * que a administração deu, o que continua guardado e com quem falar.
 *
 * `AvisoDeSuspensaoNaTela` só desenha; `AvisoDeSuspensao` busca. Enquanto a
 * pergunta corre, ou se ela falhar, nada aparece: um aviso de suspensão
 * falso assustaria o dono sem motivo, e o resto do painel diz por si quando
 * não consegue falar com a loja.
 */

import {
  esquemaDaSituacaoParaODono,
  type SituacaoParaODonoNoContrato,
} from "@simpleclick/contracts";
import { Aviso } from "@simpleclick/ui";
import { useEffect, useState } from "react";

/** Onde o painel pergunta a situação da loja, no próprio site. */
export const ENDERECO_DA_SITUACAO = "/api/loja/situacao";

/** O dia e a hora da suspensão, no fuso de Brasília. */
function momentoDaSuspensao(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Só desenha: nada para loja no ar, o aviso inteiro para a suspensa. */
export function AvisoDeSuspensaoNaTela({
  situacao,
}: {
  readonly situacao: SituacaoParaODonoNoContrato | null;
}) {
  if (situacao === null || situacao.status !== "SUSPENDED") return null;
  const { suspensao } = situacao;

  return (
    <Aviso
      tom="atencao"
      titulo="Sua loja está suspensa"
      className="mx-auto mt-8 max-w-7xl"
    >
      <div className="grid gap-2">
        <p>
          {suspensao === null
            ? "A vitrine e o recebimento de pedidos estão fora do ar."
            : `Desde ${momentoDaSuspensao(suspensao.desde)}, a vitrine e o recebimento de pedidos estão fora do ar.`}
        </p>
        {suspensao !== null && suspensao.motivo !== "" && (
          <p>
            Motivo informado pela administração:{" "}
            <strong>{suspensao.motivo}</strong>
          </p>
        )}
        <p>
          Nada foi apagado: produtos, pedidos e configurações continuam
          guardados, e a loja volta como estava quando for reativada. Quem já
          fez pedido continua acompanhando pelo link que recebeu.
        </p>
        <p>Para reativar a loja, fale com a administração da plataforma.</p>
      </div>
    </Aviso>
  );
}

/** Busca a situação ao abrir o painel e desenha o aviso, se houver. */
export function AvisoDeSuspensao() {
  const [situacao, setSituacao] = useState<SituacaoParaODonoNoContrato | null>(
    null,
  );

  useEffect(() => {
    let ativo = true;
    void fetch(ENDERECO_DA_SITUACAO, { cache: "no-store" })
      .then(async (resposta) => {
        if (!resposta.ok) throw new Error(String(resposta.status));
        return esquemaDaSituacaoParaODono.parse(await resposta.json());
      })
      .then((lida) => {
        if (ativo) setSituacao(lida);
      })
      .catch(() => {
        if (ativo) setSituacao(null);
      });
    return () => {
      ativo = false;
    };
  }, []);

  return <AvisoDeSuspensaoNaTela situacao={situacao} />;
}
