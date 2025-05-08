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
  Mic, 
  MicOff, 
  Video, 
  VideoOff,
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

// WebRTC interfaces
interface PeerConnection {
  userId: string;
  connection: RTCPeerConnection;
}

interface RemotePeer {
  userId: string;
  username?: string;
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

// WebRTC configuration
const rtcConfiguration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ],
};

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

  // WebRTC State
  const [activeMic, setActiveMic] = useState<boolean>(false);
  const [activeVideo, setActiveVideo] = useState<boolean>(false);
  const [connections, setConnections] = useState<PeerConnection[]>([]);
  const [remoteStreams, setRemoteStreams] = useState<{[key: string]: MediaStream}>({});
  const [remotePeers, setRemotePeers] = useState<RemotePeer[]>([]);
  const [isSettingUpMedia, setIsSettingUpMedia] = useState<boolean>(false);

  // --- Refs ---
  const editorRef = useRef<any>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  // WebRTC Refs
  const localStreamRef = useRef<MediaStream | null>(null);
  const mediaLockRef = useRef<boolean>(false);
  const pendingCandidatesRef = useRef<{[key: string]: RTCIceCandidate[]}>({});
  const localVideoRef = useRef<HTMLVideoElement>(null);

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
    // Clean up WebRTC connections
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
      localStreamRef.current = null;
    }
    
    connections.forEach(peer => {
      peer.connection.close();
    });
    setConnections([]);
    setRemoteStreams({});
    
    socket.emit("leave_room", { roomId, userId: user?.id });
    router.push("/");
  }, [roomId, user?.id, router, connections]);

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

  // --- WebRTC functions ---
  const toggleMicrophone = useCallback(async () => {
    try {
      if (mediaLockRef.current) return;
      mediaLockRef.current = true;
      
      if (!activeMic) {
        // Turn on mic
        await setupUserMedia(true, activeVideo);
        setActiveMic(true);
      } else {
        // Turn off mic
        if (localStreamRef.current) {
          localStreamRef.current.getAudioTracks().forEach(track => {
            track.enabled = false;
            track.stop();
          });
          
          if (!activeVideo) {
            localStreamRef.current = null;
            if (localVideoRef.current) {
              localVideoRef.current.srcObject = null;
            }
          } else {
            // Keep video on but remove audio tracks
            const videoTracks = localStreamRef.current.getVideoTracks();
            if (videoTracks.length > 0) {
              const newStream = new MediaStream();
              videoTracks.forEach(track => newStream.addTrack(track));
              localStreamRef.current = newStream;
              if (localVideoRef.current) {
                localVideoRef.current.srcObject = newStream;
              }
            }
          }
        }
        setActiveMic(false);
      }
    } catch (error) {
      console.error("Error toggling microphone:", error);
      alert("Failed to toggle microphone. Please check your device permissions.");
    } finally {
      mediaLockRef.current = false;
    }
  }, [activeMic, activeVideo]);

  const toggleVideo = useCallback(async () => {
    try {
      if (mediaLockRef.current) return;
      mediaLockRef.current = true;
      
      if (!activeVideo) {
        // Turn on video
        await setupUserMedia(activeMic, true);
        setActiveVideo(true);
      } else {
        // Turn off video
        if (localStreamRef.current) {
          localStreamRef.current.getVideoTracks().forEach(track => {
            track.enabled = false;
            track.stop();
          });
          
          if (!activeMic) {
            localStreamRef.current = null;
            if (localVideoRef.current) {
              localVideoRef.current.srcObject = null;
            }
          } else {
            // Keep audio on but remove video tracks
            const audioTracks = localStreamRef.current.getAudioTracks();
            if (audioTracks.length > 0) {
              const newStream = new MediaStream();
              audioTracks.forEach(track => newStream.addTrack(track));
              localStreamRef.current = newStream;
              if (localVideoRef.current) {
                localVideoRef.current.srcObject = newStream;
              }
            }
          }
        }
        setActiveVideo(false);
      }
    } catch (error) {
      console.error("Error toggling video:", error);
      alert("Failed to toggle video. Please check your device permissions.");
    } finally {
      mediaLockRef.current = false;
    }
  }, [activeMic, activeVideo]);
  
  const setupUserMedia = async (audio: boolean, video: boolean) => {
    try {
      setIsSettingUpMedia(true);
      
      // Stop any existing streams
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => track.stop());
      }
      
      if (!audio && !video) {
        localStreamRef.current = null;
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = null;
        }
        return;
      }
      
      // Get new media stream
      const stream = await navigator.mediaDevices.getUserMedia({
        audio,
        video: video ? { width: 320, height: 240 } : false
      });
      
      localStreamRef.current = stream;
      
      // Update local video element
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }
      
      // Add tracks to all existing peer connections
      connections.forEach(peer => {
        const { connection, userId } = peer;
        stream.getTracks().forEach(track => {
          connection.getSenders().forEach(sender => {
            if (sender.track && sender.track.kind === track.kind) {
              sender.replaceTrack(track);
            } else {
              connection.addTrack(track, stream);
            }
          });
        });
      });
      
    } catch (error) {
      console.error("Error setting up user media:", error);
      throw error;
    } finally {
      setIsSettingUpMedia(false);
    }
  };
  
  const createPeerConnection = useCallback((targetUserId: string) => {
    if (!user?.id || targetUserId === user.id) return null;
    
    console.log(`Creating peer connection with ${targetUserId}`);
    
    const peerConnection = new RTCPeerConnection(rtcConfiguration);
    
    // Add tracks from local stream to peer connection
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => {
        peerConnection.addTrack(track, localStreamRef.current!);
      });
    }
    
    // Handle ICE candidates
    peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit("signal", {
          type: "ice-candidate",
          candidate: event.candidate,
          from: user.id,
          to: targetUserId,
          roomId
        });
      }
    };
    
    // Handle incoming tracks
    peerConnection.ontrack = (event) => {
      console.log(`Received tracks from ${targetUserId}`);
      
      setRemoteStreams(prev => {
        // If we already have a stream for this user, update it
        if (prev[targetUserId]) {
          event.streams[0].getTracks().forEach(track => {
            prev[targetUserId].addTrack(track);
          });
          return {...prev};
        } 
        // Otherwise create a new stream entry
        else {
          return {
            ...prev,
            [targetUserId]: event.streams[0]
          };
        }
      });
    };
    
    // Handle connection state changes
    peerConnection.onconnectionstatechange = () => {
      if (peerConnection.connectionState === 'disconnected' || 
          peerConnection.connectionState === 'failed' || 
          peerConnection.connectionState === 'closed') {
        console.log(`Connection with ${targetUserId} closed or failed`);
        setConnections(prev => prev.filter(conn => conn.userId !== targetUserId));
        setRemoteStreams(prev => {
          const newStreams = {...prev};
          delete newStreams[targetUserId];
          return newStreams;
        });
      }
    };
    
    // Add to connections list
    setConnections(prev => [...prev.filter(conn => conn.userId !== targetUserId), 
      { userId: targetUserId, connection: peerConnection }]);
    
    // Apply any pending ICE candidates
    if (pendingCandidatesRef.current[targetUserId]) {
      pendingCandidatesRef.current[targetUserId].forEach(candidate => {
        peerConnection.addIceCandidate(candidate).catch(error => {
          console.error("Error adding pending ICE candidate:", error);
        });
      });
      delete pendingCandidatesRef.current[targetUserId];
    }
    
    return peerConnection;
  }, [roomId, user?.id]);
  
  const handleWebRTCSignal = useCallback(async (data: any) => {
    if (!user?.id || data.to !== user.id) return;
    
    const { type, from, candidate, sdp } = data;
    
    // Find existing connection or create a new one
    let peerConnection = connections.find(conn => conn.userId === from)?.connection;
    
    if (!peerConnection) {
      const newPeerConnection = createPeerConnection(from);
      if (!newPeerConnection) return;
      peerConnection = newPeerConnection;
      if (!peerConnection) return;
    }
    
    try {
      if (type === "offer") {
        await peerConnection.setRemoteDescription(new RTCSessionDescription({ type: "offer", sdp }));
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        
        socket.emit("signal", {
          type: "answer",
          sdp: answer.sdp,
          from: user.id,
          to: from,
          roomId
        });
        
      } else if (type === "answer") {
        await peerConnection.setRemoteDescription(new RTCSessionDescription({ type: "answer", sdp }));
        
      } else if (type === "ice-candidate") {
        try {
          // If connection is not ready for candidates, store them
          if (peerConnection.remoteDescription === null) {
            if (!pendingCandidatesRef.current[from]) {
              pendingCandidatesRef.current[from] = [];
            }
            pendingCandidatesRef.current[from].push(candidate);
          } else {
            await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
          }
        } catch (err) {
          console.error("Error adding ICE candidate:", err);
        }
      }
    } catch (error) {
      console.error("Error handling WebRTC signal:", error);
    }
    
  }, [connections, createPeerConnection, roomId, user?.id]);
  
  const initiateCall = useCallback(async (targetUserId: string) => {
    if (!user?.id || targetUserId === user.id) return;
    
    try {
      console.log(`Initiating call to ${targetUserId}`);
      
      // Create peer connection if it doesn't exist
      let peerConnection = connections.find(conn => conn.userId === targetUserId)?.connection;
      
      if (!peerConnection) {
        const newPeerConnection = createPeerConnection(targetUserId);
        if (!newPeerConnection) return;
        peerConnection = newPeerConnection;
        if (!peerConnection) return;
      }
      
      // Create and send offer
      const offer = await peerConnection.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true
      });
      
      await peerConnection.setLocalDescription(offer);
      
      socket.emit("signal", {
        type: "offer",
        sdp: offer.sdp,
        from: user.id,
        to: targetUserId,
        roomId
      });
      
    } catch (error) {
      console.error("Error initiating call:", error);
    }
  }, [connections, createPeerConnection, roomId, user?.id]);

  // --- Effects ---
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  // Effect for WebRTC peer connections when remote peers change
  useEffect(() => {
    const setupNewPeers = async () => {
      if (!user?.id || !remotePeers.length || !activeMic && !activeVideo) return;
      
      // Make sure we have local media if needed
      if ((activeMic || activeVideo) && !localStreamRef.current) {
        try {
          await setupUserMedia(activeMic, activeVideo);
        } catch (error) {
          console.error("Failed to set up local media:", error);
          return;
        }
      }
      
      // Initiate calls to any new peers
      for (const peer of remotePeers) {
        if (!connections.some(conn => conn.userId === peer.userId)) {
          await initiateCall(peer.userId);
        }
      }
    };
    
    setupNewPeers();
  }, [remotePeers, connections, activeMic, activeVideo, initiateCall, user?.id]);

  useEffect(() => {
    if (!roomId || !user?.id) return;

    console.log(`User ${user.id} attempting to join room ${roomId}`);
    socket.emit("join_room", { roomId, userId: user.id, username: user.username });

    // Socket event handlers
    const onConnect = () => console.log("Socket connected");
    const onDisconnect = () => console.log("Socket disconnected");
    
    const onRoomJoined = (data: { userCount: number, isOwner: boolean, initialCode?: string, initialLanguage?: string, peers?: { userId: string, username?: string }[] }) => {
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
      // Set initial remote peers
      if (data.peers) {
        setRemotePeers(data.peers.filter(peer => peer.userId !== user?.id));
      }
    };

    const onUserJoinedRoom = (data: UserJoinedRoomData): void => {
      if (data.userId && data.userId !== user?.id) {
        console.log(`User ${data.username || data.userId} joined. Current count: ${data.userCount}`);
        if (data.userCount !== undefined) setUserNumber(data.userCount);
        
        // Add to remote peers
        setRemotePeers(prev => {
          if (prev.some(peer => peer.userId === data.userId)) {
            return prev;
          }
          return [...prev, { userId: data.userId, username: data.username }];
        });
      } else if (data.userId === user?.id && data.userCount !== undefined) {
        setUserNumber(data.userCount);
      }
    };

    const onUserLeftRoom = (data: UserLeftRoomData): void => {
      if (data.userId && data.userId !== user?.id) {
        console.log(`User ${data.userId} left. Current count: ${data.userCount}`);
        if (data.userCount !== undefined) setUserNumber(data.userCount);
        
        // Remove from remote peers
        setRemotePeers(prev => prev.filter(peer => peer.userId !== data.userId));
        
        // Close and remove the connection
        const peerConnection = connections.find(conn => conn.userId === data.userId);
        if (peerConnection) {
          peerConnection.connection.close();
          setConnections(prev => prev.filter(conn => conn.userId !== data.userId));
        }
        
        // Remove remote stream
        setRemoteStreams(prev => {
          const newStreams = {...prev};
          if (newStreams[data.userId]) {
            delete newStreams[data.userId];
          }
          return newStreams;
        });
      }
    };
    
    const onSignal = (data: any) => {
      handleWebRTCSignal(data);
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
    socket.on("signal", onSignal);
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
      
      // Clean up WebRTC
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => track.stop());
      }
      
      connections.forEach(peer => {
        peer.connection.close();
      });
      
      socket.emit("leave_room", { roomId, userId: user?.id });
      
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("room_joined", onRoomJoined);
      socket.off("user_joined_room", onUserJoinedRoom);
      socket.off("user_left_room", onUserLeftRoom);
      socket.off("signal", onSignal);
      socket.off("user_code_change", onUserCodeChange);
      socket.off("user_cursor_change", onUserCursorChange);
      socket.off("user_language_change", onUserLanguageChange);
      socket.off("code_saved", onCodeSaved);
      socket.off("receive_message", onReceiveMessage);
      socket.off("user_count_update", onUserCountUpdate);
      socket.off("set_owner", onSetOwner);
    };
  }, [roomId, user, router, isOwner, handleRefreshCode, connections, handleWebRTCSignal]); 

  if (!user) {
    return (
      <div className="flex items-center justify-center h-screen">
        Loading user...
      </div>
    );
  }
  return (
    <TooltipProvider>
      <div className="flex flex-col h-screen bg-gray-900 text-white">
        {/* Header */}
        <header className="p-3 border-b border-gray-700 flex flex-wrap gap-3 justify-between items-start sm:items-center">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-4">
            <div className="flex items-center gap-3">
              <Code className="h-6 w-6 text-blue-400" />
              <h1 className="text-xl font-semibold">
                Room: <span className="text-blue-400">{roomId}</span>
              </h1>
            </div>
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              <span>{userNumber}</span>
            </div>
          </div>
  
          {/* WebRTC Controls */}
          <div className="flex items-center gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={activeMic ? "default" : "outline"}
                  size="sm"
                  className={activeMic ? "bg-green-600 hover:bg-green-700" : ""}
                  onClick={toggleMicrophone}
                  disabled={isSettingUpMedia}
                >
                  {activeMic ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}
                </Button>
              </TooltipTrigger>
              <TooltipContent><p>{activeMic ? "Mute Microphone" : "Unmute Microphone"}</p></TooltipContent>
            </Tooltip>
  
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={activeVideo ? "default" : "outline"}
                  size="sm"
                  className={activeVideo ? "bg-green-600 hover:bg-green-700" : ""}
                  onClick={toggleVideo}
                  disabled={isSettingUpMedia}
                >
                  {activeVideo ? <Video className="h-4 w-4" /> : <VideoOff className="h-4 w-4" />}
                </Button>
              </TooltipTrigger>
              <TooltipContent><p>{activeVideo ? "Turn Off Camera" : "Turn On Camera"}</p></TooltipContent>
            </Tooltip>
          </div>
  
          <Button variant="destructive" size="sm" onClick={handleLeaveRoom} className="flex items-center mt-2 sm:mt-0">
            <LogOut className="mr-2 h-4 w-4" /> Leave Room
          </Button>
        </header>
    
        {/* Main Content */}
        <div className="flex flex-col lg:flex-row flex-1 overflow-hidden">
          {/* Left Pane */}
          <div className="flex flex-col flex-1 w-full lg:w-2/3 p-2 space-y-2">
            {/* Video Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 bg-gray-800 p-2 rounded-md h-40 overflow-y-auto">
              {/* Local Video */}
              <div className="relative bg-gray-700 rounded overflow-hidden flex items-center justify-center">
                {activeVideo ? (
                  <video 
                    ref={localVideoRef}
                    autoPlay
                    muted
                    playsInline
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center h-full w-full">
                    <User className="h-8 w-8 mb-1" />
                    <span className="text-xs">{user?.username || "You"} {activeMic ? "(Audio On)" : ""}</span>
                  </div>
                )}
              </div>
              
              {/* Remote Videos */}
              {Object.entries(remoteStreams).map(([userId, stream]) => {
                const peer = remotePeers.find(p => p.userId === userId);
                const hasVideo = stream.getVideoTracks().some(track => track.enabled);
                
                return (
                  <div key={userId} className="relative bg-gray-700 rounded overflow-hidden flex items-center justify-center">
                    {hasVideo ? (
                      <video
                        autoPlay
                        playsInline
                        className="h-full w-full object-cover"
                        ref={video => {
                          if (video) video.srcObject = stream;
                        }}
                      />
                    ) : (
                      <div className="flex flex-col items-center justify-center h-full w-full">
                        <User className="h-8 w-8 mb-1" />
                        <span className="text-xs">{peer?.username || userId.substring(0, 8)}</span>
                        {stream.getAudioTracks().length > 0 && (
                          <span className="text-xs text-green-400">(Audio On)</span>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
  
            {/* Editor Controls */}
            <div className="flex flex-col md:flex-row justify-between gap-2 p-2 bg-gray-800 rounded-md">
              <div className="flex flex-wrap gap-2">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="outline" size="sm" onClick={handleRunCode} disabled={isRunning}>
                      {isRunning ? (
                        <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Terminal className="mr-2 h-4 w-4" />
                      )}
                      Run
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent><p>Execute Code</p></TooltipContent>
                </Tooltip>
    
                {isOwner && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="outline" size="sm" onClick={handleSaveCode} disabled={isRunningSave}>
                        {isRunningSave ? (
                          <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <Save className="mr-2 h-4 w-4" />
                        )}
                        Save
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent><p>Save Code (Owner only)</p></TooltipContent>
                  </Tooltip>
                )}
    
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="outline" size="sm" onClick={handleRefreshCode}>
                      <RefreshCw className="mr-2 h-4 w-4" /> Refresh Code
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent><p>Fetch latest saved code</p></TooltipContent>
                </Tooltip>
              </div>
    
              <div className="w-full md:w-40">
                <Select value={selectedLanguage} onValueChange={handleLanguageChange}>
                  <SelectTrigger className="bg-gray-700 border-gray-600 w-full">
                    <SelectValue placeholder="Language" />
                  </SelectTrigger>
                  <SelectContent className="bg-gray-700 text-white border-gray-600">
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
            <div className="flex-1 min-h-[200px] rounded-md overflow-hidden">
              <MonacoEditor
                language={selectedLanguage}
                value={code}
                onChange={handleEditorChange}
                onMount={handleEditorDidMount}
                theme="vs-dark"
              />
            </div>
    
            {/* Output Tabs */}
            <div className="h-48 md:h-1/4 lg:h-1/5 bg-gray-800 rounded-md">
              <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full flex flex-col">
                <TabsList className="bg-gray-700 rounded-t-md rounded-b-none">
                  <TabsTrigger value="output">Output</TabsTrigger>
                  <TabsTrigger value="terminal" disabled>Terminal (Soon)</TabsTrigger>
                </TabsList>
                <TabsContent value="output" className="flex-1 overflow-auto p-2 text-sm bg-gray-800 rounded-b-md">
                  <pre className="whitespace-pre-wrap">{output || "Code output will appear here."}</pre>
                </TabsContent>
                <TabsContent value="terminal" className="flex-1 overflow-auto p-2 text-sm bg-gray-800 rounded-b-md">
                  <p>Interactive terminal coming soon!</p>
                </TabsContent>
              </Tabs>
            </div>
          </div>
    
          {/* Right Pane: Chat */}
          <div className="flex flex-col w-full lg:w-1/3 p-2 border-t lg:border-t-0 lg:border-l border-gray-700">
            <div className="flex flex-col flex-1 bg-gray-800 rounded-md overflow-hidden">
              <h2 className="p-3 text-lg font-semibold border-b border-gray-700">Chat</h2>
              <ScrollArea className="flex-1 p-3">
                {messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`mb-3 p-2 rounded-lg max-w-xs break-words ${
                      msg.username === user?.fullName ? 'bg-blue-600 ml-auto' : 'bg-gray-700 mr-auto'
                    }`}
                  >
                    <p className="text-xs text-gray-400 mb-1">
                      {msg.username} - {new Date(msg.createdAt).toLocaleTimeString()}
                    </p>
                    <p>{msg.message}</p>
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </ScrollArea>
              <Separator className="bg-gray-700" />
              <div className="p-3 flex flex-col sm:flex-row gap-2">
                <Input
                  type="text"
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  placeholder="Type a message..."
                  onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                  className="bg-gray-700 border-gray-600 focus:ring-blue-500 w-full"
                />
                <Button onClick={handleSendMessage} className="bg-blue-600 hover:bg-blue-700">
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
 