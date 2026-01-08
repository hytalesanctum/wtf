// Global variables
let socket;
let currentUsername = '';
let currentRoomId = '';
let messageLog = [];
let darkModeEnabled = localStorage.getItem('darkMode') === 'true';

// Tron Game Variables
let gameActive = false;
let gameCanvas = null;
let gameCtx = null;
let gameState = {
    players: {},
    gridSize: 10,
    gameRunning: false
};
let localPlayer = {
    id: null,
    x: 40,
    y: 30,
    vx: 1,
    vy: 0,
    trail: [],
    color: '#00FF00',
    alive: true
};
let gameLoopInterval = null;
const GAME_SPEED = 100; // milliseconds

// Initialize Socket.IO connection
function initSocket() {
    socket = io('https://wtf-production-bf2a.up.railway.app');

    socket.on('connect', () => {
        console.log('Connected to server');
    });

    socket.on('receive_message', (data) => {
        handleReceivedMessage(data);
    });

    socket.on('user_joined', (data) => {
        displaySystemMessage(data.message);
    });

    socket.on('user_left', (data) => {
        displaySystemMessage(data.message);
    });

    socket.on('user_list', (users) => {
        updateUserList(users);
    });

    socket.on('message_history', (messages) => {
        displayMessageHistory(messages);
    });

    socket.on('messages_cleared', () => {
        document.getElementById('messagesList').innerHTML = '';
    });

    socket.on('disconnect', () => {
        console.log('Disconnected from server');
    });

    socket.on('access_denied', (data) => {
        alert(data.message);
        window.location.href = '/';
    });

    socket.on('game_state_update', (data) => {
        gameState.players = data.players;
        document.getElementById('gamePlayers').textContent = Object.keys(gameState.players).length;
    });

    socket.on('game_started', (data) => {
        gameState.gameRunning = true;
        gameState.players = data.players;
    });

    socket.on('game_ended', (data) => {
        gameState.gameRunning = false;
        document.getElementById('gameStatus').textContent = `${data.winner} wins!`;
        clearInterval(gameLoopInterval);
        document.getElementById('gameStartBtn').disabled = false;
    });
}


// Join room with username
function joinRoom() {
    const usernameInput = document.getElementById('usernameInput');
    const username = usernameInput.value.trim();

    if (!username) {
        alert('Please enter a username');
        return;
    }

    if (username.length < 2) {
        alert('Username must be at least 2 characters');
        return;
    }

    currentUsername = username;
    
    // Use fixed global room for everyone
    currentRoomId = 'global';

    // Hide modal and show chat
    document.getElementById('usernameModal').classList.add('hidden');
    document.getElementById('chatContainer').classList.remove('hidden');

    // Update room info
    document.getElementById('roomInfo').textContent = `Room: ${currentRoomId.substring(0, 8)}... • You are ${username}`;

    // Connect to room
    socket.emit('join_room', {
        username: currentUsername,
        roomId: currentRoomId
    });

    // Request message history
    socket.emit('get_history', currentRoomId);

    // Focus on message input
    document.getElementById('messageInput').focus();

    // Copy room link to clipboard
    const roomLink = `${window.location.origin}`;
    console.log('Shared chatroom:', roomLink);
}

// Generate unique room ID
function generateRoomId() {
    return 'room_' + Math.random().toString(36).substring(2, 15) + 
           Math.random().toString(36).substring(2, 15);
}

// Send message
function sendMessage() {
    const input = document.getElementById('messageInput');
    const message = input.value.trim();

    if (!message) return;

    socket.emit('send_message', {
        message: message,
        roomId: currentRoomId,
        username: currentUsername
    });

    input.value = '';
    input.focus();
}

// Handle received message
function handleReceivedMessage(data) {
    const messagesList = document.getElementById('messagesList');
    const messageDiv = document.createElement('div');
    
    const isOwnMessage = data.username === currentUsername;
    messageDiv.className = `message ${isOwnMessage ? 'own' : ''}`;

    const bubble = document.createElement('div');
    bubble.className = 'message-bubble';

    const username = document.createElement('strong');
    username.textContent = data.username;

    const text = document.createElement('p');
    text.textContent = data.message;

    const time = document.createElement('span');
    time.textContent = new Date(data.timestamp).toLocaleTimeString();

    bubble.appendChild(username);
    bubble.appendChild(text);
    bubble.appendChild(time);
    messageDiv.appendChild(bubble);

    messagesList.appendChild(messageDiv);
    messagesList.scrollTop = messagesList.scrollHeight;
}

