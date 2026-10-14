const WebSocket = require(“ws”); const http = require(“http”);

const PORT = process.env.PORT || 3000;

// Servidor HTTP const server = http.createServer((req, res) => {
res.writeHead(200, { “Content-Type”: “text/plain” }); res.end(“Servidor
Multiplayer Online!”); });

const wss = new WebSocket.Server({ server }); const rooms = new Map();

function gerarID() { return Math.random().toString(36).substring(2,
8).toUpperCase(); }

function send(ws, message) { if (ws.readyState === WebSocket.OPEN)
ws.send(message); }

function enviarParaSala(room, message, excluir = null) { for (const
player of room.players) { if (player !== excluir) send(player, message);
} }

function atribuirSlot(room, ws) { const usados = new Set(); for (const
player of room.players) { if (player !== ws &&
Number.isInteger(player.slot)) usados.add(player.slot); }

    for (let slot = 1; slot <= room.maxPlayers; slot++) {
        if (!usados.has(slot)) {
            ws.slot = slot;
            return slot;
        }
    }

    return null;

}

function enviarSlots(room) { // Envia a cada cliente o mapa atual de IDs
e posições P1-P4. for (const player of room.players) { send(player,
MY_SLOT|${player.slot || 0}); for (const member of room.players) {
send(player, PLAYER_SLOT|${member.playerId}|${member.slot || 0}); } } }

function enviarPings(room) { let mensagem = “PINGS”; for (const player
of room.players) { mensagem += |${player.playerId}|${player.ping}; }
enviarParaSala(room, mensagem); }

function enviarQuantidadePlayers(room) { const quantidade =
room.players.size; for (const player of room.players) { send(player,
PLAYER_COUNT|${player.playerId}|${quantidade}|${room.maxPlayers}); } }

function leaveRoom(ws) { if (!ws.roomName) return;

    const roomName = ws.roomName;
    const room = rooms.get(roomName);

    if (!room) {
        ws.roomName = null;
        ws.slot = null;
        return;
    }

    room.players.delete(ws);

    // Libera o slot para que o próximo jogador possa reutilizá-lo.
    ws.slot = null;
    ws.roomName = null;

    enviarParaSala(room, `PLAYER_LEFT|${ws.playerId}`);

    if (room.players.size === 0) {
        rooms.delete(roomName);
        console.log(`Sala removida: ${roomName}`);
    } else {
        enviarPings(room);
        enviarQuantidadePlayers(room);
        enviarSlots(room);
    }

}

wss.on(“connection”, (ws) => { ws.playerId = gerarID(); ws.roomName =
null; ws.slot = null; ws.ping = 0;

    console.log(`Jogador conectado: ${ws.playerId}`);
    send(ws, `CONNECTED|${ws.playerId}`);

    ws.on("message", (data) => {
        const message = data.toString();
        const parts = message.split("|");
        const command = parts[0];

        if (command === "PING") {
            send(ws, `PONG|${parts[1] || ""}`);
        }

        else if (command === "SET_PING") {
            let ping = Number(parts[1]);
            if (!Number.isFinite(ping)) return;
            ping = Math.max(0, Math.min(Math.round(ping), 9999));
            ws.ping = ping;

            if (ws.roomName) {
                const room = rooms.get(ws.roomName);
                if (room) enviarParaSala(room, `PLAYER_PING|${ws.playerId}|${ws.ping}`);
            }
        }

        else if (command === "CRIAR") {
            const roomName = parts[1];
            const password = parts[2];
            const maxPlayers = Math.max(2, Math.min(Number(parts[3]) || 2, 4));

            if (!roomName || !password) {
                send(ws, "ERROR|DADOS_INVALIDOS");
                return;
            }

            if (rooms.has(roomName)) {
                send(ws, "ERROR|SALA_JA_EXISTE");
                return;
            }

            leaveRoom(ws);

            const room = {
                password,
                maxPlayers,
                hostId: ws.playerId,
                players: new Set()
            };

            ws.slot = 1; // Criador da sala é sempre P1.
            ws.roomName = roomName;
            room.players.add(ws);
            rooms.set(roomName, room);

            send(ws, `ROOM_CREATED|${roomName}|${ws.playerId}`);
            enviarPings(room);
            enviarQuantidadePlayers(room);
            enviarSlots(room);

            console.log(`Sala criada: ${roomName} (anfitrião ${ws.playerId}, P1)`);
        }

        else if (command === "ENTRAR") {
            const roomName = parts[1];
            const password = parts[2];
            const room = rooms.get(roomName);

            if (!room) {
                send(ws, "ERROR|SALA_NAO_EXISTE");
                return;
            }

            if (room.password !== password) {
                send(ws, "ERROR|SENHA_INCORRETA");
                return;
            }

            // Se o cliente já estiver nesta sala, não o adicione de novo.
            if (ws.roomName === roomName) {
                enviarSlots(room);
                return;
            }

            if (room.players.size >= room.maxPlayers) {
                send(ws, "ERROR|SALA_CHEIA");
                return;
            }

            leaveRoom(ws);

            const slot = atribuirSlot(room, ws);
            if (!slot) {
                send(ws, "ERROR|SALA_CHEIA");
                return;
            }

            room.players.add(ws);
            ws.roomName = roomName;

            send(ws, `ROOM_JOINED|${roomName}|${ws.playerId}`);
            enviarParaSala(room, `PLAYER_JOINED|${ws.playerId}`, ws);

            enviarPings(room);
            enviarQuantidadePlayers(room);
            enviarSlots(room);
        }

        else if (command === "MSG") {
            if (!ws.roomName) {
                send(ws, "ERROR|SEM_SALA");
                return;
            }

            const room = rooms.get(ws.roomName);
            if (!room) return;

            const gameMessage = message.substring(4);
            // Mantém o protocolo existente: retransmite aos outros jogadores.
            enviarParaSala(room, `MSG|${ws.playerId}|${gameMessage}`, ws);
        }

        else if (command === "SAIR") {
            leaveRoom(ws);
            send(ws, "LEFT_ROOM");
        }

        else {
            if (!ws.roomName) {
                send(ws, "ERROR|SEM_SALA");
                return;
            }

            const room = rooms.get(ws.roomName);
            if (!room) return;

            enviarParaSala(room, message, ws);
        }
    });

    ws.on("close", () => {
        console.log(`Jogador desconectado: ${ws.playerId}`);
        leaveRoom(ws);
    });

});

server.listen(PORT, () => {
console.log(Servidor rodando na porta ${PORT}); });
