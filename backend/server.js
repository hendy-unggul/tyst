// server.js
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Store connected users
const users = new Map(); // Key: userId, Value: { ws, username, status }

// REST endpoint for login
app.post('/api/login', (req, res) => {
    const { username } = req.body;
    const userId = `user_${Date.now()}`;
    
    res.json({ 
        success: true, 
        userId,
        username 
    });
});

// WebSocket connection handling
wss.on('connection', (ws, req) => {
    console.log('New client connected');
    let currentUserId = null;

    // Handle messages from client
    ws.on('message', (data) => {
        try {
            const message = JSON.parse(data);
            
            switch(message.type) {
                case 'IDENTIFY':
                    // User identifies themselves after login
                    currentUserId = message.userId;
                    users.set(currentUserId, {
                        ws,
                        username: message.username,
                        status: 'online',
                        lastSeen: Date.now()
                    });
                    
                    // Broadcast updated user list
                    broadcastUserList();
                    break;
                    
                case 'FIND_PARTNER':
                    // User wants to find someone to chat
                    handleFindPartner(message.userId, message.gender);
                    break;
                    
                case 'CHAT_REQUEST_RESPONSE':
                    // User responded to chat request (accept/reject)
                    handleChatResponse(message);
                    break;
                    
                case 'SEND_MESSAGE':
                    // Forward message to specific user
                    sendToUser(message.toUserId, {
                        type: 'CHAT_MESSAGE',
                        from: message.from,
                        text: message.text,
                        timestamp: Date.now()
                    });
                    break;
            }
        } catch (error) {
            console.error('Error handling message:', error);
        }
    });

    // Handle disconnect
    ws.on('close', () => {
        if (currentUserId) {
            users.delete(currentUserId);
            broadcastUserList();
        }
        console.log('Client disconnected');
    });
});

// Store pending chat requests
const pendingRequests = new Map(); // Key: toUserId, Value: { fromUserId, fromUsername, timestamp }

function handleFindPartner(userId, gender) {
    const user = users.get(userId);
    if (!user) return;
    
    // Find online users (excluding self)
    const candidates = [];
    users.forEach((value, key) => {
        if (key !== userId && value.status === 'online') {
            candidates.push({
                userId: key,
                username: value.username,
                lastSeen: value.lastSeen
            });
        }
    });
    
    // Sort by lastSeen (newest first)
    candidates.sort((a, b) => b.lastSeen - a.lastSeen);
    
    // Take top 5
    const topCandidates = candidates.slice(0, 5);
    
    // Send notifications to candidates
    topCandidates.forEach(candidate => {
        const requestId = `${userId}_${candidate.userId}_${Date.now()}`;
        pendingRequests.set(requestId, {
            fromUserId: userId,
            fromUsername: user.username,
            toUserId: candidate.userId,
            timestamp: Date.now()
        });
        
        // Send notification to candidate
        sendToUser(candidate.userId, {
            type: 'CHAT_REQUEST',
            requestId,
            from: user.username,
            timestamp: Date.now()
        });
        
        // Auto-expire after 10 seconds
        setTimeout(() => {
            if (pendingRequests.has(requestId)) {
                pendingRequests.delete(requestId);
                // Notify sender that request expired
                sendToUser(userId, {
                    type: 'CHAT_REQUEST_EXPIRED',
                    requestId
                });
            }
        }, 10000);
    });
    
    // Notify sender that we're searching
    sendToUser(userId, {
        type: 'SEARCHING_PARTNER',
        count: topCandidates.length
    });
}

function handleChatResponse(message) {
    const { requestId, accepted } = message;
    const request = pendingRequests.get(requestId);
    
    if (!request) return;
    
    pendingRequests.delete(requestId);
    
    if (accepted) {
        // Notify both users that match is successful
        sendToUser(request.fromUserId, {
            type: 'MATCH_SUCCESS',
            partner: {
                userId: request.toUserId,
                username: request.toUsername
            }
        });
        
        sendToUser(request.toUserId, {
            type: 'MATCH_SUCCESS',
            partner: {
                userId: request.fromUserId,
                username: request.fromUsername
            }
        });
    } else {
        // Notify sender that request was rejected
        sendToUser(request.fromUserId, {
            type: 'CHAT_REQUEST_REJECTED',
            requestId
        });
    }
}

function sendToUser(userId, data) {
    const user = users.get(userId);
    if (user && user.ws.readyState === WebSocket.OPEN) {
        user.ws.send(JSON.stringify(data));
    }
}

function broadcastUserList() {
    const userList = [];
    users.forEach((value, key) => {
        userList.push({
            userId: key,
            username: value.username,
            status: value.status
        });
    });
    
    const message = JSON.stringify({
        type: 'USER_LIST',
        users: userList
    });
    
    users.forEach(user => {
        if (user.ws.readyState === WebSocket.OPEN) {
            user.ws.send(message);
        }
    });
}

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`WebSocket endpoint: ws://localhost:${PORT}`);
});
