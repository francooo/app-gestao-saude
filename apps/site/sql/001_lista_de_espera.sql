-- =============================================================================
-- Pagina de vendas — lista de espera do lancamento
--
-- Rodar UMA vez no SQL Editor do Neon, na branch de producao, com o papel dono
-- (o padrao do editor, normalmente neondb_owner).
--
-- O que este script faz:
--   1. Cria o papel `site_escrita`, que a funcao da pagina usa para conectar.
--   2. Cria o schema `site` com a lista de espera e o registro de tentativas.
--   3. Da ao papel SO o necessario: inserir inscricoes e contar tentativas.
--
-- O que este script NAO faz: nao da ao papel nenhum acesso ao schema public.
-- A pagina nao enxerga uma linha sequer do que o app mobile guarda, e tambem
-- nao consegue LER a lista de espera (so inserir): vazar a lista exigiria
-- outra credencial.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Papel de conexao da pagina
-- -----------------------------------------------------------------------------
-- TROQUE a senha antes de rodar (32+ caracteres aleatorios). Ela vai na
-- DATABASE_URL do projeto Vercel da pagina, e em nenhum outro lugar.
CREATE ROLE site_escrita WITH LOGIN PASSWORD 'TROQUE_POR_UMA_SENHA_ALEATORIA_DE_32_CARACTERES';

ALTER ROLE site_escrita SET statement_timeout = '5s';
ALTER ROLE site_escrita SET idle_in_transaction_session_timeout = '10s';
ALTER ROLE site_escrita CONNECTION LIMIT 5;

-- Nada no schema do app.
REVOKE ALL ON SCHEMA public FROM site_escrita;

-- -----------------------------------------------------------------------------
-- 2. Schema da pagina
-- -----------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS citext;
CREATE SCHEMA IF NOT EXISTS site;
GRANT USAGE ON SCHEMA site TO site_escrita;

-- Quem pediu para ser avisado do lancamento. O consentimento e obrigatorio
-- (LGPD): sem ele a linha nao existe.
CREATE TABLE IF NOT EXISTS site.lista_de_espera (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email         citext NOT NULL UNIQUE,
  nome          text CHECK (char_length(nome) <= 120),
  consentiu_em  timestamptz NOT NULL,
  origem        text CHECK (char_length(origem) <= 120),   -- utm_source/utm_campaign
  criado_em     timestamptz NOT NULL DEFAULT now()
);

-- Tentativas de inscricao por IP (so o hash), para o limite contra robos.
-- Guarda o hash e a hora, nada mais; pode ser esvaziada a qualquer momento.
CREATE TABLE IF NOT EXISTS site.tentativas (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ip_hash    text NOT NULL,
  criado_em  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS tentativas_ip_idx ON site.tentativas (ip_hash, criado_em DESC);

-- -----------------------------------------------------------------------------
-- 3. Permissoes
-- -----------------------------------------------------------------------------
GRANT INSERT ON site.lista_de_espera TO site_escrita;
GRANT INSERT, SELECT ON site.tentativas TO site_escrita;

COMMIT;

-- =============================================================================
-- Ver os inscritos (com o papel dono, no SQL Editor):
--
-- SELECT email, nome, origem, criado_em FROM site.lista_de_espera ORDER BY criado_em DESC;
--
-- Limpar tentativas antigas (opcional, de tempos em tempos):
--
-- DELETE FROM site.tentativas WHERE criado_em < now() - interval '7 days';
-- =============================================================================
