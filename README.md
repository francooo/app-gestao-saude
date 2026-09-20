# Gestão Saúde

Aplicativo mobile de gestão de saúde materno-infantil.

- **Mobile** — Expo SDK 57 + expo-router (`apps/mobile`)
- **API** — funções serverless na Vercel (`apps/api`)
- **Banco** — Neon (Postgres serverless)

Primeira entrega: tela de login ponta a ponta.

---

## Pré-requisitos

- Node 20+ (testado com 24.15)
- pnpm (`npm i -g pnpm`)
- Vercel CLI (`npm i -g vercel`) — só para rodar a API localmente
- Um celular Android com o **Expo Go**, ou o Android Studio com um emulador

> **iOS:** o Expo Go da App Store está congelado no SDK 54 — SDK 55, 56 e 57
> nunca foram aprovados. Em Windows não há caminho local para iOS. Para testar
> em iPhone é preciso build na nuvem (EAS) + conta Apple Developer (US$ 99/ano).
> **O desenvolvimento do dia a dia acontece no Android.**

## Primeira execução

```bash
pnpm install

# 1. Configure os segredos da API
cp .env.example apps/api/.env.local     # e preencha DATABASE_URL e JWT_SECRET

# 2. Crie as tabelas no Neon
pnpm db:generate                        # gera o SQL a partir de src/db/schema.ts
pnpm db:migrate                         # aplica na conexão direta (sem -pooler)
pnpm db:seed                            # cria um usuário de teste

# 3. Suba a API
pnpm api:dev                            # vercel dev na porta 3000

# 4. Suba o app
echo "EXPO_PUBLIC_API_URL=https://<sua-url>" > apps/mobile/.env
pnpm mobile
```

## Como o app encontra a API

O Expo Go num celular físico **não enxerga o `localhost` da sua máquina**.
Opções, da melhor para a pior:

| Opção | `EXPO_PUBLIC_API_URL` | Observação |
|---|---|---|
| **Túnel HTTPS** (recomendado) | a URL do `cloudflared tunnel --url http://localhost:3000` | Mesmo transporte da produção; funciona no 4G; sem firewall |
| Preview da Vercel | `https://<projeto>-<hash>.vercel.app` | Zero backend local, mas o ciclo é de ~40s |
| IP da LAN | `http://192.168.x.x:3000` | Exige mesma Wi-Fi, regra de firewall no Windows, e HTTP em claro (bloqueado fora do Expo Go) |

`npx expo start --tunnel` cria um túnel apenas para o **bundler**, não para a API.

## Regras de variáveis de ambiente

- Tudo com prefixo **`EXPO_PUBLIC_`** é **embutido no bundle do app** e fica
  visível para quem baixar o APK. Nunca coloque segredo ali.
- `DATABASE_URL`, `DATABASE_URL_UNPOOLED`, `JWT_SECRET` e `RESEND_API_KEY` vivem
  só em `apps/api/.env.local` (ignorado pelo git) e nas Environment Variables
  da Vercel.
- Use um `JWT_SECRET` **diferente** em desenvolvimento, preview e produção.

## Deploy da API

Na Vercel, criando o projeto a partir deste repositório:

- **Root Directory:** `apps/api`
- **Framework Preset:** Other
- **Build Command:** vazio

As funções são descobertas em `apps/api/api/**/*.ts`. O `apps/api` é
**autocontido** de propósito: não depende de `packages/shared` nem de aliases
de caminho, para o build não precisar de configuração especial de monorepo.

Por isso, `apps/api/src/contracts.ts` é uma **cópia deliberada** de
`packages/shared/src/auth.ts`. Ao mudar um schema, mude nos dois lugares.

## Estrutura

```
packages/shared/     tema (cores extraídas dos assets) + contratos zod
apps/mobile/
  app/               rotas do expo-router
    (auth)/login.tsx           a tela de login
    (auth)/esqueci-senha.tsx
    (app)/inicio.tsx           placeholder pós-login
  src/
    api/client.ts    fetch com refresh automático e single-flight
    auth/            AuthContext + SecureStore
    components/      GlassCard, PillInput, PrimaryButton, IllustrationRegion
apps/api/
  api/               as funções serverless
  src/db/schema.ts   Drizzle — fonte da verdade das migrations
  src/auth/session.ts  emissão e rotação de tokens
assets-source/       os PNGs originais do design (referência, fora do bundle)
```

## Autenticação

- Access token JWT HS256, **15 minutos**.
- Refresh token opaco de 256 bits, **60 dias**, guardado no banco só como
  SHA-256, com **rotação a cada uso** e **detecção de reuso**: apresentar um
  token já rotacionado revoga a sessão inteira.
- No aparelho, ambos ficam no `expo-secure-store` (Keychain / Keystore).
- Hash de senha: `scrypt` do `node:crypto` (N=2^16, r=8, p=1). Sem binário
  nativo, portanto sem risco de empacotamento na Vercel.
- E-mail inexistente e senha errada retornam a **mesma** resposta e gastam o
  **mesmo tempo** — sem isso, a diferença de latência revelaria quais contas
  existem.

## Pendências conhecidas

- **Região do banco.** O Neon está em `us-east-2` (Ohio). Dado de saúde é dado
  pessoal sensível (LGPD Art. 11) e isso configura transferência internacional
  (Arts. 33–36). O Neon tem `sa-east-1` (São Paulo) — migre antes de ter
  usuários reais. O `vercel.json` já fixa as funções em `gru1`.
- **Não há auto-cadastro.** Contas só existem via `db:seed`. Defina se haverá
  cadastro no app ou provisionamento por um painel administrativo.
- **Consentimento LGPD.** A tabela `consents` existe, mas a tela de
  consentimento no primeiro acesso ainda não.
- **Fonte.** O título usa Nunito, inferida das formas das letras do mockup.
  Confirme com quem produziu a arte.
