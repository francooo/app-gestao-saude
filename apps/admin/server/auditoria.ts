import { consultar } from './db.js';

/**
 * Registro de acesso (LGPD): quem fez o que, sobre qual conta, quando.
 *
 * A tabela so aceita INSERT e SELECT do painel_admin — nem o proprio painel
 * consegue apagar ou editar o que foi registrado.
 */
export async function registrar(entrada: {
  adminId: string;
  acao: string;
  recurso: string;
  contaAlvo?: string | null;
  detalhes?: Record<string, unknown> | null;
  ip?: string | null;
}): Promise<void> {
  await consultar(
    `insert into painel.admin_audit_log (admin_id, action, resource, target_user_id, details, ip)
     values ($1, $2, $3, $4, $5, $6)`,
    [
      entrada.adminId,
      entrada.acao,
      entrada.recurso,
      entrada.contaAlvo ?? null,
      entrada.detalhes ? JSON.stringify(entrada.detalhes) : null,
      entrada.ip ?? null,
    ],
  );
}
