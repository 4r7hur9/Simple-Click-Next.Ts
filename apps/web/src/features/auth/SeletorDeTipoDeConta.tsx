import { IconeLoja, IconePedido, IconeSeta } from "@simpleclick/ui";

/**
 * A primeira pergunta de criar conta: comprar ou vender. Dois cartões
 * grandes, que são links (`?tipo=`), para a escolha funcionar sem script e
 * poder ser compartilhada. O destino da pessoa (`proximo`) acompanha.
 */
export function SeletorDeTipoDeConta({
  enderecoDoCliente,
  enderecoDoDono,
}: {
  readonly enderecoDoCliente: string;
  readonly enderecoDoDono: string;
}) {
  return (
    <nav className="sc-cadastro__tipos" aria-label="Tipo de conta">
      <a className="sc-cadastro__tipo" href={enderecoDoCliente}>
        <span className="sc-cadastro__tipo-icone" aria-hidden="true">
          <IconePedido />
        </span>
        <span className="sc-cadastro__tipo-texto">
          <strong>Quero comprar</strong>
          <span>Peça nas lojas e acompanhe seus pedidos. Leva um minuto.</span>
        </span>
        <span className="sc-cadastro__tipo-seta" aria-hidden="true">
          <IconeSeta />
        </span>
      </a>
      <a className="sc-cadastro__tipo" href={enderecoDoDono}>
        <span className="sc-cadastro__tipo-icone" aria-hidden="true">
          <IconeLoja />
        </span>
        <span className="sc-cadastro__tipo-texto">
          <strong>Quero vender com minha loja</strong>
          <span>
            Cadastre sua loja no SimpleClick. A equipe analisa e libera.
          </span>
        </span>
        <span className="sc-cadastro__tipo-seta" aria-hidden="true">
          <IconeSeta />
        </span>
      </a>
    </nav>
  );
}
