const WebSocket = require("ws");
const http = require("http");

const PORT = process.env.PORT || 3000;

// Servidor HTTP
const server = http.createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("Servidor Multiplayer Online!");
});

const wss = new WebSocket.Server({ server });

// Salas
const rooms = new Map();


// ==============================
// GERAR ID
// ==============================

function gerarID() {
    return Math.random()
        .toString(36)
        .substring(2, 8)
        .toUpperCase();
}


// ==============================
// ENVIAR MENSAGEM
// ==============================

function send(ws, message) {

    if (ws.readyState === WebSocket.OPEN) {
        ws.send(message);
    }

}


// ==============================
// ENVIAR PARA SALA
// ==============================

function enviarParaSala(room, message, excluir = null) {

    for (const player of room.players) {

        if (player !== excluir) {
            send(player, message);
        }

    }

}


// ==============================
// ENVIAR LISTA DE PINGS
// ==============================

function enviarPings(room) {

    let mensagem = "PINGS";

    for (const player of room.players) {

        mensagem +=
            `|${player.playerId}|${player.ping}`;

    }

    enviarParaSala(room, mensagem);

}



// ==============================
// ENVIAR QUANTIDADE DE PLAYERS
// ==============================

function enviarQuantidadePlayers(room) {

    const quantidade = room.players.size;

    for (const player of room.players) {

        send(
            player,
            `PLAYER_COUNT|${player.playerId}|${quantidade}|${room.maxPlayers}`
        );

    }

}


// ==============================
// SAIR DA SALA
// ==============================

function leaveRoom(ws) {

    if (!ws.roomName) return;

    const room = rooms.get(ws.roomName);

    if (!room) {
        ws.roomName = null;
        return;
    }

    const roomName = ws.roomName;

    room.players.delete(ws);


    // Avisa os jogadores restantes
    enviarParaSala(
        room,
        `PLAYER_LEFT|${ws.playerId}`
    );


    // Remove a sala se estiver vazia
    if (room.players.size === 0) {

        rooms.delete(roomName);

        console.log(
            `Sala removida: ${roomName}`
        );

    } else {

        // Atualiza lista de pings
        enviarPings(room);
        enviarQuantidadePlayers(room);

    }


    ws.roomName = null;

}


// ==============================
// NOVA CONEXÃO
// ==============================

wss.on("connection", (ws) => {

    ws.playerId = gerarID();

    ws.roomName = null;

    ws.ping = 0;


    console.log(
        `Jogador conectado: ${ws.playerId}`
    );


    send(
        ws,
        `CONNECTED|${ws.playerId}`
    );



    // ==============================
    // RECEBER MENSAGEM
    // ==============================

    ws.on("message", (data) => {

        const message = data.toString();

        const parts = message.split("|");

        const command = parts[0];



        // ==============================
        // PING
        //
        // Cliente:
        // PING|123
        //
        // Servidor:
        // PONG|123
        // ==============================

        if (command === "PING") {

            const valor = parts[1] || "";

            send(
                ws,
                `PONG|${valor}`
            );

        }



        // ==============================
        // INFORMAR PING
        //
        // SET_PING|85
        // ==============================

        else if (command === "SET_PING") {

            let ping = Number(parts[1]);


            if (!Number.isFinite(ping)) {
                return;
            }


            // Evita valores estranhos
            ping = Math.max(
                0,
                Math.min(
                    Math.round(ping),
                    9999
                )
            );


            ws.ping = ping;


            // Se estiver em uma sala
            if (ws.roomName) {

                const room =
                    rooms.get(ws.roomName);


                if (room) {

                    // Envia para TODOS da sala
                    enviarParaSala(
                        room,
                        `PLAYER_PING|${ws.playerId}|${ws.ping}`
                    );

                }

            }

        }



        // ==============================
        // CRIAR SALA
        //
        // CRIAR|Nome|Senha|MaxJogadores
        // ==============================

        else if (command === "CRIAR") {

            const roomName = parts[1];

            const password = parts[2];

            const maxPlayers =
                Math.max(2, Math.min(Number(parts[3]) || 2, 4));


            if (!roomName || !password) {

                send(
                    ws,
                    "ERROR|DADOS_INVALIDOS"
                );

                return;

            }


            if (rooms.has(roomName)) {

                send(
                    ws,
                    "ERROR|SALA_JA_EXISTE"
                );

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

            rooms.set(
                roomName,
                room
            );


            ws.roomName = roomName;


            send(
                ws,
                `ROOM_CREATED|${roomName}|${ws.playerId}`
            );


            // Envia os pings atuais
            enviarPings(room);
            enviarQuantidadePlayers(room);


            console.log(
                `Sala criada: ${roomName}`
            );

        }



        // ==============================
        // ENTRAR NA SALA
        //
        // ENTRAR|Nome|Senha
        // ==============================

        else if (command === "ENTRAR") {

            const roomName = parts[1];

            const password = parts[2];


            const room =
                rooms.get(roomName);


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


            if (
                room.players.size >=
                room.maxPlayers
            ) {

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


            // Avisa apenas os outros
            enviarParaSala(
                room,
                `PLAYER_JOINED|${ws.playerId}`,
                ws
            );


            // Todos recebem os pings
            enviarPings(room);
            enviarQuantidadePlayers(room);

        }



        // ==============================
        // MENSAGEM DO JOGO
        //
        // MSG|qualquer coisa
        // ==============================

        else if (command === "MSG") {

            if (!ws.roomName) {

                send(
                    ws,
                    "ERROR|SEM_SALA"
                );

                return;

            }


            const room =
                rooms.get(ws.roomName);


            if (!room) return;


            const gameMessage =
                message.substring(4);


            // Envia apenas para os OUTROS
            enviarParaSala(
                room,
                `MSG|${ws.playerId}|${gameMessage}`,
                ws
            );

        }



        // ==============================
        // SAIR
        // ==============================

        else if (command === "SAIR") {

            leaveRoom(ws);

            send(
                ws,
                "LEFT_ROOM"
            );

        }

    });



    // ==============================
    // DESCONECTOU
    // ==============================

    ws.on("close", () => {

        console.log(
            `Jogador desconectado: ${ws.playerId}`
        );


        leaveRoom(ws);

    });

});



// ==============================
// INICIAR SERVIDOR
// ==============================

server.listen(PORT, () => {

    console.log(
        `Servidor rodando na porta ${PORT}`
    );

});
