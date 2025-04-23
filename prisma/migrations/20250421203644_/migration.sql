-- CreateTable
CREATE TABLE "Code" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "roomId" INTEGER NOT NULL,

    CONSTRAINT "Code_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Code_roomId_key" ON "Code"("roomId");

-- AddForeignKey
ALTER TABLE "Code" ADD CONSTRAINT "Code_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
