// server.js - FINAL VERSION FOR 1-ON-1 REAL USER CHAT
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// ============ STORAGE (SEMUA DI RAM, GA ADA DATABASE) ============
const users = new Map(); // Key: userId, Value: { ws, username, status, inChatWith }
const pendingRequests = new Map(); // Key: requestId, Value: { fromUserId, fromUsername, toUserId, toUsername, timestamp }

// ============ REST ENDPOINT (CEPAT) ============
app.post('/api/login', (req, res) => {
    const { username } = req.body;
    const userId = `user_${Date.now()}`;
    res.json({ success: true, userId, username });
});

// Test endpoint
app.get('/api/test', (req, res) => {
    res.json({ 
        status: 'ok', 
        usersOnline: users.size,
        pendingRequests: pendingRequests.size
    });
});

// ============ WEBSOCKET CONNECTION ============
wss.on('connection', (ws, req) => {
    console.log('🔌 New client connected');
    let currentUserId = null;

    ws.on('message', (data) => {
        try {
            const message = JSON.parse(data);
            
            switch(message.type) {
                case 'IDENTIFY':
                    currentUserId = message.userId;
                    users.set(currentUserId, {
                        ws,
                        username: message.username,
                        status: 'online',
                        inChatWith: null,
                        lastSeen: Date.now()
                    });
                    console.log(`✅ User IDENTIFIED: ${message.username} (${currentUserId})`);
                    broadcastUserList();
                    break;
                    
                case 'FIND_PARTNER':
                    handleFindPartner(message.userId, message.gender);
                    break;
                    
                case 'CHAT_REQUEST_RESPONSE':
                    handleChatResponse(message);
                    break;
                    
                case 'SEND_MESSAGE':
                    handleSendMessage(message);
                    break;
                    
                case 'LEAVE_CHAT':
                    handleLeaveChat(message.userId);
                    break;
            }
        } catch (error) {
            console.error('❌ Error handling message:', error);
        }
    });

    ws.on('close', () => {
        if (currentUserId) {
            console.log(`🔌 Client disconnected: ${users.get(currentUserId)?.username || currentUserId}`);
            
            // Kasih tau partner kalo ada yang disconnect
            const user = users.get(currentUserId);
            if (user && user.inChatWith) {
                const partner = users.get(user.inChatWith);
                if (partner && partner.ws.readyState === WebSocket.OPEN) {
                    partner.ws.send(JSON.stringify({
                        type: 'PARTNER_DISCONNECTED',
                        message: 'Partner meninggalkan chat'
                    }));
                }
            }
            
            users.delete(currentUserId);
            broadcastUserList();
        }
    });

    ws.on('error', (error) => {
        console.error('❌ WebSocket error:', error);
    });
});

// ============ CORE FUNCTIONS ============

function handleFindPartner(userId, gender) {
    const user = users.get(userId);
    if (!user) return;
    
    console.log(`👤 ${user.username} mencari partner...`);
    
    // Cari 5 user online yang bukan diri sendiri dan tidak sedang chat
    const candidates = [];
    users.forEach((value, key) => {
        if (key !== userId && value.status === 'online' && !value.inChatWith) {
            candidates.push({
                userId: key,
                username: value.username,
                lastSeen: value.lastSeen
            });
        }
    });
    
    // Ambil 5 paling fresh
    const topCandidates = candidates
        .sort((a, b) => b.lastSeen - a.lastSeen)
        .slice(0, 5);
    
    if (topCandidates.length === 0) {
        // Kalo ga ada partner real, kasih AI fallback
        ws.send(JSON.stringify({
            type: 'NO_REAL_PARTNER',
            message: 'Coba dengan AI dulu ya'
        }));
        return;
    }
    
    // Kirim request ke setiap candidate
    topCandidates.forEach(candidate => {
        const requestId = `${userId}_${candidate.userId}_${Date.now()}`;
        
        // Simpan request
        pendingRequests.set(requestId, {
            fromUserId: userId,
            fromUsername: user.username,
            toUserId: candidate.userId,
            toUsername: candidate.username,
            timestamp: Date.now()
        });
        
        // Kirim request ke candidate
        sendToUser(candidate.userId, {
            type: 'CHAT_REQUEST',
            requestId,
            from: user.username,
            fromId: userId,
            timestamp: Date.now()
        });
        
        // Set timeout 10 detik
        setTimeout(() => {
            if (pendingRequests.has(requestId)) {
                console.log(`⏰ Request expired: ${requestId}`);
                pendingRequests.delete(requestId);
                
                // Kasih tau pengirim kalo request expired
                sendToUser(userId, {
                    type: 'REQUEST_EXPIRED',
                    requestId,
                    message: 'Partner tidak merespon'
                });
            }
        }, 10000);
    });
    
    // Kasih tau pengirim bahwa pencarian dimulai
    sendToUser(userId, {
        type: 'SEARCHING_STARTED',
        count: topCandidates.length
    });
}

