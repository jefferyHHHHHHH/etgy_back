import { prisma } from '../src/config/prisma';

async function main() {
  const lives = await prisma.liveRoom.findMany({
    where: { status: { in: ['FINISHED', 'OFFLINE'] } },
    select: {
      id: true,
      status: true,
      estimatedViewers: true,
      actualStart: true,
      metrics: true,
      _count: { select: { messages: true } },
    },
    take: 20,
  });
  console.log(JSON.stringify(lives, null, 2));

  for (const id of [6, 8, 9]) {
    const live = await prisma.liveRoom.findUnique({
      where: { id },
      select: { anchorId: true, messages: { select: { senderId: true } } },
    });
    console.log('detail', id, live);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
