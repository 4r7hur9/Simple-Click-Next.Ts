import Link from "next/link";

import { PainelDoDia } from "./PainelDeMetricas.tsx";

/** Um atalho do início do painel: o que é, para que serve e aonde leva. */
interface Atalho {
  readonly titulo: string;
  readonly descricao: string;
  readonly href: string;
  readonly acao: string;
}

/**
 * Os atalhos de cuidar da loja. Os que abrem a vitrine levam à loja da
 * sessão, e não a uma loja fixa: dono de outra loja não pode cair na de
 * demonstração (T-115).
 */
function atalhosDaLoja(apelidoDaLoja: string): readonly Atalho[] {
  const vitrine = `/l/${encodeURIComponent(apelidoDaLoja)}`;
  return [
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
      href: vitrine,
      acao: "Abrir loja",
    },
    {
      titulo: "Conferir o catálogo",
      descricao: "Teste categorias, busca e os produtos publicados.",
      href: `${vitrine}/catalogo`,
      acao: "Ver catálogo",
    },
    {
      titulo: "Simular uma compra",
      descricao: "Percorra o fechamento com os dados da loja.",
      href: `${vitrine}/checkout`,
      acao: "Ir ao checkout",
    },
    {
      titulo: "Proteger a conta",
      descricao: "Revise sessões e opções de segurança deste acesso.",
      href: "/minha-conta/seguranca",
      acao: "Abrir segurança",
    },
  ];
}

/**
 * O início do painel (T-803): a primeira coisa que o dono vê ao entrar.
 *
 * Em cima, o resumo de hoje no fuso da loja — quanto vendeu, o que já foi
 * concluído e o que está em andamento, comparado com ontem até a mesma hora.
 * Embaixo, os atalhos para cuidar da loja e o que fica com a administração da
 * plataforma (AC-323).
 *
 * Não busca nada no servidor: o resumo é lido pelo navegador, pela rota do
 * próprio site que leva a sessão à API, e mostra os quatro estados enquanto
 * isso (P-011). Quem descobre a loja é a página, pela sessão.
 */
export function InicioDoPainel({
  apelidoDaLoja,
}: Readonly<{ apelidoDaLoja: string }>) {
  return (
    <div className="mx-auto max-w-7xl space-y-10 px-4 py-8 min-[540px]:px-6 lg:px-8 lg:py-12">
      <section aria-labelledby="painel-hoje" className="space-y-6">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div className="max-w-3xl">
            <h1
              id="painel-hoje"
              className="font-display text-2xl font-semibold min-[540px]:text-3xl"
            >
              Hoje na sua loja
            </h1>
            <p className="mt-2 text-tinta-suave">
              Os números de hoje, no horário da loja, comparados com ontem até a
              mesma hora.
            </p>
          </div>
          <Link
            className="sc-botao sc-botao--secundaria sc-botao--pilula"
            href="/painel/metricas"
          >
            Ver outros períodos
          </Link>
        </header>
        <PainelDoDia />
      </section>

      <section aria-labelledby="painel-atalhos">
        <h2 id="painel-atalhos" className="font-display text-xl font-semibold">
          Atalhos da loja
        </h2>
        <ul className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {atalhosDaLoja(apelidoDaLoja).map((atalho) => (
            <li
              key={atalho.href}
              className="flex flex-col rounded-[var(--raio-cartao)] border border-borda bg-superficie-alta p-5 shadow-[var(--sombra-larga)]"
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

      <aside
        aria-labelledby="painel-o-que-configura"
        className="rounded-[var(--raio-cartao)] border border-borda bg-superficie p-5"
      >
        <h2 id="painel-o-que-configura" className="font-display text-xl font-semibold">
          O que você configura
        </h2>
        <p className="mt-2 text-sm leading-6 text-tinta-suave">
          Pagamento, entrega, horário, contato, apresentação e impressão ficam
          nas configurações da loja. Cada alteração é salva inteira ou não é
          salva, e fica registrada no histórico. Tipo de negócio, apelido,
          documento e contrato são cuidados pela administração da plataforma.
        </p>
      </aside>
    </div>
  );
}
