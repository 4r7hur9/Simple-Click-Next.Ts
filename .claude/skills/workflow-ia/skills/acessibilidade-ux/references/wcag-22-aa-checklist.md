# WCAG 2.2 nível AA: critérios que mais aparecem em diffs de front-end

Use o número do critério no finding para dar rastreabilidade (ex.: "viola WCAG 1.4.3 Contraste mínimo").

## 1. Critérios por tema

### Perceptível
| Critério | Nível | O que verificar no código |
|---|---|---|
| 1.1.1 Conteúdo não textual | A | `alt` em `<img>`/`<Image>`; `aria-hidden="true"` em ícone decorativo; ícone funcional com nome |
| 1.3.1 Informações e relações | A | headings reais, `<label>`, `<fieldset>/<legend>`, `<table>` com `<th>`, listas com `<ul>/<ol>` |
| 1.3.2 Sequência com significado | A | ordem do DOM = ordem de leitura; CSS não reordena conteúdo com significado |
| 1.3.5 Identificar propósito do campo | AA | `autoComplete` em campos de dados pessoais |
| 1.4.1 Uso de cor | A | status, erro e links não dependem só de cor |
| 1.4.3 Contraste mínimo | AA | 4,5:1 texto normal; 3:1 texto grande (>= 24px, ou >= 18,66px negrito) |
| 1.4.4 Redimensionar texto | AA | zoom 200% sem perda; unidades relativas |
| 1.4.10 Reflow | AA | 320px de largura sem rolagem horizontal (exceto tabelas/mapas) |
| 1.4.11 Contraste não textual | AA | 3:1 para bordas de input, ícones, foco, estados de componente |
| 1.4.12 Espaçamento de texto | AA | sem altura fixa que corte texto quando o espaçamento aumenta |
| 1.4.13 Conteúdo em hover/foco | AA | tooltip dispensável (Esc), persistente e sobre o qual se pode passar o mouse |

### Operável
| Critério | Nível | O que verificar |
|---|---|---|
| 2.1.1 Teclado | A | toda função operável por teclado |
| 2.1.2 Sem armadilha de teclado | A | foco sempre consegue sair (exceto modal, que sai com Esc/fechar) |
| 2.1.4 Atalhos de caractere | A | atalho de letra única pode ser desligado/remapeado ou só age com foco no componente |
| 2.2.1 Tempo ajustável | A | aviso antes de expirar sessão, com opção de estender |
| 2.2.2 Pausar, parar, ocultar | A | carrossel automático e animação > 5s podem ser pausados |
| 2.3.1 Três flashes | A | nada pisca mais de 3 vezes por segundo |
| 2.4.1 Ignorar blocos | A | skip link ou landmarks |
| 2.4.2 Página com título | A | `<title>` descritivo |
| 2.4.3 Ordem do foco | A | sem `tabindex` positivo; foco segue a ordem lógica |
| 2.4.4 Finalidade do link | A | texto do link faz sentido (ou com contexto próximo) |
| 2.4.6 Cabeçalhos e rótulos | AA | headings e labels descritivos |
| 2.4.7 Foco visível | AA | indicador de foco presente |
| 2.4.11 Foco não obscurecido (mínimo) | AA | elemento focado não fica totalmente coberto por header fixo, banner de cookies ou toast |
| 2.5.3 Rótulo no nome | A | nome acessível contém o texto visível (`aria-label` não contradiz o texto) |
| 2.5.7 Movimentos de arrastar | AA | alternativa por clique para arrastar e soltar |
| 2.5.8 Tamanho do alvo (mínimo) | AA | alvo >= 24x24 px CSS ou espaçamento equivalente |

