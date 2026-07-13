const WebSocket = require("ws");
const http = require("http");

const PORT = process.env.PORT || 3000;

// Servidor HTTP necessário para hospedagens como Render
const server = http.createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("Servidor Multiplayer Online!");
});

const wss = new WebSocket.Server({ server });

// Salas
const rooms = new Map();

// Criar ID aleatório
function gerarID() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function send(ws, message) {
    if (ws.readyState === WebSocket.OPEN) {
        ws.send(message);
    }
}

function enviarParaSala(room, message, excluir = null) {
    for (const player of room.players) {
        if (player !== excluir) {
            send(player, message);
        }
    }
}

function leaveRoom(ws) {

    if (!ws.roomName) return;

    const room = rooms.get(ws.roomName);

    if (!room) return;

    room.players.delete(ws);

    enviarParaSala(
        room,
        `PLAYER_LEFT|${ws.playerId}`
    );

    // Se não tem ninguém, remove a sala
    if (room.players.size === 0) {
        rooms.delete(ws.roomName);
        console.log(`Sala removida: ${ws.roomName}`);
    }

    ws.roomName = null;
}


wss.on("connection", (ws) => {

    ws.playerId = gerarID();
    ws.roomName = null;

    console.log(
        `Jogador conectado: ${ws.playerId}`
    );

    send(
        ws,
        `CONNECTED|${ws.playerId}`
    );


    ws.on("message", (data) => {

        const message = data.toString();
        const parts = message.split("|");

        const command = parts[0];


        // CRIAR|NomeDaSala|Senha|MaxJogadores
        if (command === "CRIAR") {

            const roomName = parts[1];
            const password = parts[2];
            const maxPlayers = Number(parts[3]) || 2;


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

                password: password,

                maxPlayers: maxPlayers,

                hostId: ws.playerId,

                players: new Set()

            };


            room.players.add(ws);

            rooms.set(roomName, room);

            ws.roomName = roomName;


            send(
                ws,
                `ROOM_CREATED|${roomName}|${ws.playerId}`
            );


            console.log(
                `Sala criada: ${roomName}`
            );
        }



        // ENTRAR|NomeDaSala|Senha
        else if (command === "ENTRAR") {


            const roomName = parts[1];
            const password = parts[2];


            const room = rooms.get(roomName);


            if (!room) {

                send(
                    ws,
                    "ERROR|SALA_NAO_EXISTE"
                );

                return;
            }


            if (room.password !== password) {

                send(
                    ws,
                    "ERROR|SENHA_INCORRETA"
                );

                return;
            }


            if (room.players.size >= room.maxPlayers) {

                send(
                    ws,
                    "ERROR|SALA_CHEIA"
                );

                return;
            }


            leaveRoom(ws);


            room.players.add(ws);

            ws.roomName = roomName;


            send(
                ws,
                `ROOM_JOINED|${roomName}|${ws.playerId}`
            );


            enviarParaSala(
                room,
                `PLAYER_JOINED|${ws.playerId}`,
                ws
            );

        }



        // MSG|qualquer coisa
        else if (command === "MSG") {


            if (!ws.roomName) {

                send(
                    ws,
                    "ERROR|SEM_SALA"
                );

                return;
            }


            const room = rooms.get(ws.roomName);


            if (!room) return;


            const gameMessage = message.substring(4);


            enviarParaSala(
                room,
                `MSG|${ws.playerId}|${gameMessage}`,
                ws
            );

        }



        // SAIR
        else if (command === "SAIR") {


            leaveRoom(ws);

            send(
                ws,
                "LEFT_ROOM"
            );

        }

    });



    ws.on("close", () => {

        console.log(
            `Jogador desconectado: ${ws.playerId}`
        );

        leaveRoom(ws);

    });


});



server.listen(PORT, () => {

    console.log(
        `Servidor rodando na porta ${PORT}`
    );

});
