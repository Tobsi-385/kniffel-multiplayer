const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Middleware
app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// Game State Management
class GameManager {
    constructor() {
        this.games = new Map();
        this.players = new Map();
        this.aiCounter = 0;
    }

    createRoom() {
        const roomCode = this.generateRoomCode();
        const game = new KniffelGame(roomCode);
        this.games.set(roomCode, game);
        console.log(`🎯 Raum ${roomCode} erstellt`);
        return game;
    }

    getGame(roomCode) {
        return this.games.get(roomCode);
    }

    deleteGame(roomCode) {
        this.games.delete(roomCode);
        console.log(`🗑️ Raum ${roomCode} gelöscht`);
    }

    generateRoomCode() {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
        let code;
        do {
            code = Array.from({length: 4}, () => 
                chars[Math.floor(Math.random() * chars.length)]
            ).join('');
        } while (this.games.has(code));
        return code;
    }
}

class KniffelGame {
    constructor(roomCode) {
        this.roomCode = roomCode;
        this.players = new Map();
        this.playerOrder = [];
        this.currentPlayerIndex = 0;
        this.currentRound = 1;
        this.maxRounds = 13;
        this.rollsLeft = 3;
        this.dice = [1, 1, 1, 1, 1];
        this.selectedDice = [false, false, false, false, false];
        this.scores = {};
        this.gamePhase = 'waiting'; // waiting, playing, finished
        this.host = null;
        this.settings = {
            maxPlayers: 6,
            aiPlayers: 0,
            aiDifficulty: 'medium'
        };
        this.aiPlayers = new Map();
    }

    addPlayer(playerId, playerName, isHost = false) {
        const player = {
            id: playerId,
            name: playerName,
            isHost: isHost,
            isReady: false,
            isAI: false,
            connected: true
        };

        this.players.set(playerId, player);
        this.playerOrder.push(playerId);
        this.scores[playerId] = {};

        if (isHost) {
            this.host = playerId;
        }

        console.log(`👤 Spieler ${playerName} beigetreten (${this.players.size}/${this.settings.maxPlayers})`);
        return player;
    }

    addAIPlayer(difficulty = 'medium') {
        const aiId = `ai_${Date.now()}`;
        const aiName = `KI-Bot ${String.fromCharCode(65 + this.aiPlayers.size)}`;

        const aiPlayer = {
            id: aiId,
            name: aiName,
            isHost: false,
            isReady: true,
            isAI: true,
            connected: true,
            difficulty: difficulty
        };

        this.players.set(aiId, aiPlayer);
        this.playerOrder.push(aiId);
        this.scores[aiId] = {};
        this.aiPlayers.set(aiId, aiPlayer);

        console.log(`🤖 KI-Spieler ${aiName} hinzugefügt`);
        return aiPlayer;
    }

    removePlayer(playerId) {
        const player = this.players.get(playerId);
        if (!player) return false;

        this.players.delete(playerId);
        this.playerOrder = this.playerOrder.filter(id => id !== playerId);
        delete this.scores[playerId];

        if (player.isAI) {
            this.aiPlayers.delete(playerId);
        }

        // Wenn Host verlässt, neuen Host bestimmen
        if (this.host === playerId) {
            const humanPlayers = Array.from(this.players.values()).filter(p => !p.isAI);
            if (humanPlayers.length > 0) {
                this.host = humanPlayers[0].id;
                humanPlayers[0].isHost = true;
            }
        }

        console.log(`❌ Spieler ${player.name} entfernt`);
        return true;
    }

    startGame() {
        if (this.players.size < 2) return false;

        this.gamePhase = 'playing';
        this.currentPlayerIndex = 0;
        this.currentRound = 1;
        this.rollsLeft = 3;
        this.dice = [1, 1, 1, 1, 1];

        console.log(`🎮 Spiel ${this.roomCode} gestartet mit ${this.players.size} Spielern`);
        return true;
    }

    rollDice(keptDice = []) {
        if (this.rollsLeft <= 0) return false;

        for (let i = 0; i < 5; i++) {
            if (!keptDice[i]) {
                this.dice[i] = Math.floor(Math.random() * 6) + 1;
            }
        }

        this.rollsLeft--;
        console.log(`🎲 Würfel gerollt: [${this.dice.join(', ')}], Rolls left: ${this.rollsLeft}`);
        return true;
    }

