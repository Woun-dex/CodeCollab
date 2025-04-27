"use client";
import React, { useState, useEffect, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { io } from "socket.io-client";
import { useUser } from "@clerk/clerk-react";
import axios from "axios";
import MonacoEditor from "@/components/MonacoEditor";
import { Check, Code, LogOut, Send, RefreshCw, User, Users, Terminal, Save, Mic, MicOff, Video, VideoOff } from "lucide-react";



const socket = io("https://codecollabbackend-production-e138.up.railway.app", {
  autoConnect: true,
  reconnection: true,
});

const api = axios.create({
  baseURL: "https://codecollabbackend-production-e138.up.railway.app/api",
});

interface Message {
  id: number;
  message: string;
  username: string;
  createdAt: Date;
}

const configuration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    {
      urls: "turn:openrelay.metered.ca:80",
      username: "openrelayproject",
      credential: "openrelayproject",
    },
  ],
};

export default function CodeCollabRoom() {
  const { roomId } = useParams();
  const router = useRouter();
  const { user } = useUser();
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [code, setCode] = useState(
    '# Start coding here...\n\n# Example Python code\ndef greet(name):\n    return f"Hello, {name}!"\n\n# Print greeting\nprint(greet("CodeCollab User"))\n'
  );
  const [remoteCursors, setRemoteCursors] = useState<
    { userId: string; lineNumber: number; column: number }[]
  >([]);
  const [userNumber, setUserNumber] = useState(0);
  const [output, setOutput] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const [isRunning_s, setIsRunning_s] = useState(false);
  const [selectedLanguage, setSelectedLanguage] = useState("python");
  const [isOwner, setIsOwner] = useState(false);
  const [activeMic, setActiveMic] = useState(false);
  const [activeVideo, setActiveVideo] = useState(false);
  const [connections, setConnections] = useState<{[key: string]: RTCPeerConnection}>({});
  const [remoteStreams, setRemoteStreams] = useState<{[key: string]: MediaStream}>({});
  const [remotePeers, setRemotePeers] = useState<string[]>([]);
  
  // Added to track media setup state
  const [isSettingUpMedia, setIsSettingUpMedia] = useState(false);

  const editorRef = useRef<any>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const decorationIdsRef = useRef<string[]>([]);
  
  // Add this to track media acquire lock
  const mediaLockRef = useRef<boolean>(false);

  // Setup new peer connection
  const createPeerConnection = (peerId: string) => {
    const pc = new RTCPeerConnection(configuration);
    
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit("signal", {
          roomId,
          signal: { candidate: event.candidate },
          fromId: user?.id,
          targetId: peerId
        });
      }
    };

    pc.ontrack = (event) => {
      if (event.streams[0]) {
        setRemoteStreams(prev => ({
          ...prev,
          [peerId]: event.streams[0]
        }));
      }
    };

    // Add local tracks if available
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => {
        if (track.readyState === "live") {
          pc.addTrack(track, localStreamRef.current!);
        }
      });
    }

    return pc;
  };

  // Handle new user joining
  const handleUserJoined = (userId: string) => {
    if (userId !== user?.id && !connections[userId]) {
      const newPc = createPeerConnection(userId);
      
      setConnections(prev => ({
        ...prev,
        [userId]: newPc
      }));
      
      // If we have media, initiate call
      if (localStreamRef.current && (activeMic || activeVideo)) {
        handleCall(userId, newPc);
      }
    }
  };

  // Initiate call to peer
  const handleCall = async (peerId: string, peerConnection?: RTCPeerConnection) => {
    const pc = peerConnection || connections[peerId];
    if (!pc) return;
    
    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      
      socket.emit("signal", {
        roomId,
        signal: { sdp: pc.localDescription },
        fromId: user?.id,
        targetId: peerId
      });
    } catch (error) {
      console.error("Error creating offer:", error);
    }
  };

  // Handle WebRTC signaling
  useEffect(() => {
    socket.on("signal", async (data) => {
      const { fromId, signal } = data;
      
      try {
        // Create new connection if it doesn't exist
        if (!connections[fromId]) {
          const newPc = createPeerConnection(fromId);
          setConnections(prev => ({
            ...prev,
            [fromId]: newPc
          }));
        }
        
        const pc = connections[fromId];
        
        if (signal.sdp) {
          await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
          
          if (signal.sdp.type === 'offer') {
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            
            socket.emit("signal", {
              roomId,
              signal: { sdp: pc.localDescription },
              fromId: user?.id,
              targetId: fromId
            });
          }
        } else if (signal.candidate) {
          await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
        }
      } catch (error) {
        console.error("Error handling WebRTC signal:", error);
      }
    });

    socket.on("user_joined", (data) => {
      if (data.userId && data.userId !== user?.id) {
        setRemotePeers(prev => [...prev.filter(id => id !== data.userId), data.userId]);
        handleUserJoined(data.userId);
      }
    });

    socket.on("user_left", (data) => {
      if (data.userId) {
        // Clean up connection
        if (connections[data.userId]) {
          connections[data.userId].close();
          setConnections(prev => {
            const newConnections = {...prev};
            delete newConnections[data.userId];
            return newConnections;
          });
        }
        
        // Remove stream
        setRemoteStreams(prev => {
          const newStreams = {...prev};
          delete newStreams[data.userId];
          return newStreams;
        });
        
        // Remove from peers list
        setRemotePeers(prev => prev.filter(id => id !== data.userId));
      }
    });

    return () => {
      socket.off("signal");
      socket.off("user_joined");
      socket.off("user_left");
      
      // Clean up all media and connections on unmount
      cleanupMedia();
      
      // Close all connections
      Object.values(connections).forEach(conn => conn.close());
    };
  }, [connections, roomId, user?.id]);

  // Clean up media function
  const cleanupMedia = () => {
    // Stop all tracks in local stream
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => {
        track.stop();
      });
      localStreamRef.current = null;
    }
    
    // Clear video element source
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null;
    }
  };

  // Media handling with improved error handling and cleanup
  useEffect(() => {
    // If we're already setting up media, don't start another setup
    if (isSettingUpMedia) return;
    
    const setupMedia = async () => {
      // Prevent concurrent media setup
      if (mediaLockRef.current) return;
      mediaLockRef.current = true;
      
      try {
        setIsSettingUpMedia(true);
        
        // Always clean up existing media first
        cleanupMedia();
        
        // Only request media if needed
        if (!activeMic && !activeVideo) {
          mediaLockRef.current = false;
          setIsSettingUpMedia(false);
          return;
        }
        
        // Create constraints based on what's needed
        const constraints = {
          audio: activeMic ? { 
            echoCancellation: true, 
            noiseSuppression: true 
          } : false,
          video: activeVideo ? { 
            width: { ideal: 320 }, 
            height: { ideal: 240 } 
          } : false,
        };

        console.log("Requesting media with constraints:", constraints);
        
        // Add a delay before getting user media to ensure previous streams are fully released
        await new Promise(resolve => setTimeout(resolve, 500));
        
        try {
          const stream = await navigator.mediaDevices.getUserMedia(constraints);
          localStreamRef.current = stream;

          if (localVideoRef.current && activeVideo) {
            localVideoRef.current.srcObject = stream;
          }
          
          // Update all peer connections with new tracks
          Object.entries(connections).forEach(([peerId, pc]) => {
            const senders = pc.getSenders();
            
            stream.getTracks().forEach((track) => {
              const sender = senders.find(s => s.track && s.track.kind === track.kind);
              
              if (sender) {
                // Replace existing track
                sender.replaceTrack(track);
              } else {
                // Add new track if no sender exists for this track type
                pc.addTrack(track, stream);
              }
            });
            
            // Reinitiate connection with the updated tracks
            handleCall(peerId, pc);
          });
        } catch (error) {
          console.error("Error accessing media devices:", error);
          
          if (error instanceof DOMException) {
            console.error(`DOMException: ${error.name} - ${error.message}`);
            
            // Handle NotReadableError specifically (device in use)
            if (error.name === "NotReadableError") {
              console.error("Camera or microphone is already in use by another application.");
              // Add additional delay and retry once for NotReadableError
              await new Promise(resolve => setTimeout(resolve, 1000));
              try {
                const retryStream = await navigator.mediaDevices.getUserMedia(constraints);
                localStreamRef.current = retryStream;
                
                if (localVideoRef.current && activeVideo) {
                  localVideoRef.current.srcObject = retryStream;
                }
              } catch (retryError) {
                console.error("Retry failed:", retryError);
                // Reset UI state on retry failure
                if (error.message.includes("video")) setActiveVideo(false);
                if (error.message.includes("audio")) setActiveMic(false);
              }
            } else {
              // For other errors, reset the UI state based on error type
              if (error.name === "NotAllowedError") {
                console.error("User denied permission to use media devices");
                setActiveMic(false);
                setActiveVideo(false);
              }
            }
          }
        }
      } finally {
        mediaLockRef.current = false;
        setIsSettingUpMedia(false);
      }
    };

    setupMedia();
  }, [activeMic, activeVideo, connections]);

  // Handle mic and video toggle with debounce to prevent rapid toggling
  const handleMicClick = () => {
    // Prevent toggle if media setup is in progress
    if (isSettingUpMedia) return;
    
    // Toggle mic state
    setActiveMic(prev => !prev);
  };

  const handleVideoClick = () => {
    // Prevent toggle if media setup is in progress
    if (isSettingUpMedia) return;
    
    // Toggle video state
    setActiveVideo(prev => !prev);
  };

  // Socket events
  useEffect(() => {
    if (!roomId || !user?.fullName || !user?.id) return;

    socket.emit("join_room", { roomId, username: user.fullName, userId: user.id });
    socket.emit("get_user_count", { roomId });

    socket.on("receive_message", (data: Message) => {
      setMessages((prev) => [...prev, data]);
    });

    socket.on("receive_code", (data: { code: string }) => {
      if (data.code !== code) {
        setCode(data.code);
      }
    });

    socket.on("receive_cursor", ({ lineNumber, column, username: remoteUsername }) => {
      if (remoteUsername !== user?.fullName) {
        setRemoteCursors((prev) => {
          const updated = prev.filter((cursor) => cursor.userId !== remoteUsername);
          return [...updated, { userId: remoteUsername, lineNumber, column }];
        });
      }
    });

    socket.on("user_count", (data: { count: number }) => {
      setUserNumber(data.count);
    });

    socket.on("user_count_update", (data: { count: number }) => {
      setUserNumber(data.count);
    });

    socket.on("user_joined", (data: { userCount: number }) => {
      setUserNumber(data.userCount);
    });

    return () => {
      socket.off("receive_message");
      socket.off("receive_code");
      socket.off("receive_cursor");
      socket.off("user_count");
      socket.off("user_count_update");
      socket.off("user_joined");
      
      // Properly stop all media tracks
      cleanupMedia();
      
      // Close all connections
      Object.values(connections).forEach(conn => {
        conn.close();
      });
      
      // Leave the room
      socket.emit("leave_room", { roomId, username: user.fullName, userId: user.id });
    };
  }, [roomId, user?.fullName, user?.id, code]);

  // Load initial data
  useEffect(() => {
    const loadData = async () => {
      try {
        const [messagesRes, codeRes, ownerRes] = await Promise.all([
          api.get(`/rooms/${roomId}/messages`),
          api.get(`/rooms/${roomId}/code`),
          api.get(`/rooms/${roomId}/owner`),
        ]);

        setMessages(messagesRes.data);
        if (codeRes.data?.[0]?.code) {
          setCode(codeRes.data[0].code);
        }
        setIsOwner(ownerRes.data === user?.id);
      } catch (error) {
        console.error("Error loading data:", error);
      }
    };

    if (roomId && user?.id) {
      loadData();
    }
  }, [roomId, user?.id]);

  // Auto-scroll messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleEditorChange = (value: string | undefined) => {
    if (value !== undefined) {
      setCode(value);
      socket.emit("send_code", { roomId, code: value });
    }
  };

  const handleMount = (editor: any, monaco: any) => {
    editorRef.current = editor;

    editor.onDidChangeCursorPosition((e: any) => {
      const { lineNumber, column } = e.position;
      socket.emit("send_cursor", {
        roomId,
        lineNumber,
        column,
        username: user?.fullName,
      });
    });

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

    updateDecorations();
    const interval = setInterval(updateDecorations, 100);
    return () => clearInterval(interval);
  };

  const handleLogout = () => {
    // Clean up media first before leaving
    cleanupMedia();
    socket.emit("leave_room", { roomId, username: user?.fullName, userId: user?.id });
    router.push("/dashboard");
  };

  const saveCode = async () => {
    if (!isOwner) return;
    setIsRunning_s(true);
    try {
      await api.post("/save", { code, roomId });
    } catch (error) {
      console.error("Error saving code:", error);
    } finally {
      setIsRunning_s(false);
    }
  };

  const runCode = async () => {
    setIsRunning(true);
    setOutput("Running code...");
    try {
      const response = await api.post("/run", { code, language: selectedLanguage });
      setOutput(response.data.output || "Code executed successfully");
    } catch (error: any) {
      setOutput(error.response?.data?.error || error.message || "Failed to run code");
    } finally {
      setIsRunning(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !user?.fullName) return;

    socket.emit("send_message", {
      roomId,
      text: newMessage,
      username: user.fullName,
    });
    setNewMessage("");
  };

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* Header */}
      <div className="flex items-center justify-between px-3 md:px-6 py-2 md:py-3 border-b bg-secondary/20">
        <div className="flex items-center gap-1 md:gap-2">
          <Code className="h-4 w-4 md:h-5 md:w-5 text-primary" />
          <h1 className="text-lg md:text-xl font-bold">CodeCollab</h1>
          <Separator orientation="vertical" className="h-5 md:h-6 mx-1 md:mx-2" />
          <div className="text-xs md:text-sm text-muted-foreground hidden md:block">
            Room: <span className="font-semibold text-foreground">{roomId}</span>
          </div>
        </div>
        <div className="flex items-center gap-2 md:gap-4">
          <div className="flex items-center gap-1 md:gap-2">
            <Users className="h-3 w-3 md:h-4 md:w-4 text-green-500" />
            <span className="text-xs md:text-sm font-medium">{userNumber} Active</span>
          </div>
          {isOwner && (
            <div className="p-1 px-2 rounded-lg bg-green-400 text-green-900 text-xs">Owner</div>
          )}
          <Button variant="outline" size="sm" onClick={handleLogout} className="flex items-center gap-1">
            <LogOut className="h-3 w-3 md:h-4 md:w-4" />
            <span className="hidden md:inline">Leave Room</span>
          </Button>
        </div>
      </div>

      {/* Mobile Room ID */}
      <div className="md:hidden text-xs px-3 py-1 text-muted-foreground border-b">
        Room: <span className="font-semibold text-foreground">{roomId}</span>
      </div>

      {/* Main content */}
      <div className="flex flex-col md:flex-row flex-1 overflow-hidden">
        {/* Left panel - Chat */}
        <div className="hidden md:flex flex-col w-full md:w-1/3 border-r">
          <div className="p-2 md:p-3 border-b bg-secondary/10 flex items-center justify-between">
            <h2 className="text-sm md:text-md font-medium flex items-center gap-1 md:gap-2">
              <User className="h-3 w-3 md:h-4 md:w-4" /> Chat
            </h2>
          </div>

          <ScrollArea className="flex-1 px-2 md:px-3 py-2">
            <div className="space-y-3 md:space-y-4 pb-2">
              {messages.map((msg) => {
                const isUser = msg.username === user?.fullName;
                const time = new Date(msg.createdAt).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                });

                return (
                  <div key={msg.id} className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
                    <div
                      className={`max-w-[80%] rounded-lg px-2 md:px-3 py-1.5 md:py-2 relative ${
                        isUser
                          ? "bg-primary text-primary-foreground rounded-br-none"
                          : "bg-muted text-foreground rounded-bl-none"
                      }`}
                    >
                      <div className="text-xs font-medium mb-0.5 md:mb-1">{isUser ? "You" : msg.username}</div>
                      <div className="text-xs md:text-sm whitespace-pre-wrap break-words">{msg.message}</div>
                      <div className="text-xs mt-0.5 md:mt-1 opacity-70 text-right">{time}</div>
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>
          </ScrollArea>

          <form onSubmit={handleSubmit} className="p-2 md:p-3 border-t bg-background">
            <div className="flex gap-1 md:gap-2">
              <Input
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                placeholder="Type a message..."
                className="flex-1"
              />
              <Button type="submit" size="icon">
                <Send className="h-3 w-3 md:h-4 md:w-4" />
              </Button>
              <Button 
                onClick={handleMicClick} 
                variant={activeMic ? "default" : "outline"} 
                size="icon"
                disabled={isSettingUpMedia}
              >
                {activeMic ? <Mic className="h-3 w-3 md:h-4 md:w-4" /> : <MicOff className="h-3 w-3 md:h-4 md:w-4" />}
              </Button>
              <Button 
                onClick={handleVideoClick} 
                variant={activeVideo ? "default" : "outline"} 
                size="icon"
                disabled={isSettingUpMedia}
              >
                {activeVideo ? <Video className="h-3 w-3 md:h-4 md:w-4" /> : <VideoOff className="h-3 w-3 md:h-4 md:w-4" />}
              </Button>
            </div>

            {/* Video UI Section */}
            {(activeVideo || Object.keys(remoteStreams).length > 0) && (
              <div className="mt-2 md:mt-3 border rounded-lg p-1 md:p-2 bg-black/5">
                <div className="text-xs font-medium mb-1 md:mb-2 text-muted-foreground">Video Participants</div>
                <div className="grid grid-cols-2 gap-1 md:gap-2">
                  {/* Local video */}
                  {activeVideo && (
                    <div className="relative rounded-lg overflow-hidden bg-black aspect-video shadow-md">
                      <video
                        ref={localVideoRef}
                        autoPlay
                        muted
                        playsInline
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute bottom-1 md:bottom-2 left-1 md:left-2 text-xs bg-black/60 text-white px-1 md:px-2 py-0.5 md:py-1 rounded-md flex items-center gap-0.5 md:gap-1">
                        <User className="h-2.5 w-2.5 md:h-3 md:w-3" />
                        <span className="text-xs">You {activeMic ? "(mic on)" : ""}</span>
                      </div>
                    </div>
                  )}
                  
                  {/* Remote videos */}
                  {Object.entries(remoteStreams).map(([peerId, stream]) => (
                    <div key={peerId} className="relative rounded-lg overflow-hidden bg-black aspect-video shadow-md">
                      <video
                        autoPlay
                        playsInline
                        className="w-full h-full object-cover"
                        ref={(ref) => {
                          if (ref) ref.srcObject = stream;
                        }}
                      />
                      <div className="absolute bottom-1 md:bottom-2 left-1 md:left-2 text-xs bg-black/60 text-white px-1 md:px-2 py-0.5 md:py-1 rounded-md flex items-center gap-0.5 md:gap-1">
                        <User className="h-2.5 w-2.5 md:h-3 md:w-3" />
                        <span className="text-xs">Peer {stream.getAudioTracks().length > 0 ? "(mic on)" : ""}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </form>
        </div>

        {/* Right panel - Editor & Output */}
        <div className="flex flex-col w-full md:w-2/3">
          <Tabs defaultValue="editor" className="flex flex-col flex-1">
            <div className="p-1 md:p-2 border-b bg-secondary/10">
              <div className="flex justify-between items-center flex-wrap gap-2">
                <TabsList>
                  <TabsTrigger value="editor" className="flex items-center gap-1 text-xs md:text-sm">
                    <Code className="h-3 w-3 md:h-4 md:w-4" />
                    Editor
                  </TabsTrigger>
                  <TabsTrigger value="output" className="flex items-center gap-1 text-xs md:text-sm">
                    <Terminal className="h-3 w-3 md:h-4 md:w-4" />
                    Output
                  </TabsTrigger>
                  <TabsTrigger value="chat" className="flex items-center gap-1 text-xs md:text-sm md:hidden">
                    <User className="h-3 w-3 md:h-4 md:w-4" />
                    Chat
                  </TabsTrigger>
                </TabsList>

                <div className="flex items-center gap-1 md:gap-2">
                  <select
                    value={selectedLanguage}
                    onChange={(e) => setSelectedLanguage(e.target.value)}
                    className="text-xs border rounded px-1 md:px-2 py-0.5 md:py-1 bg-background"
                  >
                    <option value="python">Python</option>
                    <option value="javascript">JavaScript</option>
                  </select>
                  <Button
                    variant="default"
                    size="sm"
                    onClick={runCode}
                    disabled={isRunning}
                    className="flex items-center gap-1 text-xs md:text-sm"
                  >
                    {isRunning ? <RefreshCw className="h-3 w-3 md:h-4 md:w-4 animate-spin" /> : <Check className="h-3 w-3 md:h-4 md:w-4" />}
                    <span className="hidden md:inline">Run Code</span>
                    <span className="md:hidden">Run</span>
                  </Button>
                  <Button
                    variant="default"
                    size="sm"
                    onClick={saveCode}
                    disabled={isRunning_s || !isOwner}
                    className="flex items-center gap-1 text-xs md:text-sm"
                  >
                    {isRunning_s ? <RefreshCw className="h-3 w-3 md:h-4 md:w-4 animate-spin" /> : <Save className="h-3 w-3 md:h-4 md:w-4" />}
                    <span className="hidden md:inline">Save Code</span>
                    <span className="md:hidden">Save</span>
                  </Button>
                </div>
              </div>
            </div>

            <TabsContent value="editor" className="flex-1 p-0 m-0 overflow-hidden">
              <MonacoEditor
                height="100%"
                language={selectedLanguage}
                value={code}
                onChange={handleEditorChange}
                theme="vs-dark"
                onMount={handleMount}
                options={{
                  minimap: { enabled: false },
                  scrollBeyondLastLine: false,
                  fontSize: 14,
                  automaticLayout: true,
                }}
              />
            </TabsContent>

            <TabsContent value="output" className="flex-1 p-0 m-0 overflow-hidden">
              <div className="h-full overflow-auto bg-black p-2 md:p-4">
                <pre className="text-xs md:text-sm text-green-400 font-mono whitespace-pre-wrap">
                  {output || "Code output will appear here after running"}
                </pre>
              </div>
            </TabsContent>
            
            {/* Mobile Chat Tab */}
            <TabsContent value="chat" className="flex-1 p-0 m-0 overflow-hidden md:hidden flex flex-col">
              <ScrollArea className="flex-1 px-2 py-2">
                <div className="space-y-3 pb-2">
                  {messages.map((msg) => {
                    const isUser = msg.username === user?.fullName;
                    const time = new Date(msg.createdAt).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    });

                    return (
                      <div key={msg.id} className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
                        <div
                          className={`max-w-[85%] rounded-lg px-2 py-1.5 relative ${
                            isUser
                              ? "bg-primary text-primary-foreground rounded-br-none"
                              : "bg-muted text-foreground rounded-bl-none"
                          }`}
                        >
                          <div className="text-xs font-medium mb-0.5">{isUser ? "You" : msg.username}</div>
                          <div className="text-xs whitespace-pre-wrap break-words">{msg.message}</div>
                          <div className="text-xs mt-0.5 opacity-70 text-right">{time}</div>
                        </div>
                      </div>
                    );
                  })}
                  <div ref={messagesEndRef} />
                </div>
              </ScrollArea>

              <form onSubmit={handleSubmit} className="p-2 border-t bg-background">
                <div className="flex gap-1">
                  <Input
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    placeholder="Type a message..."
                    className="flex-1 text-sm"
                  />
                  <Button type="submit" size="icon">
                    <Send className="h-3 w-3" />
                  </Button>
                  <Button 
                    onClick={handleMicClick} 
                    variant={activeMic ? "default" : "outline"} 
                    size="icon"
                    disabled={isSettingUpMedia}
                  >
                    {activeMic ? <Mic className="h-3 w-3" /> : <MicOff className="h-3 w-3" />}
                  </Button>
                  <Button 
                    onClick={handleVideoClick} 
                    variant={activeVideo ? "default" : "outline"} 
                    size="icon"
                    disabled={isSettingUpMedia}
                  >
                    {activeVideo ? <Video className="h-3 w-3" /> : <VideoOff className="h-3 w-3" />}
                  </Button>
                </div>

                {/* Mobile Video UI Section */}
                {(activeVideo || Object.keys(remoteStreams).length > 0) && (
                  <div className="mt-2 border rounded-lg p-1 bg-black/5">
                    <div className="text-xs font-medium mb-1 text-muted-foreground">Video</div>
                    <div className="grid grid-cols-2 gap-1">
                      {/* Local video */}
                      {activeVideo && (
                        <div className="relative rounded-lg overflow-hidden bg-black aspect-video shadow-md">
                          <video
                            ref={localVideoRef}
                            autoPlay
                            muted
                            playsInline
                            className="w-full h-full object-cover"
                          />
                          <div className="absolute bottom-1 left-1 text-xs bg-black/60 text-white px-1 py-0.5 rounded-md flex items-center gap-0.5">
                            <User className="h-2 w-2" />
                            <span className="text-xs">You {activeMic ? "(mic)" : ""}</span>
                          </div>
                        </div>
                      )}
                      
                      {/* Remote videos */}
                      {Object.entries(remoteStreams).map(([peerId, stream]) => (
                        <div key={peerId} className="relative rounded-lg overflow-hidden bg-black aspect-video shadow-md">
                          <video
                            autoPlay
                            playsInline
                            className="w-full h-full object-cover"
                            ref={(ref) => {
                              if (ref) ref.srcObject = stream;
                            }}
                          />
                          <div className="absolute bottom-1 left-1 text-xs bg-black/60 text-white px-1 py-0.5 rounded-md flex items-center gap-0.5">
                            <User className="h-2 w-2" />
                            <span className="text-xs">Peer {stream.getAudioTracks().length > 0 ? "(mic)" : ""}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </form>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}