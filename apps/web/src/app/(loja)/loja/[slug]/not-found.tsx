/**
 * Loja não disponível (AC-402).
 *
 * A mesma página para loja que nunca existiu e para loja suspensa. Ela não diz
 * qual das duas é, e não tem detalhe técnico: contar que aquele endereço já
 * existiu e foi suspenso é informação que não é de ninguém que esteja apenas
 * navegando, e que serve para mapear concorrentes.
 *
 * O título é um `h1` da própria página, e não do cartão: o cartão começa no
 * nível 2 por desenho, porque o título de uma página é a página, e não um bloco
 * dentro dela.
 */
export default function LojaNaoDisponivel() {
  return (
    <main className="sc-pagina-da-loja">
      <section className="sc-secao">
        <div className="sc-secao__conteudo">
          <h1 className="sc-secao__titulo">Esta loja não está disponível</h1>
          <p className="sc-secao__texto">
            O endereço que você abriu não corresponde a nenhuma loja ativa.
            Confira o link com quem o enviou.
          </p>
        </div>
      </section>
    </main>
  );
}
