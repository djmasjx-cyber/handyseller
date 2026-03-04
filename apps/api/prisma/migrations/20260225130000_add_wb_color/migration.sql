-- CreateTable
CREATE TABLE "wb_color" (
    "id" INTEGER NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wb_color_pkey" PRIMARY KEY ("id")
);
