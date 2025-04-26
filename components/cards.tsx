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
  baseURL: "codecollabbackend-production-e138.up.railway.app/api",
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
        <span className="cursor-pointer" onClick={() => deleteroom()}>
        <Trash  className="text-red-700 cursor-pointer" />
      </span>

        </div>
        
      </CardFooter>
    </Card>
  )
}
