// server.js - FIXED VERSION WITH FULL LOGGING
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

// Store pending chat requests
const pendingRequests = new Map();

console.log('🚀 SERVER STARTING...');
console.log('📦 Users Map initialized');
console.log('📦 PendingRequests Map initialized');

// REST endpoint for login
app.post('/api/login', (req, res) => {
    const { username } = req.body;
    const userId = `user_${Date.now()}`;
    
    console.log(`✅ /api/login - User: ${username}, ID: ${userId}`);
    
    res.json({ 
        success: true, 
        userId,
        username 
    });
});

// TEST ENDPOINT - Check server status
app.get('/api/test', (req, res) => {
    console.log('🔍 /api/test called');
    res.json({ 
        status: 'ok', 
        time: Date.now(),
        usersOnline: users.size,
        pendingRequests: pendingRequests.size
    });
});

// WebSocket connection handling
wss.on('connection', (ws, req) => {
    console.log('🔌 New client connected');
    let currentUserId = null;

    ws.on('message', (data) => {
        try {
            const message = JSON.parse(data);
            console.log(`📨 Received: ${message.type} from ${message.userId || 'unknown'}`);
            
            switch(message.type) {
                case 'IDENTIFY':
                    currentUserId = message.userId;
                    users.set(currentUserId, {
                        ws,
                        username: message.username,
                        status: 'online',
                        lastSeen: Date.now()
                    });
                    console.log(`✅ User IDENTIFIED: ${message.username} (${currentUserId})`);
                    console.log(`👥 Total users online: ${users.size}`);
                    broadcastUserList();
                    break;
                    
                case 'FIND_PARTNER':
                    console.log(`🔍 FIND_PARTNER: User ${message.userId} looking for ${message.gender} partner`);
                    handleFindPartner(message.userId, message.gender);
                    break;
                    
                case 'CHAT_REQUEST_RESPONSE':
                    console.log(`💬 CHAT_REQUEST_RESPONSE: ${message.accepted ? 'ACCEPTED' : 'REJECTED'} - Request: ${message.requestId}`);
                    handleChatResponse(message);
                    break;
                    
                case 'SEND_MESSAGE':
                    console.log(`✉️ SEND_MESSAGE: From ${message.from} to ${message.toUserId}: "${message.text.substring(0,20)}..."`);
                    sendToUser(message.toUserId, {
                        type: 'CHAT_MESSAGE',
                        from: message.from,
                        text: message.text,
                        timestamp: Date.now()
                    });
                    break;
                    
                default:
                    console.log(`⚠️ Unknown message type: ${message.type}`);
            }
        } catch (error) {
            console.error('❌ Error handling message:', error);
        }
    });

    ws.on('close', () => {
        if (currentUserId) {
            const user = users.get(currentUserId);
            console.log(`🔌 Client disconnected: ${user?.username || currentUserId}`);
            users.delete(currentUserId);
            console.log(`👥 Total users online: ${users.size}`);
            broadcastUserList();
        }
    });

    ws.on('error', (error) => {
        console.error('❌ WebSocket error:', error);
    });
});

function handleFindPartner(userId, gender) {
    const user = users.get(userId);
    if (!user) {
        console.log(`❌ FIND_PARTNER: User ${userId} not found`);
        return;
    }
    
    console.log(`👤 User ${user.username} (${userId}) mencari partner...`);
    
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
    
    console.log(`📊 Found ${candidates.length} online candidates`);
    
    candidates.sort((a, b) => b.lastSeen - a.lastSeen);
    const topCandidates = candidates.slice(0, 5);
    
    console.log(`🎯 Top 5 candidates: ${topCandidates.map(c => c.username).join(', ')}`);
    
    topCandidates.forEach(candidate => {
        const requestId = `${userId}_${candidate.userId}_${Date.now()}`;
        
        // FIX: Simpan username di pendingRequests
        pendingRequests.set(requestId, {
            fromUserId: userId,
            fromUsername: user.username,  // ✅ Simpan username pengirim
            toUserId: candidate.userId,
            toUsername: candidate.username, // ✅ Simpan username penerima
            timestamp: Date.now()
        });
        
        console.log(`📤 Sending CHAT_REQUEST to ${candidate.username} (${candidate.userId}) - Request ID: ${requestId}`);
        
        sendToUser(candidate.userId, {
            type: 'CHAT_REQUEST',
            requestId,
            from: user.username,
            timestamp: Date.now()
        });
        
        // Set timeout for request expiration
        setTimeout(() => {
            if (pendingRequests.has(requestId)) {
                console.log(`⏰ CHAT_REQUEST_EXPIRED: ${requestId}`);
                pendingRequests.delete(requestId);
                sendToUser(userId, {
                    type: 'CHAT_REQUEST_EXPIRED',
                    requestId
                });
            }
        }, 10000); // 10 seconds timeout
    });
    
    sendToUser(userId, {
        type: 'SEARCHING_PARTNER',
        count: topCandidates.length
    });
    
    console.log(`✅ FIND_PARTNER complete for ${user.username}`);
}

function handleChatResponse(message) {
    const { requestId, accepted } = message;
    const request = pendingRequests.get(requestId);
    
    if (!request) {
        console.log(`❌ CHAT_RESPONSE: Request ${requestId} not found`);
        return;
    }
    
    console.log(`📨 Processing response for request ${requestId}: ${accepted ? 'ACCEPTED' : 'REJECTED'}`);
    console.log(`   From: ${request.fromUsername} (${request.fromUserId})`);
    console.log(`   To: ${request.toUsername} (${request.toUserId})`);
    
    pendingRequests.delete(requestId);
    
    if (accepted) {
        console.log(`✅ MATCH_SUCCESS! ${request.fromUsername} <-> ${request.toUsername}`);
        
        // Send to requester
        sendToUser(request.fromUserId, {
            type: 'MATCH_SUCCESS',
            partner: {
                userId: request.toUserId,
                username: request.toUsername  // ✅ Sekarang pasti ada
            }
        });
        
        // Send to acceptor
        sendToUser(request.toUserId, {
            type: 'MATCH_SUCCESS',
            partner: {
                userId: request.fromUserId,
                username: request.fromUsername  // ✅ Sekarang pasti ada
            }
        });
        
        console.log(`✅ MATCH_SUCCESS messages sent to both users`);
    } else {
        console.log(`❌ CHAT_REQUEST_REJECTED: ${requestId}`);
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
        console.log(`📨 Sent ${data.type} to ${user.username} (${userId})`);
    } else {
        console.log(`⚠️ Failed to send to ${userId}: user not found or connection closed`);
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
    
    console.log(`📢 Broadcasting USER_LIST to ${users.size} users`);
    
    users.forEach((user, userId) => {
        if (user.ws.readyState === WebSocket.OPEN) {
            user.ws.send(message);
        }
    });
}

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
    console.log('\n' + '='.repeat(50));
    console.log(`🚀 SERVER RUNNING on port ${PORT}`);
    console.log(`🔌 WebSocket endpoint: ws://localhost:${PORT}`);
    console.log(`🌐 HTTP endpoint: http://localhost:${PORT}`);
    console.log(`🧪 Test endpoint: http://localhost:${PORT}/api/test`);
    console.log('='.repeat(50) + '\n');
});
