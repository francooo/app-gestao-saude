import 'dotenv/config';
import { eq } from 'drizzle-orm';

import { db } from '../src/db/client';
import { users } from '../src/db/schema';
import { hashPassword } from '../src/lib/password';

/**
 * Cria (ou atualiza) um usuario de teste.
 *
 * Nao ha auto-cadastro no app ainda — este script e o unico caminho para
 * existir uma conta. Rode com:
 *   pnpm --filter @gestao/api db:seed
 * ou com credenciais proprias:
 *   SEED_EMAIL=... SEED_PASSWORD=... pnpm --filter @gestao/api db:seed
 */
async function main() {
  const email = (process.env.SEED_EMAIL ?? 'teste@gestaosaude.com.br').toLowerCase();
  const password = process.env.SEED_PASSWORD ?? 'senha-de-teste-123';
  const fullName = process.env.SEED_NAME ?? 'Maria de Teste';

  if (password.length < 8) throw new Error('SEED_PASSWORD precisa ter ao menos 8 caracteres');

  const passwordHash = await hashPassword(password);

  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, email));

  if (existing) {
    await db
      .update(users)
      .set({ passwordHash, fullName, isActive: true, updatedAt: new Date() })
      .where(eq(users.id, existing.id));
    console.log(`Usuario atualizado: ${email}`);
  } else {
    await db.insert(users).values({ email, passwordHash, fullName });
    console.log(`Usuario criado: ${email}`);
  }

  console.log(`Senha: ${password}`);
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
