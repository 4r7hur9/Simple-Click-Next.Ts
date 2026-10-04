import Link from "next/link";

import { PainelDoDia } from "../../../features/dashboard/PainelDeMetricas.tsx";

export const metadata = {
  title: "Painel | SimpleClick",
  description:
    "O resumo de hoje da sua loja: quanto vendeu, comparado com ontem, e os atalhos para cuidar da loja.",
};

const atalhos = [
  {
    titulo: "Configurar a loja",
    descricao:
      "Pagamento, entrega, horário, contato, apresentação e impressão.",
    href: "/painel/config/aparencia",
    acao: "Abrir configurações",
  },
  {
    titulo: "Montar o catálogo",
    descricao: "Crie categorias e defina a ordem que o cliente verá.",
    href: "/painel/categorias",
    acao: "Gerenciar categorias",
  },
  {
    titulo: "Cadastrar produtos",
    descricao: "Crie, publique, duplique ou retire itens da vitrine.",
    href: "/painel/produtos",
    acao: "Gerenciar produtos",
  },
  {
    titulo: "Abrir a apresentação",
    descricao: "Veja a entrada da loja como o cliente vê.",
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
    descricao: "Percorra o fechamento com os dados da loja.",
    href: "/l/pastelaria-da-vila/checkout",
    acao: "Ir ao checkout",
  },
  {
    titulo: "Proteger a conta",
    descricao: "Revise sessões e opções de segurança deste acesso.",
    href: "/minha-conta/seguranca",
    acao: "Abrir segurança",
  },
] as const;

/**
 * O painel do dia (T-803): a primeira coisa que o dono vê ao entrar.
 *
 * Em cima, o resumo de hoje no fuso da loja — quanto vendeu, o que já foi
 * concluído e o que está em andamento, comparado com ontem até a mesma hora.
 * Embaixo, os atalhos para cuidar da loja, que existiam antes das métricas e
 * continuam alcançáveis daqui.
 *
 * A página não busca nada no servidor: o resumo é lido pelo navegador, pela
 * rota do próprio site que leva a sessão à API, e mostra os quatro estados
 * enquanto isso (P-011).
 */
export default function PaginaInicialDoPainel() {
  return (
    <div className="mx-auto max-w-7xl space-y-10 px-4 py-8 min-[540px]:px-6 lg:px-8 lg:py-12">
      <section aria-labelledby="painel-hoje" className="space-y-6">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div className="max-w-3xl">
            <h1
              id="painel-hoje"
              className="text-2xl font-semibold min-[540px]:text-3xl"
            >
              Hoje na sua loja
            </h1>
            <p className="mt-2 text-tinta-suave">
              Os números de hoje, no horário da loja, comparados com ontem até a
              mesma hora.
            </p>
          </div>
          <Link
            className="sc-botao sc-botao--secundaria"
            href="/painel/metricas"
          >
            Ver outros períodos
          </Link>
        </header>
        <PainelDoDia />
      </section>

      <section aria-labelledby="painel-atalhos">
        <h2 id="painel-atalhos" className="text-xl font-semibold">
          Atalhos da loja
        </h2>
        <ul className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          {atalhos.map((atalho) => (
            <li
              key={atalho.href}
              className="flex flex-col rounded-lg border border-borda bg-superficie p-4"
            >
              <h3 className="text-base font-semibold">{atalho.titulo}</h3>
              <p className="mt-1 flex-1 text-sm leading-6 text-tinta-suave">
                {atalho.descricao}
              </p>
              <Link
                className="sc-botao sc-botao--discreta mt-3 self-start"
                href={atalho.href}
              >
                {atalho.acao}
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
