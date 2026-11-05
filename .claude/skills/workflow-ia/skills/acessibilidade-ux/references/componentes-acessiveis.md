# Componentes acessíveis: padrões de teclado e ARIA

Primeira opção: use a biblioteca acessível que o projeto já tem (Radix UI, shadcn/ui, React Aria, Headless UI). Elas implementam os padrões do WAI-ARIA Authoring Practices Guide (APG). Construir do zero só com motivo registrado, seguindo a tabela de cada padrão abaixo.

## 1. Botão, link e toggle

- Ação = `<button type="button">`; envio = `<button type="submit">`; navegação = `<a href>` (ou `<Link>`).
- Toggle: `<button aria-pressed={ativo}>` quando o rótulo não muda ("Negrito"); se o rótulo muda ("Mostrar senha" / "Ocultar senha"), não use `aria-pressed`.
- Switch: `<button role="switch" aria-checked={ligado}>` ou `<input type="checkbox" role="switch">`.
- Desabilitado: `disabled` remove do foco. Se o usuário precisa descobrir por que está desabilitado, use `aria-disabled="true"`, mantenha focável e explique.

## 2. Modal (dialog)

Teclado: Tab/Shift+Tab circulam dentro; Esc fecha; foco inicial no primeiro elemento útil (ou no botão seguro em confirmação destrutiva); ao fechar, foco volta ao gatilho.

Com `<dialog>` nativo:

```tsx
'use client';
import { useEffect, useRef } from 'react';

export function ConfirmarExclusao({ aberto, nome, onConfirmar, onFechar }: {
  aberto: boolean; nome: string; onConfirmar: () => void; onFechar: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (aberto && !d.open) d.showModal();
    if (!aberto && d.open) d.close();
  }, [aberto]);

  return (
    <dialog ref={ref} aria-labelledby="titulo-excluir" aria-describedby="desc-excluir" onClose={onFechar}>
      <h2 id="titulo-excluir">Excluir produto</h2>
      <p id="desc-excluir">"{nome}" será removido do catálogo. Vendas antigas não são afetadas.</p>
      <button type="button" autoFocus onClick={onFechar}>Cancelar</button>
      <button type="button" onClick={onConfirmar}>Excluir produto</button>
    </dialog>
  );
}
```

- `showModal()` torna o resto da página inerte, trata Esc (dispara `close`) e desenha `::backdrop`. Devolver o foco ao gatilho é feito pelo navegador na maioria dos casos; confirme e, se preciso, foque o gatilho manualmente no `onClose`.
- Não use `open` como atributo para modal (vira não modal).
- Drawer/sheet lateral segue o mesmo padrão.

## 3. Menu de ações (menu button)

| Tecla | Comportamento |
|---|---|
| Enter/Espaço/Seta para baixo no botão | abre e foca o primeiro item |
| Setas | movem entre itens |
| Home/End | primeiro/último |
| Esc | fecha e volta foco ao botão |
| Tab | fecha e segue o fluxo |

ARIA: botão com `aria-haspopup="menu"` e `aria-expanded`; lista `role="menu"`; itens `role="menuitem"` com foco móvel (roving tabindex). Para simples lista de links de navegação, não use `role="menu"`: use `<nav>` com `<ul>` e `<a>`.

## 4. Combobox / autocomplete (busca de produto, cliente)

- Input com `role="combobox"`, `aria-expanded`, `aria-controls` apontando para a lista, `aria-autocomplete="list"`, `aria-activedescendant` com o id da opção destacada.
- Lista `role="listbox"` com opções `role="option"` e `aria-selected`.
- Setas navegam, Enter seleciona, Esc fecha/limpa.
- Anuncie quantidade de resultados em `role="status"` ("12 produtos encontrados").
- PDV: leitor de código de barras funciona como teclado que digita e envia Enter. O campo de busca deve aceitar o código completo + Enter e adicionar o item sem abrir a lista; mantenha o foco no campo após adicionar para o próximo bipe.

## 5. Tabs

- Container `role="tablist"` com `aria-label`; abas `role="tab"` com `aria-selected` e `aria-controls`; painéis `role="tabpanel"` com `aria-labelledby`.
- Setas esquerda/direita movem entre abas; só a aba ativa tem `tabIndex=0`.
- Se as abas mudam a URL (filtro de relatório), considere links de navegação em vez de tabs.

## 6. Accordion e disclosure

```tsx
<h3>
  <button type="button" aria-expanded={aberto} aria-controls="sec-pagamento" onClick={() => setAberto(!aberto)}>
    Formas de pagamento
  </button>
</h3>
<div id="sec-pagamento" hidden={!aberto}>...</div>
```

`<details>/<summary>` resolve casos simples sem JS.

## 7. Tabelas de dados

- `<table>` com `<caption>` (pode ser visualmente oculta), `<thead>` com `<th scope="col">`, primeira coluna identificadora com `<th scope="row">`.
- Ordenação: botão dentro do `<th>` e `aria-sort="ascending|descending"` no `<th>` ativo.
- Ações por linha com nome contextual (`aria-label="Editar Camisa Polo P"`).
- Paginação em `<nav aria-label="Paginação">` com página atual marcada por `aria-current="page"`.
- Mobile: rolagem horizontal em container com `tabIndex={0}`, `role="region"` e `aria-label` para que teclado consiga rolar; ou layout de cards.

## 8. Toasts e notificações

- Região `role="status"` (ou `aria-live="polite"`) montada no layout e reaproveitada; erro crítico em `role="alert"`.
- Não roube o foco para o toast. Se houver ação ("Desfazer"), ofereça atalho alternativo ou mantenha o toast até interação.
- Duração mínima de ~5s, pausa no hover/foco, botão de fechar com nome.

## 9. Ícones, imagens e gráficos

- Ícone decorativo ao lado de texto: `aria-hidden="true"`.
- Ícone sozinho funcional: nome no botão pai.
- Foto de produto: `alt` com nome e variação relevante ("Camisa polo azul-marinho, manga curta"). Em lista onde o nome já aparece ao lado, `alt=""` evita repetição.
- Gráfico: título, resumo em texto do insight principal ("Vendas cresceram 12% na semana") e tabela de dados alternativa acessível.

## 10. Texto só para leitor de tela

```css
.sr-only {
  position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
  overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0;
}
```

Tailwind já tem `sr-only`. Não use `display: none` nem `visibility: hidden` para esse fim: escondem também do leitor de tela.

## 11. Erros comuns de ARIA

- `aria-label` em `<div>` sem role: geralmente ignorado.
- `role="button"` em `<a href>`: confunde; escolha um elemento.
- `aria-hidden="true"` em elemento focável: foco vai para algo invisível ao leitor de tela.
- `aria-live` adicionado junto com o conteúdo: não anuncia; a região precisa existir antes.
- IDs duplicados em `aria-describedby`/`aria-labelledby` quando o componente é renderizado várias vezes: gere com `useId()`.