function handleChatResponse(message) {
    const { requestId, accepted } = message;
    const request = pendingRequests.get(requestId);
    
    if (!request) {
        console.log(`❌ Request ${requestId} not found`);
        return;
    }
    
    pendingRequests.delete(requestId);
    
    if (accepted) {
        console.log(`✅ MATCH: ${request.fromUsername} <-> ${request.toUsername}`);
        
        // Update status kedua user
        const fromUser = users.get(request.fromUserId);
        const toUser = users.get(request.toUserId);
        
        if (fromUser && toUser) {
            fromUser.status = 'in_chat';
            fromUser.inChatWith = request.toUserId;
            toUser.status = 'in_chat';
            toUser.inChatWith = request.fromUserId;
            
            // Kirim MATCH_SUCCESS ke kedua user
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
        }
    } else {
        // Ditolak, kasih tau pengirim
        sendToUser(request.fromUserId, {
            type: 'REQUEST_REJECTED',
            requestId,
            message: `${request.toUsername} menolak ajakanmu`
        });
    }
}

function handleSendMessage(message) {
    const { from, to, text } = message;
    
    // Validasi: kedua user ada dan sedang chat
    const fromUser = users.get(from);
    const toUser = users.get(to);
    
    if (!fromUser || !toUser) return;
    if (fromUser.inChatWith !== to || toUser.inChatWith !== from) return;
    
    // Forward pesan
    sendToUser(to, {
        type: 'CHAT_MESSAGE',
        from: fromUser.username,
        fromId: from,
        text: text,
        timestamp: Date.now()
    });
}

function handleLeaveChat(userId) {
    const user = users.get(userId);
    if (!user || !user.inChatWith) return;
    
    const partnerId = user.inChatWith;
    const partner = users.get(partnerId);
    
    // Reset status
    user.status = 'online';
    user.inChatWith = null;
    
    if (partner) {
        partner.status = 'online';
        partner.inChatWith = null;
        
        // Kasih tau partner
        sendToUser(partnerId, {
            type: 'PARTNER_LEFT',
            message: 'Partner meninggalkan chat'
        });
    }
}

function sendToUser(userId, data) {
    const user = users.get(userId);
    if (user && user.ws.readyState === WebSocket.OPEN) {
        user.ws.send(JSON.stringify(data));
        return true;
    }
    return false;
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

// ============ START SERVER ============
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
    console.log('\n' + '='.repeat(50));
    console.log('🚀 JEJAK CHAT SERVER RUNNING');
    console.log('='.repeat(50));
    console.log(`📡 Port: ${PORT}`);
    console.log(`🔌 WebSocket: ws://localhost:${PORT}`);
    console.log(`🌐 HTTP: http://localhost:${PORT}`);
    console.log(`🧪 Test: http://localhost:${PORT}/api/test`);
    console.log('='.repeat(50) + '\n');
});
