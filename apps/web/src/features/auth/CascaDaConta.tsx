import Link from "next/link";
import type { ReactNode } from "react";

interface PropriedadesDaCasca {
  readonly children: ReactNode;
  readonly titulo: string;
  readonly descricao: string;
  readonly identificadorDoTitulo: string;
  readonly etiqueta?: string;
}

/**
 * Moldura compartilhada das telas de acesso.
 *
 * A referência visual escolhida pelo produto usa uma divisão forte entre
 * promessa e ação. Aqui ela é traduzida para a identidade do SimpleClick e
 * continua sendo HTML real: o painel decorativo não carrega informação que a
 * pessoa precise para entrar.
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
      <section className="sc-conta__cartao">
        <aside className="sc-conta__hero" aria-label="Sobre o SimpleClick">
          <div className="sc-conta__decoracao" aria-hidden="true">
            <span className="sc-conta__bolha sc-conta__bolha--um" />
            <span className="sc-conta__bolha sc-conta__bolha--dois" />
            <span className="sc-conta__bolha sc-conta__bolha--tres" />
            <span className="sc-conta__brilho" />
          </div>

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

          <div className="sc-conta__hero-conteudo">
            <p className="sc-conta__hero-etiqueta">Seu negócio em movimento</p>
            <h1>Venda com um link simples.</h1>
            <p>
              Uma vitrine bonita para mostrar o que você faz e uma operação leve
              para cuidar de cada pedido.
            </p>
            <ul className="sc-conta__beneficios">
              <li>Catálogo pronto para compartilhar</li>
              <li>Pedidos organizados em um só lugar</li>
              <li>Mais tempo para o que importa</li>
            </ul>
          </div>

          <p className="sc-conta__hero-rodape">Feito para pequenos negócios.</p>
        </aside>

        <section
          className="sc-conta__formulario"
          aria-labelledby={identificadorDoTitulo}
        >
          <div className="sc-conta__cabecalho">
            <p className="sc-conta__etiqueta">{etiqueta}</p>
            <h2 id={identificadorDoTitulo}>{titulo}</h2>
            <p>{descricao}</p>
          </div>
          {children}
        </section>
      </section>
    </main>
  );
}
