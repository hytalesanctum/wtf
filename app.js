// Global variables
let socket;
let currentUsername = '';
let currentRoomId = '';
let roomEncryptionKey = null; // Shared room key
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
}

// Derive shared room key from room ID
function deriveRoomKey(roomId) {
    // Use SHA512 hash of room ID to derive a 32-byte key
    const roomIdBytes = nacl.util.decodeUTF8(roomId);
    const hash = nacl.hash(roomIdBytes);
    return hash.slice(0, 32); // NaCl.secretbox needs 32 bytes
}

// Encrypt a message with shared room key (symmetric encryption)
function encryptMessage(message, key) {
    if (!key) return message;
    
    const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);
    const messageBytes = nacl.util.decodeUTF8(message);
    
    const encrypted = nacl.secretbox(messageBytes, nonce, key);
    const encryptedBytes = new Uint8Array(nonce.length + encrypted.length);
    encryptedBytes.set(nonce);
    encryptedBytes.set(encrypted, nonce.length);
    
    return nacl.util.encodeBase64(encryptedBytes);
}

// Decrypt a message with shared room key (symmetric decryption)
function decryptMessage(encryptedMessage, key) {
    if (!key) return encryptedMessage;
    
    try {
        const encryptedBytes = nacl.util.decodeBase64(encryptedMessage);
        const nonce = encryptedBytes.slice(0, nacl.secretbox.nonceLength);
        const cipher = encryptedBytes.slice(nacl.secretbox.nonceLength);
        
        const decrypted = nacl.secretbox.open(cipher, nonce, key);
        
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

    // Derive shared room key from room ID
    roomEncryptionKey = deriveRoomKey(currentRoomId);
    console.log('Derived room encryption key');

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

    let encryptedMessage = message;
    let isEncrypted = false;
    
    // Encrypt message with shared room key
    if (roomEncryptionKey) {
        try {
            encryptedMessage = encryptMessage(message, roomEncryptionKey);
            isEncrypted = true;
            console.log('Message encrypted with room key');
        } catch (e) {
            console.error('Encryption error:', e);
            isEncrypted = false;
        }
    }

    socket.emit('send_message', {
        message: encryptedMessage,
        roomId: currentRoomId,
        username: currentUsername,
        isEncrypted: isEncrypted
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
    
    // Decrypt message if it's encrypted
    let displayMessage = data.message;
    let wasEncrypted = data.isEncrypted;
    if (data.isEncrypted && roomEncryptionKey) {
        try {
            displayMessage = decryptMessage(data.message, roomEncryptionKey);
            console.log('Message decrypted');
        } catch (e) {
            console.error('Decryption error:', e);
            displayMessage = '[Decryption failed]';
            wasEncrypted = false;
        }
    }
    
    text.textContent = displayMessage;

    const timeContainer = document.createElement('div');
    timeContainer.style.display = 'flex';
    timeContainer.style.alignItems = 'center';
    timeContainer.style.gap = '4px';

    const time = document.createElement('span');
    time.textContent = new Date(data.timestamp).toLocaleTimeString();

    const lockIcon = document.createElement('span');
    lockIcon.className = 'message-lock-icon';
    lockIcon.title = wasEncrypted ? 'Encrypted' : 'Not encrypted';
    lockIcon.textContent = wasEncrypted ? '🔒' : '🔓';

    timeContainer.appendChild(time);
    timeContainer.appendChild(lockIcon);

    bubble.appendChild(username);
    bubble.appendChild(text);
    bubble.appendChild(timeContainer);
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
        
        // Decrypt message if it's encrypted
        let displayMessage = msg.message;
        let wasEncrypted = msg.isEncrypted;
        if (msg.isEncrypted && roomEncryptionKey) {
            try {
                displayMessage = decryptMessage(msg.message, roomEncryptionKey);
            } catch (e) {
                console.error('Decryption error:', e);
                displayMessage = '[Decryption failed]';
                wasEncrypted = false;
            }
        }
        
        text.textContent = displayMessage;

        const timeContainer = document.createElement('div');
        timeContainer.style.display = 'flex';
        timeContainer.style.alignItems = 'center';
        timeContainer.style.gap = '4px';

        const time = document.createElement('span');
        time.textContent = new Date(msg.timestamp).toLocaleTimeString();

        const lockIcon = document.createElement('span');
        lockIcon.className = 'message-lock-icon';
        lockIcon.title = wasEncrypted ? 'Encrypted' : 'Not encrypted';
        lockIcon.textContent = wasEncrypted ? '🔒' : '🔓';

        timeContainer.appendChild(time);
        timeContainer.appendChild(lockIcon);

        bubble.appendChild(username);
        bubble.appendChild(text);
        bubble.appendChild(timeContainer);
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
