-- Demo-Alpha schema extensions: fair value/reasoning persistence and strategy persona.
ALTER TABLE "Signal" ADD COLUMN "fairPrice" REAL;
ALTER TABLE "Signal" ADD COLUMN "marketContext" TEXT;
ALTER TABLE "Signal" ADD COLUMN "sentimentAnalysis" TEXT;
ALTER TABLE "Signal" ADD COLUMN "finalVerdict" TEXT;

ALTER TABLE "Strategy" ADD COLUMN "persona" TEXT DEFAULT 'BALANCED';
