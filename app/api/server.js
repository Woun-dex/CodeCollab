import http from "http";
import express from "express";
import cors from "cors";
import { Server } from "socket.io";
import { PrismaClient } from '@prisma/client';

// Initialize Express app
const app = express();
const server = http.createServer(app);

// Initialize Prisma client
const prisma = new PrismaClient();

// Test database connection
async function testConnection() {
  try {
    await prisma.$connect();
    console.log("Database connected successfully");
  } catch (error) {
    console.error("Database connection error:", error);
    process.exit(1);
  }
}

app.use(express.json());
app.use(cors());

// Rooms routes
app.get('/api/rooms', async (req, res) => {
  try {
    const rooms = await prisma.room.findMany();
    res.json(rooms);
  } catch (error) {
    console.error("Error fetching rooms:", error);
    res.status(500).json({ 
      error: "Failed to fetch rooms",
      details: error.message 
    });
  }
});

app.post('/api/rooms', async (req, res) => {
  try {
    const { roomName } = req.body;
    if (!roomName || typeof roomName !== 'string') {
      return res.status(400).json({ 
        error: "Invalid room name",
        details: "Room name is required and must be a string"
      });
    }

    const room = await prisma.room.create({
      data: { name: roomName },
    });
    res.status(201).json(room);
  } catch (error) {
    console.error("Error creating room:", error);
    res.status(500).json({ 
      error: "Failed to create room",
      details: error.message 
    });
  }
});

app.put('/api/rooms', async (req, res) => {
  try {
    const { id, roomName } = req.body;
    const room = await prisma.room.update({
      where: { id: Number(id) },
      data: { name: roomName },
    });
    res.json(room);
  } catch (error) {
    console.error("Error updating room:", error);
    res.status(500).json({ 
      error: "Failed to update room",
      details: error.message 
    });
  }
});

app.delete('/api/rooms/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    await prisma.room.delete({
      where: { id },
    });
    res.json({ message: 'Room deleted' });
  } catch (error) {
    console.error("Error deleting room:", error);
    res.status(500).json({ 
      error: "Failed to delete room",
      details: error.message 
    });
  }
});

// Get messages by room ID
app.get('/api/rooms/:roomId/messages', async (req, res) => {
  try {
    const { roomId } = req.params;
    const messages = await prisma.message.findMany({
      where: {
        roomId: parseInt(roomId)
      },
      orderBy: {
        createdAt: 'asc'
      }
    });
    res.json(messages);
  } catch (error) {
    console.error("Error fetching messages:", error);
    res.status(500).json({ 
      error: "Failed to fetch messages",
      details: error.message 
    });
  }
});

app.get('/api/rooms/:roomId/code', async (req, res) => {
  try {
    const { roomId } = req.params;
    const code = await prisma.code.findMany({
      where: {
        roomId: parseInt(roomId)
      },
    });
    res.json(code);
  } catch (error) {
    console.error("Error fetching code:", error);
    res.status(500).json({ 
      error: "Failed to fetch code",
      details: error.message 
    });
  }
});

// Add an endpoint to get active users in a room
app.get('/api/rooms/:roomId/users', (req, res) => {
  try {
    const { roomId } = req.params;
    
    if (!roomUsers.has(roomId)) {
      return res.json({ users: [], count: 0 });
    }
    
    const users = Array.from(roomUsers.get(roomId).values());
    res.json({
      users: users,
      count: users.length
    });
  } catch (error) {
    console.error("Error fetching active users:", error);
    res.status(500).json({ 
      error: "Failed to fetch active users",
      details: error.message 
    });
  }
});

// Initialize Socket.io
const io = new Server(server, {
  cors: { origin: "*" },
});

// Store active users by room
const roomUsers = new Map();

// Store socket-to-room mapping for quick lookup on disconnect
const socketRooms = new Map();

// Get count of users in a room
function getRoomUserCount(roomId) {
  if (!roomUsers.has(roomId)) {
    return 0;
  }
  return roomUsers.get(roomId).size;
}

// Update and broadcast user count for a room
function updateUserCount(roomId) {
  const count = getRoomUserCount(roomId);
  io.to(roomId).emit("user_count_update", { count, roomId });
  console.log(`Room ${roomId} now has ${count} users`);
  return count;
}

