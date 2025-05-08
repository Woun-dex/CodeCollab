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

interface SignalData {
  fromId: string;
  targetId?: string;
  signal: {
    sdp?: RTCSessionDescriptionInit;
    candidate?: RTCIceCandidateInit;
  };
  roomId: string;
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

const rtcConfiguration: RTCConfiguration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    {
      urls: "turn:relay1.expressturn.com:3480",
      username: "174672021752747357",
      credential: "DQyQiIIXACHLuNljl0XLUq8Xc3E=",
    },
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
  const [connections, setConnections] = useState<{
    [key: string]: RTCPeerConnection;
  }>({});
  const [remoteStreams, setRemoteStreams] = useState<{
    [key: string]: MediaStream;
  }>({});
  const [remotePeers, setRemotePeers] = useState<string[]>([]);
  const [isSettingUpMedia, setIsSettingUpMedia] = useState<boolean>(false);

  // --- Refs ---
  const editorRef = useRef<any>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const mediaLockRef = useRef<boolean>(false);
  const pendingCandidatesRef = useRef<{
    [key: string]: RTCIceCandidateInit[];
  }>({});
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);

  // --- WebRTC Core Logic ---
  const cleanupMedia = useCallback(
    (cleanupConnectionsFully = false): void => {
      console.log("Cleaning up media. Full cleanup:", cleanupConnectionsFully);
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => {
          track.stop();
          console.log("Local track stopped:", track.kind);
        });
        localStreamRef.current = null;
      }

      if (cleanupConnectionsFully) {
        Object.values(connections).forEach((pc) => {
          if (pc.signalingState !== "closed") {
            pc.getSenders().forEach((sender) => {
              if (sender.track && pc.signalingState !== "closed") {
                try {
                  pc.removeTrack(sender);
                  console.log(
                    "Removed track from peer connection during full cleanup:",
                    sender.track.kind
                  );
                } catch (e) {
                  console.warn("Error removing track during full cleanup:", e);
                }
              }
            });
          }
        });
      }
    },
    [connections]
  );

  const handleCall = useCallback(
    async (peerId: string, peerConnection?: RTCPeerConnection): Promise<void> => {
      const pc = peerConnection || connections[peerId];
      if (!pc || !user?.id || pc.signalingState === "closed") {
        console.warn(
          `handleCall: PC not available, user not loaded, or PC closed for ${peerId}.`
        );
        return;
      }
      if (pc.signalingState === "have-local-offer") {
        console.warn(
          `handleCall: Already have local offer for ${peerId}, skipping.`
        );
        return;
      }

      try {
        console.log(`Creating offer for ${peerId}`);
        const offer = await pc.createOffer();
        if (pc.connectionState !== 'closed') {
          console.warn(
            `handleCall: Signaling state changed before setLocalDescription for ${peerId}. Current: ${pc.signalingState}`
          );
          return;
        }
        await pc.setLocalDescription(offer);

        socket.emit("signal", {
          roomId,
          signal: { sdp: pc.localDescription },
          fromId: user.id,
          targetId: peerId,
        });
      } catch (error) {
        console.error(`Error creating offer for ${peerId}:`, error);
      }
    },
    [connections, roomId, user?.id]
  );

  const createPeerConnection = useCallback(
    (peerId: string): RTCPeerConnection => {
      console.log(`Creating new RTCPeerConnection for peer: ${peerId}`);
      const pc = new RTCPeerConnection(rtcConfiguration);

      pc.onicecandidate = (event: RTCPeerConnectionIceEvent) => {
        if (event.candidate && user?.id) {
          socket.emit("signal", {
            roomId,
            signal: { candidate: event.candidate.toJSON() },
            fromId: user.id,
            targetId: peerId,
          });
        }
      };

      pc.ontrack = (event: RTCTrackEvent) => {
        console.log(
          `Track received from ${peerId}:`,
          event.track.kind,
          "Stream IDs:",
          event.streams.map((s) => s.id)
        );
        if (event.streams && event.streams[0]) {
          setRemoteStreams((prev) => ({
            ...prev,
            [peerId]: event.streams[0],
          }));
        } else {
          console.warn(
            `No stream found in ontrack event for ${peerId}. Creating new stream for track.`
          );
          const inboundStream = new MediaStream();
          inboundStream.addTrack(event.track);
          setRemoteStreams((prev) => ({
            ...prev,
            [peerId]: inboundStream,
          }));
        }
      };

      pc.oniceconnectionstatechange = () =>
        console.log(`ICE connection state for ${peerId}: ${pc.iceConnectionState}`);
      pc.onsignalingstatechange = () =>
        console.log(`Signaling state for ${peerId}: ${pc.signalingState}`);
      pc.onconnectionstatechange = () => {
        console.log(`Connection state for ${peerId}: ${pc.connectionState}`);
        if (
          pc.connectionState === "failed" ||
          pc.connectionState === "disconnected" ||
          pc.connectionState === "closed"
        ) {
          console.warn(`Connection with ${peerId} is ${pc.connectionState}.`);
        }
      };

      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => {
          if (track.readyState === "live") {
            try {
              pc.addTrack(track, localStreamRef.current!);
            } catch (e) {
              console.error(`Error adding track to PC for ${peerId}:`, e);
            }
          }
        });
      }
      return pc;
    },
    [roomId, user?.id]
  );

  const handleUserJoined = useCallback(
    (joiningUserId: string): void => {
      if (joiningUserId === user?.id || connections[joiningUserId]) return;

      console.log(`User ${joiningUserId} joined. Creating peer connection.`);
      const newPc = createPeerConnection(joiningUserId);
      setConnections((prev) => ({ ...prev, [joiningUserId]: newPc }));

      if (localStreamRef.current && (activeMic || activeVideo)) {
        handleCall(joiningUserId, newPc);
      }
    },
    [user?.id, connections, createPeerConnection, activeMic, activeVideo, handleCall]
  );

  // --- Effects ---
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  useEffect(() => {
    if (isSettingUpMedia) return;

    const setupOrTeardownMedia = async () => {
      if (mediaLockRef.current) return;
      mediaLockRef.current = true;
      setIsSettingUpMedia(true);

      try {
        if (activeMic || activeVideo) {
          let needsNewStream = !localStreamRef.current;
          if (localStreamRef.current) {
            const audioTracks = localStreamRef.current.getAudioTracks();
            const videoTracks = localStreamRef.current.getVideoTracks();
            if (
              (activeMic && audioTracks.length === 0) ||
              (!activeMic && audioTracks.length > 0 && audioTracks.some((t) => t.enabled))
            ) {
              needsNewStream = true;
            }
            if (
              (activeVideo && videoTracks.length === 0) ||
              (!activeVideo && videoTracks.length > 0 && videoTracks.some((t) => t.enabled))
            ) {
              needsNewStream = true;
            }
          }

          if (needsNewStream) {
            cleanupMedia(false);

            const constraints: MediaStreamConstraints = {
              audio: activeMic,
              video: activeVideo ? { width: 320, height: 240 } : false,
            };
            console.log("Requesting media with constraints:", constraints);
            await new Promise((resolve) => setTimeout(resolve, 200));

            try {
              const stream = await navigator.mediaDevices.getUserMedia(constraints);
              localStreamRef.current = stream;

              if (localVideoRef.current) {
                localVideoRef.current.srcObject = stream;
              }

              console.log("Local stream acquired:", stream.id);
            } catch (error: any) {
              console.error("Error accessing media devices:", error);
              if (error instanceof DOMException) {
                console.error(`DOMException: ${error.name} - ${error.message}`);
                if (error.name === "NotAllowedError" || error.name === "NotFoundError") {
                  setActiveMic(false);
                  setActiveVideo(false);
                } else {
                  if (constraints.audio) setActiveMic(false);
                  if (constraints.video) setActiveVideo(false);
                }
              } else {
                setActiveMic(false);
                setActiveVideo(false);
              }
              localStreamRef.current = null;
            }
          }
        } else {
          cleanupMedia(true);
          if (localVideoRef.current) {
            localVideoRef.current.srcObject = null;
          }
        }
      } finally {
        mediaLockRef.current = false;
        setIsSettingUpMedia(false);
      }
    };
    setupOrTeardownMedia();
  }, [activeMic, activeVideo, cleanupMedia, isSettingUpMedia]);

  useEffect(() => {
    if (!user?.id) return;

    console.log("Media state or connections changed. Updating peer connections.");
    Object.entries(connections).forEach(([peerId, pc]) => {
      if (pc.signalingState === "closed") return;

      let renegotiationNeeded = false;
      const currentStream = localStreamRef.current;

      const audioTrack =
        currentStream && activeMic ? currentStream.getAudioTracks()[0] : null;
      const audioSender = pc.getSenders().find((s) => s.track && s.track.kind === "audio");
      if (audioTrack) {
        if (audioSender) {
          if (audioSender.track !== audioTrack) {
            audioSender
              .replaceTrack(audioTrack)
              .then(() => console.log(`Audio track replaced for ${peerId}`))
              .catch((e) => console.error(`Audio replaceTrack failed for ${peerId}`, e));
          }
        } else {
          pc.addTrack(audioTrack, currentStream!);
          console.log(`Audio track added for ${peerId}`);
          renegotiationNeeded = true;
        }
      } else if (audioSender) {
        try {
          if (pc.connectionState !== 'closed') pc.removeTrack(audioSender);
          console.log(`Audio track removed for ${peerId}`);
          renegotiationNeeded = true;
        } catch (e) {
          console.warn(`Error removing audio sender for ${peerId}`, e);
        }
      }

      const videoTrack =
        currentStream && activeVideo ? currentStream.getVideoTracks()[0] : null;
      const videoSender = pc.getSenders().find((s) => s.track && s.track.kind === "video");
      if (videoTrack) {
        if (videoSender) {
          if (videoSender.track !== videoTrack) {
            videoSender
              .replaceTrack(videoTrack)
              .then(() => console.log(`Video track replaced for ${peerId}`))
              .catch((e) => console.error(`Video replaceTrack failed for ${peerId}`, e));
          }
        } else {
          pc.addTrack(videoTrack, currentStream!);
          console.log(`Video track added for ${peerId}`);
          renegotiationNeeded = true;
        }
      } else if (videoSender) {
        try {
          if (pc.connectionState !== 'closed') pc.removeTrack(videoSender);
          console.log(`Video track removed for ${peerId}`);
          renegotiationNeeded = true;
        } catch (e) {
          console.warn(`Error removing video sender for ${peerId}`, e);
        }
      }

      if (
        renegotiationNeeded &&
        pc.signalingState !== "have-local-offer" &&
        pc.connectionState !== 'closed'
      ) {
        console.log(`Requesting renegotiation with ${peerId} due to track changes.`);
        handleCall(peerId, pc);
      }
    });
  }, [connections, handleCall, user?.id, activeMic, activeVideo]);

  useEffect(() => {
    if (!roomId || !user?.id) return;

    const onSignal = async (data: SignalData): Promise<void> => {
      if (data.roomId !== roomId || (data.targetId && data.targetId !== user.id))
        return;
      if (data.fromId === user.id) return;

      const { fromId, signal } = data;
      let pc = connections[fromId];

      if (!pc || pc.signalingState === "closed") {
        console.log(
          `Received signal from ${pc ? "closed" : "new"} peer ${fromId}. Creating/re-creating connection.`
        );
        pc = createPeerConnection(fromId);
        setConnections((prev) => ({ ...prev, [fromId]: pc }));
      }

      try {
        if (signal.sdp) {
          console.log(`Received SDP (${signal.sdp.type}) from ${fromId}`);
          if (
            signal.sdp.type === "offer" &&
            pc.signalingState === "have-local-offer"
          ) {
            console.warn(
              `Glare: Received offer from ${fromId} while in state ${pc.signalingState}.`
            );
          }

          if (
            !(
              pc.signalingState === "have-local-offer" &&
              signal.sdp.type === "offer"
            )
          ) {
            await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
          } else if (
            pc.signalingState === "have-local-offer" &&
            signal.sdp.type === "offer"
          ) {
            console.log(
              "Skipping setRemoteDescription for incoming offer due to glare and local offer presence."
            );
          }

          if (pendingCandidatesRef.current[fromId]) {
            console.log(
              `Processing ${pendingCandidatesRef.current[fromId].length} queued ICE candidates for ${fromId}`
            );
            for (const candidate of pendingCandidatesRef.current[fromId]) {
              try {
                if (pc.remoteDescription && pc.signalingState !== "closed") {
                  await pc.addIceCandidate(candidate);
                } else {
                  console.warn(
                    `Cannot add queued ICE candidate for ${fromId}, remoteDescription not set or PC closed.`
                  );
                }
              } catch (e) {
                console.error(`Error adding queued ICE candidate for ${fromId}:`, e);
              }
            }
            delete pendingCandidatesRef.current[fromId];
          }

          if (
            signal.sdp.type === "offer" &&
            pc.signalingState !== "have-local-offer" &&
            pc.signalingState !== "closed"
          ) {
            const answer = await pc.createAnswer();
            if (pc.connectionState !== 'closed') {
              await pc.setLocalDescription(answer);
              socket.emit("signal", {
                roomId,
                signal: { sdp: pc.localDescription },
                fromId: user.id,
                targetId: fromId,
              });
              console.log(`Sent answer to ${fromId}`);
            } else {
              console.warn(`PC for ${fromId} closed before sending answer.`);
            }
          }
        } else if (signal.candidate) {
          const candidate = new RTCIceCandidate(signal.candidate);
          if (pc.remoteDescription && pc.signalingState !== "closed") {
            await pc.addIceCandidate(candidate);
          } else {
            pendingCandidatesRef.current[fromId] = [
              ...(pendingCandidatesRef.current[fromId] || []),
              candidate,
            ];
            console.log(
              `Queued ICE candidate from ${fromId} (Remote desc not set or PC closed)`
            );
          }
        }
      } catch (error: any) {
        console.error(
          `Error handling WebRTC signal from ${fromId}:`,
          error.name,
          error.message,
          signal
        );
        if (error.name === "InvalidStateError" || error.message.includes("Rollback")) {
          console.warn(
            `Signaling error with ${fromId}, state: ${pc.signalingState}. Consider manual intervention or specific error handling.`,
            error
          );
        }
      }
    };

    const onUserJoinedRoom = (data: UserJoinedRoomData): void => {
      if (data.userId && data.userId !== user?.id) {
        setRemotePeers((prev) => (prev.includes(data.userId) ? prev : [...prev, data.userId]));
        handleUserJoined(data.userId);
        if (data.userCount !== undefined) setUserNumber(data.userCount);
      }
    };

    const onUserLeftRoom = (data: UserLeftRoomData): void => {
      if (data.userId && data.userId !== user?.id) {
        console.log(`User ${data.userId} left. Cleaning up WebRTC connection.`);
        if (connections[data.userId]) {
          connections[data.userId].close();
          setConnections((prev) => {
            const newConns = { ...prev };
            delete newConns[data.userId];
            return newConns;
          });
        }
        setRemoteStreams((prev) => {
          const newStreams = { ...prev };
          delete newStreams[data.userId];
          return newStreams;
        });
        setRemotePeers((prev) => prev.filter((id) => id !== data.userId));
        delete pendingCandidatesRef.current[data.userId];
        if (data.userCount !== undefined) setUserNumber(data.userCount);
      }
    };

    socket.on("signal", onSignal);
    socket.on("user_joined_room", onUserJoinedRoom);
    socket.on("user_left_room", onUserLeftRoom);

    return () => {
      socket.off("signal", onSignal);
      socket.off("user_joined_room", onUserJoinedRoom);
      socket.off("user_left_room", onUserLeftRoom);
    };
  }, [roomId, user?.id, connections, createPeerConnection, handleUserJoined]);

  useEffect(() => {
    if (!roomId || !user?.fullName || !user?.id) return;

    socket.emit("join_room", { roomId, username: user.fullName, userId: user.id });
    socket.emit("get_user_count", { roomId });

    const onReceiveMessage = (data: Message) => setMessages((prev) => [...prev, data]);
    const onReceiveCode = (data: { code: string }) =>
      setCode((prevCode) => (prevCode === data.code ? prevCode : data.code));
    const onReceiveCursor = (data: RemoteCursor & { username: string }) => {
      if (data.username !== user?.fullName) {
        setRemoteCursors((prev) => {
          const updated = prev.filter((cursor) => cursor.userId !== data.username);
          return [
            ...updated,
            { userId: data.username, lineNumber: data.lineNumber, column: data.column },
          ];
        });
      }
    };
    const onUserCount = (data: UserCountData) => setUserNumber(data.count);
    const onUserCountUpdate = (data: UserCountData) => setUserNumber(data.count);

    socket.on("receive_message", onReceiveMessage);
    socket.on("receive_code", onReceiveCode);
    socket.on("receive_cursor", onReceiveCursor);
    socket.on("user_count", onUserCount);
    socket.on("user_count_update", onUserCountUpdate);

    return () => {
      socket.off("receive_message", onReceiveMessage);
      socket.off("receive_code", onReceiveCode);
      socket.off("receive_cursor", onReceiveCursor);
      socket.off("user_count", onUserCount);
      socket.off("user_count_update", onUserCountUpdate);

      console.log("Main socket effect cleanup: Leaving room and full cleanup.");
      cleanupMedia(true);
      Object.values(connections).forEach((conn) => {
        if (conn.signalingState !== "closed") conn.close();
      });
      setConnections({});
      setRemoteStreams({});
      setRemotePeers([]);
      pendingCandidatesRef.current = {};
      if (user?.id && user.fullName) {
        socket.emit("leave_room", {
          roomId,
          username: user.fullName,
          userId: user.id,
        });
      }
    };
  }, [roomId, user?.id, user?.fullName, cleanupMedia, connections]);

  useEffect(() => {
    const loadData = async () => {
      if (!roomId || !user?.id) return;
      try {
        const [messagesRes, codeRes, ownerRes] = await Promise.all([
          api.get(`/rooms/${roomId}/messages`),
          api.get(`/rooms/${roomId}/code`),
          api.get(`/rooms/${roomId}/owner`),
        ]);
        setMessages(messagesRes.data as Message[]);
        if (codeRes.data?.[0]?.code) setCode(codeRes.data[0].code as string);
        setIsOwner(ownerRes.data === user.id);
      } catch (error) {
        console.error("Error loading initial data:", error);
      }
    };
    loadData();
  }, [roomId, user?.id]);

  // --- Action Handlers ---
  const handleMicClick = (): void => {
    if (isSettingUpMedia) return;
    setActiveMic((prev) => !prev);
  };

  const handleVideoClick = (): void => {
    if (isSettingUpMedia) return;
    setActiveVideo((prev) => !prev);
  };

  const handleEditorChange = (value: string | undefined): void => {
    if (value !== undefined) {
      setCode(value);
      socket.emit("send_code", { roomId, code: value });
    }
  };

  const handleMount = (editor: any, monacoInstance: any): void => {
    editorRef.current = editor;
    editor.onDidChangeCursorPosition((e: any) => {
      const { lineNumber, column } = e.position;
      if (user?.fullName) {
        socket.emit("send_cursor", {
          roomId,
          lineNumber,
          column,
          username: user.fullName,
        });
      }
    });
  };

  const handleLogout = (): void => {
    cleanupMedia(true);
    Object.values(connections).forEach((conn) => {
      if (conn.signalingState !== "closed") conn.close();
    });
    setConnections({});
    setRemoteStreams({});
    setRemotePeers([]);
    pendingCandidatesRef.current = {};
    if (user?.id && user.fullName) {
      socket.emit("leave_room", {
        roomId,
        username: user.fullName,
        userId: user.id,
      });
    }
    router.push("/dashboard");
  };

  const saveCode = async (): Promise<void> => {
    if (!isOwner) return;
    setIsRunningSave(true);
    try {
      await api.post("/save", { code, roomId });
    } catch (error) {
      console.error("Error saving code:", error);
    } finally {
      setIsRunningSave(false);
    }
  };

  const runCode = async (): Promise<void> => {
    setIsRunning(true);
    setOutput("Running code...");
    try {
      const response = await api.post<{ output?: string; error?: string }>(
        "/run",
        { code, language: selectedLanguage }
      );
      setOutput(
        response.data.output || response.data.error || "Code executed successfully, no output."
      );
    } catch (error: any) {
      setOutput(error.response?.data?.error || error.message || "Failed to run code");
    } finally {
      setIsRunning(false);
    }
  };

  const handleSubmitMessage = (e: React.FormEvent): void => {
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
    <TooltipProvider>
      <div className="flex flex-col h-screen bg-background text-foreground font-sans">
        {/* Header */}
        <header className="flex items-center justify-between px-4 py-3 border-b bg-gradient-to-r from-primary/10 to-secondary/10">
          <div className="flex items-center gap-3">
            <Code className="h-6 w-6 text-primary" />
            <h1 className="text-xl font-bold tracking-tight">CodeCollab</h1>
            <Separator orientation="vertical" className="h-6 mx-2" />
            <div className="text-sm text-muted-foreground">
              Room: <span className="font-semibold text-foreground">{roomId}</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={activeMic ? "secondary" : "outline"}
                  size="icon"
                  onClick={handleMicClick}
                  disabled={isSettingUpMedia}
                  className="h-9 w-9 rounded-full"
                >
                  {activeMic ? (
                    <Mic className="h-5 w-5 text-green-500" />
                  ) : (
                    <MicOff className="h-5 w-5 text-red-500" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>{activeMic ? "Disable Microphone" : "Enable Microphone"}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={activeVideo ? "secondary" : "outline"}
                  size="icon"
                  onClick={handleVideoClick}
                  disabled={isSettingUpMedia}
                  className="h-9 w-9 rounded-full"
                >
                  {activeVideo ? (
                    <Video className="h-5 w-5 text-green-500" />
                  ) : (
                    <VideoOff className="h-5 w-5 text-red-500" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>{activeVideo ? "Disable Camera" : "Enable Camera"}</TooltipContent>
            </Tooltip>
            <div className="flex items-center gap-2 bg-secondary/20 px-3 py-1 rounded-full">
              <Users className="h-4 w-4 text-green-500" />
              <span className="text-sm font-medium">{userNumber} Active</span>
            </div>
            {isOwner && (
              <div className="px-3 py-1 rounded-full bg-green-500/20 text-green-900 text-sm font-medium">
                Owner
              </div>
            )}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleLogout}
                  className="flex items-center gap-2 hover:bg-destructive/10 hover:border-destructive"
                >
                  <LogOut className="h-4 w-4" />
                  <span>Leave</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>Leave Room</TooltipContent>
            </Tooltip>
          </div>
        </header>

        {/* Main Content */}
        <main className="flex flex-1 overflow-hidden">
          {/* Chat Panel */}
          <aside className="hidden lg:flex flex-col w-96 border-r bg-background">
            <div className="flex items-center px-4 py-3 border-b">
              <User className="h-5 w-5 mr-2 text-primary" />
              <h2 className="text-lg font-semibold">Team Chat</h2>
            </div>
            <ScrollArea className="flex-1 p-4">
              <div className="space-y-4">
                {messages.map((msg, index) => (
                  <div
                    key={index}
                    className={`flex flex-col ${
                      msg.username === user?.fullName ? "items-end" : "items-start"
                    }`}
                  >
                    <div
                      className={`text-xs font-medium ${
                        msg.username === user?.fullName ? "text-primary" : "text-muted-foreground"
                      }`}
                    >
                      {msg.username === user?.fullName ? "You" : msg.username}
                    </div>
                    <div
                      className={`max-w-[80%] rounded-xl px-4 py-2 text-sm shadow-sm ${
                        msg.username === user?.fullName
                          ? "bg-primary text-primary-foreground"
                          : "bg-secondary text-foreground"
                      }`}
                    >
                      {msg.message}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {new Date(msg.createdAt).toLocaleTimeString()}
                    </div>
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>
            </ScrollArea>
            <form onSubmit={handleSubmitMessage} className="flex p-4 border-t gap-2">
              <Input
                type="text"
                placeholder="Type your message..."
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                className="flex-1 rounded-full"
              />
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button type="submit" size="icon" className="rounded-full">
                    <Send className="h-5 w-5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Send Message</TooltipContent>
              </Tooltip>
            </form>
          </aside>

          {/* Editor & Tabs */}
          <div className="flex flex-col flex-1">
            {/* Editor */}
            <div className="flex-1 border-b">
              <MonacoEditor
                height="100%"
                language={selectedLanguage}
                value={code}
                onChange={handleEditorChange}
                onMount={handleMount}
                theme="vs-dark"
                options={{
                  scrollBeyondLastLine: false,
                  automaticLayout: true,
                  minimap: { enabled: false },
                  contextmenu: false,
                  fontSize: 14,
                  lineNumbers: "on",
                  glyphMargin: true,
                }}
              />
            </div>

            {/* Tabs */}
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="grid grid-cols-3 w-full rounded-none border-b bg-secondary/10">
                <TabsTrigger value="output" className="flex items-center gap-2">
                  <Terminal className="h-4 w-4" /> Output
                </TabsTrigger>
                <TabsTrigger value="video" className="flex items-center gap-2">
                  <Video className="h-4 w-4" /> Video
                </TabsTrigger>
                <TabsTrigger value="actions" className="flex items-center gap-2">
                  <Check className="h-4 w-4" /> Actions
                </TabsTrigger>
              </TabsList>
              <TabsContent value="output" className="p-4 max-h-64 overflow-y-auto bg-background/50">
                <pre className="whitespace-pre-wrap break-all font-mono text-sm text-muted-foreground">
                  {output}
                </pre>
              </TabsContent>
              <TabsContent value="video" className="p-4 bg-background/50">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {activeVideo && (
                    <div className="flex flex-col items-center">
                      <video
                        ref={localVideoRef}
                        autoPlay
                        muted
                        playsInline
                        className="w-full max-w-xs h-48 bg-gray-900 rounded-lg shadow-lg object-cover"
                      />
                      <span className="text-sm text-muted-foreground mt-2">You</span>
                    </div>
                  )}
                  {remotePeers.map((peerId) => {
                    const stream = remoteStreams[peerId];
                    if (!stream) return null;
                    return (
                      <div key={peerId} className="flex flex-col items-center">
                        <video
                          ref={(videoElement) => {
                            if (videoElement && stream) {
                              videoElement.srcObject = stream;
                              videoElement.play().catch((e) => console.error("Video play failed:", e));
                            }
                          }}
                          autoPlay
                          playsInline
                          className="w-full max-w-xs h-48 bg-gray-900 rounded-lg shadow-lg object-cover"
                        />
                        <span className="text-sm text-muted-foreground mt-2">{peerId}</span>
                      </div>
                    );
                  })}
                </div>
                {!activeVideo && remotePeers.length === 0 && (
                  <p className="text-center text-muted-foreground">
                    Enable your camera or microphone to start a video call.
                  </p>
                )}
              </TabsContent>
              <TabsContent value="actions" className="p-4 bg-background/50">
                <div className="flex flex-wrap gap-4 items-center">
                  <div className="flex items-center gap-2">
                    <label htmlFor="language-select" className="text-sm font-medium">Language:</label>
                    <select
                      id="language-select"
                      value={selectedLanguage}
                      onChange={(e) => setSelectedLanguage(e.target.value)}
                      className="p-2 border rounded-lg bg-background text-foreground text-sm focus:ring-2 focus:ring-primary"
                    >
                      <option value="python">Python</option>
                      <option value="javascript">JavaScript</option>
                      <option value="typescript">TypeScript</option>
                      <option value="java">Java</option>
                      <option value="csharp">C#</option>
                      <option value="cpp">C++</option>
                      <option value="go">Go</option>
                      <option value="rust">Rust</option>
                      <option value="php">PHP</option>
                    </select>
                  </div>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        onClick={runCode}
                        disabled={isRunning}
                        className="flex items-center gap-2"
                      >
                        {isRunning ? (
                          <>
                            <RefreshCw className="h-4 w-4 animate-spin" /> Running...
                          </>
                        ) : (
                          <>
                            <Terminal className="h-4 w-4" /> Run Code
                          </>
                        )}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Execute the code</TooltipContent>
                  </Tooltip>
                  {isOwner && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          onClick={saveCode}
                          disabled={isRunningSave}
                          className="flex items-center gap-2"
                        >
                          {isRunningSave ? (
                            <>
                              <RefreshCw className="h-4 w-4 animate-spin" /> Saving...
                            </>
                          ) : (
                            <>
                              <Save className="h-4 w-4" /> Save Code
                            </>
                          )}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Save code to room</TooltipContent>
                    </Tooltip>
                  )}
                </div>
              </TabsContent>
            </Tabs>
          </div>
        </main>
      </div>
    </TooltipProvider>
  );
}