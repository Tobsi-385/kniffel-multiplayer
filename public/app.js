const socket = io();
let game = null, isHost = false;
let hasRolledOnce = false;

// Kategorien (oben + unten, Bonus wird separat berechnet/angezeigt)
const cats = [
  'ones','twos','threes','fours','fives','sixes',
  'three','four','full','small','large','kniffel','chance'
];

const catNames = [
  'Einser','Zweier','Dreier','Vierer','Fünfer','Sechser',
  '3er-Pasch','4er-Pasch','Full House','Kleine Str.','Große Str.','Kniffel','Chance'
];

// ===== UI FUNKTIONEN =====

function show(id) {
  document.querySelectorAll('.screen').forEach(s => s.style.display = 'none');
  document.getElementById(id).style.display = 'block';
}

function createRoom() {
  const name = document.getElementById('name').value.trim();
  if (!name) return showError('Name eingeben');
  if (name.length > 20) return showError('Name zu lang (max. 20 Zeichen)');
  isHost = true;
  socket.emit('create', { name });
}

function joinRoom() {
  const name = document.getElementById('name').value.trim();
  const code = document.getElementById('code').value.trim().toUpperCase();
  if (!name || !code) return showError('Name und Code eingeben');
  if (name.length > 20) return showError('Name zu lang');
  isHost = false;
  socket.emit('join', { code, name });
}

function leaveRoom() {
  if (game) {
    socket.emit('leave', { code: game.roomCode });
  }
  game = null;
  isHost = false;
  hasRolledOnce = false;
  show('start');
}

function showError(msg) {
  const errorDiv = document.getElementById('error');
  errorDiv.textContent = msg;
  errorDiv.classList.add('show');
  setTimeout(() => {
    errorDiv.classList.remove('show');
  }, 3000);
}

// ===== BERECHNUNGEN =====

// Score für Kategorie (Client-Vorschau)
function calculateScore(cat) {
  if (!game || !game.dice) return 0;

  const dice = game.dice;
  const sum = dice.reduce((a, b) => a + b, 0);
  const counts = {};
  dice.forEach(d => counts[d] = (counts[d] || 0) + 1);
  const values = Object.values(counts);

  const scores = {
    'ones':   dice.filter(d => d === 1).length,
    'twos':   dice.filter(d => d === 2).length * 2,
    'threes': dice.filter(d => d === 3).length * 3,
    'fours':  dice.filter(d => d === 4).length * 4,
    'fives':  dice.filter(d => d === 5).length * 5,
    'sixes':  dice.filter(d => d === 6).length * 6,
    'three':  values.some(v => v >= 3) ? sum : 0,
    'four':   values.some(v => v >= 4) ? sum : 0,
    'full':   values.includes(3) && values.includes(2) ? 25 : 0,
    'small': (
                [1,2,3,4].every(n => counts[n]) ||
                [2,3,4,5].every(n => counts[n]) ||
                [3,4,5,6].every(n => counts[n])
              ) ? 30 : 0,
    'large':  ([1,2,3,4,5].every(n => counts[n]) || [2,3,4,5,6].every(n => counts[n])) ? 40 : 0,
    'kniffel': values.includes(5) ? 50 : 0,
    'chance': sum
  };

  return scores[cat] || 0;
}

function getBonus(playerScores) {
  const upperSum = ['ones','twos','threes','fours','fives','sixes']
    .reduce((sum, cat) => sum + (playerScores[cat] || 0), 0);
  return upperSum >= 63 ? 35 : 0;
}

function getTotalScore(playerScores) {
  const base = ['ones','twos','threes','fours','fives','sixes','three','four','full','small','large','kniffel','chance']
    .reduce((sum, cat) => sum + (playerScores[cat] || 0), 0);
  return base + getBonus(playerScores);
}

// ===== SOCKET.IO =====

