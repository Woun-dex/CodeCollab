import React from "react";
import { 
  ArrowRight, Code, Users, Zap, Shield, 
  Globe, MessageSquare, ChevronRight, 
  Menu, Maximize2, Minimize2, X, Github,
  Twitter, ExternalLink, Terminal
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function DesktopAboutPage() {
  return (
    <div className="flex flex-col h-screen bg-[#1E1E1E] overflow-hidden">
      {/* Desktop Window Frame */}
      <div className="flex items-center justify-between px-4 py-2 bg-[#252526] border-b border-[#333333] select-none">
        <div className="flex items-center gap-2">
          <Menu className="h-4 w-4 text-gray-400" />
          <span className="text-sm text-gray-300">CodeCollab Desktop</span>
        </div>
      </div>

      {/* App Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Sidebar */}
        <div className="w-16 bg-[#1E1E1E] border-r border-[#333333] flex flex-col items-center py-4">
          <div className="w-10 h-10 bg-gradient-to-br from-green-500 to-green-800 rounded-lg mb-6 flex items-center justify-center">
            <Code className="h-6 w-6 text-white" />
          </div>
          <div className="w-10 h-10 bg-[#2D2D2D] rounded-lg flex items-center justify-center mb-3 cursor-pointer">
            <Terminal className="h-5 w-5 text-green-500" />
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <Tabs defaultValue="about" className="flex-1 flex flex-col overflow-hidden">
            <div className="flex items-center px-4 py-2 bg-[#252526] border-b border-[#333333]">
              <TabsList className="bg-[#2D2D2D] p-1">
                <TabsTrigger value="about" className="data-[state=active]:bg-[#3C3C3C] text-sm px-4">
                  About
                </TabsTrigger>
                <TabsTrigger value="features" className="data-[state=active]:bg-[#3C3C3C] text-sm px-4">
                  Features
                </TabsTrigger>
                <TabsTrigger value="faq" className="data-[state=active]:bg-[#3C3C3C] text-sm px-4">
                  FAQ
                </TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="about" className="flex-1 overflow-auto p-0 m-0">
              <div className="h-full overflow-auto">
                {/* Header Banner */}
                <div className="bg-gradient-to-r from-green-600 to-green-800 p-6 text-white">
                  <div className="flex items-center gap-3 mb-4">
                    <Code className="h-8 w-8" />
                    <h1 className="text-2xl font-bold tracking-tight">CodeCollab Desktop</h1>
                  </div>
                  <h2 className="text-3xl font-bold mb-4">Collaborative Coding for Desktop</h2>
                  <p className="text-lg text-green-100 mb-6">
                    A powerful desktop application for real-time code collaboration, 
                    designed for teams who need reliable performance and native integration.
                  </p>
                  <div className="flex gap-3">
                    <Link href="/dashboard">
                    <Button size="sm" className="bg-white text-green-700 hover:bg-green-50">
                      Get Started <ArrowRight className="ml-2 h-4 w-4" />
                    </Button>
                    </Link>
                    <Button size="sm" variant="outline" className="border-white text-white hover:bg-white/10">
                      What's New
                    </Button>
                  </div>
                </div>
                
                {/* About Content */}
                <div className="p-6">
                  <h2 className="text-xl font-bold mb-4 text-gray-100">About CodeCollab Desktop</h2>
                  <div className="space-y-4 text-gray-300">
                    <p>
                      CodeCollab Desktop brings all the power of our collaborative coding platform to your 
                      desktop with enhanced performance, offline capabilities, and native system integration.
                    </p>
                    <p>
                      Designed for professional developers, educators, and teams who need a reliable, 
                      always-available solution for code collaboration regardless of internet connectivity.
                    </p>
                    <p>
                      Our desktop application offers everything you love about CodeCollab with additional features 
                      only possible through a native application:
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-4 mt-6">
                    <div className="bg-[#252526] p-4 rounded-lg border border-[#333333]">
                      <div className="flex items-center gap-2 mb-2">
                        <Zap className="h-5 w-5 text-green-500" />
                        <h3 className="font-medium text-gray-100">Native Performance</h3>
                      </div>
                      <p className="text-sm text-gray-400">
                        Experience faster load times and smoother performance with our optimized desktop app.
                      </p>
                    </div>
                    
                    <div className="bg-[#252526] p-4 rounded-lg border border-[#333333]">
                      <div className="flex items-center gap-2 mb-2">
                        <Globe className="h-5 w-5 text-green-500" />
                        <h3 className="font-medium text-gray-100">Offline Support</h3>
                      </div>
                      <p className="text-sm text-gray-400">
                        Keep working even without internet access. Changes sync when connection is restored.
                      </p>
                    </div>
                    
                    <div className="bg-[#252526] p-4 rounded-lg border border-[#333333]">
                      <div className="flex items-center gap-2 mb-2">
                        <Shield className="h-5 w-5 text-green-500" />
                        <h3 className="font-medium text-gray-100">Enhanced Security</h3>
                      </div>
                      <p className="text-sm text-gray-400">
                        Additional encryption and security features available only in the desktop version.
                      </p>
                    </div>
                    
                    <div className="bg-[#252526] p-4 rounded-lg border border-[#333333]">
                      <div className="flex items-center gap-2 mb-2">
                        <Terminal className="h-5 w-5 text-green-500" />
                        <h3 className="font-medium text-gray-100">System Integration</h3>
                      </div>
                      <p className="text-sm text-gray-400">
                        Access local files, run local terminals, and integrate with your development environment.
                      </p>
                    </div>
                  </div>

                  <div className="mt-8 p-4 bg-[#252526] rounded-lg border border-[#333333]">
                    <h3 className="text-lg font-medium mb-3 text-gray-100">Version Information</h3>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-400">Current Version:</span>
                        <span className="text-gray-200">0.0.1</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-400">Released:</span>
                        <span className="text-gray-200">April 18, 2025</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-400">Platform:</span>
                        <span className="text-gray-200">Windows</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-400">License:</span>
                        <span className="text-gray-200">Commercial</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-between items-center mt-8">
                    <div className="flex gap-3">
                      <Button variant="outline" size="sm" className="flex items-center gap-2 bg-[#252526] border-[#333333] hover:bg-[#3C3C3C]">
                        <Github className="h-4 w-4" />
                        <span>GitHub</span>
                      </Button>
                      <Button variant="outline" size="sm" className="flex items-center gap-2 bg-[#252526] border-[#333333] hover:bg-[#3C3C3C]">
                        <Twitter className="h-4 w-4" />
                        <span>Twitter</span>
                      </Button>
                    </div>
                    <Button variant="outline" size="sm" className="flex items-center gap-2 bg-[#252526] border-[#333333] hover:bg-[#3C3C3C]">
                      <ExternalLink className="h-4 w-4" />
                      <span>Documentation</span>
                    </Button>
                  </div>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="features" className="flex-1 overflow-auto p-0 m-0">
              <div className="h-full overflow-auto p-6">
                <h2 className="text-2xl font-bold mb-6 text-gray-100">Key Features</h2>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="bg-[#252526] p-5 rounded-lg border border-[#333333]">
                    <div className="rounded-full bg-green-900/30 p-3 w-fit mb-4">
                      <Code className="h-5 w-5 text-green-500" />
                    </div>
                    <h3 className="text-lg font-bold mb-2 text-gray-100">Real-time Code Editor</h3>
                    <p className="text-gray-400 text-sm">
                      See changes as they happen with our powerful Monaco-based editor that supports syntax highlighting, 
                      autocompletion, and more. The desktop version includes enhanced performance and custom themes.
                    </p>
                  </div>

                  <div className="bg-[#252526] p-5 rounded-lg border border-[#333333]">
                    <div className="rounded-full bg-green-900/30 p-3 w-fit mb-4">
                      <MessageSquare className="h-5 w-5 text-green-500" />
                    </div>
                    <h3 className="text-lg font-bold mb-2 text-gray-100">Integrated Chat</h3>
                    <p className="text-gray-400 text-sm">
                      Discuss your code and exchange ideas with a built-in chat system that keeps communication contextual. 
                      Includes desktop notifications and message history synced across all your devices.
                    </p>
                  </div>

                  <div className="bg-[#252526] p-5 rounded-lg border border-[#333333]">
                    <div className="rounded-full bg-green-900/30 p-3 w-fit mb-4">
                      <Zap className="h-5 w-5 text-green-500" />
                    </div>
                    <h3 className="text-lg font-bold mb-2 text-gray-100">Native Code Execution</h3>
                    <p className="text-gray-400 text-sm">
                      Execute code directly using your local environment. The desktop version unlocks faster execution, 
                      more language support, and integration with your installed compilers and interpreters.
                    </p>
                  </div>

                  <div className="bg-[#252526] p-5 rounded-lg border border-[#333333]">
                    <div className="rounded-full bg-green-900/30 p-3 w-fit mb-4">
                      <Users className="h-5 w-5 text-green-500" />
                    </div>
                    <h3 className="text-lg font-bold mb-2 text-gray-100">Multiple Users</h3>
                    <p className="text-gray-400 text-sm">
                      Invite teammates with a simple link and collaborate with an unlimited number of participants in each room. 
                      The desktop app adds presence awareness and user activity tracking.
                    </p>
                  </div>

                  <div className="bg-[#252526] p-5 rounded-lg border border-[#333333]">
                    <div className="rounded-full bg-green-900/30 p-3 w-fit mb-4">
                      <Shield className="h-5 w-5 text-green-500" />
                    </div>
                    <h3 className="text-lg font-bold mb-2 text-gray-100">Enhanced Security</h3>
                    <p className="text-gray-400 text-sm">
                      The desktop version adds additional security layers including local encryption, secure credential storage, 
                      and integration with your system's security features.
                    </p>
                  </div>

                  <div className="bg-[#252526] p-5 rounded-lg border border-[#333333]">
                    <div className="rounded-full bg-green-900/30 p-3 w-fit mb-4">
                      <Terminal className="h-5 w-5 text-green-500" />
                    </div>
                    <h3 className="text-lg font-bold mb-2 text-gray-100">Local Environment Access</h3>
                    <p className="text-gray-400 text-sm">
                      Access your local file system, terminals, and development tools directly from the app. 
                      Share local resources securely with collaboration partners.
                    </p>
                  </div>
                </div>

                <div className="bg-green-700 mt-8 p-5 rounded-lg">
                  <h3 className="text-lg font-bold mb-2 text-white">Ready to Start Collaborating?</h3>
                  <p className="text-green-100 mb-4">
                    Create your first collaboration room and invite your team to start coding together.
                  </p>
                  <Link href="/dashboard">
                  <Button className="bg-white text-green-700 hover:bg-green-50">
                    Create a Room
                  </Button>
                  </Link>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="faq" className="flex-1 overflow-auto p-0 m-0">
              <div className="h-full overflow-auto p-6">
                <h2 className="text-2xl font-bold mb-6 text-gray-100">Frequently Asked Questions</h2>
                
                <div className="space-y-4">
                  <div className="bg-[#252526] p-4 rounded-lg border border-[#333333]">
                    <h3 className="text-lg font-bold mb-2 text-gray-100">What's different in the desktop version?</h3>
                    <p className="text-gray-400">
                      The desktop version offers offline capabilities, faster performance, integration with your local 
                      development environment, and additional security features not available in the web version.
                    </p>
                  </div>

                  <div className="bg-[#252526] p-4 rounded-lg border border-[#333333]">
                    <h3 className="text-lg font-bold mb-2 text-gray-100">Can I use my existing account?</h3>
                    <p className="text-gray-400">
                      Yes, you can sign in with your existing CodeCollab account. All your rooms, settings, and 
                      preferences will sync automatically between the web and desktop versions.
                    </p>
                  </div>

                  <div className="bg-[#252526] p-4 rounded-lg border border-[#333333]">
                    <h3 className="text-lg font-bold mb-2 text-gray-100">How do I update the application?</h3>
                    <p className="text-gray-400">
                      The desktop app automatically checks for updates and prompts you when new versions are available. 
                      You can also check for updates manually from the Help menu.
                    </p>
                  </div>

                  <div className="bg-[#252526] p-4 rounded-lg border border-[#333333]">
                    <h3 className="text-lg font-bold mb-2 text-gray-100">Is the desktop app free?</h3>
                    <p className="text-gray-400">
                      The desktop app follows the same pricing model as our web version. The basic collaboration features 
                      are free, with premium features available through subscription plans.
                    </p>
                  </div>

                  <div className="bg-[#252526] p-4 rounded-lg border border-[#333333]">
                    <h3 className="text-lg font-bold mb-2 text-gray-100">Can I use it offline?</h3>
                    <p className="text-gray-400">
                      Yes, you can work on your existing rooms offline. Changes will automatically sync 
                      when internet connectivity is restored. Creating new rooms requires an internet connection.
                    </p>
                  </div>

                  <div className="bg-[#252526] p-4 rounded-lg border border-[#333333]">
                    <h3 className="text-lg font-bold mb-2 text-gray-100">Which platforms are supported?</h3>
                    <p className="text-gray-400">
                      CodeCollab Desktop is available for Windows (10 and newer), macOS (Big Sur and newer), 
                      and major Linux distributions including Ubuntu, Debian, and Fedora.
                    </p>
                  </div>
                </div>
              </div>
            </TabsContent>
          </Tabs>

          {/* Status Bar */}
          <div className="flex items-center justify-between px-4 py-1.5 bg-[#252526] border-t border-[#333333] text-xs text-gray-400">
            <div>CodeCollab Desktop v0.0.1</div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-full bg-green-500"></div>
                <span>Connected</span>
              </div>
              <div>© 2025 CodeCollab</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}