import Link from "next/link";
import type { ReactNode } from "react";
import { IconeConfirmar } from "@simpleclick/ui";

interface PropriedadesDaCasca {
  readonly children: ReactNode;
  readonly titulo: string;
  readonly descricao: string;
  readonly identificadorDoTitulo: string;
  readonly etiqueta?: string;
}

const BENEFICIOS = [
  "Catálogo pronto para compartilhar",
  "Pedidos organizados em um só lugar",
  "Mais tempo para o que importa",
] as const;

/**
 * Moldura compartilhada das telas de acesso.
 *
 * Um cartão só, com o painel da marca ao lado do formulário; no celular os
 * dois empilham e o painel encolhe para a faixa da marca, para o formulário
 * aparecer sem rolar. O título da tela é o `h1`: é ele que diz onde a pessoa
 * está. O painel não carrega informação que a pessoa precise para entrar.
 */
export function CascaDaConta({
  children,
  titulo,
  descricao,
  identificadorDoTitulo,
  etiqueta = "Área do lojista",
}: PropriedadesDaCasca) {
  return (
    <main className="sc-conta">
      <div className="sc-conta__cartao">
        <aside className="sc-conta__painel" aria-label="Sobre o SimpleClick">
          <Link
            className="sc-conta__marca"
            href="/"
            aria-label="SimpleClick, início"
          >
            <span className="sc-conta__marca-simbolo" aria-hidden="true">
              ✦
            </span>
            <span>simpleclick</span>
          </Link>

          <div className="sc-conta__promessa">
            <p className="sc-conta__promessa-etiqueta">
              Seu negócio em movimento
            </p>
            <p className="sc-conta__promessa-titulo">
              Venda com um link simples.
            </p>
            <p className="sc-conta__promessa-texto">
              Uma vitrine bonita para mostrar o que você faz e uma operação leve
              para cuidar de cada pedido.
            </p>
            <ul className="sc-conta__beneficios">
              {BENEFICIOS.map((beneficio) => (
                <li key={beneficio}>
                  <span className="sc-conta__beneficio-icone">
                    <IconeConfirmar />
                  </span>
                  {beneficio}
                </li>
              ))}
            </ul>
          </div>

          <p className="sc-conta__painel-rodape">
            Feito para pequenos negócios.
          </p>
        </aside>

        <section
          className="sc-conta__formulario"
          aria-labelledby={identificadorDoTitulo}
        >
          <div className="sc-conta__miolo">
            <header className="sc-conta__cabecalho">
              <p className="sc-conta__etiqueta">{etiqueta}</p>
              <h1 id={identificadorDoTitulo} className="sc-conta__titulo">
                {titulo}
              </h1>
              <p className="sc-conta__descricao">{descricao}</p>
            </header>
            {children}
          </div>
        </section>
      </div>
    </main>
  );
}
