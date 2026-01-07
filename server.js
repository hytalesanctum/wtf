const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Store active users and their room/username mapping
const users = new Map();
const rooms = new Map();

app.use(express.static('public'));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

io.on('connection', (socket) => {
  console.log('New user connected:', socket.id);

  // User sets their username and joins a room
  socket.on('join_room', (data) => {
    const { username, roomId } = data;
    
    socket.join(roomId);
    
    // Store user info
    users.set(socket.id, {
      username,
      roomId,
      joinedAt: new Date()
    });

    // Initialize room if it doesn't exist
    if (!rooms.has(roomId)) {
      rooms.set(roomId, {
        messages: [],
        users: [],
        createdAt: new Date()
      });
    }

    // Add user to room's user list
    const room = rooms.get(roomId);
    room.users.push({
      socketId: socket.id,
      username
    });

    // Notify others that user joined
    socket.broadcast.to(roomId).emit('user_joined', {
      username,
      message: `${username} joined the chat`,
      timestamp: new Date()
    });

    // Send current user list to all in room
    io.to(roomId).emit('user_list', room.users.map(u => u.username));

    console.log(`${username} joined room ${roomId}`);
  });

  // Handle incoming messages
  socket.on('send_message', (data) => {
    const user = users.get(socket.id);
    
    if (!user) {
      console.log('Message from unknown user:', socket.id);
      return;
    }

    const { message, roomId, encryptedMessage } = data;

    // Store message in room history
    const room = rooms.get(roomId);
    if (room) {
      room.messages.push({
        username: user.username,
        message: encryptedMessage || message,
        timestamp: new Date(),
        senderId: socket.id
      });

      // Keep only last 100 messages per room
      if (room.messages.length > 100) {
        room.messages.shift();
      }
    }

    // Broadcast message to all in room
    io.to(roomId).emit('receive_message', {
      username: user.username,
      message: encryptedMessage || message,
      timestamp: new Date(),
      senderId: socket.id
    });
  });

  // Handle user disconnect
  socket.on('disconnect', () => {
    const user = users.get(socket.id);
    
    if (user) {
      const room = rooms.get(user.roomId);
      if (room) {
        room.users = room.users.filter(u => u.socketId !== socket.id);
        
        // Notify others
        io.to(user.roomId).emit('user_left', {
          username: user.username,
          message: `${user.username} left the chat`,
          userCount: room.users.length
        });

        io.to(user.roomId).emit('user_list', room.users.map(u => u.username));

        // Clean up empty rooms
        if (room.users.length === 0) {
          rooms.delete(user.roomId);
        }
      }

      users.delete(socket.id);
      console.log(`${user.username} disconnected from room ${user.roomId}`);
    }
  });

  // Get message history when user joins
  socket.on('get_history', (roomId) => {
    const room = rooms.get(roomId);
    if (room) {
      socket.emit('message_history', room.messages);
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Chatroom server running on http://localhost:${PORT}`);
});
