"use client";

/**
 * A prévia viva da loja, na própria landing (AC-939, AC-940).
 *
 * O QUE DIFERENCIA UMA LANDING DE CONSTRUTOR DE LOJA não é decoração: é mostrar
 * o produto funcionando. Concorrente mostra captura de tela; aqui a pessoa
 * digita o nome do negócio dela, escolhe uma cor, e vê a loja tomar forma — com
 * o MESMO ajuste de contraste que o produto faz, não uma imitação.
 *
 * OS ELEMENTOS SÃO OS DO NEGÓCIO, e não formas abstratas: um celular com a loja
 * dentro, e a mensagem que o cliente manda no WhatsApp. São as duas coisas que
 * quem tem lanchonete reconhece de imediato, porque são as duas que ele já usa
 * todo dia.
 *
 * A MENSAGEM CHEGA PRONTA do servidor, gerada pelo gerador de verdade. A tela
 * não a monta, e não monta total nenhum: preço calculado na tela é o erro que a
 * versão 1 deste produto cometeu (P-006), e uma segunda conta escrita aqui
 * divergiria da real no dia em que uma das duas mudasse.
 */
import { useEffect, useId, useState } from "react";
import { PALETA_DE_LOJA, TemaDaLoja } from "@simpleclick/ui";

import { anunciarCor } from "../../lib/cor-da-landing.ts";
import { iniciaisDe } from "../../lib/iniciais.ts";
import { lerMensagemDoWhatsApp } from "../../lib/texto-whatsapp.ts";

/** Um item do pedido de exemplo, já formatado pelo servidor. */
export interface ItemNaPrevia {
  readonly nome: string;
  readonly detalhe: string | null;
  readonly preco: string;
}

export interface PreviaDaLojaProps {
  readonly itens: readonly ItemNaPrevia[];
  readonly total: string;
  /** A mensagem do WhatsApp, gerada no servidor. */
  readonly mensagem: string;
}

/**
 * As cores vêm do DESIGN SYSTEM, e não são escritas aqui.
 *
 * É a mesma lista que a tela de configuração do dono vai oferecer: duas cópias
 * dariam cores diferentes no mesmo produto, e a pessoa escolheria na landing uma
 * cor que depois não existe no painel.
 */
const CORES = PALETA_DE_LOJA;

const NOME_PADRAO = "Sua Loja";

