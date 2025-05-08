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





const socket = io("https://codecollabbackend-production-e138.up.railway.app");

// Create axios instance with base URL
const api = axios.create({
  baseURL: "https://codecollabbackend-production-e138.up.railway.app/api",
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
      {/* Header */}
      <header className="flex flex-wrap h-auto md:h-20 bg-gradient-to-r from-[#1E1E1E] via-[#232946] to-[#1E1E1E] items-center justify-between px-3 md:px-6 py-3 gap-4 border-b shadow-md">
        <div className="flex items-center gap-3 md:gap-6">
          <SidebarTrigger />
          <Separator orientation="vertical" className="h-4 md:h-6" />
          <Breadcrumb>
            <BreadcrumbList className="flex-wrap gap-2 md:gap-4">
              <BreadcrumbItem className="hidden md:block">
                <BreadcrumbLink href="#">Home</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator className="hidden md:block" />
              <BreadcrumbItem>
                <BreadcrumbPage className="text-base md:text-lg font-bold text-primary">
                  Collaborative Rooms
                </BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </div>
      </header>
  
      {/* Room Creation Form */}
      <form
        onSubmit={handleSubmit}
        className="flex flex-col sm:flex-row gap-3 md:gap-6 bg-gradient-to-r from-[#232946]/80 to-[#1E1E1E]/80 shadow-lg rounded-xl mt-4 mx-2 px-4 py-4 md:p-6"
      >
        <Input
          value={roomName}
          onChange={(e) => setRoomName(e.target.value)}
          placeholder="Enter room name"
          className="flex-1 text-base md:text-lg px-4 py-2 rounded-lg border-2 border-primary/30 focus:border-primary focus:ring-2 focus:ring-primary/30 transition"
        />
        <Button
          type="submit"
          className="text-base md:text-lg px-6 py-2 rounded-lg bg-gradient-to-r from-primary to-blue-500 shadow-md hover:from-blue-500 hover:to-primary transition font-semibold w-full sm:w-auto"
        >
          Create Room
        </Button>
      </form>
  
      {/* Rooms Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 md:gap-10 p-4 md:p-6">
        {rooms.map((room) => (
          <div
            key={room.id}
            className="rounded-2xl bg-gradient-to-br from-[#232946] to-[#1E1E1E] shadow-xl border border-primary/20 hover:shadow-2xl hover:border-primary/60 transition-all duration-200 group"
          >
            <CardDemo
              name={room.name}
              numberId={room.id}
              handleClick={() => handleJoinRoom(room.id)}
              deleteClick={() => handleDelete(room.id)}
              className="p-6"
            />
          </div>
        ))}
      </div>
    </SidebarInset>
  </SidebarProvider>  
  )
}
  
