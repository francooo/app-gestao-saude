# Família Saúde — versão web

A versão para navegador do aplicativo, para o usuário final. Mesma conta, mesma API e mesmo banco do app mobile (`apps/mobile`); o que muda é o layout, adaptado a tablet e desktop.

Não confundir com `apps/admin` (painel interno) nem com `apps/site` (página de vendas).

## Como roda

```
navegador  ──►  apps/web (Vite + React)  ──►  /api/*  (BFF: api/rotas.ts)  ──►  apps/api
```

- **Front:** Vite, React, react-router, react-query e CSS Modules. As rotas espelham as do aplicativo (`/inicio`, `/remedios`, `/medicos`…).
- **BFF** (`server/rotas.ts`, uma função só na Vercel): repassa as chamadas à API do aplicativo. Existe porque a API não tem CORS e porque o refresh token não pode ficar ao alcance do JavaScript da página — o BFF o guarda num cookie `HttpOnly` restrito a `/api/auth`. O access token (15 min) fica só em memória.
- **Regras e contratos:** vêm de `packages/shared` (`@gestao/shared/api/*` e `@gestao/shared/lib/*`), os mesmos módulos do aplicativo.
- **Design:** `src/estilos/tokens.css` é gerado de `packages/shared/src/theme.ts`. Depois de mudar o tema, rode `pnpm --filter @gestao/web tokens`.
- **Pele da web:** `src/estilos/tema-web.css` vem depois dos tokens e remapeia as cores para o layout web "Família Saúde" (sálvia, musgo, creme, caramelo), seguindo as telas de referência de `familia-saude-web-completo.zip`. O tema do aplicativo não muda. As ilustrações `inicio-mae-bebe.jpg`, `receita-por-foto.jpg` e `assistente-medica.png` são recortes dessas telas; o logo (`src/ui/Logo.tsx`) é o conceito do pacote redesenhado em SVG — troque pelos arquivos oficiais quando existirem.

## Desenvolvimento

```bash
cp apps/web/.env.example apps/web/.env.local   # aponte API_URL para a API
pnpm --filter @gestao/web dev                  # http://localhost:5190
```

O `pnpm dev` sobe o site e o BFF juntos. A API é outra: `pnpm api:dev` (porta 3000) ou um preview da Vercel.

A versão do React é a mesma do aplicativo, de propósito: com `node-linker=hoisted`, versões diferentes deixam duas cópias no workspace e os hooks quebram.

## Deploy (Vercel)

Projeto próprio, separado da API, do painel e do site.

| Configuração | Valor |
|---|---|
| Root Directory | `apps/web` |
| Framework | Vite |
| Variável `API_URL` | endereço da API em produção (só servidor) |
| Variável `VITE_MAPTILER_KEY` | chave pública do mapa, restrita ao domínio |

"Include files outside the Root Directory" precisa estar ligado: o build lê `packages/shared`.

## Pendência conhecida: IP atrás do BFF

O limite de tentativas de login da API conta falhas **por IP** (`apps/api/src/lib/rateLimit.ts`, 20 falhas em 15 min), lendo `x-forwarded-for`. O BFF repassa o IP de quem chamou nesse cabeçalho, mas a Vercel pode reescrevê-lo com o IP da própria função. Se isso acontecer, todos os usuários da web dividem a mesma cota.

Conferir no primeiro preview: fazer um login errado pela web e olhar o `ip` gravado em `login_attempts`. Se for o da função, a correção é pequena e não cria função nova na API: ela passa a aceitar o IP real num cabeçalho próprio, autenticado por um segredo compartilhado entre os dois projetos.

## O que já existe

- **Entrada:** login, cadastro e esqueci a senha.
- **Início:** resumo do dia, filtro por membro da família e o atalho de ler receita por foto.
- **Remédios:** lista com marcação de dose, detalhe (fotos, receita, histórico), estoque, registro de compra, histórico completo, formulário (com "Descreva como tomar" por IA), leitura de receita ou caixinha por foto e revisão da receita em lote. A partir de 1280 px, lista e detalhe ficam lado a lado.

- **Médicos e consultas:** lista com filtro por pessoa e especialidade, ponto de referência (endereço ou posição do navegador) e distância, mapa dos consultórios com "Como chegar", cadastro e edição de médico e nova consulta. A partir de 1280 px, lista e mapa ficam lado a lado.

- **Assistente:** conversa com contexto da pessoa escolhida, ações rápidas, botão de emergência (192) e, sem assinatura, o histórico para reler.
- **Diário de sintomas:** os seis tipos, escala de 1 a 5, registro de hoje ou de ontem, gráfico dos últimos 7 dias e linha do tempo.
- **Avisos:** dose atrasada, consulta próxima, tratamento terminando, peso desatualizado, política e fim do teste — calculados no navegador (`src/lib/avisos.tsx`), com o ponto de "há novidades" no sino.
- **Ajustes e conta:** dados pessoais, e-mail e senha, família (lista, cadastro e remoção de membro), assinatura, privacidade (consentimento, resumo da política e apagar a conta), lembretes por WhatsApp e acompanhantes.

## O que a web faz diferente do aplicativo

- **Nome e marca:** o site se chama "Família Saúde", com o logo novo; o aplicativo continua "Gestão Saúde".
- **Lembrar de mim:** no login. Marcado, a sessão dura 60 dias; desmarcado, o cookie some ao fechar o navegador. Quem decide é o BFF (`gs_lembrar`); a API não muda.
- **Remédios:** a lista ocupa a tela inteira (com busca e filtro "Em uso / Hoje / Todos") e o detalhe tem tela própria; o layout de lista e detalhe lado a lado saiu.
- **Foto identificada pela IA:** a legenda aparece quando o remédio nasceu da leitura da foto da caixa. Depende do campo `photoReadKind` no detalhe do remédio, que só a API atualizada devolve; sem ele, a legenda simplesmente não aparece.
- **Ajustes:** saem os interruptores de notificação do aparelho e o cartão de versão; no lugar, uma nota dizendo que os lembretes tocam no celular.
- **Avisos lidos:** ficam no `localStorage` do navegador, separados por conta. Não há nada de saúde ali — só ids e um horário. "Marcar todas como lidas" inclui o aviso da política (no aplicativo ele fica de fora).
- **Diário de sintomas:** cada registro tem um botão de lixeira; no aplicativo, tocar na linha é o que oferece apagar. O horário é o campo de hora do navegador.
- **Assinatura:** a compra é pela Google Play, no aplicativo. A tela da web mostra o plano e o "Já assinei", sem botão de compra.
- **Política de privacidade:** o link "Ler a política completa" vai a `/api/privacidade`, e o BFF redireciona para a página pública da API (o navegador não conhece `API_URL`).
- **Lembretes:** o navegador não agenda alarme. Onde o aplicativo tem o interruptor de lembretes, a web diz que os avisos tocam no celular.
- **Fotos:** não há a pergunta "câmera ou galeria". O seletor de arquivo do navegador já oferece as duas no celular, e no computador só existe arquivo.
- **Localização:** o site só pede a posição quando a pessoa clica em "Usar minha localização atual"; o aplicativo pede ao abrir a tela de Médicos.
- **Nova consulta:** dia e hora são os campos do próprio navegador, e não o calendário com horários de meia em meia hora. O lembrete escolhido é gravado na conta, mas quem agenda o aviso é o celular, quando o aplicativo for aberto.
- **Foto, receita lida e rascunhos** ficam só em memória, como no aplicativo. Recarregar a página no meio de uma leitura descarta a foto, e a tela volta para o começo.
