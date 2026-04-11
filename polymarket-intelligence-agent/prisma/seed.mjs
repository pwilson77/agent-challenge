import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const seedMarkets = [
    {
      id: "seed-btc-100k",
      question: "Will Bitcoin exceed $100k before year end?",
      probability: 0.41,
      volume: 8200000,
      liquidity: 3900000,
      endDate: new Date(Date.now() + 1000 * 60 * 60 * 24 * 180),
    },
    {
      id: "seed-fed-cut",
      question: "Will the Fed cut rates by at least 25bps this quarter?",
      probability: 0.46,
      volume: 2100000,
      liquidity: 1100000,
      endDate: new Date(Date.now() + 1000 * 60 * 60 * 24 * 90),
    },
  ];

  for (const market of seedMarkets) {
    await prisma.market.upsert({
      where: { id: market.id },
      update: {
        question: market.question,
        probability: market.probability,
        volume: market.volume,
        liquidity: market.liquidity,
        endDate: market.endDate,
      },
      create: market,
    });
  }

  await prisma.strategy.upsert({
    where: { name: "Default Strategy" },
    update: {
      description: "Baseline strategy using Eliza market analysis prompt",
      promptTemplate:
        "Analyze each market and return JSON signals with confidence, reasoning, and action.",
      batchSize: 4,
      active: true,
    },
    create: {
      name: "Default Strategy",
      description: "Baseline strategy using Eliza market analysis prompt",
      promptTemplate:
        "Analyze each market and return JSON signals with confidence, reasoning, and action.",
      batchSize: 4,
      active: true,
      scheduleEnabled: false,
    },
  });

  await prisma.simulation.create({
    data: {
      marketId: seedMarkets[0].id,
      investment: 1000,
      entryPrice: 0.41,
      exitPrice: 0.55,
      shares: 2439.024,
      finalValue: 1341.463,
      profit: 341.463,
      roi: 34.1463,
    },
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error("Seed failed", error);
    await prisma.$disconnect();
    process.exit(1);
  });
