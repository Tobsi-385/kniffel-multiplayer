const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, { cors: { origin: "*" } });

app.use(express.static(path.join(__dirname, 'public')));

const games = new Map();
const gameHistory = new Map(); // Spielhistorie speichern
const playerStats = new Map(); // Statistiken pro Spieler

// ===== UTILITY FUNCTIONS =====

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
    'small': ([1,2,3,4].every(n => counts[n]) || [2,3,4,5].every(n => counts[n])) ? 30 : 0,
    'large': ([1,2,3,4,5].every(n => counts[n]) || [2,3,4,5,6].every(n => counts[n])) ? 40 : 0,
    'kniffel': values.includes(5) ? 50 : 0,
    'chance': sum
  };

  return scores[category] || 0;
}

// Berechne Gesamtscore
function getTotalScore(playerScores) {
  return Object.values(playerScores).reduce((a, b) => a + (b || 0), 0);
}

// Überprüfe ob Kategorie bereits genutzt wurde
function isCategoryUsed(playerScores, category) {
  return playerScores[category] !== undefined;
}

// Speichere Spiel in Datei
function saveGameToHistory(code, game, winner) {
  const history = {
    code,
    timestamp: new Date().toISOString(),
    winner,
    players: game.players.map(p => ({
      name: p.name,
      score: getTotalScore(p.scores)
    })),
    duration: game.startTime ? Date.now() - game.startTime : 0
  };
  
  gameHistory.set(code, history);
  
  // Optional: In Datei speichern
  try {
    if (!fs.existsSync('game_logs')) fs.mkdirSync('game_logs');
    fs.writeFileSync(
      `game_logs/${code}.json`,
      JSON.stringify(history, null, 2)
    );
  } catch (e) {
    console.log('⚠️ Konnte Spiel-Log nicht speichern:', e.message);
  }
}

// Update Spieler-Statistiken
function updatePlayerStats(playerName, score) {
  if (!playerStats.has(playerName)) {
    playerStats.set(playerName, {
      games: 0,
      totalScore: 0,
      avgScore: 0,
      wins: 0
    });
  }
  
  const stats = playerStats.get(playerName);
  stats.games++;
  stats.totalScore += score;
  stats.avgScore = Math.round(stats.totalScore / stats.games);
  if (score > 0) stats.wins++;
  
  return stats;
}

// ===== SOCKET.IO EVENTS =====

