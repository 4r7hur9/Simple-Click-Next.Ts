import Link from "next/link";

export const metadata = {
  title: "Painel | SimpleClick",
  description: "Atalhos para testar e administrar sua loja SimpleClick.",
};

const atalhos = [
  {
    titulo: "Abrir a apresentação",
    descricao: "Veja a entrada da loja com a identidade e o fundo 3D.",
    href: "/l/pastelaria-da-vila",
    acao: "Abrir loja",
  },
  {
    titulo: "Conferir o catálogo",
    descricao: "Teste categorias, busca e os produtos publicados.",
    href: "/l/pastelaria-da-vila/catalogo",
    acao: "Ver catálogo",
  },
  {
    titulo: "Simular uma compra",
    descricao: "Percorra o fechamento com os dados da loja de demonstração.",
    href: "/l/pastelaria-da-vila/checkout",
    acao: "Ir ao checkout",
  },
  {
    titulo: "Proteger a conta",
    descricao: "Revise sessões e opções de segurança deste acesso.",
    href: "/minha-conta/seguranca",
    acao: "Abrir segurança",
  },
  {
    titulo: "Configurar a loja",
    descricao: "Edite apresentação, marca, capa, cor e contato público.",
    href: "/painel/config/aparencia",
    acao: "Abrir configurações",
  },
  {
    titulo: "Montar o catálogo",
    descricao: "Crie categorias e defina a ordem que o cliente verá.",
    href: "/painel/categorias",
    acao: "Gerenciar categorias",
  },
] as const;

/**
 * Início útil do painel enquanto métricas e configuração editável chegam.
 *
 * Não mostra números inventados: oferece caminhos reais para conferir o fluxo
 * já implementado e deixa explícito o que ainda pertence à próxima onda.
 */
export default function PaginaInicialDoPainel() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
      <header className="max-w-3xl">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--cor-primaria)]">
          Ambiente de demonstração
        </p>
        <h1 className="mt-3 text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
          Sua loja está pronta para ser testada.
        </h1>
        <p className="mt-4 text-lg leading-8 text-[var(--cor-tinta-suave)]">
          Comece pela experiência do cliente. Todos os atalhos abaixo abrem
          telas reais usando os dados locais da Pastelaria da Vila.
        </p>
      </header>

      <section aria-labelledby="painel-atalhos" className="mt-10">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 id="painel-atalhos" className="text-2xl font-semibold">
              Teste o fluxo do MVP
            </h2>
            <p className="mt-2 text-[var(--cor-tinta-suave)]">
              Abra cada etapa em ordem ou vá direto ao ponto que quer revisar.
            </p>
          </div>
          <span className="rounded-full border border-[var(--cor-borda)] bg-[var(--cor-superficie)] px-3 py-1 text-sm">
            Loja demo ativa
          </span>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          {atalhos.map((atalho, indice) => (
            <article
              key={atalho.href}
              className="flex min-h-56 flex-col rounded-[var(--raio-grande)] border border-[var(--cor-borda)] bg-[var(--cor-superficie)] p-6 shadow-[var(--sombra-baixa)]"
            >
              <span className="text-sm font-semibold text-[var(--cor-primaria)]">
                0{indice + 1}
              </span>
              <h3 className="mt-5 text-2xl font-semibold">{atalho.titulo}</h3>
              <p className="mt-2 flex-1 leading-7 text-[var(--cor-tinta-suave)]">
                {atalho.descricao}
              </p>
              <Link
                className="sc-botao sc-botao--primario mt-6"
                href={atalho.href}
              >
                {atalho.acao}
              </Link>
            </article>
          ))}
        </div>
      </section>

      <aside className="mt-8 rounded-[var(--raio-grande)] border border-[var(--cor-borda)] bg-[var(--cor-superficie)] p-6">
        <h2 className="text-xl font-semibold">Configuração local disponível</h2>
        <p className="mt-2 leading-7 text-[var(--cor-tinta-suave)]">
          A edição de aparência e contato salva no banco do ambiente de
          desenvolvimento. Use a navegação da configuração para alternar entre
          as duas telas antes de revisar a loja pública.
        </p>
      </aside>
    </div>
  );
}
