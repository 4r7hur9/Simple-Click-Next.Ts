// Seções dos controles na vitrine do design system: botão e campo em cada estado
// que oferecem, para o axe medir todos (AC-013, AC-016).
import { Botao, Campo } from "@simpleclick/ui";

import { Secao } from "./SecaoDaVitrine.tsx";

/** Botão e campo, com variantes, carregando, desabilitado, erro e sucesso. */
export function SecoesDeControles() {
  return (
    <>
      <Secao
        descricao="Estados próprios: carregando e desabilitado. Vazio e erro pertencem a quem mostra o resultado, não ao botão."
        id="secao-botao"
        titulo="Botão"
      >
        <div className="flex flex-wrap gap-3">
          <Botao variante="primaria">Salvar</Botao>
          <Botao variante="secundaria">Cancelar</Botao>
          <Botao variante="perigo">Recusar pedido</Botao>
          <Botao variante="discreta">Ver detalhes</Botao>
          <Botao tamanho="pequeno" variante="secundaria">
            Editar
          </Botao>
        </div>
        <div className="flex flex-wrap gap-3">
          <Botao carregando rotuloDeEspera="Salvando o pedido…">
            Salvar
          </Botao>
          <Botao desabilitado variante="primaria">
            Indisponível
          </Botao>
          <Botao carregando variante="perigo">
            Recusando
          </Botao>
        </div>
      </Secao>

      <Secao
        descricao="Estados próprios: carregando (verificando no servidor), erro e sucesso. Campo sem valor é o começo normal, não um estado vazio."
        id="secao-campo"
        titulo="Campo"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo
            dica="Aparece no endereço da sua vitrine."
            id="campo-apelido"
            obrigatorio
            rotulo="Apelido da loja"
            defaultValue="padaria-do-ze"
          />
          <Campo
            carregando
            id="campo-apelido-verificando"
            rotulo="Apelido da loja"
            rotuloDeEspera="Verificando se o apelido está livre…"
            defaultValue="padaria-do-ze"
          />
          <Campo
            erro="Este apelido já é usado por outra loja."
            id="campo-apelido-erro"
            rotulo="Apelido da loja"
            defaultValue="padaria"
          />
          <Campo
            id="campo-apelido-sucesso"
            rotulo="Apelido da loja"
            sucesso="Apelido disponível."
            defaultValue="padaria-do-ze-2"
          />
          <Campo
            desabilitado
            dica="Só a administração altera o tipo de negócio."
            id="campo-ramo"
            rotulo="Tipo de negócio"
            defaultValue="Alimentação"
          />
        </div>
      </Secao>
    </>
  );
}
