import { PrismaClient } from "@prisma/client";

async function main() {
  const prisma = new PrismaClient({
    // @ts-ignore
    accelerateUrl: process.env.DATABASE_URL
  });
  try {
    const result = await prisma.$queryRaw`SELECT version();`;
    console.log(result);
  } catch (e) {
    console.error(e);
  } finally {
    await prisma.$disconnect();
  }
}

main();
