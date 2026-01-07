# Encrypted Chatroom

A real-time encrypted chatroom with no login required. Anyone with the link can join and chat securely.

## Features

- 🔐 **End-to-end encryption** using TweetNaCl.js (NaCl public-key cryptography)
- 💬 **Real-time messaging** via WebSockets (Socket.io)
- 👤 **No login required** - username-based identification
- 🔗 **Shareable room links** - anyone with the link can join
- 👥 **User list** showing who's currently in the room
- 🌙 **Dark mode** support
- 📱 **Responsive design** that works on mobile and desktop
- 💾 **Message history** for users joining existing rooms

## Getting Started

### Prerequisites

- Node.js (v14 or higher)
- npm

### Installation

1. Clone the repository
```bash
git clone https://github.com/hytalesanctum/wtf.git
cd wtf
```

2. Install dependencies
```bash
npm install
```

3. Start the server
```bash
npm start
```

4. Open your browser and go to `http://localhost:3000`

## Usage

1. Enter a username on the first page
2. Share the generated room URL with others
3. Anyone with the link can join the same room and start chatting
4. Messages are encrypted end-to-end using NaCl cryptography
5. Toggle dark mode with the 🌙 button
6. Open Wikipedia Medicine with the 📚 button

## Security

- Messages are encrypted on the client side using NaCl public-key authenticated encryption
- Each session generates unique ephemeral keys
- Server stores and relays encrypted messages without being able to decrypt them
- No user authentication or login required - access is based on sharing the room link

## Architecture

- **Backend**: Node.js + Express + Socket.io
- **Frontend**: HTML5, CSS3, JavaScript
- **Encryption**: TweetNaCl.js (NaCl cryptography library)

## Files

- `server.js` - Express server with Socket.io for real-time communication
- `public/index.html` - Chat interface markup
- `public/style.css` - Styling and dark mode support
- `public/app.js` - Frontend logic and encryption handling

## License

MIT