io.on('connection', (socket) => {
  console.log('👤 Spieler verbunden:', socket.id);

  // Raum erstellen
  socket.on('create', ({ name }) => {
    const code = generateRoomCode();
    const game = {
      roomCode: code,
      players: [{ id: socket.id, name, isHost: true, scores: {} }],
      turn: 0,
      dice: [1,1,1,1,1],
      rolls: 3,
      phase: 'waiting',
      chat: [],
      startTime: null,
      maxPlayers: 4,
      gameLog: []
    };
    
    games.set(code, game);
    socket.join(code);
    socket.emit('room', game);
    console.log(`✅ Raum ${code} erstellt von ${name}`);
  });

  // Raum beitreten
  socket.on('join', ({ code, name }) => {
    if (!code || !name) {
      socket.emit('error', 'Code und Name erforderlich');
      return;
    }

    const game = games.get(code.toUpperCase());
    if (!game) {
      socket.emit('error', 'Raum nicht gefunden');
      return;
    }

    if (game.players.length >= game.maxPlayers) {
      socket.emit('error', `Raum voll (max. ${game.maxPlayers} Spieler)`);
      return;
    }

    const p = { id: socket.id, name, isHost: false, scores: {} };
    game.players.push(p);
    socket.join(code.toUpperCase());
    
    io.to(code.toUpperCase()).emit('room', game);
    io.to(code.toUpperCase()).emit('chat', {
      system: true,
      message: `${name} ist beigetreten`,
      timestamp: new Date().toLocaleTimeString('de-DE')
    });
    console.log(`✅ ${name} beigetreten zu ${code}`);
  });

  // Spiel starten
  socket.on('start', ({ code }) => {
    const g = games.get(code);
    if (g) {
      g.phase = 'playing';
      g.turn = 0;
      g.dice = rollDice();
      g.rolls = 3;
      g.startTime = Date.now();
      g.gameLog = [];
      
      console.log(`🎮 Spiel ${code} gestartet. ${g.players[0].name} am Zug`);
      io.to(code).emit('room', g);
    }
  });

  // Würfel werfen
  socket.on('roll', ({ code, kept }) => {
    const g = games.get(code);
    if (!g || g.rolls <= 0) return;

    // Validierung
    if (kept.length !== g.dice.length) return;

    g.dice = g.dice.map((d, i) => kept[i] ? d : Math.floor(Math.random()*6)+1);
    g.rolls--;

    g.gameLog.push({
      player: g.players[g.turn].name,
      action: 'roll',
      dice: g.dice,
      rollsLeft: g.rolls
    });

    io.to(code).emit('room', g);
  });

  // Score setzen
  socket.on('score', ({ code, cat }) => {
    const g = games.get(code);
    if (!g) return;

    const p = g.players[g.turn];

    // Validierung: Kategorie bereits genutzt?
    if (isCategoryUsed(p.scores, cat)) {
      socket.emit('error', 'Kategorie bereits genutzt!');
      return;
    }

    const score = calculateScore(g.dice, cat);
    p.scores[cat] = score;

    g.gameLog.push({
      player: p.name,
      action: 'score',
      category: cat,
      points: score
    });

    // Überprüfe ob Spiel vorbei ist
    const allCats = ['ones','twos','threes','fours','fives','sixes','three','four','full','small','large','kniffel','chance'];
    const isGameOver = g.players.every(player => 
      allCats.every(cat => cat in player.scores)
    );

    if (isGameOver) {
      const totals = g.players.map(pl => ({
        name: pl.name,
        score: getTotalScore(pl.scores)
      }));
      totals.sort((a, b) => b.score - a.score);

      g.phase = 'finished';
      g.winner = totals[0];

      // Speichere Spiel-Historie
      saveGameToHistory(code, g, totals[0]);

      // Update Statistiken
      totals.forEach(t => {
        updatePlayerStats(t.name, t.score);
      });

      io.to(code).emit('gameOver', {
        winner: totals[0],
        standings: totals
      });

      console.log(`🏆 Spiel ${code} vorbei! Gewinner: ${totals[0].name} (${totals[0].score} Punkte)`);
    } else {
      // Nächster Spieler
      g.turn = (g.turn + 1) % g.players.length;
      g.dice = rollDice();
      g.rolls = 3;

      io.to(code).emit('room', g);
    }
  });

  // Chat-Nachricht
  socket.on('chat', ({ code, message }) => {
    const g = games.get(code);
    if (!g) return;

    const sender = g.players.find(p => p.id === socket.id);
    if (!sender) return;

    const chatMsg = {
      player: sender.name,
      message: message.substring(0, 200),
      timestamp: new Date().toLocaleTimeString('de-DE')
    };

    g.chat.push(chatMsg);
    io.to(code).emit('chat', chatMsg);
  });

  // Leaderboard abrufen
  socket.on('getLeaderboard', () => {
    const lb = Array.from(playerStats.entries())
      .map(([name, stats]) => ({ name, ...stats }))
      .sort((a, b) => b.totalScore - a.totalScore)
      .slice(0, 10);

    socket.emit('leaderboard', lb);
  });

  // Spiel-Historie abrufen
  socket.on('getHistory', ({ code }) => {
    const history = gameHistory.get(code);
    socket.emit('gameHistory', history || null);
  });

  // Statistiken abrufen
  socket.on('getStats', ({ playerName }) => {
    const stats = playerStats.get(playerName);
    socket.emit('playerStats', stats || null);
  });

  // Disconnect
  socket.on('disconnect', () => {
    console.log('👤 Spieler getrennt:', socket.id);

    // Cleanup: Entferne Spieler aus Spielen
    games.forEach((game, code) => {
      game.players = game.players.filter(p => p.id !== socket.id);
      
      // Wenn Spiel leer, lösche es
      if (game.players.length === 0) {
        games.delete(code);
        console.log(`🗑️ Raum ${code} gelöscht (leer)`);
      } else {
        // Benachrichtige andere Spieler
        io.to(code).emit('playerLeft', {
          message: 'Ein Spieler hat das Spiel verlassen'
        });
        io.to(code).emit('room', game);
      }
    });
  });
});

// ===== SERVER STARTEN =====

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Server läuft auf Port ${PORT}`);
  console.log(`📝 Logs werden in ./game_logs/ gespeichert`);
});
