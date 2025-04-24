import http from "http";
import multer from 'multer';
import path from 'path';
import os from "os";
import express from "express";
import cors from "cors";
import { Server } from "socket.io";
import { PrismaClient } from '@prisma/client';
import Docker from "dockerode";
import bodyParser from "body-parser";
import fs from "fs";
import { v4 as uuidv4 } from "uuid";
const { verifyWebhook } = require('@clerk/nextjs/webhooks');


// Initialize Express app
const app = express();
const server = http.createServer(app);
const docker = new Docker({ host: "localhost", port: 2375 });
app.use(bodyParser.json());


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

const uploadsDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure multer storage
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadsDir);
  },
  filename: function (req, file, cb) {
    // Create unique filename with original extension
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, 'profile-' + uniqueSuffix + ext);
  }
});

// File filter to only allow image files
const fileFilter = (req, file, cb) => {
  // Accept only image files
  if (file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb(new Error('Only image files are allowed!'), false);
  }
};

// Set up multer upload
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB max file size
  },
  fileFilter: fileFilter
});

// Serve static files from the uploads directory
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

// Handle file upload endpoint
app.post('/api/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    // Create the URL for the uploaded file
    const fileUrl = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;
    
    // Return the file URL
    res.status(200).json({
      success: true,
      message: "File uploaded successfully",
      url: fileUrl,
      filename: req.file.filename
    });
  } catch (error) {
    console.error("Error uploading file:", error);
    res.status(500).json({
      error: "Failed to upload file",
      details: error.message
    });
  }
});

// Error handling middleware for multer errors
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    // A Multer error occurred when uploading
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        error: "File size too large",
        details: "Maximum file size is 5MB"
      });
    }
    return res.status(400).json({
      error: "File upload error",
      details: err.message
    });
  } else if (err) {
    // An unknown error occurred
    return res.status(500).json({
      error: "Server error",
      details: err.message
    });
  }
  next();
});


app.post('/api/webhooks', async (req, res) => {
  try {
    const evt = await verifyWebhook(req, {
      signingSecret: process.env.CLERK_WEBHOOK_SIGNING_SECRET,
    });

    const { id, type, data } = evt;

    console.log(`Received webhook: ID=${id}, Type=${type}`);

    if (type === 'user.created' || type === 'user.updated') {
      const { id: clerkId, email_addresses, first_name, last_name, unsafe_metadata, profile_image_url } = data;

      const email = email_addresses[0]?.email_address || '';
      // Generate username from email or unsafe_metadata, ensure uniqueness
      let username = unsafe_metadata?.username || email.split('@')[0] || `user_${clerkId}`;
      // Check for username uniqueness
      const existingUser = await prisma.user.findUnique({ where: { username } });
      if (existingUser && existingUser.clerkId !== clerkId) {
        username = `${username}_${clerkId.slice(0, 8)}`;
      }

      const bio = unsafe_metadata?.bio || null;
      const profilePicture = profile_image_url || null;

      await prisma.user.upsert({
        where: { clerkId },
        update: {
          email,
          username,
          firstName: first_name || '',
          lastName: last_name || '',
          bio,
          profilePicture,
        },
        create: {
          clerkId,
          email,
          username,
          firstName: first_name || '',
          lastName: last_name || '',
          bio,
          profilePicture,
        },
      });

      console.log(`User ${type === 'user.created' ? 'created' : 'updated'}: clerkId=${clerkId}, email=${email}`);
    } else if (type === 'user.deleted') {
      const { id: clerkId } = data;
      await prisma.user.delete({
        where: { clerkId },
      }).catch(err => {
        if (err.code === 'P2025') {
          console.warn(`User not found for deletion: clerkId=${clerkId}`);
        } else {
          throw err;
        }
      });
      console.log(`User deleted: clerkId=${clerkId}`);
    }

    return res.status(200).send('Webhook received');
  } catch (err) {
    console.error('Webhook error:', err);
    if (err instanceof PrismaClientKnownRequestError) {
      if (err.code === 'P2002') {
        return res.status(400).send('Duplicate email or username');
      }
    }
    return res.status(400).send('Error processing webhook');
  }
});



app.get('/api/user/:clerkId', async (req, res) => {
  try {
    const { clerkId } = req.params;
    const user = await prisma.user.findUnique({
      where: { clerkId },
    });
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    res.json(user);
  }
  catch (error) {
    console.error("Error fetching user:", error);
    res.status(500).json({
      error: "Failed to fetch user",
      details: error.message
    });
  }
});

