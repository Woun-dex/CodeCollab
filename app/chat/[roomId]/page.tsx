"use client"
import React, { useState, useEffect, useRef } from 'react'
import { useParams , useRouter  } from 'next/navigation'
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { io } from "socket.io-client"
import { OnMount } from '@monaco-editor/react'
import { useUser } from "@clerk/clerk-react"
import axios from "axios"
import MonacoEditor from '@/components/MonacoEditor'
import { ScrollArea } from "@/components/ui/scroll-area"
import { LogOut } from "lucide-react"

// Create socket connection
const socket = io("http://localhost:8000", {
  autoConnect: true,
  reconnection: true
});

// Create axios instance
const api = axios.create({
  baseURL: "http://localhost:8000/api",
});

interface Message {
  id: number;
  message: string;
  username: string;
  createdAt: Date;
}

interface EditorProps {
  height?: string;
  defaultLanguage?: string;
  value?: string;
  onChange?: (value: string | undefined) => void;
  theme?: string;
  roomId: string;
  username: string;
  onMount?: OnMount;
}

// Editor component removed from main file and simplified
function Editor({
  height = '100%',
  defaultLanguage = 'python',
  value,
  onChange,
  theme = 'vs-dark',
  onMount
}: EditorProps) {
  return (
    <MonacoEditor
      height={height}
      defaultLanguage={defaultLanguage}
      value={value}
      onChange={onChange}
      theme={theme}
      onMount={onMount}
    />
  );
}

