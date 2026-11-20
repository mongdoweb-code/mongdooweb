-- ช่องลงนามฝั่งร้านแบบเว้นว่าง (เซ็นด้วยมือภายหลัง)
ALTER TABLE "SalesDocument" ADD COLUMN "signBlank" BOOLEAN NOT NULL DEFAULT false;
