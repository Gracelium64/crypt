declare global {
  namespace Express {
    interface Request {
      account?: {
        accountId: string;
        email: string;
        iat?: number;
        exp?: number;
      };
      rawBody?: Buffer;
    }
  }
}

export {};