    submitScore(playerId, category, dice) {
        if (this.scores[playerId][category] !== undefined) return false;

        const score = this.calculateScore(dice, category);
        this.scores[playerId][category] = score;

        // Nächster Spieler
        this.nextPlayer();

        console.log(`📊 ${this.players.get(playerId).name}: ${category} = ${score}`);
        return true;
    }

    nextPlayer() {
        this.currentPlayerIndex = (this.currentPlayerIndex + 1) % this.playerOrder.length;
        this.rollsLeft = 3;
        this.dice = [1, 1, 1, 1, 1];
        this.selectedDice = [false, false, false, false, false];

        // Prüfe auf Rundenende
        if (this.currentPlayerIndex === 0) {
            this.currentRound++;
            if (this.currentRound > this.maxRounds) {
                this.gamePhase = 'finished';
                console.log(`🏁 Spiel ${this.roomCode} beendet`);
            }
        }
    }

    calculateScore(dice, category) {
        const counts = dice.reduce((acc, val) => {
            acc[val] = (acc[val] || 0) + 1;
            return acc;
        }, {});

        switch (category) {
            case 'ones': return dice.filter(d => d === 1).length * 1;
            case 'twos': return dice.filter(d => d === 2).length * 2;
            case 'threes': return dice.filter(d => d === 3).length * 3;
            case 'fours': return dice.filter(d => d === 4).length * 4;
            case 'fives': return dice.filter(d => d === 5).length * 5;
            case 'sixes': return dice.filter(d => d === 6).length * 6;

            case 'three-of-kind':
                return Object.values(counts).some(c => c >= 3) ? dice.reduce((a, b) => a + b, 0) : 0;

            case 'four-of-kind':
                return Object.values(counts).some(c => c >= 4) ? dice.reduce((a, b) => a + b, 0) : 0;

            case 'full-house':
                const values = Object.values(counts);
                return values.includes(3) && values.includes(2) ? 25 : 0;

            case 'small-straight':
                const sortedDice = [...new Set(dice)].sort();
                const straights4 = [[1,2,3,4], [2,3,4,5], [3,4,5,6]];
                return straights4.some(straight => 
                    straight.every(num => sortedDice.includes(num))
                ) ? 30 : 0;

            case 'large-straight':
                const sortedUnique = [...new Set(dice)].sort();
                return (sortedUnique.join('') === '12345' || sortedUnique.join('') === '23456') ? 40 : 0;

            case 'kniffel':
                return Object.values(counts).includes(5) ? 50 : 0;

            case 'chance':
                return dice.reduce((a, b) => a + b, 0);

            default:
                return 0;
        }
    }

    getCurrentPlayer() {
        return this.playerOrder[this.currentPlayerIndex];
    }

    getGameState() {
        return {
            roomCode: this.roomCode,
            players: Array.from(this.players.values()),
            playerOrder: this.playerOrder,
            currentPlayerIndex: this.currentPlayerIndex,
            currentRound: this.currentRound,
            rollsLeft: this.rollsLeft,
            dice: this.dice,
            selectedDice: this.selectedDice,
            scores: this.scores,
            gamePhase: this.gamePhase,
            host: this.host,
            settings: this.settings
        };
    }
}

// AI Engine für automatische Züge
class AIEngine {
    static async makeMove(game, aiPlayerId) {
        const aiPlayer = game.players.get(aiPlayerId);
        const difficulty = aiPlayer.difficulty;

        // Simuliere Denkzeit
        const thinkingTime = {
            'easy': 1000,
            'medium': 2000, 
            'hard': 3000
        }[difficulty] || 2000;

        await new Promise(resolve => setTimeout(resolve, thinkingTime));

        if (game.rollsLeft > 0) {
            // AI entscheidet ob und welche Würfel behalten werden
            const keptDice = this.decideKeepDice(game.dice, game.rollsLeft, difficulty);
            return { action: 'roll', keptDice };
        } else {
            // AI wählt beste verfügbare Kategorie
            const category = this.chooseBestCategory(game.dice, game.scores[aiPlayerId], difficulty);
            return { action: 'score', category, dice: game.dice };
        }
    }

