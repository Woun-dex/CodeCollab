import { Toaster } from "@/components/ui/sonner"

export default function UserSettingsLayout({
    children,
  }: {
    children: React.ReactNode
  }) {
    return (
      <div className="flex h-screen">
        <main className="flex-1 overflow-y-auto ">
          {children}
          <Toaster />
        </main>
      </div>
    )
  } 