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
import { useState , useEffect} from "react";
import { useUser  } from "@clerk/clerk-react";
import axios from "axios";

interface RoomCardProps {
    name: string;
    numberId: number;
    handleClick: (numberId: number) => void;
    deleteClick: (numberId:number) => void;
}

const api = axios.create({
  baseURL: "https://codecollabbackend-production-e138.up.railway.app:8000/api",
});

type CardProps = React.ComponentProps<typeof Card>

export function CardDemo({ className, numberId,name , handleClick, deleteClick , ...props }: CardProps & RoomCardProps) {
  const [ isowner , setisOwner ] = useState(false);
  const { user } = useUser();

  useEffect ( () => {
    const owner = async () => {
      try {
        const response = await api.get(`/rooms/${numberId}/owner`);
        // Check if the response data matches the user id
        if (response.data === user?.id) {
          setisOwner(true);
        }
      }
      catch (error) {
        console.error("Error loading owner:", error);
      }
    };

    owner();
  }, [user])

  const deleteroom = () => {

    if ( isowner) {
      deleteClick(numberId);
    }
  }
  
  return (
    <Card className={cn("w-full max-w-xs", className)} {...props}>
  <CardHeader>
    <CardTitle className="text-lg md:text-xl font-semibold truncate">{name}</CardTitle>
    <CardDescription className="text-sm text-muted-foreground break-all">
      Room ID: {numberId}
    </CardDescription>
  </CardHeader>

  <CardFooter>
    <div className="flex flex-col sm:flex-row w-full gap-2">
      <Button
        className="flex-1 flex items-center justify-center gap-1"
        onClick={() => handleClick(numberId)}
      >
        <Check className="w-4 h-4" />
        Enter Room
      </Button>
      <Button
        type="button"
        variant="ghost"
        className="text-red-600 hover:text-red-800 p-2"
        onClick={deleteroom}
      >
        <Trash className="w-5 h-5" />
      </Button>
    </div>
  </CardFooter>
</Card>

  )
}
