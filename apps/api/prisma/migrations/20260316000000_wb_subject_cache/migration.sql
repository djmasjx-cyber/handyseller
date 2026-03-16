-- CreateTable: WB предметы (глобальный кеш категорий, TTL 30 дней)
CREATE TABLE "wb_subject" (
    "id" INTEGER NOT NULL,
    "name" VARCHAR(300) NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wb_subject_pkey" PRIMARY KEY ("id")
);