// server.js sendet immer 'room', kein 'update'
socket.on('room', (roomData) => {
  const previousTurn = game ? game.turn : null;
  game = roomData;

  console.log('Raum-Daten:', game.roomCode, 'Phase:', game.phase);

  if (game.phase === 'playing') {
    show('game');

    // Spielerwechsel: Locks löschen
    if (previousTurn !== null && previousTurn !== game.turn) {
      document.querySelectorAll('.dice').forEach(die => die.classList.remove('locked'));
    }

    // neu rendern (zeigt ? bzw. Zahlen bei gelockten)
    renderGame();

    // Vor dem ersten Wurf keine Animation und keine Zahlen
    if (!hasRolledOnce) return;

    const diceElements = document.querySelectorAll('.dice');
    diceElements.forEach(die => {
      if (!die.classList.contains('locked')) {
        die.classList.remove('rolling');
        void die.offsetWidth;     // Reflow für Neustart
        die.classList.add('rolling');
      }
    });

    setTimeout(() => {
      diceElements.forEach(die => {
        if (!die.classList.contains('locked')) {
          die.textContent = die.dataset.value;  // nach Animation echte Zahl
        }
        die.classList.remove('rolling');
      });
    }, 600);

  } else if (game.phase === 'waiting') {
    show('lobby');
    updateLobby();
  }
});

socket.on('error', (msg) => {
  showError(msg);
});

socket.on('gameStart', (gameData) => {
  game = gameData;
  hasRolledOnce = false;
  show('game');
  renderGame();
});

socket.on('gameOver', (data) => {
  const winner = data.winner;      // { name, score }
  const totalScore = winner.score; // Gesamtpunkte vom Server, inkl. Bonus
  alert(`🏆 Gewinner: ${winner.name} mit ${totalScore} Punkten!`);
  leaveRoom();
});

socket.on('playerLeft', (data) => {
  if (game && game.phase === 'waiting') {
    game = data.room;
    updateLobby();
  }
});

// ===== LOBBY =====

function updateLobby() {
  if (!game) return;

  document.getElementById('roomCode').textContent = game.roomCode;

  const playersList = document.getElementById('playersList');
  playersList.innerHTML = '';
  game.players.forEach(p => {
    const li = document.createElement('li');
    li.textContent = `👤 ${p.name}`;
    playersList.appendChild(li);
  });

  const startBtn = document.getElementById('startBtn');
  if (isHost && game.phase === 'waiting' && game.players.length >= 1) {
    startBtn.style.display = 'block';
  } else {
    startBtn.style.display = 'none';
  }
}

function startGame() {
  socket.emit('start', { code: game.roomCode });
}

// ===== SPIELFUNKTIONEN =====

function roll() {
  if (!game || game.rolls <= 0) return showError('Keine Würfe mehr übrig!');
  const current = game.players[game.turn];
  if (current.id !== socket.id) return showError('Du bist nicht am Zug!');

  const diceElements = document.querySelectorAll('.dice:not(.dice-placeholder)');
  const kept = diceElements.length > 0
    ? Array.from(diceElements).map(d => d.classList.contains('locked'))
    : [false, false, false, false, false];

  hasRolledOnce = true;  // ab jetzt echte Würfe + Animation
  socket.emit('roll', { code: game.roomCode, kept });
}

function toggleDice(index) {
  if (game.rolls >= 3) return;
  const dice = document.querySelectorAll('.dice');
  dice[index].classList.toggle('locked');
}

function chooseScore(cat) {
  const current = game.players[game.turn];
  if (current.id !== socket.id) return showError('Du bist nicht am Zug!');
  if (current.scores[cat] !== undefined) return showError('Kategorie bereits verwendet!');
  if (game.rolls === 3) return showError('Du musst erst würfeln!');

  socket.emit('score', { code: game.roomCode, cat });

  // Würfel sofort zurück auf Fragezeichen (ohne Animation)
  hasRolledOnce = false;
  const diceDiv = document.getElementById('dice');
  diceDiv.innerHTML = '';
  for (let i = 0; i < 5; i++) {
    const die = document.createElement('div');
    die.className = 'dice dice-placeholder';
    die.textContent = '?';
    diceDiv.appendChild(die);
  }

  setTimeout(() => {
    document.querySelectorAll('.dice').forEach(die => die.classList.remove('locked'));
  }, 100);
}

// ===== RENDERING =====

