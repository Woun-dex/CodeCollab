-- DropForeignKey
ALTER TABLE "Code" DROP CONSTRAINT "Code_roomId_fkey";

-- DropForeignKey
ALTER TABLE "Message" DROP CONSTRAINT "Message_roomId_fkey";

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Code" ADD CONSTRAINT "Code_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;
