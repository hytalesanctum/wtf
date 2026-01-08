const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const geoip = require('geoip-lite');

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

// Global room ID
const GLOBAL_ROOM = 'global';

// Allowed countries (ISO 2-letter country codes)
const ALLOWED_COUNTRIES = ['MA', 'AT', 'IR', 'IQ'];

// Message history file
const MESSAGES_FILE = path.join(__dirname, 'messages.json');

// Load persisted messages from file
function loadMessages() {
  try {
    if (fs.existsSync(MESSAGES_FILE)) {
      const data = fs.readFileSync(MESSAGES_FILE, 'utf8');
      return JSON.parse(data);
    }
  } catch (err) {
    console.error('Error loading messages:', err);
  }
  return [];
}

// Save messages to file
function saveMessages(messages) {
  try {
    fs.writeFileSync(MESSAGES_FILE, JSON.stringify(messages, null, 2));
  } catch (err) {
    console.error('Error saving messages:', err);
  }
}

// Initialize global room with persisted messages
const globalMessages = loadMessages();
rooms.set(GLOBAL_ROOM, {
  messages: globalMessages,
  users: [],
  createdAt: new Date()
});

app.use(express.static('.'));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

io.on('connection', (socket) => {
  console.log('New user connected:', socket.id);

  // Get user's IP address
  const clientIp = socket.handshake.headers['x-forwarded-for']?.split(',')[0] || 
                   socket.handshake.address || 
                   socket.conn.remoteAddress;

  // Get geolocation data
  const geo = geoip.lookup(clientIp);
  const country = geo?.country;

  console.log(`Connection from IP: ${clientIp}, Country: ${country}`);

  // Check if user's country is allowed
  if (!ALLOWED_COUNTRIES.includes(country)) {
    console.log(`Access denied for IP ${clientIp} from ${country}`);
    socket.emit('access_denied', {
      message: `Access denied.`
    });
    socket.disconnect(true);
    return;
  }

  console.log(`Access granted for IP ${clientIp} from ${country}`);

  // User sets their username and joins a room
  socket.on('join_room', (data) => {
    const { username, roomId } = data;
    
    // Override roomId to always be the global room
    const actualRoomId = GLOBAL_ROOM;
    socket.join(actualRoomId);
    
    // Store user info
    users.set(socket.id, {
      username,
      roomId: actualRoomId,
      joinedAt: new Date()
    });

    // Get global room
    const room = rooms.get(actualRoomId);

    // Add user to room's user list
    room.users.push({
      socketId: socket.id,
      username
    });

    // Notify others that user joined
    socket.broadcast.to(actualRoomId).emit('user_joined', {
      username,
      message: `${username} joined the chat`,
      timestamp: new Date()
    });

    // Send current user list to all in room
    io.to(actualRoomId).emit('user_list', room.users.map(u => u.username));

    console.log(`${username} joined global room`);
  });

  // Handle incoming messages
  socket.on('send_message', (data) => {
    const user = users.get(socket.id);
    
    if (!user) {
      console.log('Message from unknown user:', socket.id);
      return;
    }

    const { message, isEncrypted } = data;
    const roomId = GLOBAL_ROOM;

    // Store message in room history
    const room = rooms.get(roomId);
    if (room) {
      const newMessage = {
        username: user.username,
        message: message,
        timestamp: new Date(),
        senderId: socket.id,
        isEncrypted: isEncrypted || false
      };
      room.messages.push(newMessage);

      // Save to file
      saveMessages(room.messages);

      // Keep only last 1000 messages in memory
      if (room.messages.length > 1000) {
        room.messages.shift();
        saveMessages(room.messages);
      }
    }

    // Broadcast message to all in room
    io.to(roomId).emit('receive_message', {
      username: user.username,
      message: message,
      timestamp: new Date(),
      senderId: socket.id,
      isEncrypted: isEncrypted || false
    });
  });

  // Handle clear messages
  socket.on('clear_messages', (data) => {
    const roomId = GLOBAL_ROOM;
    const room = rooms.get(roomId);
    if (room) {
      room.messages = [];
      saveMessages([]);
      io.to(roomId).emit('messages_cleared', {});
    }
  });

  // Handle user disconnect
  socket.on('disconnect', () => {
    const user = users.get(socket.id);
    
    if (user) {
      const room = rooms.get(GLOBAL_ROOM);
      if (room) {
        room.users = room.users.filter(u => u.socketId !== socket.id);
        
        // Remove public key
        userPublicKeys.delete(user.username);
        
        // Notify others
        io.to(GLOBAL_ROOM).emit('user_left', {
          username: user.username,
          message: `${user.username} left the chat`,
          userCount: room.users.length
        });

        io.to(GLOBAL_ROOM).emit('user_list', room.users.map(u => u.username));
      }

      users.delete(socket.id);
      console.log(`${user.username} disconnected`);
    }
  });

  // Get message history when user joins
  socket.on('get_history', (roomId) => {
    const room = rooms.get(GLOBAL_ROOM);
    if (room) {
      socket.emit('message_history', room.messages);
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Chatroom server running on http://localhost:${PORT}`);
});
