# Tandem — real-time collaborative whiteboard

A Figma/Miro-style whiteboard where several people edit the same board at once — without conflicts. Built on **CRDTs (Yjs)** with **React 19, TypeScript and Vite**; the canvas is hand-written SVG.

## Features

- Infinite canvas: pan, zoom around the cursor, dotted grid
- Sticky notes, rectangles, ellipses, text and freehand drawing; colours, resize, duplicate (⌘D), delete
- **Live cursors, presence avatars and other people's selections**
- Conflict-free simultaneous editing (Yjs CRDT) and per-user **undo / redo** (⌘Z / ⇧⌘Z) that never undoes someone else's work
- Offline-first: the board persists in IndexedDB and merges when tabs reconnect
- **"Invite a bot"** — a simulated teammate that is a real second peer (its own Yjs document and awareness) and edits through the same sync protocol
- Keyboard shortcuts: V select · H pan · S sticky · R rectangle · O ellipse · T text · P pen

## Architecture

```
React UI ──▶ Y.Map<Shape> (CRDT) ──▶ Y.UndoManager (local changes only)
                 │
                 ├── y-indexeddb  (persistence)
                 └── BroadcastProvider  ◀──▶ other tabs / the bot
                       • sync step 1/2 with state vectors
                       • incremental updates
                       • awareness: cursors, selections, names
```

`src/lib/broadcastProvider.ts` is a small Yjs transport over `BroadcastChannel`. It follows the same pattern as `y-websocket`, so syncing across devices is a drop-in swap for a network provider (y-websocket, Liveblocks, PartyKit) — the UI doesn't change.

## Run locally

```sh
npm install
npm run dev
```

Open the board in two tabs (or click **Open 2nd tab**) and edit in both.

---

Made by [Khachik Harutyunyan](https://khharutyunyan.dev) — Senior Full-Stack Web & Mobile Developer.