export default function Page() {
  const { roomId } = useParams();
  const router = useRouter();
  const { user } = useUser();
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [code, setCode] = useState('// Start coding here...\n');
  const editorRef = useRef<any>(null);
  const [remoteCursors, setRemoteCursors] = useState<
    { userId: string; lineNumber: number; column: number }[]
  >([]);
  const [userNumber, setUserNumber] = useState(0);

  console.log(user);

  const handleEditorChange = (value: string | undefined) => {
    if (value !== undefined) {
      setCode(value);
      socket.emit("send_code", { 
        roomId, 
        code: value 
      });
    }
  };

  // Handle editor mounting and cursor tracking
  const handleMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;

    // Emit cursor position changes
    editor.onDidChangeCursorPosition((e) => {
      const { lineNumber, column } = e.position;
      socket.emit('send_cursor', { 
        roomId, 
        lineNumber, 
        column, 
        username: user?.fullName 
      });
    });

    // Visualize remote cursors using Monaco decorations
    const updateDecorations = () => {
      if (editor && monaco) {
        const decorations = remoteCursors.map((cursor) => ({
          range: new monaco.Range(cursor.lineNumber, cursor.column, cursor.lineNumber, cursor.column),
          options: {
            isWholeLine: false,
            className: `remote-cursor-${cursor.userId.replace(/[^a-zA-Z0-9]/g, '')}`,
            hoverMessage: { value: `User: ${cursor.userId}` },
          },
        }));
        editor.deltaDecorations([], decorations);
      }
    };

    // Update decorations periodically
    updateDecorations();
    const interval = setInterval(updateDecorations, 100);
    return () => clearInterval(interval);
  };

  const handleLogout = () => {
    // Emit leave_room event to the server
    if (roomId && user?.fullName) {
      socket.emit("leave_room", { roomId, username: user.fullName });
    }
    
    // Redirect to home or rooms list page
    router.push('/dashboard');
  };

  // Load existing messages and code
  useEffect(() => {
    const loadMessages = async () => {
      try {
        const { data } = await api.get(`/rooms/${roomId}/messages`);
        setMessages(data);
      } catch (error) {
        console.error("Error loading messages:", error);
      }
    };
    
    const loadCode = async () => {
      try {
        const { data } = await api.get(`/rooms/${roomId}/code`);
        if (data && data.length > 0) {
          setCode(data[0].code);
        }
      } catch (error) {
        console.error("Error loading code:", error);
      }
    };
    
    if (roomId) {
      loadMessages();
      loadCode();
    }
  }, [roomId]);

  // Socket connection and event handlers
  useEffect(() => {
    if (roomId && user?.fullName) {
      // Join the room
      socket.emit("join_room", { roomId, username: user.fullName });
      
      // Request current user count
      socket.emit("get_user_count", { roomId });
    }

    // Listen for messages
    socket.on("receive_message", (data: Message) => {
      setMessages(prev => [...prev, data]);
    });

    // Listen for code updates
    socket.on("receive_code", (data: { code: string }) => {
      if (data.code !== code) {
        setCode(data.code);
      }
    });

    // Listen for cursor updates
    socket.on('receive_cursor', ({ lineNumber, column, username: remoteUsername }) => {
      if (remoteUsername !== user?.fullName) {
        setRemoteCursors((prev) => {
          const updated = prev.filter((cursor) => cursor.userId !== remoteUsername);
          return [...updated, { userId: remoteUsername, lineNumber, column }];
        });
      }
    });
    
    // Listen for user count updates - fixed property name
    socket.on("user_count", (data: { count: number, roomId: string }) => {
      setUserNumber(data.count);
    });
    
    // Listen for real-time user count updates
    socket.on("user_count_update", (data: { count: number, roomId: string }) => {
      setUserNumber(data.count);
    });
    
    // Listen for user join events
    socket.on("user_joined", (data: { username: string, socketId: string, userCount: number }) => {
      // Update user count from join event
      setUserNumber(data.userCount);
    });

    return () => {
      socket.off("receive_message");
      socket.off("receive_code");
      socket.off("receive_cursor");
      socket.off("user_count");
      socket.off("user_count_update");
      socket.off("user_joined");
    };
  }, [roomId, user?.fullName, code]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !user?.fullName) return;

    socket.emit("send_message", { 
      roomId, 
      text: newMessage,
      username: user.fullName
    });
    setNewMessage("");
  };

  return (
    <div className="flex h-screen bg-background">
      {/* Chat Section */}
      <div className="flex flex-col w-1/3 border-r overflow-hidden">
        <div className="p-4 border-b">
          <h2 className="text-xl font-semibold">Chat Room: {roomId}</h2>
          <div className='flex justify-between'>
          <div className="flex gap-1 items-center">
            <div className="w-2 h-2 bg-green-500 rounded-full"></div>
            <p className="text-xs">Active Users: {userNumber}</p>
          </div>
          <Button 
              variant="outline" 
              size="sm" 
              onClick={handleLogout}
              className="flex items-center gap-1"
            >
              <LogOut className="h-4 w-4" />
              <span>Leave</span>
          </Button>
          </div>
        </div>
        
        <ScrollArea className="flex-1 p-4 overflow-hidden">
          <div className="space-y-4">
            {messages.map((msg) => {
              const isUser = msg.username === user?.fullName;
              const time = new Date(msg.createdAt).toLocaleTimeString([], { 
                hour: '2-digit', 
                minute: '2-digit' 
              });

              return (
                <div key={msg.id} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`max-w-[75%] rounded-lg px-4 py-2 relative ${
                      isUser
                        ? 'bg-primary text-primary-foreground rounded-br-none'
                        : 'bg-muted text-foreground rounded-bl-none'
                    }`}
                  >
                    <div className="text-sm font-medium mb-1">{msg.username}</div>
                    <div className="text-sm">{msg.message}</div>
                    <div className="text-xs mt-1 opacity-70 text-right">{time}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </ScrollArea>

        <form onSubmit={handleSubmit} className="p-4 border-t">
          <div className="flex gap-2">
            <Input
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              placeholder="Type a message..."
              className="flex-1"
            />
            <Button type="submit">Send</Button>
          </div>
        </form>
      </div>

      {/* Code Editor Section */}
      <div className="flex flex-col w-2/3">
        <div className="p-4 border-b">
          <h2 className="text-xl font-semibold">Code Editor</h2>
        </div>
        <div className="flex-1">
          <MonacoEditor
            height="100%"
            defaultLanguage="python"
            value={code}
            onChange={handleEditorChange}
            theme="vs-dark"
            onMount={handleMount}
          />
        </div>
      </div>
    </div>
  );
}