### Compreensível
| Critério | Nível | O que verificar |
|---|---|---|
| 3.1.1 Idioma da página | A | `<html lang="pt-BR">` |
| 3.2.1 / 3.2.2 Em foco / Em entrada | A | focar ou alterar campo não submete nem navega sozinho |
| 3.2.6 Ajuda consistente | A | ajuda/contato no mesmo lugar entre páginas |
| 3.3.1 Identificação do erro | A | erro descrito em texto |
| 3.3.2 Rótulos ou instruções | A | label e instrução de formato |
| 3.3.3 Sugestão de erro | AA | mensagem diz como corrigir |
| 3.3.4 Prevenção de erros (legal, financeiro, dados) | AA | transação financeira reversível, verificada ou confirmada |
| 3.3.7 Entrada redundante | A | não pedir o mesmo dado duas vezes no fluxo |
| 3.3.8 Autenticação acessível (mínimo) | AA | permitir colar senha e gerenciador de senhas; sem teste cognitivo sem alternativa |

### Robusto
| Critério | Nível | O que verificar |
|---|---|---|
| 4.1.2 Nome, função, valor | A | componentes customizados expõem role, nome e estado (`aria-expanded`, `aria-selected`, `aria-checked`) |
| 4.1.3 Mensagens de status | AA | status anunciado sem mover foco (`role="status"`, `aria-live`) |

## 2. Mapeamento para severidade

- Bloqueia fluxo principal para teclado/leitor de tela (2.1.1, 2.1.2, 4.1.2 em ação essencial): alto, ou urgente se for critério de aceite.
- Rótulos, foco, contraste de texto, modais (1.3.1, 2.4.7, 1.4.3, 3.3.1): alto.
- Cor como único meio, status não anunciado, reflow, alvo pequeno (1.4.1, 4.1.3, 1.4.10, 2.5.8): médio.
- Título de página, texto de link genérico, autocomplete (2.4.2, 2.4.4, 1.3.5): baixo.

## 3. Contraste

Fórmula: razão = (L1 + 0,05) / (L2 + 0,05), com L = luminância relativa. Não calcule de cabeça: use ferramenta.
- DevTools do Chrome mostra a razão no seletor de cor de qualquer texto.
- Pares críticos para checar em todo tema: texto secundário/cinza sobre branco, texto sobre botão primário, placeholder, texto sobre fundo colorido de badge, borda de input sobre fundo, anel de foco.
- Texto desabilitado está isento de contraste, mas deve continuar legível o suficiente para entender o estado.

## 4. Testes automatizados

Automação pega cerca de um terço dos problemas. Ela é gate mínimo, não prova de acessibilidade.

### Playwright + axe (E2E)

```ts
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('[CA-4] tela de vendas sem violações WCAG A/AA detectáveis', async ({ page }) => {
  await page.goto('/vendas');
  const resultado = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(resultado.violations).toEqual([]);
});
```

### Teclado no Playwright

```ts
test('finaliza venda só com teclado', async ({ page }) => {
  await page.goto('/pdv');
  await page.getByRole('combobox', { name: 'Buscar produto' }).fill('7891234567890');
  await page.keyboard.press('Enter');
  await page.keyboard.press('F4');
  await expect(page.getByRole('dialog', { name: 'Pagamento' })).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Pagamento' }).getByRole('button', { name: 'Dinheiro' })).toBeFocused();
});
```

### Componentes (Vitest/Jest + Testing Library)
- Consultas por papel e nome (`getByRole('button', { name: /salvar/i })`, `getByLabelText('CPF')`) falham quando falta rótulo: são testes de acessibilidade de graça.
- `vitest-axe` ou `jest-axe` para rodar axe em componente renderizado.
- `userEvent.tab()` para verificar ordem de foco.

### Lint
- `eslint-plugin-jsx-a11y` (já incluso em `eslint-config-next` com regras básicas). Não desabilite regras no diff sem justificativa.

## 5. Verificação manual rápida (5 minutos por tela)

1. Navegue a tela inteira só com Tab, Shift+Tab, Enter, Espaço, Esc e setas.
2. Foco sempre visível? Ordem faz sentido? Consegue sair de todos os componentes?
3. Zoom 200% e largura de 320px (DevTools, modo responsivo).
4. Ative "Emular prefers-reduced-motion" no DevTools (Rendering).
5. Leitor de tela (NVDA no Windows, VoiceOver no macOS/iOS, TalkBack no Android): passe pelos headings e formulários e dispare um erro.