// Display message history
function displayMessageHistory(messages) {
    const messagesList = document.getElementById('messagesList');
    messagesList.innerHTML = '';

    messages.forEach(msg => {
        const messageDiv = document.createElement('div');
        const isOwnMessage = msg.username === currentUsername;
        messageDiv.className = `message ${isOwnMessage ? 'own' : ''}`;

        const bubble = document.createElement('div');
        bubble.className = 'message-bubble';

        const username = document.createElement('strong');
        username.textContent = msg.username;

        const text = document.createElement('p');
        text.textContent = msg.message;

        const time = document.createElement('span');
        time.textContent = new Date(msg.timestamp).toLocaleTimeString();

        bubble.appendChild(username);
        bubble.appendChild(text);
        bubble.appendChild(time);
        messageDiv.appendChild(bubble);

        messagesList.appendChild(messageDiv);
    });

    messagesList.scrollTop = messagesList.scrollHeight;
}

// Display system message
function displaySystemMessage(message) {
    const messagesList = document.getElementById('messagesList');
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message system-message';
    messageDiv.textContent = message;
    messagesList.appendChild(messageDiv);
    messagesList.scrollTop = messagesList.scrollHeight;
}

// Update user list
function updateUserList(users) {
    const usersList = document.getElementById('usersList');
    usersList.innerHTML = '';

    users.forEach(user => {
        const userItem = document.createElement('div');
        userItem.className = 'user-item';
        userItem.textContent = user;
        usersList.appendChild(userItem);
    });
}

// Handle key press in message input
function handleKeyPress(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        sendMessage();
    }
    // Shift+Enter allows newline (default textarea behavior)
}

// Leave chat
function leaveChat() {
    if (confirm('Are you sure you want to leave?')) {
        window.location.href = '/';
    }
}

// Toggle dark mode
function toggleDarkMode() {
    darkModeEnabled = !darkModeEnabled;
    document.body.classList.toggle('dark-mode', darkModeEnabled);
    localStorage.setItem('darkMode', darkModeEnabled);
}

// Go to Wikipedia Medicine page
function goToWikipedia() {
    window.open('https://en.wikipedia.org/wiki/Medicine', '_blank');
}

// Toggle Wikipedia Modal
function toggleWikipediaModal() {
    const modal = document.getElementById('wikipediaModal');
    modal.classList.toggle('hidden');
}

// Load Wikipedia content via API
async function loadWikipediaContent() {
    // Content is already in HTML, no need to load
}

// ===== TRON GAME FUNCTIONS =====

function toggleMinigameModal() {
    const modal = document.getElementById('gameModal');
    modal.classList.toggle('hidden');
    
    if (!modal.classList.contains('hidden')) {
        setTimeout(() => {
            if (!gameCanvas) {
                initializeGame();
            }
        }, 50);
    } else {
        stopGame();
    }
}

function initializeGame() {
    gameCanvas = document.getElementById('gameCanvas');
    gameCtx = gameCanvas.getContext('2d');
    
    // Generate random spawn position and color for this player
    localPlayer.id = socket.id;
    localPlayer.x = Math.floor(Math.random() * 70) + 5;
    localPlayer.y = Math.floor(Math.random() * 50) + 5;
    localPlayer.vx = 1;
    localPlayer.vy = 0;
    localPlayer.trail = [];
    localPlayer.alive = true;
    
    // Random color for this player
    const colors = ['#FF0080', '#00FFFF', '#FFFF00', '#00FF00', '#FF00FF', '#FFA500'];
    localPlayer.color = colors[Math.floor(Math.random() * colors.length)];
    
    // Draw initial game board
    drawGameBoard();
    
    // Add keyboard controls
    document.addEventListener('keydown', handleGameKeyDown);
    document.addEventListener('keyup', handleGameKeyUp);
    
    gameActive = true;
}

function handleGameKeyDown(e) {
    if (!gameActive || !gameState.gameRunning) return;
    
    if (e.key === 'Escape') {
        toggleMinigameModal();
        return;
    }
    
    const key = e.key.toLowerCase();
    
    // Prevent reversing into yourself
    if (key === 'arrowup' && localPlayer.vy !== 1) {
        localPlayer.vx = 0;
        localPlayer.vy = -1;
        e.preventDefault();
    } else if (key === 'arrowdown' && localPlayer.vy !== -1) {
        localPlayer.vx = 0;
        localPlayer.vy = 1;
        e.preventDefault();
    } else if (key === 'arrowleft' && localPlayer.vx !== 1) {
        localPlayer.vx = -1;
        localPlayer.vy = 0;
        e.preventDefault();
    } else if (key === 'arrowright' && localPlayer.vx !== -1) {
        localPlayer.vx = 1;
        localPlayer.vy = 0;
        e.preventDefault();
    }
}

