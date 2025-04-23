import * as React from "react"
import { GalleryVerticalEnd } from "lucide-react"
import { useUser } from "@clerk/clerk-react";

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

// This is sample data.
const data = {
  navMain: [
    {
      title: "Dashboard",
      url: "#",
      
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
      url: "#",
      
    },
  ],
}

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {

  const { user } = useUser();

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
      <img className="rounded-full w-8 h-8" src={user?.imageUrl} alt="" />
      <div>

      <p className="text-xs">User : {user?.fullName}</p>
      <p className="text-xs">email : {user?.primaryEmailAddress?.emailAddress}</p>
      </div>
      </div>
      <SidebarRail />
    </Sidebar>
  )
}
