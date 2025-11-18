const socket = io();
let game = null, isHost = false;
const cats = ['ones','twos','threes','fours','fives','sixes','three','four','full','small','large','kniffel','chance'];
const catNames = ['Einser','Zweier','Dreier','Vierer','Fünfer','Sechser','3er-Pasch','4er-Pasch','Full House','Kleine Str.','Große Str.','Kniffel','Chance'];

// ===== UI FUNKTIONEN =====

function show(id) {
  document.querySelectorAll('.screen').forEach(s => s.style.display = 'none');
  document.getElementById(id).style.display = 'block';
}

function createRoom() {
    const name = document.getElementById('name').value.trim();
    if (!name) return showError('Name eingeben');
    if (name.length > 20) return showError('Name zu lang (max. 20 Zeichen)');
    isHost = true;  // ← DIESE ZEILE HINZUFÜGEN
    socket.emit('create', { name });
}

function joinRoom() {
    const name = document.getElementById('name').value.trim();
    const code = document.getElementById('code').value.trim().toUpperCase();
    if (!name || !code) return showError('Name und Code eingeben');
    if (name.length > 20) return showError('Name zu lang');
    isHost = false;  // ← DIESE ZEILE HINZUFÜGEN
    socket.emit('join', { code, name });
}

// ===== SOCKET.IO EVENT HANDLER =====
socket.on('room', (roomData) => {
    game = roomData;
    console.log('✅ Raum-Daten erhalten:', game.roomCode);
    show('waitingScreen');
    updateWaitingScreen();
});

socket.on('error', (msg) => {
    showError(msg);
});

socket.on('gameOver', (data) => {
    show('gameOverScreen');
    document.getElementById('winner').textContent = `🏆 Gewinner: ${data.winner.name} (${data.winner.score} Punkte)`;
});

socket.on('chat', (msg) => {
    const chatDiv = document.getElementById('chatBox');
    const p = document.createElement('p');
    p.textContent = `${msg.player || msg.system}: ${msg.message}`;
    chatDiv.appendChild(p);
    chatDiv.scrollTop = chatDiv.scrollHeight;
});

socket.on('playerLeft', (data) => {
    showError(data.message);
});

function updateWaitingScreen() {
    if (!game) return;
    document.getElementById('roomCode').textContent = game.roomCode;
    document.getElementById('playerCount').textContent = `${game.players.length}/${game.maxPlayers}`; 
    const playerList = document.getElementById('playerList');
    playerList.innerHTML = '';
    game.players.forEach(p => {
        const div = document.createElement('div');
        div.textContent = '👤 ' + p.name;
        playerList.appendChild(div);
    });
    
    // Nur Host kann Spiel starten
    const startContainer = document.getElementById('startContainer');
    startContainer.innerHTML = '';
    if (isHost && game.phase === 'waiting' && game.players.length >= 1) {
        const btn = document.createElement('button');
        btn.textContent = 'Spiel starten';
        btn.onclick = startGame;
        startContainer.appendChild(btn);
    }
}

function startGame() {
  socket.emit('start', { code: game.roomCode });
}

function rollDice() {
  if (game.rolls <= 0) return showError('Keine Würfe mehr übrig!');
  const diceElements = document.querySelectorAll('.dice-item');
  // Animiere Würfel
  diceElements.forEach(die => {
    die.classList.add('rolling');
  });
  setTimeout(() => {
    const kept = Array.from(diceElements).map(d => d.classList.contains('kept'));
    socket.emit('roll', { code: game.roomCode, kept });
    diceElements.forEach(die => {
      die.classList.remove('rolling');
      die.classList.remove('kept');
    });
  }, 1000);
}



function selectScore(cat) {
  // Überprüfe ob bereits genutzt
  const current = game.players[game.turn];
  if (current.scores[cat] !== undefined) {
    return showError('Diese Kategorie wurde bereits genutzt!');
  }

  socket.emit('score', { code: game.roomCode, cat });
}

function sendChat() {
  const input = document.getElementById('chatInput');
  const message = input.value.trim();
  
  if (!message) return;
  if (message.length > 200) return showError('Nachricht zu lang (max. 200 Zeichen)');
  
  socket.emit('chat', { code: game.roomCode, message });
  input.value = '';
}

function showError(msg) {
  alert('❌ ' + msg);
}

function showSuccess(msg) {
  console.log('✅ ' + msg);
}

// ===== RENDERING FUNKTIONEN =====

function renderGame() {
  const current = game.players[game.turn];
  
  // Header
  document.getElementById('turn').textContent = `🎮 ${current.name} am Zug`;
  document.getElementById('rolls').textContent = `Würfe: ${game.rolls}/3`;
  document.getElementById('roomCode').textContent = `Raum: ${game.roomCode}`;

// Würfel - MIT AUTOMATISCHEM HALTEN
 const diceDiv = document.getElementById('dice');
  diceDiv.innerHTML = '';
  game.dice.forEach((d, i) => {
    const el = document.createElement('div');
    el.className = 'dice-item';
    const diceFaces = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
    el.textContent = diceFaces[d - 1];;
    
    // Nur halten wenn noch Würfe übrig sind
    if (game.rolls < 3) {
      el.onclick = () => el.classList.toggle('kept');
      el.style.cursor = 'pointer';
    }
    
    diceDiv.appendChild(el);
  });

  // Buttons
  document.getElementById('rollBtn').disabled = game.rolls === 0 || current.id !== socket.id;
  document.getElementById('rollBtn').style.opacity = document.getElementById('rollBtn').disabled ? '0.5' : '1';

  // Score-Tabelle
  renderScoreTable();
  
  // Spieler-Info
  renderPlayerInfo();
}

