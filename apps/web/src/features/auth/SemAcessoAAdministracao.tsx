import { Aviso, Botao } from "@simpleclick/ui";

export interface SemAcessoAAdministracaoProps {
  /** A área do papel da conta, da lista fixa `DESTINO_DO_PAPEL`. */
  readonly areaDoPapel: string;
  /** A ação de sair que já existe (`sairDaConta`), passada pela página. */
  readonly sair: () => Promise<void>;
}

/**
 * Conta logada que não é da administração (card #11).
 *
 * Mensagem neutra: não diz o papel da conta nem por que não tem acesso, e só
 * aparece a quem já provou a senha (nada se revela sobre o e-mail). A pessoa
 * continua logada e escolhe: ir para a própria área, sair e entrar com outra
 * conta, ou usar o login comum.
 */
export function SemAcessoAAdministracao({
  areaDoPapel,
  sair,
}: SemAcessoAAdministracaoProps) {
  return (
    <div className="sc-entrada-admin__sem-acesso">
      <Aviso tom="erro" titulo="Esta conta não tem acesso à administração">
        Se você queria entrar na sua conta de cliente ou na sua loja, use o
        login comum.
      </Aviso>
      <div className="sc-entrada-admin__acoes">
        <a className="sc-botao sc-botao--primaria" href={areaDoPapel}>
          Ir para a minha área
        </a>
        <form action={sair}>
          <Botao type="submit" variante="secundaria">
            Sair e entrar com outra conta
          </Botao>
        </form>
      </div>
      <p className="sc-conta__rodape-formulario">
        <a href="/entrar">Ir para o login de clientes e lojas</a>
      </p>
    </div>
  );
}
