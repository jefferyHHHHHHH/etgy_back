import { LivePresenceService } from '../src/services/livePresence.service';
import { prisma } from '../src/config/prisma';

async function main() {
  const result = await LivePresenceService.backfillAllEndedLives();
  console.log('backfill result:', result);

  const lives = await prisma.liveRoom.findMany({
    where: { status: 'FINISHED' },
    select: { id: true, metrics: { select: { peakViewers: true, averageViewers: true } } },
  });
  console.log('finished lives metrics:', lives);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
