import {Check , Trash } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

interface RoomCardProps {
    name: string;
    numberId: number;
    handleClick: (numberId: number) => void;
    deleteClick: (numberId:number) => void;
}

type CardProps = React.ComponentProps<typeof Card>

export function CardDemo({ className, numberId,name , handleClick, deleteClick , ...props }: CardProps & RoomCardProps) {
  return (
    <Card className={cn("w-[230px]", className)} {...props}>
      <CardHeader>
        <CardTitle>{name} </CardTitle>
        <CardDescription>Room ID: {numberId}</CardDescription>
      </CardHeader>
      <CardFooter>
        <div className="flex justify-content items-center gap-2">
        <Button className="w-full" onClick={() => handleClick(numberId)}>
          <Check /> Enter Room
        </Button>
        <span className="cursor-pointer" onClick={() => deleteClick(numberId)}>
  <Trash className="text-red-700 cursor-pointer" />
</span>

        </div>
        
      </CardFooter>
    </Card>
  )
}
