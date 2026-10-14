/**
 * Uma lista de atos da trilha de auditoria (AC-207, AC-118, AC-922).
 *
 * Só desenha: quem, quando, o quê e cada campo com o valor de antes e o de
 * depois. O ato sensível — a troca da chave PIX, por exemplo — ganha selo e
 * moldura próprios, porque é justamente o que precisa saltar aos olhos de quem
 * investiga um desvio.
 */

import type { RegistroDaTrilhaNoContrato } from "@simpleclick/contracts";
import { Cartao, Selo } from "@simpleclick/ui";
import type { ReactNode } from "react";

import {
  momentoNaTela,
  rotuloDoAto,
  rotuloDoCampo,
  valorNaTela,
} from "./trilha-na-tela.ts";

export interface ListaDaTrilhaProps {
  readonly registros: readonly RegistroDaTrilhaNoContrato[];
  /** Linha extra por ato, como a loja a que ele pertence. */
  readonly complemento?: (registro: RegistroDaTrilhaNoContrato) => ReactNode;
}

export function ListaDaTrilha({ registros, complemento }: ListaDaTrilhaProps) {
  return (
    <ol className="grid gap-3">
      {registros.map((registro) => (
        <li key={registro.id} data-sensivel={registro.sensivel || undefined}>
          <Cartao
            titulo={rotuloDoAto(registro.acao)}
            nivelDoTitulo={3}
            acoes={
              registro.sensivel ? (
                <Selo tom="atencao">Alteração sensível</Selo>
              ) : undefined
            }
            className={
              registro.sensivel
                ? "border-[var(--cor-atencao)] bg-[var(--cor-atencao-suave)]"
                : undefined
            }
          >
            <time
              dateTime={registro.quando}
              className="text-sm text-[var(--cor-tinta-suave)]"
            >
              {momentoNaTela(registro.quando)}
            </time>
            <p className="mt-1 text-sm">
              Por {registro.quem?.nome ?? "tarefa do sistema"} ({registro.papel}
              )
            </p>
            {complemento?.(registro)}
            {registro.campos.length > 0 && (
              <dl className="mt-2 grid gap-1 text-sm">
                {registro.campos.map((campo) => (
                  <div key={campo.campo} className="flex flex-wrap gap-x-2">
                    <dt className="font-medium">
                      {rotuloDoCampo(campo.campo)}:
                    </dt>
                    <dd>
                      {valorNaTela(campo.antes, campo.campo)} →{" "}
                      {valorNaTela(campo.depois, campo.campo)}
                    </dd>
                  </div>
                ))}
              </dl>
            )}
          </Cartao>
        </li>
      ))}
    </ol>
  );
}
