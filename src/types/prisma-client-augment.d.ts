declare module '@prisma/client' {
  // Prisma Client types are generated into node_modules; in some Windows setups
  // TS can temporarily pick up stale typings under @prisma/client/.prisma.
  // This augmentation keeps the workspace type-check clean until regeneration.
  // eslint-disable-next-line @typescript-eslint/consistent-type-definitions
  interface PrismaClient {
    contentPolicy: any;
    sensitiveWord: any;
  }
}

export {};
