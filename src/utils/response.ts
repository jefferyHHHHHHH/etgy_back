import { Response } from 'express';

export const ok = <T>(res: Response, data: T, message = 'Success', code = 200) => {
  return res.status(code).json({ code, message, data });
};

export const fail = (res: Response, message: string, code = 400, data?: unknown) => {
  return res.status(code).json({ code, message, data: data ?? null });
};
