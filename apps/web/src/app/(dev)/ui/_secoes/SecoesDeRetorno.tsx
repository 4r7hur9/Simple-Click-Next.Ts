// Seções do retorno ao usuário na vitrine do design system: aviso, diálogo, os blocos
// de estado de tela e a cor da loja com contraste ajustado (AC-013, AC-014).
import {
  Aviso,
  Botao,
  Carregando,
  Cartao,
  Dialogo,
  Erro,
  Esqueleto,
  Sucesso,
  TemaDaLoja,
  Vazio,
} from "@simpleclick/ui";

import { CORES_DE_EXEMPLO } from "./dados-da-vitrine.ts";
import { Secao } from "./SecaoDaVitrine.tsx";

/** Aviso, diálogo, estados de tela e identidade da loja, nessa ordem. */
export function SecoesDeRetorno() {
  return (
    <>
      <Secao
        descricao="Os quatro tons. O erro interrompe o leitor de tela; os outros esperam a próxima pausa."
        id="secao-aviso"
        titulo="Aviso"
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Aviso titulo="Loja em horário reduzido" tom="info">
            Hoje o atendimento vai até as 16h.
          </Aviso>
          <Aviso titulo="Pedido aceito" tom="sucesso">
            O cliente já foi avisado pela página de acompanhamento.
          </Aviso>
          <Aviso titulo="Não foi possível imprimir" tom="erro">
            A impressora não respondeu. O cupom continua na fila.
          </Aviso>
          <Aviso titulo="Chave PIX não cadastrada" tom="atencao">
            Sem ela, o cliente não consegue concluir o pagamento.
          </Aviso>
        </div>
      </Secao>

      <Secao
        descricao="Estados próprios: carregando, erro e sucesso, para a ação que o diálogo confirma. Aqui eles aparecem embutidos, sem bloquear a página."
        id="secao-dialogo"
        titulo="Caixa de diálogo"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Dialogo
            aberto
            descricao="O cliente será avisado na página de acompanhamento."
            id="dialogo-pronto"
            modal={false}
            rodape={
              <>
                <Botao variante="secundaria">Voltar</Botao>
                <Botao variante="perigo">Recusar</Botao>
              </>
            }
            titulo="Recusar o pedido #1042?"
          >
            <p>Diga o motivo para o cliente entender a recusa.</p>
          </Dialogo>

          <Dialogo
            aberto
            estado="carregando"
            id="dialogo-carregando"
            modal={false}
            rotuloDeEspera="Recusando o pedido…"
            titulo="Recusar o pedido #1042?"
          />

          <Dialogo
            aberto
            estado="erro"
            id="dialogo-erro"
            mensagemDeErro="A recusa não foi registrada. O pedido continua em aberto."
            modal={false}
            referenciaDoErro="ref-9b04"
            titulo="Recusar o pedido #1042?"
          />

          <Dialogo
            aberto
            descricaoDeSucesso="O cliente já vê o novo status."
            estado="sucesso"
            id="dialogo-sucesso"
            modal={false}
            titulo="Recusar o pedido #1042?"
            tituloDeSucesso="Pedido recusado"
          />
        </div>
      </Secao>

      <Secao
        descricao="Os blocos reutilizáveis, fora de qualquer moldura. Toda tela nova monta os quatro a partir daqui."
        id="secao-estados"
        titulo="Estados de tela"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Carregando rotulo="Carregando o catálogo…" />
          <Esqueleto linhas={4} rotulo="Carregando a lista de produtos…" />
          <Vazio
            descricao="Nenhum pedido chegou no período escolhido."
            titulo="Sem resultados"
          />
          <Erro
            mensagem="Não foi possível falar com o servidor."
            referencia="ref-1d55"
          />
          <Sucesso
            descricao="As alterações já valem para a vitrine."
            titulo="Configuração salva"
          />
        </div>
      </Secao>

      <Secao
        descricao="A cor escolhida pelo dono é aplicada como está. As duas amostras mostram ajustes diferentes de tinta e texto para alcançar o mínimo do WCAG."
        id="secao-tema"
        titulo="Identidade da loja"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          {CORES_DE_EXEMPLO.map(({ cor, nome, observacao }) => (
            <TemaDaLoja corPrincipal={cor} key={cor}>
              <Cartao titulo={`${nome} (${cor})`}>
                <p className="text-sm">{observacao}</p>
                <div className="flex flex-wrap gap-3">
                  <Botao variante="primaria">Fazer pedido</Botao>
                  <Botao variante="discreta">Ver cardápio</Botao>
                </div>
              </Cartao>
            </TemaDaLoja>
          ))}
        </div>
      </Secao>
    </>
  );
}
