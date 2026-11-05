---
name: acessibilidade-ux
description: "Acessibilidade (WCAG 2.2 nível AA) e UX de interfaces web: HTML semântico (button, a, label, landmarks, headings), navegação por teclado e foco visível, contraste, ARIA só quando o HTML não resolve, texto alternativo, formulários com rótulos e mensagens de erro claras, feedback de status (aria-live), modais e menus acessíveis, responsividade, alvos de toque, prefers-reduced-motion e padrões de UX (estados vazios, confirmação, desfazer, formatação pt-BR). Use quando o diff criar ou alterar telas, componentes interativos, formulários, modais, tabelas, ícones clicáveis, cores/tema ou animações. Não use para lógica de estado e dados (use frontend-engenharia) nem para velocidade (use frontend-performance)."
---

# Acessibilidade e UX

Regras para que qualquer pessoa consiga usar a interface: com teclado, leitor de tela, zoom, baixa visão, daltonismo, tela pequena ou pressa no caixa.
O `implementer` e o `fixer` usam as regras ao construir; o `quality-reviewer` e o `test-reviewer` usam o checklist para gerar findings com severidade.
Alvo: WCAG 2.2 nível AA. Exemplos em React/Next.js; em outro stack, aplique o equivalente (as regras são de HTML e de UX, não de framework).

## Regras inegociáveis

1. **Use o elemento nativo certo: `<button>` para ação, `<a href>` para navegação, `<label>` para campo.** `div` com `onClick` não recebe foco, não responde a Enter/Espaço e não é anunciado como botão.
2. **Tudo que funciona com mouse funciona com teclado, em ordem lógica e sem armadilha de foco.** Operador de caixa e usuários de leitor de tela dependem disso.
3. **Foco sempre visível.** `outline: none` sem substituto deixa o usuário de teclado cego.
4. **Todo campo de formulário tem rótulo programático.** Placeholder não é rótulo: some ao digitar e não é lido de forma confiável.
5. **Erro de validação diz o que está errado e como corrigir, junto ao campo e anunciado.** Borda vermelha sozinha não comunica para quem não vê cor.
6. **Contraste mínimo AA: 4,5:1 para texto normal, 3:1 para texto grande e para bordas/ícones de componentes.** Contraste baixo exclui baixa visão e quem usa o celular no sol.
7. **Informação nunca depende só de cor.** Status "pago/pendente" precisa de texto ou ícone com rótulo, não só verde/vermelho.
8. **Imagem informativa tem `alt` descritivo; decorativa tem `alt=""`.** Sem `alt`, o leitor de tela lê o nome do arquivo.
9. **Botão só com ícone tem nome acessível (`aria-label` ou texto oculto).** Senão é anunciado apenas como "botão".
10. **ARIA só quando o HTML não resolve, e completo quando usado.** `role="button"` sem teclado ou `aria-expanded` que não atualiza é pior que nenhum ARIA.
11. **Modal prende o foco enquanto aberto, fecha com Esc e devolve o foco ao gatilho.** Sem isso o usuário de teclado navega atrás do modal.
12. **Mudança de status assíncrona é anunciada (`role="status"`/`aria-live`, `role="alert"` para erro).** Toast silencioso não existe para quem usa leitor de tela.
13. **Layout funciona a 320px de largura e com zoom de 200% sem perder conteúdo nem exigir rolagem horizontal.** Lojista usa celular; muita gente usa zoom.
14. **Animação respeita `prefers-reduced-motion`.** Movimento pode causar náusea e distração.
15. **Ação destrutiva ou irreversível pede confirmação clara ou oferece desfazer.** Excluir produto ou cancelar venda por clique acidental é perda de dado.

## Como construir

### Estrutura da página
- `<html lang="pt-BR">` no layout raiz.
- Landmarks: `<header>`, `<nav aria-label="Principal">`, `<main>` (um por página), `<footer>`, `<aside>`.
- Um `<h1>` por página descrevendo a tela; hierarquia `h2`/`h3` sem pular níveis por estilo.
- Link "Pular para o conteúdo" como primeiro elemento focável, apontando para `#conteudo` no `<main>`.
- `<title>` único por página via `metadata`/`generateMetadata` ("Vendas do dia | Loja Centro").
- Tabelas de dados com `<table>`, `<caption>` ou `aria-label`, `<th scope="col">`. Não use tabela para layout, nem `div` para dados tabulares.

