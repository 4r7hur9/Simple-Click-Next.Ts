# Formulários, mensagens e padrões de UX para o lojista

O público típico dos produtos é dono, gerente ou vendedor de loja: pouco tempo, muitas interrupções, uso em celular e tablet, às vezes com cliente esperando no caixa. UX boa aqui é velocidade com segurança.

## 1. Anatomia de um campo

```tsx
const id = useId();
const dicaId = `${id}-dica`;
const erroId = `${id}-erro`;

<div>
  <label htmlFor={id}>Preço de venda <span className="sr-only">(obrigatório)</span></label>
  <p id={dicaId} className="text-sm text-muted-foreground">Use vírgula para centavos. Ex.: 89,90</p>
  <input
    id={id}
    name="preco"
    inputMode="decimal"
    required
    aria-invalid={!!erro}
    aria-describedby={erro ? `${dicaId} ${erroId}` : dicaId}
  />
  {erro && <p id={erroId} className="text-destructive">{erro}</p>}
</div>
```

- Ordem: rótulo, dica, campo, erro.
- A dica de formato aparece antes do erro acontecer.
- Marcação de obrigatório visível em texto para todos (ou legenda "Campos com * são obrigatórios" no topo do form e `required` nos campos).

## 2. Mensagens de erro

Estrutura: o que aconteceu + como resolver. Tom neutro, sem culpar.

| Ruim | Bom |
|---|---|
| Campo inválido | Informe o telefone com DDD, somente números. Ex.: 85999998888 |
| Erro 409 | Estoque insuficiente: restam 2 unidades de Camisa Polo P. |
| Falha na operação | Não foi possível salvar o produto. Verifique sua conexão e tente de novo. |
| Senha incorreta (no login) | E-mail ou senha inválidos. |
| Erro inesperado | Algo deu errado ao finalizar a venda. A venda não foi registrada. Tente novamente ou chame o suporte com o código A7F3. |

- Erro de negócio vindo do servidor (Problem Details) é traduzido para mensagem do domínio; o código técnico vai para log com correlation id, e o usuário recebe um código curto para suporte quando útil.
- Sempre diga o estado final: a venda foi ou não registrada? O dinheiro foi ou não cobrado?

## 3. Validação: quando mostrar

- No blur do campo (depois que o usuário saiu), não a cada tecla do primeiro preenchimento.
- Depois de um erro, revalide a cada tecla para o erro sumir assim que corrigido.
- No submit: todos os erros de uma vez, foco no primeiro campo inválido ou em um resumo `role="alert"` com links para os campos.
- Validação que depende do servidor (SKU duplicado, CPF já cadastrado): no submit ou no blur com debounce, com mensagem específica.

## 4. Envio e prevenção de duplo clique

- Durante o envio: botão mostra "Salvando..." e fica desabilitado (ou `aria-disabled` + ignorar cliques), `aria-busy` no form.
- Operação financeira (venda, estorno, fechamento de caixa): resumo antes de confirmar (WCAG 3.3.4) com valores formatados; após confirmar, tela de resultado clara com número da venda.
- Idempotência no servidor é a defesa real contra duplicação (ver `backend-engenharia`); o botão desabilitado é a defesa de UX.

## 5. Confirmação e desfazer

| Situação | Padrão |
|---|---|
| Remover item do carrinho | remover direto + "Desfazer" por alguns segundos |
| Excluir produto/cliente | diálogo de confirmação com nome do item e consequência |
| Cancelar venda finalizada | diálogo + motivo obrigatório + registro em auditoria |
| Ação em massa | diálogo com a quantidade afetada ("Excluir 37 produtos?") |
| Sair com formulário alterado | aviso de alterações não salvas |

Botão do diálogo usa verbo específico ("Excluir produto", "Cancelar venda"), nunca "OK"/"Sim". O botão de cancelar/voltar recebe o foco inicial em ações destrutivas.

## 6. Estados de tela

- **Primeiro uso (vazio inicial)**: explique o valor e ofereça a ação ("Cadastre seu primeiro produto para começar a vender").
- **Vazio por filtro**: diga que o filtro não encontrou nada e ofereça limpar filtro.
- **Carregando**: skeleton no formato do conteúdo; operações longas mostram progresso ou etapa atual.
- **Erro**: o que falhou, se há dado perdido, botão de tentar de novo.
- **Parcial**: mostre o que carregou e sinalize o que falhou na região correspondente.
- **Offline**: indicador persistente e o que ainda é possível fazer.

## 7. Texto de interface

- Verbos no infinitivo em botões ("Salvar produto", "Finalizar venda"), consistentes em todo o app.
- Termos do negócio do lojista: "estoque", "grade" (tamanhos/cores), "caixa", "sangria", "suprimento", "fechamento", "comanda". Mantenha o glossário do produto.
- Números: `Intl.NumberFormat('pt-BR')`; moeda com `currency: 'BRL'`; percentuais com `style: 'percent'`.
- Datas: `Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeZone })` com o fuso da loja; datas relativas ("há 5 minutos") com a data completa em `title` ou `<time dateTime>`.
- Evite abreviações ambíguas; se usar, `<abbr title="Stock Keeping Unit">SKU</abbr>` na primeira ocorrência.

## 8. Responsividade e contexto de uso

- Mobile-first; pontos de quebra a partir do conteúdo, não de dispositivos específicos.
- Tablet no balcão: alvos de 44x44 px, fonte base >= 16px (evita zoom automático no iOS em inputs), ações principais na metade inferior.
- Teclado virtual certo por campo (`inputMode`, `type`), `enterKeyHint="search"`/`"done"` quando fizer sentido.
- Orientação: não trave em retrato ou paisagem sem necessidade (WCAG 1.3.4).
- Formulários longos: dividir em etapas com indicador de progresso e salvamento de rascunho.

## 9. Movimento e atenção

- Transições curtas (150 a 250ms) para dar continuidade, nunca para decorar.
- `prefers-reduced-motion: reduce` remove deslocamentos, parallax e animações em loop; fades curtos podem permanecer.
- Nada de carrossel automático em tela operacional.
- Sons (bipe do caixa) com opção de desligar e sempre acompanhados de feedback visual.

## 10. Checklist rápido de UX para o revisor

- A tela deixa claro o estado final das operações importantes?
- Existe caminho de volta/cancelar em cada etapa?
- As mensagens de erro são específicas e acionáveis?
- O fluxo principal cabe em uma tela de celular sem esconder a ação primária?
- A mesma ação tem o mesmo nome e lugar das outras telas?