function renderGame() {
  if (!game) return;

  const current = game.players[game.turn];

  document.getElementById('currentPlayerName').textContent = current.name;
  document.getElementById('gameRoomCode').textContent = game.roomCode;
  document.getElementById('rollsLeft').textContent = game.rolls;

  // Würfel
  const diceDiv = document.getElementById('dice');
  const hasDiceValues = game.dice && game.dice.some(d => d > 0);

  if (!hasDiceValues || !hasRolledOnce) {
    // Vor erstem Wurf: nur Fragezeichen, keine Zahlen
    diceDiv.innerHTML = '';
    for (let i = 0; i < 5; i++) {
      const die = document.createElement('div');
      die.className = 'dice dice-placeholder';
      die.textContent = '?';
      diceDiv.appendChild(die);
    }
  } else {
    const oldDice = Array.from(diceDiv.querySelectorAll('.dice:not(.dice-placeholder)'));
    const lockedStates = oldDice.map(d => d.classList.contains('locked'));
    diceDiv.innerHTML = '';
    game.dice.forEach((value, i) => {
      const die = document.createElement('div');
      die.className = 'dice';
      die.dataset.value = value;   // echten Wert speichern
      die.textContent = '?';      // während Animation nur ?
      die.onclick = () => toggleDice(i);
      if (lockedStates[i]) {
        die.classList.add('locked');
        die.textContent = value;  // gelockte Würfel direkt zeigen
      }
      diceDiv.appendChild(die);
    });
  }

  const rollBtn = document.getElementById('rollBtn');
  rollBtn.disabled = game.rolls === 0 || current.id !== socket.id;

  renderScorecard();
}

function renderScorecard() {
  const scorecardDiv = document.getElementById('scorecard');

  let html = '<table><tr><th>Kategorie</th>';
  game.players.forEach(p => {
    html += `<th>${p.name}</th>`;
  });
  html += '</tr>';

  // Obere Kategorien
  ['ones','twos','threes','fours','fives','sixes'].forEach((cat, idx) => {
    html += '<tr>';
    html += `<td style="font-weight:bold;text-align:left;">${catNames[idx]}</td>`;

    game.players.forEach((p, pi) => {
      const score = p.scores[cat];
      const isCurrentPlayer = pi === game.turn;
      const canClick = isCurrentPlayer && score === undefined && game.rolls < 3 && p.id === socket.id;

      let cellClass = '';
      if (score !== undefined) cellClass = 'filled';
      else if (canClick) cellClass = 'clickable';

      const displayValue = score !== undefined ? score : (canClick ? calculateScore(cat) : '-');

      if (canClick) {
        html += `<td class="${cellClass}" onclick="chooseScore('${cat}')" style="cursor:pointer;">${displayValue}</td>`;
      } else {
        html += `<td class="${cellClass}">${displayValue}</td>`;
      }
    });

    html += '</tr>';
  });

  // Summe oben
  html += '<tr><td style="font-weight:bold;text-align:left;">Summe (oben)</td>';
  game.players.forEach(p => {
    const upperSum = ['ones','twos','threes','fours','fives','sixes']
      .reduce((sum, cat) => sum + (p.scores[cat] || 0), 0);
    html += `<td class="filled">${upperSum}</td>`;
  });
  html += '</tr>';

  // Bonus
  html += '<tr><td style="font-weight:bold;text-align:left;">Bonus</td>';
  game.players.forEach(p => {
    const bonus = getBonus(p.scores);
    const bonusText = bonus > 0 ? `${bonus}` : '(-)';
    html += `<td class="filled">${bonusText}</td>`;
  });
  html += '</tr>';

  // Untere Kategorien
  ['three','four','full','small','large','kniffel','chance'].forEach((cat, idx) => {
    html += '<tr>';
    html += `<td style="font-weight:bold;text-align:left;">${catNames[idx + 6]}</td>`;

    game.players.forEach((p, pi) => {
      const score = p.scores[cat];
      const isCurrentPlayer = pi === game.turn;
      const canClick = isCurrentPlayer && score === undefined && game.rolls < 3 && p.id === socket.id;

      let cellClass = '';
      if (score !== undefined) cellClass = 'filled';
      else if (canClick) cellClass = 'clickable';

      const displayValue = score !== undefined ? score : (canClick ? calculateScore(cat) : '-');

      if (canClick) {
        html += `<td class="${cellClass}" onclick="chooseScore('${cat}')" style="cursor:pointer;">${displayValue}</td>`;
      } else {
        html += `<td class="${cellClass}">${displayValue}</td>`;
      }
    });

    html += '</tr>';
  });

  // Gesamt
  html += '<tr><td style="font-weight:bold;text-align:left;color:#218014;">🏆 GESAMT</td>';
  game.players.forEach(p => {
    const total = getTotalScore(p.scores);
    html += `<td class="filled" style="font-weight:bold;color:#218014;">${total}</td>`;
  });
  html += '</tr>';

  html += '</table>';
  scorecardDiv.innerHTML = html;
}