### Teclado e foco
- Ordem de tabulação segue a ordem visual; evite `tabindex` positivo. `tabindex="0"` só em widget customizado; `tabindex="-1"` para foco programático.
- Estilo de foco com `:focus-visible` e contraste de 3:1 com o fundo.
- Após navegação SPA ou ação que troca o conteúdo principal, mova o foco para o título da nova seção ou mantenha-o em lugar previsível.
- Após excluir item de lista, mova o foco para o próximo item ou para o título da lista.
- Atalhos de teclado no PDV (F2 buscar, F4 finalizar) documentados na tela, sem conflitar com leitor de tela, e sem disparar dentro de campos de texto quando forem letras simples.
- Elemento com foco não pode ficar escondido atrás de header fixo ou banner (WCAG 2.4.11).

### Formulários
- `<label htmlFor>` ligado ao `id` do campo; grupo de radio/checkbox em `<fieldset>` com `<legend>`.
- Campo obrigatório: `required` e indicação textual ("obrigatório"), não só asterisco colorido.
- Erro: `aria-invalid="true"` e `aria-describedby` apontando para a mensagem. No submit com erros, foque o primeiro campo inválido ou um resumo com links.
- Instruções de formato antes do campo ("Somente números, com DDD").
- `type` e `inputMode` corretos (`email`, `tel`, `inputMode="decimal"` para preço, `inputMode="numeric"` para quantidade) e `autoComplete` (`name`, `email`, `tel`, `postal-code`, `current-password`, `new-password`).
- Não bloqueie colar em senha nem desative autocomplete de senha (WCAG 3.3.8).
- Não peça de novo informação já informada no mesmo fluxo (WCAG 3.3.7).
- Botão de submit sempre habilitado e visível com texto de ação ("Finalizar venda"); se desabilitar durante envio, indique o porquê (`aria-busy`, texto "Salvando...").

### Feedback e estados
- Região `role="status"` (educada) para sucesso e progresso; `role="alert"` para erro que exige atenção. A região precisa existir no DOM antes da mensagem entrar.
- Loading: skeleton com `aria-busy="true"` no container ou texto oculto "Carregando vendas".
- Estado vazio com explicação e ação primária.
- Toast: permanece tempo suficiente (ou até ser fechado), pausa no hover/foco, não é o único lugar de uma informação crítica.
- Tempo limite de sessão: avise antes e permita estender (WCAG 2.2.1).

### Componentes interativos
- Modal: `<dialog>` nativo com `showModal()` (foco preso, Esc e `::backdrop` nativos) ou biblioteca acessível já usada no projeto (Radix, React Aria, Headless UI, shadcn/ui). Título ligado por `aria-labelledby`.
- Menu, combobox, tabs, accordion, datepicker: use a biblioteca acessível do projeto; não recrie do zero. Se precisar criar, siga o padrão do WAI-ARIA Authoring Practices ([references/componentes-acessiveis.md](references/componentes-acessiveis.md)).
- Disclosure simples: `<button aria-expanded aria-controls>` ou `<details>/<summary>`.
- Alvos de toque/clique com no mínimo 24x24 px CSS (WCAG 2.5.8); no PDV em tablet, prefira 44x44 px.
- Arrastar (reordenar) tem alternativa por clique/teclado (WCAG 2.5.7).

### Visual
- Tokens de cor já validados para contraste nos temas claro e escuro. Cor nova: verifique a razão de contraste.
- Texto em `rem`; nada de altura fixa em container de texto que corte conteúdo com zoom.
- Não use texto dentro de imagem para informação.
- `@media (prefers-reduced-motion: reduce)` desliga animações não essenciais (Tailwind: `motion-reduce:`). Nada pisca mais de 3 vezes por segundo.
- Ícones de status acompanhados de texto ou `aria-label`.

### UX de produto
- Linguagem do usuário (lojista), não do sistema: "Estoque insuficiente para Camisa P (restam 2)" em vez de "Erro 422".
- Formatação brasileira: moeda `R$ 1.234,56` via `Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })`, datas `dd/mm/aaaa`, fuso do usuário.
- Ação destrutiva: diálogo de confirmação dizendo o que será perdido, botão com verbo específico ("Excluir produto"), foco inicial no botão seguro; ou desfazer por alguns segundos.
- Consistência: mesma ação, mesmo nome e mesmo lugar em todas as telas.
- Responsivo mobile-first; tabelas largas viram cards ou ganham rolagem horizontal contida com cabeçalho legível.

## Checklist de revisão

