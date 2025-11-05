const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, { cors: { origin: "*" } });

app.use(express.static(path.join(__dirname, 'public')));

const games = new Map();

function generateRoomCode() {
    return Math.random().toString(36).substring(2, 6).toUpperCase();
}

function rollDice(count = 5) {
    return Array(count).fill(0).map(() => Math.floor(Math.random() * 6) + 1);
}

function calculateScore(dice, category) {
    const sum = dice.reduce((a, b) => a + b, 0);
    const counts = {};
    dice.forEach(d => counts[d] = (counts[d] || 0) + 1);
    const values = Object.values(counts);
    
    const scores = {
        'ones': dice.filter(d => d === 1).length,
        'twos': dice.filter(d => d === 2).length * 2,
        'threes': dice.filter(d => d === 3).length * 3,
        'fours': dice.filter(d => d === 4).length * 4,
        'fives': dice.filter(d => d === 5).length * 5,
        'sixes': dice.filter(d => d === 6).length * 6,
        'three': values.some(v => v >= 3) ? sum : 0,
        'four': values.some(v => v >= 4) ? sum : 0,
        'full': values.includes(3) && values.includes(2) ? 25 : 0,
        'small': [1,2,3,4].every(n => counts[n]) ? 30 : 0,
        'large': [2,3,4,5].every(n => counts[n]) ? 40 : 0,
        'kniffel': values.includes(5) ? 50 : 0,
        'chance': sum
    };
    return scores[category] || 0;
}

io.on('connection', (socket) => {
    console.log('👤', socket.id);

    socket.on('create', ({ name }) => {
        const code = generateRoomCode();
        const game = {
            roomCode: code,
            players: [{ id: socket.id, name, isHost: true, scores: {} }],
            turn: 0,
            dice: [1,1,1,1,1],
            rolls: 3,
            phase: 'waiting'
        };
        games.set(code, game);
        socket.join(code);
        socket.emit('room', { code, ...game });
    });

    socket.on('join', ({ code, name }) => {
        const game = games.get(code.toUpperCase());
        if (!game) { socket.emit('error', 'Not found'); return; }
        const p = { id: socket.id, name, isHost: false, scores: {} };
        game.players.push(p);
        socket.join(code.toUpperCase());
        io.to(code.toUpperCase()).emit('room', game);
    });

    socket.on('start', ({ code }) => {
    const g = games.get(code);
    if (g) {
        g.phase = 'playing';
        g.turn = 0; // Host fängt IMMER an (Index 0)
        g.dice = rollDice();
        g.rolls = 3;
        io.to(code).emit('room', g);
    }
    });

    socket.on('roll', ({ code, kept }) => {
        const g = games.get(code);
        if (g && g.rolls > 0) {
            g.dice = g.dice.map((d, i) => kept[i] ? d : Math.floor(Math.random()*6)+1);
            g.rolls--;
            io.to(code).emit('room', g);
        }
    });

    socket.on('score', ({ code, cat }) => {
        const g = games.get(code);
        if (g) {
            const p = g.players[g.turn];
            p.scores[cat] = calculateScore(g.dice, cat);
            g.turn = (g.turn + 1) % g.players.length;
            g.dice = rollDice();
            g.rolls = 3;
            io.to(code).emit('room', g);
        }
    });
});

server.listen(3000, () => console.log('🚀 Port 3000'));
