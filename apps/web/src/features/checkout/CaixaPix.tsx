"use client";

/**
 * Caixa da chave PIX no fechamento do pedido (AC-510).
 *
 * A versão 1 não cobra: o pagamento é combinado entre cliente e loja fora do
 * sistema (AC-513). O que esta caixa faz é entregar a chave da forma mais curta
 * possível — ver, copiar, colar no aplicativo do banco.
 *
 * A CONFIRMAÇÃO DE CÓPIA NÃO É ENFEITE. Sem ela, quem clicou não sabe se
 * funcionou, clica de novo, e vai para o banco sem certeza de ter a chave. E se
 * a cópia FALHAR — navegador sem permissão de área de transferência, página sem
 * conexão segura — a caixa diz isso e mostra a chave para copiar à mão, em vez
 * de anunciar um sucesso que não houve. Confirmação falsa é pior que nenhuma:
 * o cliente cola o que estava na área de transferência antes e paga outra
 * pessoa.
 */
import { useState } from "react";
import { Aviso, Botao, Cartao } from "@simpleclick/ui";

/** Como cada tipo de chave se chama para quem lê. */
const NOME_DO_TIPO: Record<string, string> = {
  CPF: "CPF",
  CNPJ: "CNPJ",
  EMAIL: "E-mail",
  TELEFONE: "Telefone",
  ALEATORIA: "Chave aleatória",
};

export interface CaixaPixProps {
  readonly chave: string;
  readonly tipoDaChave?: string | null | undefined;
  readonly nomeDoRecebedor?: string | null | undefined;
  /**
   * Como copiar. Existe como parâmetro para o teste poder provar os dois
   * caminhos — o que copia e o que falha — sem depender da permissão de área de
   * transferência do navegador que estiver rodando.
   */
  readonly copiar?: ((texto: string) => Promise<void>) | undefined;
}

async function copiarPeloNavegador(texto: string): Promise<void> {
  await navigator.clipboard.writeText(texto);
}

export function CaixaPix({
  chave,
  tipoDaChave,
  nomeDoRecebedor,
  copiar = copiarPeloNavegador,
}: CaixaPixProps) {
  const [situacao, setSituacao] = useState<"parado" | "copiado" | "falhou">(
    "parado",
  );

  async function aoCopiar() {
    try {
      await copiar(chave);
      setSituacao("copiado");
    } catch {
      // O erro em si não interessa a quem está pagando: o que interessa é que
      // a chave continua na tela e dá para copiar com o dedo.
      setSituacao("falhou");
    }
  }

  const rotuloDoTipo = tipoDaChave ? NOME_DO_TIPO[tipoDaChave] : undefined;

  return (
    <Cartao titulo="Pague com PIX" nivelDoTitulo={2}>
      <dl className="sc-pix">
        <div className="sc-pix__linha">
          <dt className="sc-pix__rotulo">
            Chave PIX{rotuloDoTipo ? ` (${rotuloDoTipo})` : ""}
          </dt>
          {/* A chave fica em `code` porque é para ser copiada caractere por
              caractere: fonte de largura fixa evita confundir zero com O. */}
          <dd className="sc-pix__valor">
            <code>{chave}</code>
          </dd>
        </div>
        {nomeDoRecebedor ? (
          <div className="sc-pix__linha">
            <dt className="sc-pix__rotulo">Recebedor</dt>
            <dd className="sc-pix__valor">{nomeDoRecebedor}</dd>
          </div>
        ) : null}
      </dl>

      <Botao variante="secundaria" onClick={aoCopiar}>
        Copiar chave PIX
      </Botao>

      {situacao === "copiado" ? (
        <Aviso tom="sucesso">
          Chave copiada. Cole no aplicativo do seu banco.
        </Aviso>
      ) : null}
      {situacao === "falhou" ? (
        <Aviso tom="atencao">
          Não foi possível copiar automaticamente. Selecione a chave acima e
          copie à mão.
        </Aviso>
      ) : null}
    </Cartao>
  );
}