| # | Verificação | Severidade padrão |
|---|---|---|
| 1 | Critério de aceite de acessibilidade/UX (ex.: "operável por teclado", "mensagem de erro X") não atendido | urgente |
| 2 | Ação essencial do fluxo (finalizar venda, salvar, login) inalcançável ou inoperável por teclado | urgente |
| 3 | `div`/`span` com `onClick` como botão ou link, sem `role`, `tabIndex` e tratamento de teclado | alto |
| 4 | Campo de formulário sem rótulo programático (só placeholder ou texto solto) | alto |
| 5 | `outline: none`/`focus:outline-none` sem estilo de foco substituto | alto |
| 6 | Modal sem foco preso, sem fechar com Esc ou sem devolver foco ao gatilho | alto |
| 7 | Botão só com ícone sem nome acessível | alto |
| 8 | Erro de formulário sem texto (só cor) ou sem associação ao campo (`aria-describedby`) | alto |
| 9 | Ação destrutiva sem confirmação nem desfazer | alto |
| 10 | Texto com contraste abaixo de 4,5:1 (ou 3:1 para texto grande) usando cor nova fora dos tokens | alto |
| 11 | Status ou informação transmitido apenas por cor | medio |
| 12 | Imagem informativa sem `alt` ou decorativa com `alt` redundante | medio |
| 13 | Mensagem assíncrona (sucesso/erro/toast) sem `role="status"`/`role="alert"`/`aria-live` | medio |
| 14 | ARIA incorreto ou incompleto (`role` sem comportamento, `aria-expanded` fixo, `aria-label` em elemento não interativo genérico) | medio |
| 15 | Layout quebra ou exige rolagem horizontal em 320px ou com zoom de 200% | medio |
| 16 | Animação sem tratamento de `prefers-reduced-motion` | medio |
| 17 | Hierarquia de headings quebrada, `h1` ausente ou múltiplos `main` | medio |
| 18 | Tabela de dados construída com `div` ou sem `th` | medio |
| 19 | Alvo de toque menor que 24x24 px sem espaçamento compensatório | medio |
| 20 | Mensagem de erro técnica (código, stack, "Erro 500") exibida ao usuário | medio |
| 21 | Moeda, data ou número sem formatação pt-BR | medio |
| 22 | `tabindex` positivo ou ordem de foco diferente da visual | medio |
| 23 | Campo sem `type`/`inputMode`/`autoComplete` adequados | baixo |
| 24 | `<title>` da página genérico ou ausente | baixo |
| 25 | Estado vazio sem explicação ou ação | baixo |
| 26 | Texto de link/botão genérico ("clique aqui", "ok") | baixo |

## Anti-padrões (errado → certo)

### Div clicável

```tsx
// errado
<div className="btn" onClick={finalizarVenda}>Finalizar</div>

// certo
<button type="button" onClick={finalizarVenda}>Finalizar venda</button>
```

### Placeholder como rótulo e erro só com cor

```tsx
// errado
<input placeholder="CPF" className={erro ? 'border-red-500' : ''} />

// certo
<label htmlFor="cpf">CPF</label>
<p id="cpf-dica">Somente números</p>
<input id="cpf" inputMode="numeric" autoComplete="off"
  aria-invalid={!!erro} aria-describedby={erro ? 'cpf-dica cpf-erro' : 'cpf-dica'} />
{erro && <p id="cpf-erro">{erro}</p>}
```

### Botão de ícone sem nome

```tsx
// errado
<button onClick={() => remover(item.id)}><TrashIcon /></button>

// certo
<button type="button" onClick={() => remover(item.id)} aria-label={`Remover ${item.nome}`}>
  <TrashIcon aria-hidden="true" />
</button>
```

### Foco removido

```css
/* errado */
button:focus { outline: none; }

/* certo */
button:focus-visible { outline: 2px solid var(--cor-foco); outline-offset: 2px; }
```

### Feedback silencioso

```tsx
// errado: só um toast visual que some
toast('Venda registrada');

// certo: região de status presente desde o início
<p role="status" className="sr-only">{mensagemStatus}</p>
// ao concluir: setMensagemStatus('Venda 1234 registrada. Total R$ 189,90.');
```

### Animação sem respeitar preferência

```css
/* certo */
.drawer { transition: transform 200ms ease-out; }
@media (prefers-reduced-motion: reduce) {
  .drawer { transition: none; }
}
```

## Referências

- [references/wcag-22-aa-checklist.md](references/wcag-22-aa-checklist.md): leia quando precisar do critério WCAG exato para justificar um finding, validar contraste ou planejar testes automatizados com axe.
- [references/componentes-acessiveis.md](references/componentes-acessiveis.md): leia quando construir ou revisar modal, menu, combobox/autocomplete, tabs, accordion, tabela, toast ou componente do PDV.
- [references/formularios-e-ux.md](references/formularios-e-ux.md): leia quando criar formulários, mensagens de erro, estados vazios, confirmações, textos de interface ou fluxos do lojista.

Skills vizinhas: `frontend-engenharia` (estado, dados, Zod), `frontend-performance` (CLS, INP), `testes-qualidade` (E2E e testes de acessibilidade no CI).
