# Omega Chess

A browser-based two-player chess game with a card power-up system, playable online via shareable room link. No accounts needed.

## Stack

- **Server:** Node.js + Express + Socket.io + chess.js — handles all game logic authoritatively
- **Client:** React + Vite — renders board from FEN, click-to-move UI, mobile-friendly
- **Deploy:** Railway (server) + Vercel (client)

## How It Works

Every 3 full moves, both players are dealt 3 cards and must pick 1. Cards are applied simultaneously and affect the game for a set number of turns.

## The 10 Cards

| Card | Effect |
|------|--------|
| 💀 Omega Chad Energy | ??? |
| 👾 Pac-Man | ??? |
| 🧙 Hobbit Charge | ??? |
| ⚡ Double Move | Take two moves in a row |
| 🧊 Time Freeze | Freeze opponent for a turn |
| ✨ Resurrection | Bring back a captured piece |
| 🐴 Knight's Domain | Knights gain extended range |
| 💥 Nuclear Pawn | Pawn explodes on capture |
| 🏃 Pawn Rush | All pawns can move 2 squares |
| 🔄 Swap Places | Swap any two of your pieces |

## Getting Started

### Server

```bash
cd server
npm install
npm start
```

### Client

```bash
cd client
npm install
VITE_SERVER_URL=<your-server-url> npm run dev
```

## Deployment

- **Server → Railway:** Connect repo, `railway.json` is pre-configured.
- **Client → Vercel:** Set root dir to `client`, add env var `VITE_SERVER_URL=<railway url>`.
