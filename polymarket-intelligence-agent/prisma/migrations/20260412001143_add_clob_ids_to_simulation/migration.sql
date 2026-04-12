-- AlterTable
ALTER TABLE "Market" ADD COLUMN "clobTokenId" TEXT;
ALTER TABLE "Market" ADD COLUMN "conditionId" TEXT;

-- AlterTable
ALTER TABLE "SimulationPosition" ADD COLUMN "clobTokenId" TEXT;
