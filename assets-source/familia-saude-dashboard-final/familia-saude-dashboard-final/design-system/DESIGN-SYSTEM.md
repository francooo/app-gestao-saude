# Design System — Família Saúde Dashboard Web

## 1. Visão do produto

O dashboard web é uma área administrativa para acompanhar o crescimento e o uso do aplicativo Família Saúde. Seu foco é permitir que a equipe acompanhe usuários, assinaturas, medicamentos cadastrados, médicos vinculados e relatórios consolidados.

A tela de Notificações não faz parte do escopo atual do dashboard. Notificações operacionais continuam sendo uma experiência prioritariamente do aplicativo do usuário.

## 2. Direção visual

A interface combina acolhimento e controle administrativo. O visual deve transmitir confiança, cuidado e organização, sem parecer um sistema hospitalar frio. A referência vem do aplicativo mobile: verde-sálvia, verde-musgo, creme, caramelo e ilustrações botânicas suaves.

Princípios:

- Clareza antes de decoração;
- Cartões com informação agrupada;
- Filtros sempre próximos das tabelas;
- Indicadores importantes em cartões de KPI;
- Status representados por cor e texto;
- Espaçamento generoso para leitura em desktop;
- Linguagem simples em português brasileiro;
- Ações primárias com caramelo;
- Estado selecionado com verde-musgo.

## 3. Paleta de cores

| Token | Uso | Valor sugerido |
|---|---|---|
| `sage-50` | Fundo principal | `#EEF3E9` |
| `sage-100` | Fundo secundário e áreas suaves | `#DDE8D8` |
| `sage-300` | Bordas e gráficos suaves | `#B7C9AD` |
| `moss-700` | Texto principal e navegação ativa | `#3F5A45` |
| `moss-800` | Títulos e contraste | `#304637` |
| `cream-50` | Superfícies e cartões | `#FFFDF7` |
| `cream-100` | Campos e áreas internas | `#F8F3E8` |
| `caramel-500` | Ações primárias e destaques | `#C9854B` |
| `caramel-600` | Hover e ação pressionada | `#A96839` |
| `mustard-400` | Apoio visual e alertas leves | `#D6B45A` |
| `success` | Status ativo/estável | `#5D9B72` |
| `warning` | Estoque baixo ou atenção | `#C9854B` |
| `error` | Erros críticos | `#B95B54` |
| `ink` | Texto principal | `#27352B` |
| `muted` | Texto secundário | `#718074` |

## 4. Tipografia

A tipografia deve ser arredondada, acolhedora e altamente legível. Usar uma sans-serif contemporânea com pesos 400, 500, 600 e 700.

- Display: 32–40 px, peso 700;
- Título de página: 28–32 px, peso 700;
- Título de cartão: 18–20 px, peso 600;
- Texto padrão: 14–16 px, peso 400;
- Label de campo: 12–14 px, peso 600;
- KPI: 28–36 px, peso 700;
- Texto auxiliar: 12–13 px, peso 400.

Evitar caixa alta em parágrafos longos. Usar sentence case nos títulos e labels.

## 5. Layout desktop

- Artboard de referência: `2560 × 1440 px`;
- Proporção: `16:9`;
- Sidebar fixa: aproximadamente 250–280 px;
- Conteúdo com padding lateral de 48–72 px;
- Grid principal de 12 colunas;
- Gap entre cartões: 20–28 px;
- Raio de cartão: 18–24 px;
- Raio de botão e campo: 12–16 px;
- Sombra baixa, difusa e discreta;
- Fundo com textura botânica muito sutil, sem prejudicar contraste.

## 6. Navegação lateral

Itens finais do dashboard:

1. Visão geral
2. Usuários
3. Assinaturas
4. Medicamentos
5. Médicos
6. Relatórios
7. Configurações

A navegação ativa usa fundo verde-sálvia mais escuro, texto verde-musgo e um indicador lateral ou ícone em caramelo. Não incluir Notificações nesta versão do dashboard.

## 7. Componentes

### 7.1 KPI Card

Usado para totalizadores e métricas rápidas. Deve conter label, valor principal, variação opcional e ícone discreto.

Exemplos:

- Usuários ativos;
- Assinantes;
- Medicamentos cadastrados;
- Médicos cadastrados;
- Taxa de renovação;
- Tempo médio no aplicativo.

### 7.2 Filter Bar

Combina campo de busca, selects e botão de ação. Deve ficar acima das tabelas. Campos usam fundo creme-100, borda sage-300 e ícone de busca.

### 7.3 Data Table

Cabeçalho com contraste suave, linhas com altura confortável, alinhamento consistente e status em pills. Usar paginação e ações compactas no final da linha.

### 7.4 Status Pill

- Ativo/Estável: fundo verde claro e texto verde-musgo;
- Em avaliação/Pendente: fundo amarelo claro e texto caramelo;
- Inativo: fundo cinza-sálvia e texto muted;
- Estoque baixo/Validade próxima: fundo caramelo claro e texto caramelo escuro.

### 7.5 Chart Card

Gráficos devem ser simples, com linhas ou barras arredondadas, poucos rótulos e legenda visível. Usar verde-musgo para série principal, caramelo para série comparativa e sage-300 para grade.

### 7.6 Primary Button

Fundo caramelo, texto creme, raio 12–16 px, peso 600. Usar para Entrar, Gerar relatório, Exportar, Adicionar e Salvar.

### 7.7 Secondary Button

Fundo transparente ou creme, borda sage-300, texto moss-700. Usar para filtros, cancelar e ações secundárias.

## 8. Ícones

Usar ícones lineares, arredondados e com espessura consistente. Os ícones devem ser reconhecíveis sem depender apenas da cor.

Inventário conceitual:

- Marca Família Saúde;
- Visão geral: grid/dashboard;
- Usuários: pessoas;
- Assinaturas: cartão ou documento;
- Medicamentos: cápsula ou frasco;
- Médicos: estetoscópio ou cruz médica;
- Relatórios: gráfico ou documento;
- Configurações: engrenagem;
- Busca: lupa;
- Exportação: seta para baixo/documento;
- Filtros: funil;
- Perfil: avatar;
- Status: check, alerta e pausa;
- Ações: editar, visualizar, excluir e mais opções.

Não misturar estilos preenchido e outline na mesma área sem motivo.

## 9. Dados e linguagem

- Usar português brasileiro;
- Datas no formato `12 nov 2026`;
- Valores monetários no formato `R$ 42.300`;
- Percentuais com vírgula decimal, por exemplo `87,4%`;
- Evitar abreviações técnicas desnecessárias;
- Usar estados vazios com orientação prática;
- Confirmar ações destrutivas em modal;
- Não apresentar números fictícios como dados reais em produção.

## 10. Acessibilidade

- Contraste mínimo adequado entre texto e fundo;
- Status com texto e cor;
- Alvos clicáveis com pelo menos 40 px;
- Foco visível em campos e botões;
- Labels persistentes nos formulários;
- Tabelas com cabeçalhos semânticos;
- Ícones com tooltip quando não houver texto;
- Mensagens de erro próximas ao campo afetado.

## 11. Responsividade futura

Embora as telas entregues sejam desktop, o sistema deve poder se adaptar para larguras menores. Em tablet, a sidebar pode colapsar. Em telas menores, cartões KPI devem quebrar em duas colunas e tabelas devem usar scroll horizontal ou uma visualização de cards.
