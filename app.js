// Global variables
let socket;
let currentUsername = '';
let currentRoomId = '';
let encryptionKeys = null;
let messageLog = [];
let darkModeEnabled = localStorage.getItem('darkMode') === 'true';

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

    socket.on('disconnect', () => {
        console.log('Disconnected from server');
    });
}

// Generate encryption keys for this session
function generateEncryptionKeys() {
    const keyPair = nacl.box.keyPair();
    return keyPair;
}

// Encrypt a message
function encryptMessage(message, publicKey) {
    if (!encryptionKeys) return message;
    
    const nonce = nacl.randomBytes(nacl.box.nonceLength);
    const messageBytes = nacl.util.decodeUTF8(message);
    
    const encrypted = nacl.box(messageBytes, nonce, publicKey, encryptionKeys.secretKey);
    const encryptedBytes = new Uint8Array(nonce.length + encrypted.length);
    encryptedBytes.set(nonce);
    encryptedBytes.set(encrypted, nonce.length);
    
    return nacl.util.encodeBase64(encryptedBytes);
}

// Decrypt a message
function decryptMessage(encryptedMessage, publicKey) {
    if (!encryptionKeys) return encryptedMessage;
    
    try {
        const encryptedBytes = nacl.util.decodeBase64(encryptedMessage);
        const nonce = encryptedBytes.slice(0, nacl.box.nonceLength);
        const cipher = encryptedBytes.slice(nacl.box.nonceLength);
        
        const decrypted = nacl.box.open(cipher, nonce, publicKey, encryptionKeys.secretKey);
        
        if (decrypted === false) {
            return '[Decryption failed]';
        }
        
        return nacl.util.encodeUTF8(decrypted);
    } catch (e) {
        console.error('Decryption error:', e);
        return '[Decryption failed]';
    }
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

    // For now, send message as-is (encryption happens on receiver side in this simple implementation)
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

// Check if user already has a username in session
window.addEventListener('load', () => {
    // Apply dark mode if enabled
    if (darkModeEnabled) {
        document.body.classList.add('dark-mode');
    }

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
