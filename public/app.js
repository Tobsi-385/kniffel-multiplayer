// Kniffel Multiplayer Client - Socket.IO Integration
class KniffelMultiplayerClient {
    constructor() {
        this.socket = null;
        this.gameState = {
            roomCode: null,
            playerId: null,
            playerName: '',
            isHost: false,
            currentScreen: 'lobby',
            players: [],
            currentPlayerIndex: 0,
            currentRound: 1,
            rollsLeft: 3,
            dice: [1, 1, 1, 1, 1],
            selectedDice: [false, false, false, false, false],
            scores: {},
            gamePhase: 'waiting'
        };

        this.scoreCategories = [
            { id: 'ones', name: 'Einser', description: 'Alle Einser zählen' },
            { id: 'twos', name: 'Zweier', description: 'Alle Zweier zählen' },
            { id: 'threes', name: 'Dreier', description: 'Alle Dreier zählen' },
            { id: 'fours', name: 'Vierer', description: 'Alle Vierer zählen' },
            { id: 'fives', name: 'Fünfer', description: 'Alle Fünfer zählen' },
            { id: 'sixes', name: 'Sechser', description: 'Alle Sechser zählen' },
            { id: 'three-of-kind', name: 'Dreierpasch', description: 'Summe aller Würfel' },
            { id: 'four-of-kind', name: 'Viererpasch', description: 'Summe aller Würfel' },
            { id: 'full-house', name: 'Full House', description: '25 Punkte' },
            { id: 'small-straight', name: 'Kleine Straße', description: '30 Punkte' },
            { id: 'large-straight', name: 'Große Straße', description: '40 Punkte' },
            { id: 'kniffel', name: 'Kniffel', description: '50 Punkte' },
            { id: 'chance', name: 'Chance', description: 'Summe aller Würfel' }
        ];

        this.init();
    }

    init() {
        this.setupEventListeners();
        this.connectSocket();
        this.showScreen('lobby');
    }

    connectSocket() {
        this.socket = io();

        this.socket.on('connect', () => {
            console.log('✅ Mit Server verbunden');
            this.updateConnectionStatus('connected', 'Verbunden');
        });

        this.socket.on('disconnect', () => {
            console.log('❌ Verbindung getrennt');
            this.updateConnectionStatus('disconnected', 'Getrennt');
        });

        this.setupSocketEvents();
    }

    setupSocketEvents() {
            // Raum beigetreten
        this.socket.on('joined_room', (data) => {
            console.log('🚪 Raum beigetreten:', data.gameState.roomCode);
            this.gameState.playerId = this.socket.id;
            this.gameState.roomCode = data.gameState.roomCode; // WICHTIG: Raumcode explizit setzen
            this.gameState.isHost = data.player.isHost; // Host-Status setzen
            this.updateGameState(data.gameState);
            this.showScreen('waiting-room');
            this.renderUI(); // Sofort rendern
            console.log('✅ State aktualisiert - Raum:', this.gameState.roomCode, 'Host:', this.gameState.isHost);
        });

        // Spieler beigetreten
        this.socket.on('player_joined', (data) => {
            console.log('👤 Spieler beigetreten:', data.player.name);
            console.log('👥 Aktuelle Spieleranzahl:', data.gameState.players.length);
            this.updateGameState(data.gameState);
            this.renderUI(); // Wichtig: UI komplett neu rendern
            this.addChatMessage('System', `${data.player.name} ist beigetreten (${data.gameState.players.length}/6)`, 'system');
        });

        // KI-Spieler hinzugefügt
        this.socket.on('ai_player_added', (data) => {
            console.log('🤖 KI-Spieler hinzugefügt:', data.aiPlayer.name);
            this.updateGameState(data.gameState);
            this.addChatMessage('System', `${data.aiPlayer.name} wurde hinzugefügt`, 'system');
        });

        // Spiel gestartet
        this.socket.on('game_started', (data) => {
            console.log('🎮 Spiel gestartet');
            this.updateGameState(data.gameState);
            this.showScreen('game-screen');
            this.addChatMessage('System', 'Spiel wurde gestartet!', 'system');
        });

        // Würfel gerollt
        this.socket.on('dice_rolled', (data) => {
            console.log('🎲 Würfel gerollt:', data.dice);
            this.gameState.dice = data.dice;
            this.gameState.rollsLeft = data.rollsLeft;
            this.updateGameState(data.gameState);
            this.renderDice();
        });

        // KI hat gewürfelt
        this.socket.on('ai_dice_rolled', (data) => {
            console.log('🤖 KI hat gewürfelt:', data.aiPlayerName);
            this.gameState.dice = data.dice;
            this.gameState.rollsLeft = data.rollsLeft;
            this.updateGameState(data.gameState);
            this.renderDice();
            this.addChatMessage('System', `${data.aiPlayerName} hat gewürfelt`, 'ai');
        });

        // Punkte eingetragen
        this.socket.on('score_submitted', (data) => {
            console.log('📊 Punkte eingetragen');
            this.updateGameState(data.gameState);
            this.renderScoreTable();
        });

        // KI hat Punkte eingetragen
        this.socket.on('ai_score_submitted', (data) => {
            console.log('🤖 KI hat Punkte eingetragen:', data.aiPlayerName);
            this.updateGameState(data.gameState);
            this.renderScoreTable();
            this.addChatMessage('System', `${data.aiPlayerName} hat ${data.category} gewählt (${data.score} Punkte)`, 'ai');
        });

        // Chat-Nachricht
        this.socket.on('chat_message', (data) => {
            this.addChatMessage(data.playerName, data.message);
        });

        // Spieler verlassen
        this.socket.on('player_left', (data) => {
            this.updateGameState(data.gameState);
            this.addChatMessage('System', 'Ein Spieler hat das Spiel verlassen', 'system');
        });

        // Fehler
        this.socket.on('error', (data) => {
            console.error('❌ Fehler:', data.message);
            alert(`Fehler: ${data.message}`);
        });
    }

