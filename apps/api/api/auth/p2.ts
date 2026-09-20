import type { VercelRequest, VercelResponse } from '@vercel/node';
import { signAccessToken } from '../../src/lib/tokens';

export default function handler(_req: VercelRequest, res: VercelResponse) {
  res.status(200).json({ modulo: 'lib/tokens', carregou: typeof signAccessToken });
}
