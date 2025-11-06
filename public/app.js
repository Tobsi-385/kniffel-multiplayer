const socket = io();
let game = null, isHost = false;

const cats = ['ones','twos','threes','fours','fives','sixes','three','four','full','small','large','kniffel','chance'];
const catNames = ['Einser','Zweier','Dreier','Vierer','Fünfer','Sechser','3er-Pasch','4er-Pasch','Full House','Kleine Str.','Große Str.','Kniffel','Chance'];

function show(id) {
    document.querySelectorAll('.screen').forEach(s => s.style.display = 'none');
    document.getElementById(id).style.display = 'block';
}

function createRoom() {
    const name = document.getElementById('name').value;
    if (!name) return alert('Name eingeben');
    socket.emit('create', { name });
}

function joinRoom() {
    const name = document.getElementById('name').value;
    const code = document.getElementById('code').value;
    if (!name || !code) return alert('Name und Code eingeben');
    socket.emit('join', { code, name });
}

function startGame() {
    socket.emit('start', { code: game.roomCode });
}

function rollDice() {
    const diceElements = document.querySelectorAll('.dice-item');
    diceElements.forEach(die => {
        die.classList.add('rolling');
    });

    // Würfelwurf mit Animation, nach 500ms das Würfelergebnis senden
    setTimeout(() => {
        const kept = Array.from(diceElements).map(d => d.classList.contains('kept'));
        socket.emit('roll', { code: game.roomCode, kept });
        diceElements.forEach(die => {
            die.classList.remove('rolling');
        });
    }, 5000);
}

function selectScore(cat) {
    socket.emit('score', { code: game.roomCode, cat });
}

function renderGame() {
    const current = game.players[game.turn];
    document.getElementById('turn').textContent = `${current.name} am Zug`;
    document.getElementById('rolls').textContent = `Würfe: ${game.rolls}/3`;

    const diceDiv = document.getElementById('dice');
    diceDiv.innerHTML = '';
    game.dice.forEach((d, i) => {
        const el = document.createElement('div');
        el.className = 'dice-item';
        el.textContent = '⚀⚁⚂⚃⚄⚅'[d-1];
        el.onclick = () => {
            if (game.rolls < 3) el.classList.toggle('kept');
        };
        diceDiv.appendChild(el);
    });

    if (!document.getElementById('scoreHeader').innerHTML) {
        let header = '<tr><th>Kategorie</th>';
        game.players.forEach(p => header += '<th>' + p.name + '</th>');
        header += '</tr>';
        document.getElementById('scoreHeader').innerHTML = header;
    }

    let tbody = '';
    cats.forEach((cat, i) => {
        tbody += '<tr><td>' + catNames[i] + '</td>';
        game.players.forEach(p => {
            const score = p.scores[cat];
            if (score !== undefined) {
                tbody += '<td>' + score + '</td>';
            } else if (game.turn === game.players.indexOf(p)) {
                tbody += '<td class="available" onclick="selectScore(\'' + cat + '\')">[?]</td>';
            } else {
                tbody += '<td>-</td>';
            }
        });
        tbody += '</tr>';
    });
    document.getElementById('scoreBody').innerHTML = tbody;
}

socket.on('room', (data) => {
    game = data;
    isHost = game.players[0].id === socket.id;

    if (game.phase === 'waiting') {
        show('waiting');
        document.getElementById('roomCode').textContent = game.roomCode;
        
        let html = '';
        game.players.forEach(p => {
            html += '<div style="padding:8px; background:#f0f0f0; margin:5px 0; border-radius:4px;">' +
                    p.name + (p.isHost ? ' (Host)' : '') + '</div>';
        });
        document.getElementById('players').innerHTML = html;
        
        if (isHost) {
            document.getElementById('startBtn').style.display = 'block';
        }
    } else if (game.phase === 'playing') {
        show('game');
        renderGame();
    }
});

socket.on('error', (msg) => alert('Fehler: ' + msg));

show('lobby');
