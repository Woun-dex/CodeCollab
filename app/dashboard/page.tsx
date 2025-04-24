"use client"
import { AppSidebar } from "@/components/app-sidebar"
import { Input } from "@/components/ui/input"
import React, { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { CardDemo } from "@/components/cards"
import { Redirect } from "next"

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { Separator } from "@/components/ui/separator"
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar"
import { io } from "socket.io-client";
import { useUser } from "@clerk/clerk-react";
import axios from "axios";
import { redirect } from "next/dist/server/api-utils"
import { useRouter } from "next/navigation";
import { auth } from "@clerk/nextjs/server" ;




const socket = io("http://localhost:8000");

// Create axios instance with base URL
const api = axios.create({
  baseURL: "http://localhost:8000/api",
  headers: {
    "Content-Type": "application/json",
  },
});

// Add response interceptor for better error handling
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response) {
      // The request was made and the server responded with a status code
      // that falls out of the range of 2xx
      console.error('API Error Response:', {
        status: error.response.status,
        data: error.response.data,
        headers: error.response.headers
      });
    } else if (error.request) {
      // The request was made but no response was received
      console.error('API Error Request:', error.request);
    } else {
      // Something happened in setting up the request that triggered an Error
      console.error('API Error:', error.message);
    }
    return Promise.reject(error);
  }
);

interface Room {
  id: number;
  name: string;
}

export default function Page(){
  const [roomName, setRoomName] = useState("");
  const [rooms, setRooms] = useState<Room[]>([]);
  const { user } = useUser();
  const router = useRouter();

  const handleJoinRoom = (roomId: number) => {
    socket.emit("join_room", { roomId, username: user?.username });
    router.push(`/chat/${roomId}`);
  };

  const handleDelete = async (roomId: number) => {
    try {
      const { data } = await api.delete(`/rooms/${roomId}`); // Correct endpoint
      console.log(data); // { message: "Room deleted" }
      return data;
    } catch (error) {
      console.error("Error deleting room:", error);
      throw error;
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!roomName.trim()) return; // Don't create empty rooms
    
    try {
      const { data: newRoom } = await api.post("/rooms", { roomName , userId: user?.id  });
      setRooms(prevRooms => [...prevRooms, newRoom]);
      setRoomName("");
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const errorMessage = error.response?.data?.error || 'Unknown error occurred';
        const errorDetails = error.response?.data?.details || error.message;
        console.error("Error creating room:", {
          message: errorMessage,
          details: errorDetails,
          status: error.response?.status
        });
      } else {
        console.error("Error creating room:", error);
      }
    }
  };

  useEffect(() => {
    const fetchData = async () => {
      try {
        const { data } = await api.get("/rooms");
        setRooms(data);
      } catch (error) {
        if (axios.isAxiosError(error)) {
          const errorMessage = error.response?.data?.error || 'Unknown error occurred';
          const errorDetails = error.response?.data?.details || error.message;
          console.error("Error fetching rooms:", {
            message: errorMessage,
            details: errorDetails,
            status: error.response?.status
          });
        } else {
          console.error("Error fetching rooms:", error);
        }
      }
    };
    fetchData();
  }, [rooms]);

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <header className="flex h-16 shrink-0 items-center gap-2 border-b">
          <div className="flex items-center gap-2 px-3">
            <SidebarTrigger />
            <Separator orientation="vertical" className="mr-2 h-4" />
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem className="hidden md:block">
                  <BreadcrumbLink href="#">
                  </BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator className="hidden md:block" />
                <BreadcrumbItem>
                  <BreadcrumbPage>Collaborative Rooms</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </div>
        </header>
        <form onSubmit={handleSubmit} className="flex gap-4 p-4">
          <Input 
            value={roomName} 
            onChange={(e) => setRoomName(e.target.value)} 
            placeholder="Enter room name"
          />  
          <Button type="submit">
            Create Room
          </Button>
        </form>
        <div className="flex flex-wrap gap-8 p-4">
          {rooms.map((room) => ( 
            <CardDemo 
              key={room.id}
              name={room.name} 
              numberId={room.id} 
              handleClick={() => handleJoinRoom(room.id)}
              deleteClick={()=> handleDelete(room.id)}
            />
          ))}
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
