# Fontes das seções de prova da landing (#87)

Código: `apps/web/src/features/landing/secoes/conteudo-de-prova.ts`. Cada número da seção "Dados de mercado" vem de uma das fontes abaixo, lida em 19/10/2026 e reconferida em 20/10/2026 (#91, gráficos). As contas dos gráficos estão em `apps/web/src/features/landing/custo-do-aplicativo.ts`. Se uma fonte mudar, atualize os arquivos e esta lista.

| # | Número usado | Fonte | Link | Data |
|---|---|---|---|---|
| 1 | Comissão de 12% (Básico) a 23% (Entrega); 3,2% de taxa de pagamento online; mensalidade de R$ 110 a R$ 150 acima de R$ 1.800/mês | iFood — Portal do Parceiro | https://parceiros.ifood.com.br/restaurante | consultado em 20/10/2026 (a página não traz data de vigência) |
| 2 | Faturamento do delivery por canal: marketplaces 54%, WhatsApp 26%, app/site próprio 12%, telefone 8% (gráfico de rosca) | Mercado&Consumo, pesquisa Abrasel (2.176 donos) | https://mercadoeconsumo.com.br/16/03/2025/foodservice/whatsapp-representa-26-do-faturamento-com-delivery-em-bares-e-restaurantes/ | 16/03/2025 |
| 3 | 79% das transações online no celular (quadriculado; a matéria não diz de onde vem esse número); e-commerce acima de R$ 258 bi em 2026 (projeção ABComm) | Times Brasil (CNBC) | https://timesbrasil.com.br/empresas-e-negocios/tecnologia-e-inovacao/e-commerce-no-brasil-passa-de-r-200-bilhoes-e-vira-mainstream-com-ia-whatsapp-e-mobile/ | 26/02/2026 |
| 4 | Nuvemshop plano Essencial: R$ 69/mês no pagamento mensal; com Nuvem Pago, 0% de comissão e 4,19% de processamento por venda ("varia por meio de pagamento e parcelas") | Nuvemshop — planos e preços | https://www.nuvemshop.com.br/planos-e-precos | consultado em 20/10/2026 |

## Contas dos gráficos (#91)

- **De cada R$ 100:** SimpleClick R$ 100,00; loja virtual (Nuvemshop Essencial) R$ 95,81 (4,19%); iFood Básico R$ 84,80 (12% + 3,2%); iFood Entrega R$ 73,80 (23% + 3,2%). Mensalidade à parte, escrita ao lado.
- **Faça a conta:** faturamento = pedidos × ticket médio; custo no mês = taxa por pedido × faturamento + mensalidade (no iFood, só acima de R$ 1.800/mês). Supõe todos os pedidos pagos pela plataforma.
- **Série histórica do e-commerce (ABComm): NÃO entrou.** O site da ABComm (abcomm.org) hoje redireciona para abiacom.org, e lá não há a série anual; os números de 2021 a 2025 só aparecem em matérias de terceiros, com valores conflitantes entre si (ex.: R$ 204,3 bi aparece como projeção de 2025 e como resultado de 2024). Sem fonte oficial aberta, sem gráfico.

## Ressalvas

- Os valores do iFood variam por plano, região e promoção; a seção diz isso.
- "0% no SimpleClick" vale para o SimpleClick. Banco ou maquininha do lojista podem cobrar tarifa de recebimento; a seção diz isso.
- Dados de terceiros que o `conteudo.ts` antigo usa (58% Abrasel, Fenacon) não foram reutilizados aqui.

## O que NÃO foi usado, e por quê

- **Rappi e Uber Eats:** não achei tabela pública oficial de comissão no Brasil; só relatos de fórum e guias sem data. Sem fonte, sem número.
- **Tarifa de Pix e maquininha:** o Banco Central não fixa valor para empresas (cada banco decide) e as fontes encontradas eram blogs. Entrou só como ressalva, sem número.
- **Sebrae/IBGE:** não encontrei dado de custo de abertura de loja online que eu pudesse abrir e confirmar.
- **Valores do MEI (DAS 2026):** só achei em sites de contabilidade, não no gov.br.
