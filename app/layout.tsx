import type { Metadata } from "next";
import { Ubuntu } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { ClerkProvider } from "@clerk/nextjs";

const ubuntu = Ubuntu({ subsets: ["latin"], weight: ["400", "500", "700"] });

export const metadata: Metadata = {
  title: "CodeCollab",
  description: "CodeCollab is a platform for collaborative coding.",
};


export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <ClerkProvider>
    <html lang="en" suppressHydrationWarning>
      <body className={`${ubuntu.className}`}>
        <ThemeProvider
            attribute="class"
            defaultTheme="system"
            enableSystem
            disableTransitionOnChange
          >
            
          {children}
        </ThemeProvider>
      </body>
    </html>
    </ClerkProvider>
  );
}
