import { consultar } from './db';
import { ERRO, falha } from './http';
import { verificarTokenDeAcesso } from './token';

export interface Admin {
  id: string;
  email: string;
  nome: string;
  papel: string;
}

/**
 * Exige um admin ativo. Devolve o admin ou a Response 401 ja pronta.
 *
 * Confere o banco a cada chamada (e nao so o token): desativar um admin corta
 * o acesso na hora, sem esperar o token de 15 minutos vencer.
 */
export async function exigirAdmin(request: Request): Promise<Admin | Response> {
  const cabecalho = request.headers.get('authorization');
  const token = cabecalho?.startsWith('Bearer ') ? cabecalho.slice(7) : null;
  const adminId = token ? verificarTokenDeAcesso(token) : null;
  if (!adminId) return falha(401, ERRO.NAO_AUTENTICADO);

  const admin = await buscarAdminAtivo(adminId);
  return admin ?? falha(401, ERRO.NAO_AUTENTICADO);
}

export async function buscarAdminAtivo(id: string): Promise<Admin | null> {
  const [linha] = await consultar<Admin>(
    `select id, email, full_name as nome, role as papel
       from painel.admin_users
      where id = $1 and is_active`,
    [id],
  );
  return linha ?? null;
}
