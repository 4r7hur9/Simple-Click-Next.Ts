// Seções dos componentes que carregam dado próprio na vitrine do design system:
// cartão e lista, cada um nos quatro estados de tela (AC-013).
import { Cartao, Lista } from "@simpleclick/ui";

import { PEDIDOS, SEM_PEDIDOS } from "./dados-da-vitrine.ts";
import { Secao } from "./SecaoDaVitrine.tsx";

/** Cartão e lista em pronto, carregando, vazio, erro e sucesso. */
export function SecoesDeDados() {
  return (
    <>
      <Secao
        descricao="Os quatro estados inteiros: o cartão é a menor parte da tela que carrega dado próprio."
        id="secao-cartao"
        titulo="Cartão"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Cartao titulo="Pedidos de hoje">
            <p>12 pedidos aceitos, 3 em preparo.</p>
          </Cartao>
          <Cartao
            estado="carregando"
            rotuloDeEspera="Carregando o resumo do dia…"
            titulo="Resumo do dia"
          />
          <Cartao
            esperaComEsqueleto
            estado="carregando"
            rotuloDeEspera="Carregando o histórico…"
            titulo="Histórico"
          />
          <Cartao
            descricaoVazio="Cadastre o primeiro produto para a vitrine sair do ar vazia."
            estado="vazio"
            titulo="Catálogo"
            tituloVazio="Nenhum produto cadastrado"
          />
          <Cartao
            estado="erro"
            mensagemDeErro="Não foi possível carregar as métricas agora."
            referenciaDoErro="ref-7f3a"
            titulo="Métricas"
          />
          <Cartao
            descricaoDeSucesso="A chave PIX foi atualizada."
            estado="sucesso"
            titulo="Formas de pagamento"
            tituloDeSucesso="Configuração salva"
          />
        </div>
      </Secao>

      <Secao
        descricao="Os quatro estados. É onde eles mais importam: pedido, produto e cliente são todos listas vindas do servidor."
        id="secao-lista"
        titulo="Lista"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Lista
            chaveDoItem={(pedido) => pedido.id}
            itens={PEDIDOS}
            renderizarItem={(pedido) => (
              <span>
                {pedido.cliente} — {pedido.total}
              </span>
            )}
            rotulo="Pedidos recebidos"
          />
          <Lista
            chaveDoItem={(pedido) => pedido.id}
            estado="carregando"
            itens={SEM_PEDIDOS}
            renderizarItem={() => null}
            rotulo="Pedidos recebidos"
            rotuloDeEspera="Carregando os pedidos…"
          />
          <Lista
            chaveDoItem={(pedido) => pedido.id}
            descricaoVazio="Assim que a primeira venda entrar, ela aparece aqui."
            estado="vazio"
            itens={SEM_PEDIDOS}
            renderizarItem={() => null}
            rotulo="Pedidos recebidos"
            tituloVazio="Nenhum pedido ainda"
          />
          <Lista
            chaveDoItem={(pedido) => pedido.id}
            estado="erro"
            itens={SEM_PEDIDOS}
            mensagemDeErro="A fila de pedidos não respondeu. Tente de novo em instantes."
            referenciaDoErro="ref-2c19"
            renderizarItem={() => null}
            rotulo="Pedidos recebidos"
          />
          <Lista
            chaveDoItem={(pedido) => pedido.id}
            descricaoDeSucesso="3 pedidos novos desde a última atualização."
            estado="sucesso"
            itens={PEDIDOS}
            renderizarItem={(pedido) => (
              <span>
                {pedido.cliente} — {pedido.total}
              </span>
            )}
            rotulo="Pedidos recebidos"
            tituloDeSucesso="Lista atualizada"
          />
        </div>
      </Secao>
    </>
  );
}
