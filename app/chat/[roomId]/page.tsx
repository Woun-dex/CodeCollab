"use client";
import React, { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { io, Socket } from "socket.io-client";
import { useUser } from "@clerk/clerk-react";
import axios from "axios";
import MonacoEditor from "@/components/MonacoEditor";
import {
  Check,
  Code,
  LogOut,
  Send,
  RefreshCw,
  User,
  Users,
  Terminal,
  Save,
  MessageSquare,
  // Mic, MicOff, Video, VideoOff, // Removed WebRTC icons
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";


interface Message {
  id: number;
  message: string;
  username: string;
  createdAt: Date | string;
}

interface RemoteCursor {
  userId: string;
  lineNumber: number;
  column: number;
}

interface UserCountData {
  count: number;
}

interface UserJoinedRoomData {
  userId: string;
  username?: string;
  userCount?: number;
}

interface UserLeftRoomData {
  userId: string;
  userCount?: number;
}

// --- Constants ---
const SOCKET_SERVER_URL =
  "https://codecollabbackend-production-e138.up.railway.app";
const API_BASE_URL =
  "https://codecollabbackend-production-e138.up.railway.app/api";

const socket: Socket = io(SOCKET_SERVER_URL, {
  autoConnect: true,
  reconnection: true,
});

const api = axios.create({
  baseURL: API_BASE_URL,
});

// Removed rtcConfiguration

export default function CodeCollabRoom() {
  const { roomId } = useParams<{ roomId: string }>();
  const router = useRouter();
  const { user } = useUser();

  // --- State ---
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState<string>("");
  const [code, setCode] = useState<string>(
    '# Start coding here...\n\n# Example Python code\ndef greet(name):\n    return f"Hello, {name}!"\n\n# Print greeting\nprint(greet("CodeCollab User"))\n'
  );
  const [remoteCursors, setRemoteCursors] = useState<RemoteCursor[]>([]);
  const [userNumber, setUserNumber] = useState<number>(0);
  const [output, setOutput] = useState<string>("");
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [isRunningSave, setIsRunningSave] = useState<boolean>(false);
  const [selectedLanguage, setSelectedLanguage] = useState<string>("python");
  const [isOwner, setIsOwner] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<string>("output");

  // Removed WebRTC State (activeMic, activeVideo, connections, remoteStreams, remotePeers, isSettingUpMedia)

  // --- Refs ---
  const editorRef = useRef<any>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  // Removed WebRTC Refs (localStreamRef, mediaLockRef, pendingCandidatesRef, localVideoRef)


  // --- Editor and Core Logic Callbacks ---
  const handleEditorDidMount = (editor: any) => {
    editorRef.current = editor;
  };

  const handleEditorChange = useCallback(
    (value: string | undefined) => {
      if (value === undefined) return;
      setCode(value);
      socket.emit("code_change", { roomId, code: value, userId: user?.id });
    },
    [roomId, user?.id]
  );

  const handleCursorChange = useCallback(
    (position: { lineNumber: number; column: number }) => {
      socket.emit("cursor_change", {
        roomId,
        userId: user?.id,
        position,
      });
    },
    [roomId, user?.id]
  );

  const handleLanguageChange = useCallback(
    (language: string) => {
      setSelectedLanguage(language);
      socket.emit("language_change", { roomId, language, userId: user?.id });
    },
    [roomId, user?.id]
  );

  const handleSendMessage = useCallback(async () => {
    if (newMessage.trim() && user) {
      try {
        const response = await api.post(`/rooms/${roomId}/messages`, {
          message: newMessage,
          username: user.username || user.id,
        });
        // Message will be broadcasted via socket, no need to setMessages here
        setNewMessage("");
      } catch (error) {
        console.error("Failed to send message:", error);
      }
    }
  }, [newMessage, roomId, user]);

  const handleRunCode = useCallback(async () => {
    setIsRunning(true);
    setOutput("Running code...");
    try {
      const response = await api.post("/execute", {
        language: selectedLanguage,
        code,
      });
      setOutput(response.data.output);
    } catch (error: any) {
      setOutput(
        `Error: ${error.response?.data?.error || error.message || "Unknown error"}`
      );
    } finally {
      setIsRunning(false);
      setActiveTab("output");
    }
  }, [code, selectedLanguage]);

  const handleSaveCode = useCallback(async () => {
    if (!isOwner) {
      alert("Only the room owner can save the code.");
      return;
    }
    setIsRunningSave(true);
    try {
      await api.post(`/rooms/${roomId}/code`, { code, language: selectedLanguage });
      socket.emit("code_saved_confirmation", { roomId }); // Inform others
      alert("Code saved successfully!");
    } catch (error) {
      console.error("Failed to save code:", error);
      alert("Failed to save code.");
    } finally {
      setIsRunningSave(false);
    }
  }, [code, selectedLanguage, roomId, isOwner]);

  const handleLeaveRoom = useCallback(() => {
    socket.emit("leave_room", { roomId, userId: user?.id });
    router.push("/");
  }, [roomId, user?.id, router]);

  const handleRefreshCode = useCallback(async () => {
    try {
      const response = await api.get(`/rooms/${roomId}/code`);
      const { code: fetchedCode, language: fetchedLanguage } = response.data;
      setCode(fetchedCode);
      setSelectedLanguage(fetchedLanguage);
      if (editorRef.current) {
         editorRef.current.setValue(fetchedCode);
      }
      socket.emit("code_change", { roomId, code: fetchedCode, userId: user?.id });
      socket.emit("language_change", { roomId, language: fetchedLanguage, userId: user?.id });
    } catch (error) {
      console.error("Failed to refresh code:", error);
    }
  }, [roomId, user?.id]);


  // --- Effects ---
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  // Removed WebRTC related useEffects for media setup and peer connection updates

  useEffect(() => {
    if (!roomId || !user?.id) return;

    console.log(`User ${user.id} attempting to join room ${roomId}`);
    socket.emit("join_room", { roomId, userId: user.id, username: user.username });

    // Socket event handlers
    const onConnect = () => console.log("Socket connected");
    const onDisconnect = () => console.log("Socket disconnected");
    
    const onRoomJoined = (data: { userCount: number, isOwner: boolean, initialCode?: string, initialLanguage?: string }) => {
      console.log("Successfully joined room:", data);
      setUserNumber(data.userCount);
      setIsOwner(data.isOwner);
      if (data.initialCode && editorRef.current && editorRef.current.getValue() !== data.initialCode) {
        setCode(data.initialCode);
        if (editorRef.current) editorRef.current.setValue(data.initialCode);
      }
      if (data.initialLanguage) {
        setSelectedLanguage(data.initialLanguage);
      }
    };

    const onUserJoinedRoom = (data: UserJoinedRoomData): void => {
      if (data.userId && data.userId !== user?.id) {
        console.log(`User ${data.username || data.userId} joined. Current count: ${data.userCount}`);
        if (data.userCount !== undefined) setUserNumber(data.userCount);
      } else if (data.userId === user?.id && data.userCount !== undefined) {
        setUserNumber(data.userCount);
      }
    };

    const onUserLeftRoom = (data: UserLeftRoomData): void => {
      if (data.userId && data.userId !== user?.id) {
        console.log(`User ${data.userId} left. Current count: ${data.userCount}`);
        if (data.userCount !== undefined) setUserNumber(data.userCount);
      }
    };
    
    const onUserCodeChange = (data: { userId: string; code: string }) => {
      if (data.userId !== user?.id) {
        setCode(data.code);
        if (editorRef.current && editorRef.current.getValue() !== data.code) {
          const currentPosition = editorRef.current.getPosition();
          editorRef.current.setValue(data.code);
          if (currentPosition) editorRef.current.setPosition(currentPosition);
        }
      }
    };

    const onUserCursorChange = (data: { userId: string; position: { lineNumber: number; column: number } }) => {
      if (data.userId !== user?.id) {
        setRemoteCursors((prev) =>
          prev.filter((c) => c.userId !== data.userId).concat({
            userId: data.userId,
            lineNumber: data.position.lineNumber,
            column: data.position.column
          })
        );
      }
    };
    
    const onUserLanguageChange = (data: { userId: string; language: string }) => {
      if (data.userId !== user?.id) {
        setSelectedLanguage(data.language);
      }
    };

    const onCodeSaved = () => {
      alert("The room owner has saved the code.");
      handleRefreshCode(); // Refresh to get the latest saved version
    };

    const onReceiveMessage = (message: Message) => {
      setMessages((prevMessages) => [...prevMessages, message]);
    };
    
    const onUserCountUpdate = (data: UserCountData) => {
      setUserNumber(data.count);
    };

    const onSetOwner = (data: { ownerId: string }) => {
      setIsOwner(data.ownerId === user?.id);
    };

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("room_joined", onRoomJoined);
    socket.on("user_joined_room", onUserJoinedRoom);
    socket.on("user_left_room", onUserLeftRoom);
    // Removed socket.on("signal", onSignal);
    socket.on("user_code_change", onUserCodeChange);
    socket.on("user_cursor_change", onUserCursorChange);
    socket.on("user_language_change", onUserLanguageChange);
    socket.on("code_saved", onCodeSaved);
    socket.on("receive_message", onReceiveMessage);
    socket.on("user_count_update", onUserCountUpdate);
    socket.on("set_owner", onSetOwner);

    // Fetch initial messages
    api.get(`/rooms/${roomId}/messages`)
      .then(response => setMessages(response.data))
      .catch(error => console.error("Failed to fetch initial messages:", error));

    // Fetch initial code
     api.get(`/rooms/${roomId}/code`)
      .then(response => {
        const { code: initialCode, language: initialLanguage, ownerId } = response.data;
        if (editorRef.current && editorRef.current.getValue() !== initialCode) {
            setCode(initialCode);
            if (editorRef.current) editorRef.current.setValue(initialCode);
        }
        setSelectedLanguage(initialLanguage);
        setIsOwner(ownerId === user?.id);
      })
      .catch(error => console.error("Failed to fetch initial code:", error));


    return () => {
      console.log("Cleaning up CodeCollabRoom effects, leaving room:", roomId);
      socket.emit("leave_room", { roomId, userId: user?.id });
      
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("room_joined", onRoomJoined);
      socket.off("user_joined_room", onUserJoinedRoom);
      socket.off("user_left_room", onUserLeftRoom);
      // Removed socket.off("signal", onSignal);
      socket.off("user_code_change", onUserCodeChange);
      socket.off("user_cursor_change", onUserCursorChange);
      socket.off("user_language_change", onUserLanguageChange);
      socket.off("code_saved", onCodeSaved);
      socket.off("receive_message", onReceiveMessage);
      socket.off("user_count_update", onUserCountUpdate);
      socket.off("set_owner", onSetOwner);
    };
  }, [roomId, user, router, isOwner, handleRefreshCode]); // Added handleRefreshCode as a dependency

  if (!user) {
    return (
      <div className="flex items-center justify-center h-screen">
        Loading user...
      </div>
    );
  }

  return (
    <TooltipProvider>
  <div className="flex flex-col h-screen bg-zinc-950 text-zinc-100">
    {/* Header */}
    <header className="p-4 border-b border-zinc-800 flex flex-wrap gap-3 justify-between items-start sm:items-center">
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-4">
        <div className="flex items-center gap-3">
          <Code className="h-6 w-6 text-indigo-400" />
          <h1 className="text-xl font-medium">
            Room: <span className="text-indigo-400 font-semibold">{roomId}</span>
          </h1>
        </div>
        <div className="flex items-center gap-2 bg-zinc-900 px-3 py-1 rounded-full text-sm">
          <Users className="h-4 w-4 text-zinc-400" />
          <span className="font-medium">{userNumber}</span>
        </div>
      </div>
      <Button 
        variant="outline" 
        size="sm" 
        onClick={handleLeaveRoom} 
        className="flex items-center mt-2 sm:mt-0 border-zinc-700 hover:bg-zinc-800 hover:text-red-400 transition-colors"
      >
        <LogOut className="mr-2 h-4 w-4" /> Leave Room
      </Button>
    </header>

    {/* Main Content */}
    <div className="flex flex-col lg:flex-row flex-1 overflow-hidden">
      {/* Left Pane */}
      <div className="flex flex-col flex-1 w-full lg:w-2/3 p-3 space-y-3">
        {/* Editor Controls */}
        <div className="flex flex-col md:flex-row justify-between gap-3 p-3 bg-zinc-900 rounded-lg shadow-md">
          <div className="flex flex-wrap gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={handleRunCode} 
                  disabled={isRunning}
                  className="bg-zinc-800 border-zinc-700 hover:bg-zinc-700 hover:border-zinc-600"
                >
                  {isRunning ? (
                    <RefreshCw className="mr-2 h-4 w-4 animate-spin text-indigo-400" />
                  ) : (
                    <Terminal className="mr-2 h-4 w-4 text-indigo-400" />
                  )}
                  Run
                </Button>
              </TooltipTrigger>
              <TooltipContent className="bg-zinc-800 border-zinc-700">
                <p>Execute Code</p>
              </TooltipContent>
            </Tooltip>

            {isOwner && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={handleSaveCode} 
                    disabled={isRunningSave}
                    className="bg-zinc-800 border-zinc-700 hover:bg-zinc-700 hover:border-zinc-600"
                  >
                    {isRunningSave ? (
                      <RefreshCw className="mr-2 h-4 w-4 animate-spin text-indigo-400" />
                    ) : (
                      <Save className="mr-2 h-4 w-4 text-indigo-400" />
                    )}
                    Save
                  </Button>
                </TooltipTrigger>
                <TooltipContent className="bg-zinc-800 border-zinc-700">
                  <p>Save Code (Owner only)</p>
                </TooltipContent>
              </Tooltip>
            )}

            <Tooltip>
              <TooltipTrigger asChild>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={handleRefreshCode}
                  className="bg-zinc-800 border-zinc-700 hover:bg-zinc-700 hover:border-zinc-600"
                >
                  <RefreshCw className="mr-2 h-4 w-4 text-indigo-400" /> Refresh Code
                </Button>
              </TooltipTrigger>
              <TooltipContent className="bg-zinc-800 border-zinc-700">
                <p>Fetch latest saved code</p>
              </TooltipContent>
            </Tooltip>
          </div>

          <div className="w-full md:w-40">
            <Select value={selectedLanguage} onValueChange={handleLanguageChange}>
              <SelectTrigger className="bg-zinc-800 border-zinc-700 w-full hover:border-indigo-500 transition-colors focus:ring-1 focus:ring-indigo-500">
                <SelectValue placeholder="Language" />
              </SelectTrigger>
              <SelectContent className="bg-zinc-800 text-zinc-100 border-zinc-700">
                <SelectItem value="python">Python</SelectItem>
                <SelectItem value="javascript">JavaScript</SelectItem>
                <SelectItem value="java">Java</SelectItem>
                <SelectItem value="csharp">C#</SelectItem>
                <SelectItem value="cpp">C++</SelectItem>
                <SelectItem value="ruby">Ruby</SelectItem>
                <SelectItem value="go">Go</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Editor */}
        <div className="flex-1 min-h-[200px] rounded-lg overflow-hidden shadow-lg border border-zinc-800">
          <MonacoEditor
            language={selectedLanguage}
            value={code}
            onChange={handleEditorChange}
            onMount={handleEditorDidMount}
            theme="vs-dark"
            options={{
              fontSize: 14,
              fontFamily: 'JetBrains Mono, Consolas, monospace',
              minimap: { enabled: true },
              scrollBeyondLastLine: false,
              lineNumbers: 'on',
              renderLineHighlight: 'all',
              cursorBlinking: 'smooth',
              cursorStyle: 'line',
              smoothScrolling: true,
              padding: { top: 10 }
            }}
          />
        </div>

        {/* Output Tabs */}
        <div className="h-48 md:h-1/4 lg:h-1/5 bg-zinc-900 rounded-lg shadow-md border border-zinc-800">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full flex flex-col">
            <TabsList className="bg-zinc-800 rounded-t-lg rounded-b-none border-b border-zinc-700 p-1">
              <TabsTrigger 
                value="output"
                className="data-[state=active]:bg-zinc-900 data-[state=active]:text-indigo-400 data-[state=active]:shadow-none"
              >
                Output
              </TabsTrigger>
              <TabsTrigger 
                value="terminal" 
                disabled
                className="opacity-50 cursor-not-allowed"
              >
                Terminal (Soon)
              </TabsTrigger>
            </TabsList>
            <TabsContent 
              value="output" 
              className="flex-1 overflow-auto p-3 text-sm bg-zinc-900 rounded-b-lg"
            >
              <pre className="whitespace-pre-wrap font-mono text-zinc-300">{output || "Code output will appear here."}</pre>
            </TabsContent>
            <TabsContent 
              value="terminal" 
              className="flex-1 overflow-auto p-3 text-sm bg-zinc-900 rounded-b-lg"
            >
              <p className="text-zinc-400 italic">Interactive terminal coming soon!</p>
            </TabsContent>
          </Tabs>
        </div>
      </div>

      {/* Right Pane: Chat */}
      <div className="flex flex-col w-full lg:w-1/3 p-3 border-t lg:border-t-0 lg:border-l border-zinc-800">
        <div className="flex flex-col flex-1 bg-zinc-900 rounded-lg overflow-hidden shadow-md border border-zinc-800">
          <h2 className="p-3 text-lg font-medium border-b border-zinc-800 flex items-center">
            <MessageSquare className="h-5 w-5 mr-2 text-indigo-400" />
            <span>Chat</span>
          </h2>
          <ScrollArea className="flex-1 p-3">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`mb-3 p-3 rounded-lg max-w-[85%] break-words shadow-sm ${
                  msg.username === user?.fullName 
                    ? 'bg-indigo-600 ml-auto' 
                    : 'bg-zinc-800 mr-auto border border-zinc-700'
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <div className="h-6 w-6 rounded-full bg-zinc-700 flex items-center justify-center text-xs font-bold">
                    {msg.username.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex flex-col">
                    <p className="text-xs font-medium">
                      {msg.username}
                    </p>
                    <p className="text-xs text-zinc-400">
                      {new Date(msg.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                    </p>
                  </div>
                </div>
                <p className="text-sm">{msg.message}</p>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </ScrollArea>
          <Separator className="bg-zinc-800" />
          <div className="p-3">
            <div className="flex items-center gap-2 bg-zinc-800 rounded-lg p-1 border border-zinc-700 focus-within:border-indigo-500 transition-colors">
              <Input
                type="text"
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                placeholder="Type a message..."
                onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                className="bg-transparent border-0 focus-visible:ring-0 focus-visible:ring-offset-0 w-full"
              />
              <Button 
                onClick={handleSendMessage} 
                size="sm"
                className="bg-indigo-600 hover:bg-indigo-700 rounded-md p-2 h-8 w-8"
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</TooltipProvider>
);
}