    setupEventListeners() {
        // Lobby Events
        document.getElementById('createRoomBtn').addEventListener('click', () => this.createRoom());
        document.getElementById('joinRoomBtn').addEventListener('click', () => this.joinRoom());

        // Waiting Room Events
        document.getElementById('add-ai-btn').addEventListener('click', () => this.addAIPlayer());
        document.getElementById('start-game-btn').addEventListener('click', () => this.startGame());
        document.getElementById('leaveRoomBtn').addEventListener('click', () => this.leaveRoom());
        document.getElementById('copyRoomCodeBtn').addEventListener('click', () => this.copyRoomCode());

        // Chat Events
        document.getElementById('send-chat-btn').addEventListener('click', () => this.sendChatMessage());
        document.getElementById('chat-input').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.sendChatMessage();
        });

        // Game Events
        document.getElementById('rollDiceBtn').addEventListener('click', () => this.rollDice());
        document.getElementById('quitGameBtn').addEventListener('click', () => this.quitGame());

        // Finished Game Events
        document.getElementById('new-game-btn').addEventListener('click', () => this.newGame());
        document.getElementById('back-to-lobby-btn').addEventListener('click', () => this.backToLobby());
    }

    // Screen Management
    showScreen(screenId) {
        const screens = ['lobby', 'waiting-room', 'game-screen', 'game-finished'];
        screens.forEach(screen => {
            document.getElementById(screen).classList.remove('active');
        });
        document.getElementById(screenId).classList.add('active');
        this.gameState.currentScreen = screenId;
    }

    updateConnectionStatus(status, text) {
        const statusElement = document.getElementById('connection-status');
        const iconElement = document.getElementById('status-icon');
        const textElement = document.getElementById('status-text');

        statusElement.className = `connection-status ${status}`;
        iconElement.textContent = status === 'connected' ? '🟢' : '🔴';
        textElement.textContent = text;
    }

    // Game Actions
    createRoom() {
        const playerName = document.getElementById('playerName').value.trim();
        if (!playerName) {
            alert('Bitte geben Sie einen Spielernamen ein');
            return;
        }

        this.gameState.playerName = playerName;
        this.socket.emit('create_room', { playerName });
    }

    joinRoom() {
    const playerName = document.getElementById('playerName').value.trim();
    const roomCodeInput = document.getElementById('roomCode').value.trim().toUpperCase();
    
    if (!playerName || !roomCodeInput) {
        alert('Bitte geben Sie Namen und Raum-Code ein');
        return;
    }
    
    if (roomCodeInput.length !== 4) {
        alert('Raum-Code muss genau 4 Zeichen haben');
        return;
    }
    
    console.log(`🚪 Versuche Raum beizutreten: "${roomCodeInput}"`);
    this.gameState.playerName = playerName;
    
    // Debug: Socket-Verbindung prüfen
    if (!this.socket.connected) {
        console.error('❌ Socket nicht verbunden!');
        alert('Keine Verbindung zum Server. Seite neu laden und versuchen.');
        return;
    }
    
    this.socket.emit('join_room', { 
        roomCode: roomCodeInput, 
        playerName: playerName 
    });
}

    addAIPlayer() {
        const difficulty = document.getElementById('ai-difficulty').value;
        this.socket.emit('add_ai_player', {
            roomCode: this.gameState.roomCode,
            difficulty: difficulty
        });
    }

    startGame() {
        this.socket.emit('start_game', {
            roomCode: this.gameState.roomCode
        });
    }

    rollDice() {
        if (!this.isMyTurn() || this.gameState.rollsLeft <= 0) return;

        this.socket.emit('roll_dice', {
            roomCode: this.gameState.roomCode,
            keptDice: this.gameState.selectedDice
        });

        // Reset selection
        this.gameState.selectedDice = [false, false, false, false, false];
        this.renderDice();
    }

    submitScore(category) {
        if (!this.isMyTurn() || this.gameState.rollsLeft === 3) return;

        this.socket.emit('submit_score', {
            roomCode: this.gameState.roomCode,
            category: category,
            dice: this.gameState.dice
        });
    }

    sendChatMessage() {
        const input = document.getElementById('chat-input');
        const message = input.value.trim();
        if (!message) return;

        this.socket.emit('chat_message', {
            roomCode: this.gameState.roomCode,
            message: message
        });

        input.value = '';
    }

    leaveRoom() {
        this.showScreen('lobby');
        // Socket wird automatisch disconnected
    }

    copyRoomCode() {
        navigator.clipboard.writeText(this.gameState.roomCode);
        const btn = document.getElementById('copyRoomCodeBtn');
        btn.textContent = '✅ Kopiert!';
        setTimeout(() => {
            btn.textContent = '📋 Kopieren';
        }, 2000);
    }

    // Game State Management
    updateGameState(newState) {
        Object.assign(this.gameState, newState);
        this.renderUI();
    }

    renderUI() {
    this.renderWaitingRoom();
    this.renderGameScreen();
    this.renderGamePlayersOverview(); // NEU
    this.renderScoreTable();
    this.renderDice();
}

    renderWaitingRoom() {
    if (this.gameState.currentScreen !== 'waiting-room') return;

    // Room Code
    document.getElementById('current-room-code').textContent = this.gameState.roomCode;

    // Players List
    const playersContainer = document.getElementById('players-list');
    const playerCount = document.getElementById('player-count');
    
    playersContainer.innerHTML = '';
    playerCount.textContent = this.gameState.players.length;

    // Zähle menschliche und KI-Spieler
    let humanCount = 0;
    let aiCount = 0;

    this.gameState.players.forEach(player => {
        const playerDiv = document.createElement('div');
        playerDiv.className = 'player-item';
        
        const playerInfo = document.createElement('div');
        playerInfo.className = 'player-info';
        
        const statusDot = document.createElement('div');
        statusDot.className = `player-status ${player.isAI ? 'ai' : 'human'}`;
        
        const playerName = document.createElement('span');
        playerName.textContent = `${player.isAI ? '🤖' : '👤'} ${player.name}${player.isHost ? ' (Host)' : ''}`;
        
        // Zählung
        if (player.isAI) {
            aiCount++;
        } else {
            humanCount++;
        }
        
        playerInfo.appendChild(statusDot);
        playerInfo.appendChild(playerName);
        playerDiv.appendChild(playerInfo);
        
        playersContainer.appendChild(playerDiv);
    });

    // Aktualisiere Zähler
    document.getElementById('human-count').textContent = humanCount;
    document.getElementById('ai-count').textContent = aiCount;

    // Host Controls
    const hostControls = document.getElementById('host-controls');
    hostControls.style.display = this.gameState.isHost ? 'block' : 'none';
}