function handleGameKeyUp(e) {
    // Reserved for potential usage
}

function startGame() {
    if (gameState.gameRunning) {
        alert('Game already in progress!');
        return;
    }
    
    // Reset local player
    localPlayer.trail = [];
    localPlayer.alive = true;
    localPlayer.x = Math.floor(Math.random() * 70) + 5;
    localPlayer.y = Math.floor(Math.random() * 50) + 5;
    
    // Notify server
    socket.emit('game_start', {
        roomId: currentRoomId,
        player: {
            id: socket.id,
            username: currentUsername,
            x: localPlayer.x,
            y: localPlayer.y,
            color: localPlayer.color
        }
    });
    
    gameState.gameRunning = true;
    document.getElementById('gameStatus').textContent = 'In Progress...';
    document.getElementById('gameStartBtn').disabled = true;
    
    // Start game loop
    gameLoopInterval = setInterval(updateGame, GAME_SPEED);
}

function updateGame() {
    if (!gameState.gameRunning || !localPlayer.alive) {
        return;
    }
    
    // Update local player position
    localPlayer.x += localPlayer.vx;
    localPlayer.y += localPlayer.vy;
    
    // Add current position to trail
    localPlayer.trail.push({x: localPlayer.x, y: localPlayer.y});
    
    // Check collisions
    if (checkCollision()) {
        localPlayer.alive = false;
        socket.emit('game_move', {
            roomId: currentRoomId,
            playerId: socket.id,
            x: localPlayer.x,
            y: localPlayer.y,
            vx: localPlayer.vx,
            vy: localPlayer.vy,
            trail: localPlayer.trail,
            alive: false
        });
        
        document.getElementById('gameStatus').textContent = 'You crashed!';
        gameState.gameRunning = false;
        clearInterval(gameLoopInterval);
    } else {
        // Send position to server
        socket.emit('game_move', {
            roomId: currentRoomId,
            playerId: socket.id,
            x: localPlayer.x,
            y: localPlayer.y,
            vx: localPlayer.vx,
            vy: localPlayer.vy,
            trail: localPlayer.trail,
            alive: true
        });
    }
    
    // Redraw game
    drawGameBoard();
}

function checkCollision() {
    const maxX = gameCanvas.width / gameState.gridSize;
    const maxY = gameCanvas.height / gameState.gridSize;
    
    // Check boundaries
    if (localPlayer.x < 0 || localPlayer.x >= maxX || 
        localPlayer.y < 0 || localPlayer.y >= maxY) {
        return true;
    }
    
    // Check collision with own trail
    for (let point of localPlayer.trail.slice(0, -5)) {
        if (point.x === localPlayer.x && point.y === localPlayer.y) {
            return true;
        }
    }
    
    // Check collision with other players' trails
    for (let playerId in gameState.players) {
        const player = gameState.players[playerId];
        if (playerId === socket.id) continue; // Skip self
        
        for (let point of player.trail) {
            if (point.x === localPlayer.x && point.y === localPlayer.y) {
                return true;
            }
        }
    }
    
    return false;
}

