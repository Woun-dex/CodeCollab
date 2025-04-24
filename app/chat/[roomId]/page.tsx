"use client"
import React, { useState, useEffect, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { io } from "socket.io-client"
import { OnMount } from '@monaco-editor/react'
import { useUser } from "@clerk/clerk-react"
import axios from "axios"
import MonacoEditor from '@/components/MonacoEditor'
import { ScrollArea } from "@/components/ui/scroll-area"
import { Check, Code, LogOut, Send, RefreshCw, User, Users, Terminal , Save } from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Separator } from "@/components/ui/separator"

const cursorStyles = `
  .remote-cursor-decoration {
    background-color: #ff000050;
    width: 2px !important;
    margin-left: 0;
    border-left: 2px solid red;
  }
  .remote-cursor-margin {
    width: 5px;
    background-color: red;
  }
  
  /* Custom color themes for different users */
  .remote-cursor-user1 { border-left-color: #FF5733; }
  .remote-cursor-user2 { border-left-color: #33FF57; }
  .remote-cursor-user3 { border-left-color: #3357FF; }
  .remote-cursor-user4 { border-left-color: #F033FF; }
  .remote-cursor-user5 { border-left-color: #FF33A8; }
`;

// Add a style tag to the document
if (typeof document !== 'undefined') {
  const style = document.createElement('style');
  style.innerHTML = cursorStyles;
  document.head.appendChild(style);
}

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
  const [code, setCode] = useState('# Start coding here...\n\n# Example Python code\ndef greet(name):\n    return f"Hello, {name}!"\n\n# Print greeting\nprint(greet("CodeCollab User"))\n');
  const editorRef = useRef<any>(null);
  const [remoteCursors, setRemoteCursors] = useState<
    { userId: string; lineNumber: number; column: number }[]
  >([]);
  const [userNumber, setUserNumber] = useState(0);
  const [output, setOutput] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [isRunning_s, setIsRunning_s] = useState(false);
  const [selectedLanguage, setSelectedLanguage] = useState('python');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleEditorChange = (value: string | undefined) => {
    if (value !== undefined) {
      setCode(value);
      socket.emit("send_code", { 
        roomId, 
        code: value 
      });
    }
  };
  
  const decorationIdsRef = useRef<string[]>([]);
  
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
        const decorations = remoteCursors.map((cursor, index) => ({
          range: new monaco.Range(cursor.lineNumber, cursor.column, cursor.lineNumber, cursor.column),
          options: {
            isWholeLine: false,
            className: `remote-cursor-user${(index % 5) + 1}`,
            hoverMessage: { value: `${cursor.userId} is here` },
          },
        }));
        decorationIdsRef.current = editor.deltaDecorations(decorationIdsRef.current, decorations);
      }
    };

    // Update decorations more frequently
    updateDecorations();
    const interval = setInterval(updateDecorations, 50);
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

  const saveCode = async () => {
    try {
      setIsRunning_s(true);
      if (typeof code!== "string" ||!code) {
        throw new Error("Invalid code: Code must be a non-empty string");
      }

      const response = await api.post("/save", {
        code: code,
        roomId: roomId,
      });
      console.log("Code saved successfully:", response.data);
    } catch (error:any) {
      console.error("Error saving code:", error);
    } finally {
      setIsRunning_s(false);
    }
  }

  const runCode = async () => {
    try {
      setIsRunning(true);
      setOutput('Running code...');
      
      if (typeof code !== "string" || !code) {
        throw new Error("Invalid code: Code must be a non-empty string");
      }
  
      const response = await api.post("/run", {
        code: code,
        language: selectedLanguage,
      });
  
      setOutput(response.data.output || "Code executed successfully with no output");
    } catch (error:any) {
      console.error("Error running code:", error);
      if (error.response) {
        setOutput(`Error: ${error.response.data.error || error.response.data.details || 'Execution failed'}`);
      } else {
        setOutput(`Error: ${error.message || 'Failed to run code'}`);
      }
    } finally {
      setIsRunning(false);
    }
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
    
    // Listen for user count updates
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
    <div className="flex flex-col h-screen bg-background">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-3 border-b bg-secondary/20">
        <div className="flex items-center gap-2">
          <Code className="h-5 w-5 text-primary" />
          <h1 className="text-xl font-bold">CodeCollab</h1>
          <Separator orientation="vertical" className="h-6 mx-2" />
          <div className="text-sm text-muted-foreground">Room: <span className="font-semibold text-foreground">{roomId}</span></div>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-green-500" />
            <span className="text-sm font-medium">{userNumber} Active</span>
          </div>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={handleLogout}
            className="flex items-center gap-1"
          >
            <LogOut className="h-4 w-4" />
            <span>Leave Room</span>
          </Button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left panel - Chat */}
        <div className="flex flex-col w-1/3 border-r">
          <div className="p-3 border-b bg-secondary/10 flex items-center justify-between">
            <h2 className="text-md font-medium flex items-center gap-2">
              <User className="h-4 w-4" /> Chat
            </h2>
          </div>
          
          <ScrollArea className="flex-1 px-3 py-2">
            <div className="space-y-4 pb-2">
              {messages.map((msg) => {
                const isUser = msg.username === user?.fullName;
                const time = new Date(msg.createdAt).toLocaleTimeString([], { 
                  hour: '2-digit', 
                  minute: '2-digit' 
                });

                return (
                  <div key={msg.id} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
                    <div
                      className={`max-w-[80%] rounded-lg px-3 py-2 relative ${
                        isUser
                          ? 'bg-primary text-primary-foreground rounded-br-none'
                          : 'bg-muted text-foreground rounded-bl-none'
                      }`}
                    >
                      <div className="text-xs font-medium mb-1">{isUser ? 'You' : msg.username}</div>
                      <div className="text-sm whitespace-pre-wrap break-words">{msg.message}</div>
                      <div className="text-xs mt-1 opacity-70 text-right">{time}</div>
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>
          </ScrollArea>

          <form onSubmit={handleSubmit} className="p-3 border-t bg-background">
            <div className="flex gap-2">
              <Input
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                placeholder="Type a message..."
                className="flex-1"
              />
              <Button type="submit" size="icon">
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </form>
        </div>

        {/* Right panel - Editor & Output */}
        <div className="flex flex-col w-2/3">
          <Tabs defaultValue="editor" className="flex flex-col flex-1">
            <div className="p-2 border-b bg-secondary/10">
              <div className="flex justify-between items-center">
                <TabsList>
                  <TabsTrigger value="editor" className="flex items-center gap-1">
                    <Code className="h-4 w-4" />
                    Editor
                  </TabsTrigger>
                  <TabsTrigger value="output" className="flex items-center gap-1">
                    <Terminal className="h-4 w-4" />
                    Output
                  </TabsTrigger>
                </TabsList>
                
                <div className="flex items-center gap-2">
                  <select
                    value={selectedLanguage}
                    onChange={(e) => setSelectedLanguage(e.target.value)}
                    className="text-xs border rounded px-2 py-1 bg-background"
                  >
                    <option value="python">Python</option>
                    <option value="javascript">JavaScript</option>
                  </select>
                  <Button 
                    variant="default" 
                    size="sm" 
                    onClick={runCode}
                    disabled={isRunning}
                    className="flex items-center gap-1"
                  >
                    {isRunning ? (
                      <RefreshCw className="h-4 w-4 animate-spin" />
                    ) : (
                      <Check className="h-4 w-4" />
                    )}
                    <span>Run Code</span>
                  </Button>
                  <Button 
                    variant="default" 
                    size="sm" 
                    onClick={saveCode}
                    disabled={isRunning_s}
                    className="flex items-center gap-1"
                  >
                    {isRunning_s ? (
                      <RefreshCw className="h-4 w-4 animate-spin" />
                    ) : (
                      <Save className="h-4 w-4" />
                    )}
                    <span>Save Code</span>
                  </Button>
                </div>
              </div>
            </div>
            
            <TabsContent value="editor" className="flex-1 p-0 m-0 overflow-hidden">
              <MonacoEditor
                height="100%"
                defaultLanguage={selectedLanguage}
                value={code}
                onChange={handleEditorChange}
                theme="vs-dark"
                onMount={handleMount}
              />
            </TabsContent>
            
            <TabsContent value="output" className="flex-1 p-0 m-0 overflow-hidden">
              <div className="h-full overflow-auto bg-black p-4">
                <pre className="text-sm text-green-400 font-mono whitespace-pre-wrap">
                  {output || "Code output will appear here after running"}
                </pre>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}