renderGamePlayersOverview() {
    const container = document.getElementById('game-players-list');
    if (!container) return;

    container.innerHTML = '';

    this.gameState.players.forEach((player, index) => {
        const playerCard = document.createElement('div');
        playerCard.className = `game-player-card ${index === this.gameState.currentPlayerIndex ? 'current-turn' : ''}`;
        
        const playerInfo = document.createElement('div');
        playerInfo.className = 'game-player-info';
        
        const avatar = document.createElement('span');
        avatar.className = 'player-avatar';
        avatar.textContent = player.isAI ? '🤖' : '👤';
        
        const name = document.createElement('span');
        name.className = 'player-name';
        name.textContent = player.name;
        
        const score = document.createElement('span');
        score.className = 'player-score';
        const total = this.calculateTotal(player.id);
        score.textContent = `${total} Pkt`;
        
        playerInfo.appendChild(avatar);
        playerInfo.appendChild(name);
        
        playerCard.appendChild(playerInfo);
        playerCard.appendChild(score);
        
        // Turn-Indikator
        if (index === this.gameState.currentPlayerIndex) {
            const turnIndicator = document.createElement('span');
            turnIndicator.className = 'turn-indicator';
            turnIndicator.textContent = '▶️';
            playerCard.appendChild(turnIndicator);
        }
        
        container.appendChild(playerCard);
    });
}

    
    renderGameScreen() {
    if (this.gameState.currentScreen !== 'game-screen') return;

    // Current Round
    document.getElementById('current-round').textContent = this.gameState.currentRound;
    document.getElementById('game-room-code').textContent = this.gameState.roomCode || 'XXXX';

    // Current Player
    const currentPlayer = this.gameState.players[this.gameState.currentPlayerIndex];
    if (currentPlayer) {
        document.getElementById('current-player-name').textContent = currentPlayer.name;
    }

    // Rolls Left
    document.getElementById('rolls-left').textContent = this.gameState.rollsLeft;

    // Roll Button
    const rollBtn = document.getElementById('rollDiceBtn');
    rollBtn.disabled = !this.isMyTurn() || this.gameState.rollsLeft <= 0;
}

    renderDice() {
        const diceContainer = document.getElementById('dice-container');
        if (!diceContainer) return;

        diceContainer.innerHTML = '';

        this.gameState.dice.forEach((value, index) => {
            const diceDiv = document.createElement('div');
            diceDiv.className = `dice dice-${value} ${this.gameState.selectedDice[index] ? 'selected' : ''}`;
            diceDiv.dataset.index = index;

            // Click handler für Würfel-Selektion
            diceDiv.addEventListener('click', () => {
                if (this.isMyTurn() && this.gameState.rollsLeft < 3 && this.gameState.rollsLeft > 0) {
                    this.gameState.selectedDice[index] = !this.gameState.selectedDice[index];
                    diceDiv.classList.toggle('selected');
                }
            });

            diceContainer.appendChild(diceDiv);
        });
    }

    renderScoreTable() {
        const container = document.getElementById('score-table-container');
        if (!container) return;

        let tableHTML = '<table class="score-table"><thead><tr>';
        tableHTML += '<th class="category">Kategorie</th>';

        this.gameState.players.forEach(player => {
            tableHTML += `<th>${player.isAI ? '🤖' : '👤'} ${player.name}</th>`;
        });

        tableHTML += '</tr></thead><tbody>';

        this.scoreCategories.forEach(category => {
            tableHTML += '<tr>';
            tableHTML += `<td class="category">${category.name}</td>`;

            this.gameState.players.forEach(player => {
                const score = this.gameState.scores[player.id] && this.gameState.scores[player.id][category.id];
                const isAvailable = score === undefined && this.isMyTurn() && 
                                  this.gameState.currentPlayerIndex === this.gameState.players.indexOf(player) &&
                                  this.gameState.rollsLeft < 3;

                let cellClass = '';
                let cellContent = score !== undefined ? score : '';

                if (isAvailable) {
                    cellClass = 'available';
                    const potentialScore = this.calculateScore(this.gameState.dice, category.id);
                    cellContent = `(${potentialScore})`;
                }

                tableHTML += `<td class="${cellClass}" ${isAvailable ? `onclick="game.submitScore('${category.id}')"` : ''}>${cellContent}</td>`;
            });

            tableHTML += '</tr>';
        });

        // Summen berechnen
        tableHTML += '<tr style="border-top: 2px solid #000;"><td class="category"><strong>Gesamt</strong></td>';
        this.gameState.players.forEach(player => {
            const total = this.calculateTotal(player.id);
            tableHTML += `<td><strong>${total}</strong></td>`;
        });
        tableHTML += '</tr>';

        tableHTML += '</tbody></table>';
        container.innerHTML = tableHTML;
    }

    // Chat
    addChatMessage(playerName, message, type = 'player') {
        const chatMessages = document.getElementById('chat-messages');
        if (!chatMessages) return;

        const messageDiv = document.createElement('div');
        messageDiv.className = 'chat-message';

        const icon = type === 'system' ? '🔔' : (type === 'ai' ? '🤖' : '👤');
        const time = new Date().toLocaleTimeString();

        messageDiv.innerHTML = `
            <div class="chat-message-header">${icon} ${playerName} - ${time}</div>
            <div>${message}</div>
        `;

        chatMessages.appendChild(messageDiv);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    // Helper Functions
    isMyTurn() {
        const currentPlayer = this.gameState.players[this.gameState.currentPlayerIndex];
        return currentPlayer && currentPlayer.id === this.gameState.playerId;
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

    calculateTotal(playerId) {
        const playerScores = this.gameState.scores[playerId] || {};
        return Object.values(playerScores).reduce((sum, score) => sum + (score || 0), 0);
    }

    // Game End Actions
    newGame() {
        // Reset und neues Spiel starten
        this.showScreen('waiting-room');
    }

    backToLobby() {
        this.showScreen('lobby');
    }

    quitGame() {
        this.showScreen('lobby');
    }
}

// Initialize Game when page loads
let game;
document.addEventListener('DOMContentLoaded', () => {
    game = new KniffelMultiplayerClient();
});
