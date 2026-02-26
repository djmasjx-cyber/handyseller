-- AlterTable
ALTER TABLE "Product" ADD COLUMN "items_per_pack" INTEGER;
ALTER TABLE "Product" ADD COLUMN "material" VARCHAR(200);
ALTER TABLE "Product" ADD COLUMN "craft_type" VARCHAR(200);
ALTER TABLE "Product" ADD COLUMN "country_of_origin" VARCHAR(100);
ALTER TABLE "Product" ADD COLUMN "package_contents" TEXT;
