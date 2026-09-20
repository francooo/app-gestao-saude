import type { VercelRequest, VercelResponse } from '@vercel/node';
import { hashPassword } from '../../src/lib/password';

// Sonda temporaria: isola qual import do login derruba a funcao.
export default function handler(_req: VercelRequest, res: VercelResponse) {
  res.status(200).json({ modulo: 'lib/password', carregou: typeof hashPassword });
}