// Test database connection before starting server
testConnection().then(() => {
  // Socket.io connection handling
  io.on("connection", (socket) => {
    console.log("🔌 Socket connected:", socket.id);
    
    socket.on("join_room", (data) => {
      const { roomId, username } = data;
      console.log("User joining room:", { roomId, username, socketId: socket.id });
      
      // Join the socket.io room
      socket.join(roomId);
      
      // Initialize room users map if needed
      if (!roomUsers.has(roomId)) {
        roomUsers.set(roomId, new Map());
      }
      
      // Add user to the room
      roomUsers.get(roomId).set(socket.id, { 
        id: socket.id,
        username,
        joinedAt: new Date()
      });
      
      // Store which room this socket is in for easy cleanup
      socketRooms.set(socket.id, roomId);
      
      // Update and broadcast user count
      const userCount = updateUserCount(roomId);
      
      // Notify all users in the room about the new user
      io.to(roomId).emit("user_joined", { 
        username, 
        socketId: socket.id,
        userCount
      });
      
      // Send the current user list to the newly joined user
      const userList = Array.from(roomUsers.get(roomId).values());
      socket.emit("user_list", { users: userList, count: userList.length });
    });

    socket.on("send_message", async (data) => {
      try {
        console.log("Received message data:", data);
        const { username, roomId, text } = data; 
        
        if (!username || !roomId || !text) {
          console.error("Missing required fields:", { username, roomId, text });
          return;
        }

        // Save message to database
        const savedMessage = await prisma.message.create({
          data: {
            username: username,
            roomId: parseInt(roomId),
            message: text
          }
        });
        console.log("Message saved to database:", savedMessage);

        // Create message object to send
        const messageToSend = {
          id: savedMessage.id,
          username: savedMessage.username,
          message: savedMessage.message,
          createdAt: savedMessage.createdAt
        };

        // Emit to all clients in the room (including sender)
        io.to(roomId).emit("receive_message", messageToSend);
        console.log("Message broadcasted:", messageToSend);
      } catch (error) {
        console.error("Error in send_message:", error);
      }
    });

    socket.on("send_code", async (data) => {
      try {
        const { roomId, code } = data;
        if (!roomId || !code) {
          console.error("Missing required fields for code sync:", { roomId, code });
          return;
        }

        await prisma.code.upsert({
          where: { roomId: parseInt(roomId) }, // Find by roomId
          update: {
            code: code, // Update the code field
          },
          create: {
            roomId: parseInt(roomId), // Create with roomId
            code: code, // Initial code content
          },
        });

        io.to(roomId).emit("receive_code", { code });
        console.log("Code broadcasted to room:", roomId);
      } catch (error) {
        console.error("Error in code sync:", error);
      }
    });

    // Handle cursor position updates
    socket.on("send_cursor", (data) => {
      try {
        const { roomId, lineNumber, column, username } = data;
        
        if (!roomId || lineNumber === undefined || column === undefined || !username) {
          console.error("Missing required fields for cursor update:", data);
          return;
        }
        
        // Store the cursor position with the user
        if (roomUsers.has(roomId) && roomUsers.get(roomId).has(socket.id)) {
          const userInfo = roomUsers.get(roomId).get(socket.id);
          userInfo.cursorPosition = { lineNumber, column };
        }
        
        // Broadcast cursor position to all other clients in the room
        socket.to(roomId).emit("receive_cursor", {
          username,
          lineNumber,
          column
        });
      } catch (error) {
        console.error("Error handling cursor position:", error);
      }
    });

    // Request active users count
    socket.on("get_user_count", ({ roomId }) => {
      if (roomId) {
        const count = getRoomUserCount(roomId);
        socket.emit("user_count", { count, roomId });
      }
    });
    socket.on("leave_room", (data) => {
      const { roomId, username } = data;
      console.log(`User ${username} (${socket.id}) is leaving room ${roomId}`);
    
      // Leave the socket.io room
      socket.leave(roomId);
      
      // Remove user from our tracking structures
      if (roomId && roomUsers.has(roomId)) {
        const users = roomUsers.get(roomId);
        
        // Remove user from room
        users.delete(socket.id);
        
        // Clean up empty room
        if (users.size === 0) {
          roomUsers.delete(roomId);
          console.log(`Room ${roomId} is now empty and cleaned up`);
        } else {
          // Update user count
          const userCount = updateUserCount(roomId);
          
          // Notify others that user left
          io.to(roomId).emit("user_left", { 
            username,
            socketId: socket.id,
            userCount
          });
        }
      }
      
      // Update socket-to-room mapping
      socketRooms.delete(socket.id);
    });

    socket.on("disconnect", () => {
      console.log("🔌 Socket disconnected:", socket.id);
      
      // Get the room this socket was in
      const roomId = socketRooms.get(socket.id);
      if (roomId && roomUsers.has(roomId)) {
        const users = roomUsers.get(roomId);
        
        // Get user data before removing
        const userData = users.get(socket.id);
        
        // Remove user from room
        if (userData) {
          users.delete(socket.id);
          
          // Clean up empty room
          if (users.size === 0) {
            roomUsers.delete(roomId);
            console.log(`Room ${roomId} is now empty and cleaned up`);
          } else {
            // Update user count and notify room
            updateUserCount(roomId);
            
            // Notify others that user left
            socket.to(roomId).emit("user_left", { 
              username: userData.username,
              socketId: socket.id
            });
          }
        }
      }
      
      // Clean up socket-to-room mapping
      socketRooms.delete(socket.id);
    });    
  });

  // Start server
  server.listen(8000, () => {
    console.log("Server is running on port 8000");
  });
});