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
      const messages = JSON.parse(data);
      // Clear corrupted/encrypted messages - look for messages that appear to be base64
      const hasCorruptedMessages = messages.some(msg => 
        typeof msg.message === 'string' && 
        msg.message.length > 50 && 
        /^[A-Za-z0-9+/=]+$/.test(msg.message)
      );
      if (hasCorruptedMessages) {
        console.log('Detected corrupted messages, clearing...');
        return [];
      }
      return messages;
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

// ===== TRON GAME STATE (Global) =====
const gameRooms = new Map();
const gameCountdowns = new Map();

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

    const { message } = data;
    const roomId = GLOBAL_ROOM;

    // Store message in room history
    const room = rooms.get(roomId);
    if (room) {
      const newMessage = {
        username: user.username,
        message: message,
        timestamp: new Date(),
        senderId: socket.id
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
      senderId: socket.id
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

  // ===== TRON GAME SOCKET EVENTS =====

  function getGameRoom(roomId) {
    if (!gameRooms.has(roomId)) {
      gameRooms.set(roomId, {
        players: {},
        gameRunning: false,
        ready: {},
        nextCorner: 0
      });
    }
    return gameRooms.get(roomId);
  }

  function getAvailableCorner(gameRoom) {
    if (gameRoom.nextCorner >= 4) return -1; // Max 4 players
    const corner = gameRoom.nextCorner;
    gameRoom.nextCorner++;
    return corner;
  }

  socket.on('game_join', (data) => {
    const gameRoom = getGameRoom(data.roomId);
    
    // Assign corner if available
    const cornerIndex = getAvailableCorner(gameRoom);
    if (cornerIndex === -1) {
      socket.emit('game_error', { message: 'Game is full (max 4 players)' });
      return;
    }
    
    // Add player
    gameRoom.players[data.playerId] = {
      id: data.playerId,
      username: data.username,
      cornerIndex: cornerIndex,
      ready: false,
      trail: [],
      alive: true,
      x: 0,
      y: 0,
      vx: 1,
      vy: 0,
      color: ''
    };
    
    gameRoom.ready[data.playerId] = false;
    
    // Notify all players
    io.to(data.roomId).emit('game_player_joined', {
      players: gameRoom.players
    });
  });

  socket.on('game_ready', (data) => {
    const gameRoom = getGameRoom(data.roomId);
    
    if (!gameRoom.players[data.playerId]) {
      console.log('Player not in game room:', data.playerId);
      return;
    }
    
    gameRoom.ready[data.playerId] = true;
    gameRoom.players[data.playerId].ready = true;
    
    const readyCount = Object.values(gameRoom.ready).filter(r => r).length;
    const playerCount = Object.keys(gameRoom.players).length;
    
    console.log(`[${data.roomId}] Player ${data.username} ready. Ready: ${readyCount}/${playerCount}, GameRunning: ${gameRoom.gameRunning}`);
    
    // Notify all players of ready state
    io.to(data.roomId).emit('game_ready_state', {
      readyPlayers: readyCount,
      totalPlayers: playerCount
    });
    
    // Start countdown if 2+ players ready and game not running
    if (readyCount >= 2 && playerCount >= 2 && !gameRoom.gameRunning && !gameCountdowns.has(data.roomId)) {
      console.log(`[${data.roomId}] Starting countdown...`);
      startGameCountdown(data.roomId, gameRoom, io);
    }
  });

  function startGameCountdown(roomId, gameRoom, io) {
    let countdown = 3;
    gameCountdowns.set(roomId, true);
    gameRoom.gameRunning = true;
    
    const countdownInterval = setInterval(() => {
      io.to(roomId).emit('game_countdown', { countdown: countdown });
      
      if (countdown === 0) {
        clearInterval(countdownInterval);
        gameCountdowns.delete(roomId);
        
        // Reset ready states and start game
        Object.keys(gameRoom.ready).forEach(id => {
          gameRoom.ready[id] = false;
        });
        
        // Initialize positions in corners
        for (let playerId in gameRoom.players) {
          const player = gameRoom.players[playerId];
          const corners = [
            { x: 1, y: 1, vx: 1, vy: 0 },      // Top-left: move right
            { x: 78, y: 1, vx: -1, vy: 0 },    // Top-right: move left
            { x: 1, y: 58, vx: 1, vy: 0 },     // Bottom-left: move right
            { x: 78, y: 58, vx: -1, vy: 0 }    // Bottom-right: move left
          ];
          
          if (player.cornerIndex >= 0 && player.cornerIndex < corners.length) {
            const corner = corners[player.cornerIndex];
            player.x = corner.x;
            player.y = corner.y;
            player.vx = corner.vx;
            player.vy = corner.vy;
            player.trail = [{ x: corner.x, y: corner.y }];
          }
        }
        
        io.to(roomId).emit('game_started', {
          players: gameRoom.players
        });
      }
      
      countdown--;
    }, 1000);
  }

  socket.on('game_input', (data) => {
    const gameRoom = getGameRoom(data.roomId);
    if (gameRoom.players[data.playerId]) {
      gameRoom.players[data.playerId].vx = data.vx;
      gameRoom.players[data.playerId].vy = data.vy;
    }
  });

  socket.on('game_move', (data) => {
    const gameRoom = getGameRoom(data.roomId);
    
    if (gameRoom.players[data.playerId]) {
      gameRoom.players[data.playerId].x = data.x;
      gameRoom.players[data.playerId].y = data.y;
      gameRoom.players[data.playerId].vx = data.vx;
      gameRoom.players[data.playerId].vy = data.vy;
      gameRoom.players[data.playerId].trail = data.trail;
      gameRoom.players[data.playerId].alive = data.alive;
    }

    // Broadcast to all players in room
    io.to(data.roomId).emit('game_state_update', {
      players: gameRoom.players
    });

    // Check if only one player left alive
    const aliveCount = Object.values(gameRoom.players).filter(p => p.alive).length;
    if (aliveCount <= 1 && Object.values(gameRoom.players).length > 1) {
      const winner = Object.values(gameRoom.players).find(p => p.alive);
      gameRoom.gameRunning = false;
      gameRoom.nextCorner = 0; // Reset corner assignment
      
      io.to(data.roomId).emit('game_ended', {
        winner: winner ? winner.username : 'Nobody',
        winnerId: winner ? winner.id : null
      });
    }
  });

  socket.on('game_leave', (data) => {
    const gameRoom = getGameRoom(data.roomId);
    
    if (gameRoom.players[data.playerId]) {
      delete gameRoom.players[data.playerId];
      delete gameRoom.ready[data.playerId];
    }

    if (Object.keys(gameRoom.players).length === 0) {
      gameRooms.delete(data.roomId);
      gameCountdowns.delete(data.roomId);
    } else {
      io.to(data.roomId).emit('game_state_update', {
        players: gameRoom.players
      });
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Chatroom server running on http://localhost:${PORT}`);
});
