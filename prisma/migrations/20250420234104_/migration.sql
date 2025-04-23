/*
  Warnings:

  - A unique constraint covering the columns `[name]` on the table `Room` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateTable
CREATE TABLE "Message" (
    "id" SERIAL NOT NULL,
    "username" TEXT NOT NULL,
    "roomId" INTEGER NOT NULL,
    "message" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Room_name_key" ON "Room"("name");

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
