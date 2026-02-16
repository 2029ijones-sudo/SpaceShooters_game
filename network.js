// ==================== NETWORK.JS ====================
console.log('network.js loaded');

let peer = null;
let conn = null;
let isHost = false;
let roomCode = null;

// Callbacks for game.js
let onPlayerJoined = null;
let onEnemyUpdate = null;
let onPlayerDisconnect = null;

// Initialize PeerJS with a random ID (host) or specific ID (joiner)
function initPeer(asHost, code, callbacks) {
    return new Promise((resolve, reject) => {
        onPlayerJoined = callbacks.onPlayerJoined;
        onEnemyUpdate = callbacks.onEnemyUpdate;
        onPlayerDisconnect = callbacks.onPlayerDisconnect;

        if (asHost) {
            // Host: create a random peer ID and listen for connections
            peer = new Peer(); // random ID
            peer.on('open', (id) => {
                roomCode = id; // use peer ID as room code
                console.log('Host peer created, room code:', roomCode);
                peer.on('connection', (connection) => {
                    conn = connection;
                    conn.on('data', (data) => {
                        handleData(data);
                    });
                    conn.on('close', () => {
                        if (onPlayerDisconnect) onPlayerDisconnect();
                    });
                    if (onPlayerJoined) onPlayerJoined();
                });
                resolve(roomCode);
            });
        } else {
            // Joiner: connect to given code
            peer = new Peer(); // temporary ID, not used
            peer.on('open', () => {
                conn = peer.connect(code);
                conn.on('open', () => {
                    console.log('Connected to host:', code);
                    conn.on('data', (data) => {
                        handleData(data);
                    });
                    conn.on('close', () => {
                        if (onPlayerDisconnect) onPlayerDisconnect();
                    });
                    resolve();
                });
                conn.on('error', reject);
            });
        }
        peer.on('error', reject);
    });
}

// Handle incoming messages
function handleData(data) {
    switch (data.type) {
        case 'playerUpdate':
            if (onEnemyUpdate) onEnemyUpdate(data.player); // remote player becomes "enemy" in game
            break;
        case 'enemyUpdate':
            // For co-op, host sends enemy positions to client
            if (onEnemyUpdate) onEnemyUpdate(data.enemies);
            break;
        // Add more types as needed
    }
}

// Send player state to remote
function sendPlayerState(playerData) {
    if (conn && conn.open) {
        conn.send({ type: 'playerUpdate', player: playerData });
    }
}

// Host sends enemy positions (for co‑op)
function sendEnemyState(enemiesData) {
    if (conn && conn.open && isHost) {
        conn.send({ type: 'enemyUpdate', enemies: enemiesData });
    }
}

function disconnect() {
    if (conn) conn.close();
    if (peer) peer.destroy();
    conn = null;
    peer = null;
}

window.network = {
    initPeer,
    sendPlayerState,
    sendEnemyState,
    disconnect,
    isHost: () => isHost,
    getRoomCode: () => roomCode
};
