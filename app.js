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

    socket.on('access_denied', (data) => {
        alert(data.message);
        window.location.href = '/';
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
    
    if (!modal.classList.contains('hidden')) {
        loadWikipediaContent();
    }
}

// Load Wikipedia content via API
async function loadWikipediaContent() {
    const contentDiv = document.getElementById('wikipediaContent');
    
    try {
        // Use Wikipedia's REST API with mobile endpoint
        const response = await fetch('https://en.wikipedia.org/api/rest_v1/page/mobile/sections/Medicine', {
            headers: {
                'Accept': 'application/json'
            }
        });
        
        if (!response.ok) {
            throw new Error('Failed to fetch');
        }
        
        const data = await response.json();
        
        let html = '<h1>Medicine</h1>';
        
        if (data.sections) {
            data.sections.forEach(section => {
                if (section.text) {
                    html += `<h2>${section.text}</h2>`;
                }
            });
        }
        
        contentDiv.innerHTML = html || getDefaultMedicineContent();
    } catch (error) {
        console.error('Error loading Wikipedia:', error);
        contentDiv.innerHTML = getDefaultMedicineContent();
    }
}

// Fallback content if API fails
function getDefaultMedicineContent() {
    return `
        <h1>Medicine</h1>
        <p><strong>Medicine</strong> is the science and practice of diagnosing, treating, and preventing disease.</p>
        
        <h2>Definition</h2>
        <p>Medicine encompasses a variety of health care practices evolved to maintain and restore health by the prevention and treatment of illness. It is both an area of knowledge—a science of body systems and diseases—and the applied practice of that knowledge.</p>
        
        <h2>History</h2>
        <p>The practice of medicine dates back to prehistoric times, with the oldest known medical texts appearing around 1600 BC. Ancient medical practitioners developed empirical treatments and surgical techniques that were passed down through generations.</p>
        
        <h2>Branches of Medicine</h2>
        <ul>
            <li><strong>Internal Medicine</strong> - Treatment of adult diseases</li>
            <li><strong>Pediatrics</strong> - Treatment of children</li>
            <li><strong>Surgery</strong> - Operative treatment</li>
            <li><strong>Psychiatry</strong> - Mental health treatment</li>
            <li><strong>Cardiology</strong> - Heart and circulatory system</li>
            <li><strong>Oncology</strong> - Cancer treatment</li>
            <li><strong>Neurology</strong> - Nervous system disorders</li>
        </ul>
        
        <h2>Modern Medicine</h2>
        <p>Modern medicine relies on various tools and techniques including:</p>
        <ul>
            <li>Pharmaceutical drugs</li>
            <li>Surgical procedures</li>
            <li>Diagnostic imaging</li>
            <li>Laboratory testing</li>
            <li>Psychological therapies</li>
        </ul>
        
        <h2>Medical Ethics</h2>
        <p>Modern medical practice is guided by ethical principles including autonomy, beneficence, non-maleficence, and justice. Healthcare providers must maintain confidentiality and obtain informed consent from patients.</p>
        
        <h2>Future of Medicine</h2>
        <p>Emerging fields in medicine include personalized medicine, regenerative medicine, and digital health technologies that are revolutionizing how healthcare is delivered.</p>
    `;
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
