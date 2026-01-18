import type { Request, Response } from 'express';
import { ok } from '../utils/response';
import { dictionaries } from '../docs/dictionaries';

export class MetaController {
	static getDictionaries(req: Request, res: Response) {
		return ok(res, dictionaries);
	}
}
