import Link from "next/link";
import type { ReactNode } from "react";
import { IconeConfirmar } from "@simpleclick/ui";

interface PropriedadesDaCasca {
  readonly children: ReactNode;
  readonly titulo: string;
  readonly descricao: string;
  readonly identificadorDoTitulo: string;
  readonly etiqueta?: string;
  /**
   * O que o painel ao lado conta. `conta` (padrão) serve a todo mundo: quem
   * compra, quem vende, a equipe e a administração. `lojista` é a conversa
   * de quem quer abrir uma loja (tela `/vender`).
   */
  readonly painel?: "conta" | "lojista";
}

const PAINEIS = {
  conta: {
    etiqueta: "Sua conta SimpleClick",
    titulo: "Uma conta só para tudo.",
    texto:
      "Peça nas lojas, acompanhe seus pedidos e, se você vende, cuide da sua loja. Tudo com o mesmo e-mail.",
    itens: [
      "Pedidos e endereços salvos",
      "Acompanhe cada pedido",
      "A mesma conta em todas as lojas",
    ],
    rodape: "Para quem compra e quem vende.",
  },
  lojista: {
    etiqueta: "Seu negócio em movimento",
    titulo: "Venda com um link simples.",
    texto:
      "Uma vitrine bonita para mostrar o que você faz e uma operação leve para cuidar de cada pedido.",
    itens: [
      "Catálogo pronto para compartilhar",
      "Pedidos organizados em um só lugar",
      "Mais tempo para o que importa",
    ],
    rodape: "Feito para pequenos negócios.",
  },
} as const;

/**
 * Moldura compartilhada das telas de acesso.
 *
 * Um cartão só, com o painel da marca ao lado do formulário; no celular o
 * painel encolhe para a faixa da marca, para o formulário aparecer sem rolar.
 * O título da tela é o `h1`: é ele que diz onde a pessoa está. O painel não
 * carrega informação que a pessoa precise para entrar.
 */
export function CascaDaConta({
  children,
  titulo,
  descricao,
  identificadorDoTitulo,
  etiqueta = "Sua conta SimpleClick",
  painel = "conta",
}: PropriedadesDaCasca) {
  const conteudo = PAINEIS[painel];
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
            <p className="sc-conta__promessa-etiqueta">{conteudo.etiqueta}</p>
            <p className="sc-conta__promessa-titulo">{conteudo.titulo}</p>
            <p className="sc-conta__promessa-texto">{conteudo.texto}</p>
            <ul className="sc-conta__beneficios">
              {conteudo.itens.map((item) => (
                <li key={item}>
                  <span className="sc-conta__beneficio-icone">
                    <IconeConfirmar />
                  </span>
                  {item}
                </li>
              ))}
            </ul>
          </div>

          <p className="sc-conta__painel-rodape">{conteudo.rodape}</p>
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