function renderScoreTable() {
  const tableDiv = document.getElementById('scores');
  let html = '<table class="scores"><tr><th>Kategorie</th>';
  
  // Header mit Spielernamen
  game.players.forEach(p => {
    html += `<th>${p.name}</th>`;
  });
  html += '</tr>';

  // Score-Reihen
  cats.forEach((cat, i) => {
    html += `<tr>
      <td><strong>${catNames[i]}</strong></td>`;
    
    game.players.forEach((p, pi) => {
      const score = p.scores[cat];
      const isAvailable = score === undefined;
      const isCurrentPlayer = pi === game.turn && game.phase === 'playing';
      
      if (isAvailable && isCurrentPlayer && p.id === socket.id) {
        // Clickable für aktuellen Spieler
        html += `<td class="available" onclick="selectScore('${cat}')" style="cursor: pointer;">
          ${calculateScorePreview(cat)}
        </td>`;
      } else {
        // Nicht anklickbar
        html += `<td style="background: ${score !== undefined ? '#f0f0f0' : '#fff'};">
          ${score !== undefined ? score : '-'}
        </td>`;
      }
    });
    
    html += '</tr>';
  });

  // Gesamt-Score
  html += '<tr style="border-top: 2px solid #333; font-weight: bold;"><td>GESAMT</td>';
  game.players.forEach(p => {
    const total = Object.values(p.scores).reduce((a, b) => a + (b || 0), 0);
    html += `<td>${total}</td>`;
  });
  html += '</tr></table>';

  tableDiv.innerHTML = html;
}

function calculateScorePreview(cat) {
  // Berechne was der Score wäre
  const dice = game.dice;
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

  return scores[cat] || 0;
}

function renderPlayerInfo() {
  const infoDiv = document.getElementById('playerInfo');
  let html = '<h3>Spieler:</h3>';
  
  game.players.forEach((p, i) => {
    const active = i === game.turn ? '🔴' : '⚪';
    const total = Object.values(p.scores).reduce((a, b) => a + (b || 0), 0);
    html += `<div style="padding: 8px; background: ${i === game.turn ? '#e0f2fe' : '#f5f5f5'}; margin: 5px 0; border-radius: 4px;">
      ${active} <strong>${p.name}</strong> - ${total} Punkte
    </div>`;
  });
  
  infoDiv.innerHTML = html;
}

function renderChat() {
  const chatDiv = document.getElementById('chatLog');
  if (!game.chat) return;
  
  chatDiv.innerHTML = game.chat.map(msg => {
    if (msg.system) {
      return `<div style="text-align: center; color: #999; font-size: 12px; padding: 5px;">
        <em>${msg.message}</em>
      </div>`;
    }
    return `<div style="padding: 5px; border-bottom: 1px solid #eee;">
      <strong>${msg.player}</strong> <span style="color: #999; font-size: 12px;">${msg.timestamp}</span><br>
      ${msg.message}
    </div>`;
  }).join('');
  
  // Scroll zu unten
  chatDiv.scrollTop = chatDiv.scrollHeight;
}

function renderGameOver() {
  const standings = game.standings || [];
  let html = '<h2>🏆 Spiel vorbei!</h2>';
  
  standings.forEach((player, i) => {
    const medals = ['🥇', '🥈', '🥉'];
    const medal = medals[i] || '•';
    html += `<div style="padding: 15px; background: ${i === 0 ? '#fef3c7' : '#f5f5f5'}; margin: 10px 0; border-radius: 4px; font-size: 18px;">
      ${medal} <strong>${player.name}</strong><br>
      <span style="font-size: 24px; color: #2563eb;">${player.score} Punkte</span>
    </div>`;
  });
  
  html += `<button onclick="location.reload()">🔄 Neu spielen</button>`;
  
  document.getElementById('standings').innerHTML = html;
}

// ===== SOCKET EVENTS =====

socket.on('room', (data) => {
  game = data;
  if (game.phase === 'waiting') {
    show('waitingScreen');
  } else if (game.phase === 'playing') {
    show('gameScreen');
    renderGame();
  } else if (game.phase === 'finished') {
    show('gameOverScreen');
    renderGameOver();
  }
});

socket.on('error', (msg) => {
  showError(msg);
});

socket.on('chat', (msg) => {
  if (!game.chat) game.chat = [];
  game.chat.push(msg);
  renderChat();
});

socket.on('playerLeft', ({ message }) => {
  console.log('⚠️ ' + message);
  renderPlayerInfo();
});

socket.on('gameOver', (data) => {
  game.phase = 'finished';
  game.winner = data.winner;
  game.standings = data.standings;
  show('gameOverScreen');
  renderGameOver();
});

socket.on('connect', () => {
  console.log('✅ Mit Server verbunden');
});

socket.on('disconnect', () => {
  console.log('❌ Verbindung unterbrochen');
});

// ===== INIT =====

show('startScreen');
