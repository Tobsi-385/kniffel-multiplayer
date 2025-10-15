# Kniffel Multiplayer - Online Game

Ein vollständig funktionsfähiges Multiplayer Kniffel-Spiel mit WebSocket-Technologie.

## 🎮 Features

- **Online Multiplayer**: Spielen Sie mit Freunden über verschiedene Rechner
- **KI-Gegner**: 0-4 KI-Spieler mit verschiedenen Schwierigkeitsgraden
- **Echtzeitkommunikation**: Socket.IO für sofortige Updates
- **Responsive Design**: Funktioniert auf Desktop und Mobile
- **Chat-System**: Kommunikation während des Spiels
- **Host-Kontrolle**: Vollständige Spielverwaltung

## 🚀 Online Deployment mit Render

### 1. Repository erstellen
```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin <your-github-repo>
git push -u origin main
```

### 2. Auf Render deployen
1. Gehen Sie zu [https://render.com](https://render.com)
2. Erstellen Sie ein kostenloses Konto
3. Klicken Sie auf "New +" → "Web Service"
4. Verbinden Sie Ihr GitHub Repository
5. Konfiguration:
   - **Name**: `kniffel-multiplayer`
   - **Environment**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Auto-Deploy**: `Yes`

### 3. Nach dem Deployment
- Ihre Anwendung ist verfügbar unter: `https://kniffel-multiplayer.onrender.com`
- Teilen Sie diese URL mit Freunden zum Spielen
- Kostenlose Render-Apps schlafen nach 15 Minuten ein, wachen aber automatisch auf

## 💻 Lokale Entwicklung

```bash
npm install
npm run dev
```

Öffnen Sie http://localhost:3000

## 🎯 Wie zu spielen

1. **Host**: Erstellen Sie einen neuen Raum
2. **Spieler**: Treten Sie mit dem Raum-Code bei
3. **KI hinzufügen**: Host kann 0-4 KI-Gegner hinzufügen
4. **Spiel starten**: Host startet das Spiel manuell
5. **Spielen**: Abwechselnd würfeln und Punkte eintragen

## 🛠 Technologie-Stack

- **Backend**: Node.js, Express, Socket.IO
- **Frontend**: Vanilla JavaScript, HTML5, CSS3
- **Deployment**: Render.com
- **Features**: WebSockets, AI Engine, Responsive Design

## 📝 Für Universitätsprojekt

Dieses Projekt demonstriert:
- Verteilte Systemarchitektur
- Client-Server-Kommunikation
- Echtzeitdatenübertragung
- State Management
- Multiplayer-Synchronisation
- KI-Integration

Perfect für Web-Technologie oder Verteilte Systeme Module.