    static decideKeepDice(dice, rollsLeft, difficulty) {
        // Vereinfachte AI-Logik für Würfel behalten
        if (difficulty === 'easy') {
            return dice.map(() => Math.random() < 0.3);
        }

        // Für medium/hard: Behalte Würfel die zu guten Kombinationen führen können
        const counts = dice.reduce((acc, val) => {
            acc[val] = (acc[val] || 0) + 1;
            return acc;
        }, {});

        const keepDice = new Array(5).fill(false);

        // Behalte Paare, Drillinge etc.
        Object.entries(counts).forEach(([value, count]) => {
            if (count >= 2) {
                dice.forEach((die, index) => {
                    if (die == value) keepDice[index] = true;
                });
            }
        });

        return keepDice;
    }

    static chooseBestCategory(dice, playerScores, difficulty) {
        const availableCategories = [
            'ones', 'twos', 'threes', 'fours', 'fives', 'sixes',
            'three-of-kind', 'four-of-kind', 'full-house',
            'small-straight', 'large-straight', 'kniffel', 'chance'
        ].filter(cat => playerScores[cat] === undefined);

        if (availableCategories.length === 0) return 'chance';

        // Für einfache AI: Zufällige Auswahl
        if (difficulty === 'easy') {
            return availableCategories[Math.floor(Math.random() * availableCategories.length)];
        }

        // Für medium/hard: Beste verfügbare Kategorie wählen
        let bestCategory = availableCategories[0];
        let bestScore = 0;

        const game = { calculateScore: KniffelGame.prototype.calculateScore };

        availableCategories.forEach(category => {
            const score = game.calculateScore(dice, category);
            if (score > bestScore) {
                bestScore = score;
                bestCategory = category;
            }
        });

        return bestCategory;
    }
}

const gameManager = new GameManager();