export function PreviaDaLoja({ itens, total, mensagem }: PreviaDaLojaProps) {
  const campo = useId();
  const [nome, setNome] = useState("");
  const [cor, setCor] = useState<string>(CORES[0]?.valor ?? "");

  const nomeExibido = nome.trim() === "" ? NOME_PADRAO : nome.trim();

  // A COR ESCOLHIDA PINTA A PÁGINA INTEIRA, e não só o celular da prévia. É o
  // que faz a landing virar a marca de quem chegou enquanto ela ainda está
  // decidindo — e era o que faltava: a pessoa escolhia vermelho e o fundo
  // continuava azul, como se a escolha não valesse nada.
  useEffect(() => {
    anunciarCor(cor);
  }, [cor]);

  return (
    <div className="sc-previa">
      <div className="sc-previa__controles">
        <label className="sc-previa__rotulo" htmlFor={campo}>
          Qual o nome do seu negócio?
        </label>
        <input
          className="sc-previa__campo"
          id={campo}
          name="nome-do-negocio"
          type="text"
          value={nome}
          placeholder={NOME_PADRAO}
          maxLength={40}
          autoComplete="organization"
          onChange={(evento) => setNome(evento.target.value)}
        />

        <fieldset className="sc-previa__cores">
          <legend className="sc-previa__rotulo">E a cor da sua marca?</legend>
          <div className="sc-previa__paleta">
            {CORES.map((opcao) => (
              <label className="sc-previa__cor" key={opcao.valor}>
                <input
                  type="radio"
                  name="cor-da-marca"
                  value={opcao.valor}
                  checked={cor === opcao.valor}
                  onChange={() => setCor(opcao.valor)}
                />
                {/*
                  A amostra é o único lugar do projeto onde uma cor vem de dado,
                  e não de valor declarado — ela É o dado que a pessoa escolheu.
                */}
                <span
                  className="sc-previa__amostra"
                  style={{ background: opcao.valor }}
                  aria-hidden="true"
                />
                <span className="sc-previa__cor-nome">{opcao.nome}</span>
              </label>
            ))}
          </div>
        </fieldset>
      </div>

      <div className="sc-previa__palco">
        {/*
          O CELULAR. É a moldura que quem tem loja reconhece: é assim que o
          cliente dele vai ver a loja. Mostrar isso num retângulo branco perderia
          a metade do argumento.
        */}
        <div className="sc-previa__celular">
          <div className="sc-previa__entalhe" aria-hidden="true" />
          <TemaDaLoja corPrincipal={cor} className="sc-previa__tela">
            <div className="sc-previa__capa" aria-hidden="true" />
            <div className="sc-previa__marca" aria-hidden="true">
              {iniciaisDe(nomeExibido)}
            </div>
            <p className="sc-previa__nome-da-loja">{nomeExibido}</p>
            <p className="sc-previa__situacao">
              <span className="sc-previa__pulso" aria-hidden="true" />
              Aberta agora
            </p>

            <ul className="sc-previa__itens">
              {itens.map((item) => (
                <li className="sc-previa__item" key={item.nome}>
                  <span className="sc-previa__item-figura" aria-hidden="true" />
                  <span className="sc-previa__item-texto">
                    <strong>{item.nome}</strong>
                    {item.detalhe ? <em>{item.detalhe}</em> : null}
                  </span>
                  <span className="sc-previa__item-preco">{item.preco}</span>
                </li>
              ))}
            </ul>

            <p className="sc-previa__total">
              <span>Total</span>
              <strong>{total}</strong>
            </p>
            <p className="sc-previa__botao" aria-hidden="true">
              Fechar pedido
            </p>
          </TemaDaLoja>
        </div>

        {/*
          A MENSAGEM. É o que o dono recebe, e é o motivo pelo qual ele confia no
          produto antes de testar: ele já sabe como uma mensagem de pedido
          deveria parecer, porque recebe pedido no WhatsApp todo dia.
        */}
        <figure className="sc-previa__conversa">
          <figcaption className="sc-previa__conversa-titulo">
            O que chega no seu WhatsApp
          </figcaption>
          <div className="sc-previa__balao">
            {/*
              A mensagem é desenhada COMO ELA CHEGA: o que está entre asteriscos
              vira negrito, e os asteriscos somem. Mostrá-los crus faria a
              landing parecer quebrada justamente para quem mais entende do
              assunto — o dono de loja abre o WhatsApp quarenta vezes por dia e
              sabe que mensagem nenhuma tem asterisco à vista.
            */}
            <p className="sc-previa__mensagem">
              {/*
                A POSIÇÃO É A IDENTIDADE aqui, e por isso ela serve de chave: as
                linhas de uma mensagem não se reordenam nem se inserem no meio, e
                duas linhas em branco seguidas teriam a mesma chave se ela viesse
                do conteúdo.
              */}
              {lerMensagemDoWhatsApp(mensagem).map((linha, numero) => (
                <span className="sc-previa__linha" key={`linha-${numero}`}>
                  {linha.map((pedaco, ordem) =>
                    pedaco.negrito ? (
                      <strong key={`p-${ordem}`}>{pedaco.texto}</strong>
                    ) : (
                      <span key={`p-${ordem}`}>{pedaco.texto}</span>
                    ),
                  )}
                </span>
              ))}
            </p>
            <span className="sc-previa__hora" aria-hidden="true">
              agora
            </span>
          </div>
        </figure>
      </div>
    </div>
  );
}
