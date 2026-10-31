-- =============================================================================
-- Painel administrativo web — acesso ao banco
--
-- Rodar UMA vez no SQL Editor do Neon, na branch de producao, com o papel dono
-- das tabelas do app (o padrao do editor, normalmente neondb_owner).
--
-- O que este script faz:
--   1. Cria o papel `painel_admin`, que o painel usa para conectar.
--   2. Da a ele SOMENTE LEITURA nas tabelas do app (schema public). Ele nao
--      consegue inserir, alterar nem apagar nada do que o app mobile usa.
--   3. Esconde dele senhas e tokens: users.password_hash, refresh tokens,
--      tokens de troca de senha/e-mail e tentativas de login.
--   4. Cria o schema `painel` com as tabelas do proprio painel (admins, sessoes
--      do painel e registro de acesso para a LGPD). O app nunca le esse schema.
--
-- O que este script NAO faz: nao altera nenhuma tabela, coluna ou dado que ja
-- existe. Tudo aqui e papel novo, permissao nova ou tabela nova.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Papel de conexao do painel
-- -----------------------------------------------------------------------------
-- TROQUE a senha antes de rodar: gere uma aleatoria com 32+ caracteres (o Neon
-- recusa senha fraca em papel criado por SQL). Ela vai na DATABASE_URL do
-- projeto Vercel do painel, nunca no app mobile.
CREATE ROLE painel_admin WITH LOGIN PASSWORD 'TROQUE_POR_UMA_SENHA_ALEATORIA_DE_32_CARACTERES';

-- Uma consulta pesada do painel nao pode segurar o banco que o app usa.
ALTER ROLE painel_admin SET statement_timeout = '15s';
ALTER ROLE painel_admin SET idle_in_transaction_session_timeout = '30s';
ALTER ROLE painel_admin CONNECTION LIMIT 10;

-- -----------------------------------------------------------------------------
-- 2. Leitura das tabelas do app (schema public)
-- -----------------------------------------------------------------------------
GRANT USAGE ON SCHEMA public TO painel_admin;
REVOKE CREATE ON SCHEMA public FROM painel_admin;

-- Tabelas inteiras, sem segredo dentro.
GRANT SELECT ON
  profiles,
  professionals,
  appointments,
  medications,
  medication_times,
  medication_doses,
  medication_stock_entries,
  medication_attachments,
  medication_photo_reads,
  symptom_entries,
  caregivers,
  whatsapp_sends,
  assistant_conversations,
  assistant_messages,
  consents
TO painel_admin;

-- users: todas as colunas MENOS password_hash.
GRANT SELECT (
  id,
  email,
  full_name,
  is_active,
  password_changed_at,
  reference_label,
  reference_address,
  reference_latitude,
  reference_longitude,
  timezone,
  trial_ends_at,
  premium_until,
  premium_store,
  premium_product,
  created_at,
  updated_at
) ON users TO painel_admin;

-- sessions: so o necessario para "ultimo acesso" e engajamento (sem IP e
-- sem user agent).
GRANT SELECT (id, user_id, created_at, last_used_at, revoked_at) ON sessions TO painel_admin;

-- De proposito SEM acesso: refresh_tokens, password_reset_tokens,
-- email_change_tokens, login_attempts.
-- Tabela nova criada no app no futuro NAO fica visivel sozinha: precisa de um
-- GRANT SELECT explicito aqui. E proposital — nada novo vaza para o painel sem
-- alguem decidir.

-- -----------------------------------------------------------------------------
-- 3. Schema proprio do painel
-- -----------------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS painel;
GRANT USAGE ON SCHEMA painel TO painel_admin;

-- Administradores do painel. Separado de public.users: nenhuma conta do app
-- vira admin, e nenhum fluxo do app consegue criar admin.
CREATE TABLE IF NOT EXISTS painel.admin_users (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email          citext NOT NULL UNIQUE,
  password_hash  text NOT NULL,
  full_name      text NOT NULL,
  role           text NOT NULL DEFAULT 'admin' CHECK (role IN ('admin')),
  is_active      boolean NOT NULL DEFAULT true,
  last_login_at  timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

-- Sessoes do painel (refresh token em cookie httpOnly; aqui so o SHA-256).
CREATE TABLE IF NOT EXISTS painel.admin_sessions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id     uuid NOT NULL REFERENCES painel.admin_users (id) ON DELETE CASCADE,
  token_hash   text NOT NULL UNIQUE,
  ip           inet,
  user_agent   text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz NOT NULL DEFAULT now(),
  expires_at   timestamptz NOT NULL,
  revoked_at   timestamptz
);
CREATE INDEX IF NOT EXISTS admin_sessions_admin_id_idx ON painel.admin_sessions (admin_id);
CREATE INDEX IF NOT EXISTS admin_sessions_expires_at_idx ON painel.admin_sessions (expires_at);

-- Registro de acesso (LGPD): quem viu o que, de quem e quando.
-- Somente insercao: o painel grava e le, mas nao edita nem apaga.
CREATE TABLE IF NOT EXISTS painel.admin_audit_log (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  admin_id        uuid NOT NULL REFERENCES painel.admin_users (id),
  action          text NOT NULL,          -- ex.: 'login', 'listar_usuarios', 'exportar_csv'
  resource        text NOT NULL,          -- ex.: 'usuarios', 'medicamentos'
  target_user_id  uuid,                   -- conta da familia consultada, quando houver
  details         jsonb,                  -- filtros usados, pagina, etc.
  ip              inet,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS admin_audit_log_admin_id_idx ON painel.admin_audit_log (admin_id, created_at DESC);
CREATE INDEX IF NOT EXISTS admin_audit_log_target_idx ON painel.admin_audit_log (target_user_id, created_at DESC);

-- Permissoes do painel nas proprias tabelas.
GRANT SELECT, INSERT, UPDATE ON painel.admin_users TO painel_admin;
GRANT SELECT, INSERT, UPDATE, DELETE ON painel.admin_sessions TO painel_admin;
GRANT SELECT, INSERT ON painel.admin_audit_log TO painel_admin;

COMMIT;

-- =============================================================================
-- Conferencia (rodar depois, opcional). Deve listar so SELECT em public e as
-- permissoes acima em painel:
--
-- SELECT table_schema, table_name, privilege_type
--   FROM information_schema.role_table_grants
--  WHERE grantee = 'painel_admin'
--  ORDER BY 1, 2, 3;
-- =============================================================================