// Socket.IO Connection Handling
io.on('connection', (socket) => {
    console.log(`🔗 Client verbunden: ${socket.id}`);

    // Raum erstellen
    socket.on('create_room', ({ playerName }) => {
        const game = gameManager.createRoom();
        const player = game.addPlayer(socket.id, playerName, true);

        socket.join(game.roomCode);
        gameManager.players.set(socket.id, game.roomCode);

        socket.emit('room_created', {
            roomCode: game.roomCode,
            player: player,
            gameState: game.getGameState()
        });
    });

    // Raum beitreten
    socket.on('join_room', ({ roomCode, playerName }) => {
        const game = gameManager.getGame(roomCode);
        if (!game) {
            socket.emit('error', { message: 'Raum nicht gefunden' });
            return;
        }

        if (game.players.size >= game.settings.maxPlayers) {
            socket.emit('error', { message: 'Raum ist voll' });
            return;
        }

        const player = game.addPlayer(socket.id, playerName);
        socket.join(roomCode);
        gameManager.players.set(socket.id, roomCode);

        socket.emit('joined_room', {
            player: player,
            gameState: game.getGameState()
        });

        socket.to(roomCode).emit('player_joined', {
            player: player,
            gameState: game.getGameState()
        });
    });

    // KI-Spieler hinzufügen (nur Host)
    socket.on('add_ai_player', ({ roomCode, difficulty }) => {
        const game = gameManager.getGame(roomCode);
        if (!game || game.host !== socket.id) {
            socket.emit('error', { message: 'Nicht berechtigt' });
            return;
        }

        const aiPlayer = game.addAIPlayer(difficulty);

        io.to(roomCode).emit('ai_player_added', {
            aiPlayer: aiPlayer,
            gameState: game.getGameState()
        });
    });

    // Spiel starten (nur Host)
    socket.on('start_game', ({ roomCode }) => {
        const game = gameManager.getGame(roomCode);
        if (!game || game.host !== socket.id) {
            socket.emit('error', { message: 'Nicht berechtigt' });
            return;
        }

        if (game.startGame()) {
            io.to(roomCode).emit('game_started', {
                gameState: game.getGameState()
            });

            // Wenn erstes Spieler AI ist, automatisch spielen lassen
            setTimeout(() => this.handleAITurn(game), 1000);
        }
    });

    // Würfel rollen
    socket.on('roll_dice', ({ roomCode, keptDice }) => {
        const game = gameManager.getGame(roomCode);
        if (!game || game.getCurrentPlayer() !== socket.id) {
            socket.emit('error', { message: 'Nicht dein Zug' });
            return;
        }

        if (game.rollDice(keptDice)) {
            io.to(roomCode).emit('dice_rolled', {
                dice: game.dice,
                rollsLeft: game.rollsLeft,
                gameState: game.getGameState()
            });
        }
    });

    // Punkte eintragen
    socket.on('submit_score', ({ roomCode, category, dice }) => {
        const game = gameManager.getGame(roomCode);
        if (!game || game.getCurrentPlayer() !== socket.id) {
            socket.emit('error', { message: 'Nicht dein Zug' });
            return;
        }

        if (game.submitScore(socket.id, category, dice)) {
            io.to(roomCode).emit('score_submitted', {
                playerId: socket.id,
                category: category,
                score: game.scores[socket.id][category],
                gameState: game.getGameState()
            });

            // Prüfe auf AI-Spieler als nächstes
            setTimeout(() => this.handleAITurn(game), 1000);
        }
    });

    // Chat-Nachrichten
    socket.on('chat_message', ({ roomCode, message }) => {
        const game = gameManager.getGame(roomCode);
        if (!game || !game.players.has(socket.id)) return;

        const player = game.players.get(socket.id);
        io.to(roomCode).emit('chat_message', {
            playerId: socket.id,
            playerName: player.name,
            message: message,
            timestamp: Date.now()
        });
    });

    // Verbindung getrennt
    socket.on('disconnect', () => {
        console.log(`❌ Client getrennt: ${socket.id}`);

        const roomCode = gameManager.players.get(socket.id);
        if (roomCode) {
            const game = gameManager.getGame(roomCode);
            if (game) {
                game.removePlayer(socket.id);

                socket.to(roomCode).emit('player_left', {
                    playerId: socket.id,
                    gameState: game.getGameState()
                });

                // Lösche Spiel wenn keine menschlichen Spieler mehr da sind
                const humanPlayers = Array.from(game.players.values()).filter(p => !p.isAI);
                if (humanPlayers.length === 0) {
                    gameManager.deleteGame(roomCode);
                }
            }
            gameManager.players.delete(socket.id);
        }
    });
});

// AI Turn Handler
async function handleAITurn(game) {
    const currentPlayerId = game.getCurrentPlayer();
    const currentPlayer = game.players.get(currentPlayerId);

    if (!currentPlayer || !currentPlayer.isAI || game.gamePhase !== 'playing') {
        return;
    }

    try {
        const aiMove = await AIEngine.makeMove(game, currentPlayerId);

        if (aiMove.action === 'roll') {
            if (game.rollDice(aiMove.keptDice)) {
                io.to(game.roomCode).emit('ai_dice_rolled', {
                    aiPlayerId: currentPlayerId,
                    aiPlayerName: currentPlayer.name,
                    dice: game.dice,
                    rollsLeft: game.rollsLeft,
                    keptDice: aiMove.keptDice,
                    gameState: game.getGameState()
                });

                // Weiteren AI-Zug planen falls nötig
                setTimeout(() => handleAITurn(game), 2000);
            }
        } else if (aiMove.action === 'score') {
            if (game.submitScore(currentPlayerId, aiMove.category, aiMove.dice)) {
                io.to(game.roomCode).emit('ai_score_submitted', {
                    aiPlayerId: currentPlayerId,
                    aiPlayerName: currentPlayer.name,
                    category: aiMove.category,
                    score: game.scores[currentPlayerId][aiMove.category],
                    gameState: game.getGameState()
                });

                // Nächsten Spieler prüfen
                setTimeout(() => handleAITurn(game), 1000);
            }
        }
    } catch (error) {
        console.error('AI Turn Error:', error);
    }
}

// Serve static files and start server
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 Kniffel Multiplayer Server läuft auf Port ${PORT}`);
    console.log(`🌐 Online erreichbar unter http://localhost:${PORT}`);
});