app.put('/api/user/:clerkId', async (req, res) => {
  try {
    const { clerkId } = req.params;
    const { username, firstName, lastName, email , profilePicture } = req.body;
    if (!username || !firstName || !lastName || !email || !profilePicture) {
      return res.status(400).json({ error: "All fields are required" });
    }
    const updatedUser = await prisma.user.update({
      where: { clerkId },
      data: {
        username,
        firstName,
        lastName,
        email,
        profilePicture
      }
    })
    res.json(updatedUser);

  }
  catch (error) {
    console.error("Error updating user:", error);
    res.status(500).json({
      error: "Failed to update user",
      details: error.message
    });
  }
})

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
    const { roomName , userId } = req.body;
    if (!roomName || typeof roomName !== 'string') {
      return res.status(400).json({ 
        error: "Invalid room name",
        details: "Room name is required and must be a string"
      });
    }
    const owner = await prisma.user.findUnique({
      where: { clerkId: userId },
    });

    const room = await prisma.room.create({
      data: { name: roomName , ownerId: owner.id },
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

app.get('/api/rooms/:roomId/owner', async (req, res) => {
  try {
    const { roomId } = req.params;
    const room = await prisma.room.findUnique({
      where: {
        id: parseInt(roomId)
      },
      include: {
        owner: true // Include the owner relation
      }
    });

    if (!room) {
      return res.status(404).json({
        error: "Room not found",
        details: "No room exists with the provided ID"
      });
    }

    // Just return the owner's clerk ID
    res.json(room.owner.clerkId);
  } catch (error) {
    console.error("Error fetching room owner:", error);
    res.status(500).json({ 
      error: "Failed to fetch room owner",
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

app.post("/api/run", async (req, res) => {
  console.log("Received /api/run request:", req.body);
  const { language, code } = req.body;

  // Validate input
  if (!language || !code || typeof code !== "string") {
    return res.status(400).json({
      error: "Invalid input",
      details: "Both 'language' and 'code' are required, and 'code' must be a string",
    });
  }

  // Validate language
  if (!["python", "javascript"].includes(language)) {
    return res.status(400).json({
      error: "Unsupported language",
      details: "Language must be 'python' or 'javascript'",
    });
  }

  const fileId = uuidv4();
  const fileName = `${fileId}.${language === "python" ? "py" : "js"}`;
  const tempFile = `${os.tmpdir()}\\${fileName}`; // Use os.tmpdir() and backslash for Windows

  try {
    // Ensure the temp directory exists
    const tempDir = os.tmpdir();
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    // Write code to temporary file
    console.log("Writing to temp file:", tempFile); // Debug log
    fs.writeFileSync(tempFile, code);

    const image = language === "python" ? "python:3.10" : "node:18";

    // Create and configure Docker container
    const container = await docker.createContainer({
      Image: image,
      Cmd: language === "python"
        ? ["python", `/code/${fileName}`]
        : ["node", `/code/${fileName}`],
      HostConfig: {
        Binds: [`${tempFile}:/code/${fileName}`], // Use absolute path
        NetworkMode: "none",
        AutoRemove: true,
        Memory: 128 * 1024 * 1024,
      },
    });

    // Attach to container output
    const stream = await container.attach({
      stream: true,
      stdout: true,
      stderr: true,
    });
    let output = "";
    stream.on("data", (data) => (output += data.toString()));

    // Start and wait for container
    await container.start();
    await container.wait();

    res.json({ output });
  } catch (err) {
    console.error("Execution error:", err);
    res.status(500).json({
      error: "Execution failed",
      details: err.message,
    });
  } finally {
    // Clean up temporary file
    try {
      if (fs.existsSync(tempFile)) {
        fs.unlinkSync(tempFile);
        console.log("Temp file deleted:", tempFile);
      }
    } catch (err) {
      console.error("Error deleting temp file:", err);
    }
  }
});

app.post("/api/save" , async (req, res) => {
  const { roomId, code } = req.body;
  console.log("Received /api/save request:", req.body);
  if (!roomId ||!code) {
    return res.status(400).json({
      error: "Invalid input",
      details: "Both 'roomId' and 'code' are required",
    });
  }
  try {
    const savedCode = await prisma.code.upsert({
      where: { roomId: parseInt(roomId) },
      update: { code: code },
      create: { roomId: parseInt(roomId), code: code },
    });
    res.json({ message: "Code saved successfully", savedCode });
  } catch (error) {
    console.error("Error saving code:", error);
    res.status(500).json({
      error: "Failed to save code",
      details: error.message,
    });
  }
}
);
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