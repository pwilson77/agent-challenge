-- CreateTable
CREATE TABLE "SimulationSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "betSize" REAL NOT NULL DEFAULT 100,
    "interval" TEXT NOT NULL DEFAULT '1h',
    "intervalMin" INTEGER,
    "nextTickAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "SimulationPosition" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "marketId" TEXT NOT NULL,
    "marketQuestion" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "betSize" REAL NOT NULL,
    "entryProbability" REAL NOT NULL,
    "shares" REAL NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "closedAt" DATETIME,
    "closeProbability" REAL,
    "realizedPnl" REAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SimulationPosition_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "SimulationSession" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SimulationSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "positionId" TEXT NOT NULL,
    "probability" REAL NOT NULL,
    "value" REAL NOT NULL,
    "pnl" REAL NOT NULL,
    "takenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SimulationSnapshot_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "SimulationPosition" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "SimulationPosition_sessionId_idx" ON "SimulationPosition"("sessionId");

-- CreateIndex
CREATE INDEX "SimulationPosition_sessionId_status_idx" ON "SimulationPosition"("sessionId", "status");

-- CreateIndex
CREATE INDEX "SimulationSnapshot_sessionId_takenAt_idx" ON "SimulationSnapshot"("sessionId", "takenAt");

-- CreateIndex
CREATE INDEX "SimulationSnapshot_positionId_takenAt_idx" ON "SimulationSnapshot"("positionId", "takenAt");