function drawGameBoard() {
    const gridSize = gameState.gridSize;
    
    // Clear canvas with dark background
    gameCtx.fillStyle = '#000011';
    gameCtx.fillRect(0, 0, gameCanvas.width, gameCanvas.height);
    
    // Draw grid
    gameCtx.strokeStyle = '#1a1a2e';
    gameCtx.lineWidth = 0.5;
    
    for (let x = 0; x <= gameCanvas.width; x += gridSize) {
        gameCtx.beginPath();
        gameCtx.moveTo(x, 0);
        gameCtx.lineTo(x, gameCanvas.height);
        gameCtx.stroke();
    }
    
    for (let y = 0; y <= gameCanvas.height; y += gridSize) {
        gameCtx.beginPath();
        gameCtx.moveTo(0, y);
        gameCtx.lineTo(gameCanvas.width, y);
        gameCtx.stroke();
    }
    
    // Draw other players
    for (let playerId in gameState.players) {
        const player = gameState.players[playerId];
        if (playerId === socket.id) continue; // Skip local player
        
        // Draw trail
        gameCtx.strokeStyle = player.color;
        gameCtx.lineWidth = gridSize;
        gameCtx.lineCap = 'square';
        
        if (player.trail.length > 0) {
            gameCtx.beginPath();
            gameCtx.moveTo(player.trail[0].x * gridSize + gridSize/2, 
                           player.trail[0].y * gridSize + gridSize/2);
            
            for (let i = 1; i < player.trail.length; i++) {
                gameCtx.lineTo(player.trail[i].x * gridSize + gridSize/2, 
                              player.trail[i].y * gridSize + gridSize/2);
            }
            gameCtx.stroke();
        }
        
        // Draw bike head
        if (player.trail.length > 0) {
            const head = player.trail[player.trail.length - 1];
            gameCtx.fillStyle = player.color;
            gameCtx.globalAlpha = 0.8;
            gameCtx.fillRect(head.x * gridSize + 1, head.y * gridSize + 1, 
                           gridSize - 2, gridSize - 2);
            gameCtx.globalAlpha = 1;
        }
    }
    
    // Draw local player trail
    gameCtx.strokeStyle = localPlayer.color;
    gameCtx.lineWidth = gridSize;
    gameCtx.lineCap = 'square';
    
    if (localPlayer.trail.length > 0) {
        gameCtx.beginPath();
        gameCtx.moveTo(localPlayer.trail[0].x * gridSize + gridSize/2, 
                       localPlayer.trail[0].y * gridSize + gridSize/2);
        
        for (let i = 1; i < localPlayer.trail.length; i++) {
            gameCtx.lineTo(localPlayer.trail[i].x * gridSize + gridSize/2, 
                          localPlayer.trail[i].y * gridSize + gridSize/2);
        }
        gameCtx.stroke();
    }
    
    // Draw local player bike head (glow effect if alive)
    gameCtx.fillStyle = localPlayer.color;
    if (localPlayer.alive) {
        // Glow effect
        gameCtx.shadowColor = localPlayer.color;
        gameCtx.shadowBlur = 15;
        gameCtx.globalAlpha = 0.9;
    } else {
        gameCtx.globalAlpha = 0.5;
    }
    
    gameCtx.fillRect(localPlayer.x * gridSize + 1, localPlayer.y * gridSize + 1, 
                     gridSize - 2, gridSize - 2);
    gameCtx.globalAlpha = 1;
    gameCtx.shadowBlur = 0;
}

function stopGame() {
    if (gameLoopInterval) {
        clearInterval(gameLoopInterval);
        gameLoopInterval = null;
    }
    
    gameActive = false;
    gameState.gameRunning = false;
    
    document.removeEventListener('keydown', handleGameKeyDown);
    document.removeEventListener('keyup', handleGameKeyUp);
    
    socket.emit('game_stop', {
        roomId: currentRoomId,
        playerId: socket.id
    });
    
    document.getElementById('gameStatus').textContent = 'Waiting...';
    document.getElementById('gameStartBtn').disabled = false;
}

// Check if user already has a username in session
window.addEventListener('load', () => {
    // Apply dark mode if enabled
    if (darkModeEnabled) {
        document.body.classList.add('dark-mode');
    }

    // Pre-load Wikipedia content
    loadWikipediaContent();

    initSocket();

    const usernameInput = document.getElementById('usernameInput');
    usernameInput.focus();

    // Allow joining by pressing Enter
    usernameInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            joinRoom();
        }
    });

    // Copy room link when hovering over room info
    const roomInfo = document.getElementById('roomInfo');
    if (roomInfo) {
        roomInfo.style.cursor = 'pointer';
        roomInfo.addEventListener('click', () => {
            const roomLink = `${window.location.origin}${window.location.search}`;
            navigator.clipboard.writeText(roomLink).then(() => {
                alert('Room link copied to clipboard!');
            });
        });
    }
});

// Clear chat history with password
function clearChatHistory() {
    console.log('Clear button clicked');
    document.getElementById('clearPasswordModal').classList.remove('hidden');
    document.getElementById('clearPassword').focus();
}

function closeClearModal() {
    document.getElementById('clearPasswordModal').classList.add('hidden');
    document.getElementById('clearPassword').value = '';
}

function confirmClearChat() {
    const password = document.getElementById('clearPassword').value;
    console.log('Password entered:', password);
    
    if (password === 'smurf') {
        console.log('Password correct, emitting clear_messages');
        if (socket && socket.connected) {
            socket.emit('clear_messages', {});
            document.getElementById('messagesList').innerHTML = '';
            closeClearModal();
            alert('Chat history cleared!');
        } else {
            alert('Not connected to server!');
        }
    } else {
        alert('Incorrect password!');
        document.getElementById('clearPassword').value = '';
    }
}
