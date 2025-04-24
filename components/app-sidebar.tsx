import * as React from "react"
import { GalleryVerticalEnd } from "lucide-react"
import { useUser } from "@clerk/clerk-react";
import { useState } from "react";
import axios from "axios";

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarRail,
} from "@/components/ui/sidebar"

const api = axios.create({
  baseURL: "http://localhost:8000/api",
  headers: {
    "Content-Type": "application/json",
  },
});

// This is sample data.
const data = {
  navMain: [
    {
      title: "Dashboard",
      url: "/dashboard",
      
    },
    {
      title: "Settings",
      url: "#",
      
    },
    {
      title: "About",
      url: "#",
      
    },
    {
      title: "User",
      url: "/user",
      
    },
  ],
}


export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {

  const [user_, setUser] = useState<any>(null);
  const { user } = useUser();


  React.useEffect(() => {
    const fetchUser = async () => {
      if (user && user.id) {  // Only proceed if user and user.id exist
        try {
          const response = await api.get(`/user/${user.id}`);
          setUser(response.data);
        } catch (error) {
          console.error("Error fetching user:", error);
        }
      }
    };
    
    fetchUser();
  }, [user]);



  return (
    <Sidebar {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <a href="#">
                <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                  <GalleryVerticalEnd className="size-4" />
                </div>
                <div className="flex flex-col gap-0.5 leading-none">
                  <span className="font-semibold">CodeCollab</span>
                </div>
              </a>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarMenu>
            {data.navMain.map((item) => (
              <SidebarMenuItem key={item.title}>
                <SidebarMenuButton asChild>
                  <a href={item.url} className="font-medium">
                    {item.title}
                  </a>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
      <div className=" p-4 flex gap-2 items-center">
      <img className="rounded-full w-10 h-10" src={user_?.profilePicture} alt="" />
      <div>

      <p className="text-xs"><span className="font-semibold">Username</span> : {user_?.username}</p>
      <p className="text-xs"><span className="font-semibold">Email</span> : {user_?.email}</p>
      </div>
      </div>
      <SidebarRail />
    </Sidebar>
  )
}
