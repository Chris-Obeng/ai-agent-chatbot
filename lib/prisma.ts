import { PrismaClient } from "@prisma/client";

const prismaClientSingleton = () => {
  const isBuildTime = process.env.NEXT_PHASE === "phase-production-build";

  // During build-time, we provide a placeholder if DATABASE_URL is missing
  // to prevent 'Failed to collect page data' errors.
  const accelerateUrl = process.env.DATABASE_URL || "prisma://placeholder";

  return new PrismaClient({
    // @ts-ignore
    accelerateUrl,
  });
};

declare global {
  var prisma: undefined | ReturnType<typeof prismaClientSingleton>;
}

const prisma = globalThis.prisma ?? prismaClientSingleton();

export default prisma;

if (process.env.NODE_ENV !== "production") globalThis.prisma = prisma;
