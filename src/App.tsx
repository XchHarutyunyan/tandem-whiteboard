import { useEffect, useMemo, useState } from "react";
import { Board } from "./components/Board";
import { Toolbar } from "./components/Toolbar";
import { loadUser, useBot, usePeers, useRoom, useShapes } from "./hooks/useRoom";
import { seedBoard } from "./lib/room";
import { COLORS, INK, type Tool } from "./lib/types";

const roomFromHash = () => new URLSearchParams(location.hash.slice(1)).get("room") || "demo";

export default function App() {
  const user = useMemo(() => loadUser(), []);
  const [roomId] = useState(roomFromHash);
  const room = useRoom(roomId, user);
  const shapes = useShapes(room);
  const peers = usePeers(room);
  const bot = useBot(roomId);
  const [tool, setTool] = useState<Tool>("select");
  const [color, setColor] = useState(COLORS[0]);
  const [ink, setInk] = useState(INK[0]);
  const [selection, setSelection] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!location.hash) history.replaceState(null, "", `#room=${roomId}`);
  }, [roomId]);

  // Recolour the selected shapes when a swatch is picked
  const applyColor = (c: string, kind: "fill" | "ink") => {
    if (kind === "fill") setColor(c);
    else setInk(c);
    if (!room || !selection.length) return;
    room.doc.transact(() =>
      selection.forEach((id) => {
        const s = room.shapes.get(id);
        if (!s) return;
        const isInk = s.type === "path" || s.type === "text";
        if (isInk === (kind === "ink")) room.shapes.set(id, { ...s, color: c });
      })
    );
  };

  const resetBoard = () => {
    if (!room || !confirm("Clear the board for everyone and restore the starter content?")) return;
    room.doc.transact(() => [...room.shapes.keys()].forEach((k) => room.shapes.delete(k)), "seed");
    seedBoard(room, user.name);
    setSelection([]);
  };

  const share = async () => {
    await navigator.clipboard.writeText(location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="logo">T</span>
          <span>
            Tandem <small>real-time whiteboard · room “{roomId}”</small>
          </span>
        </div>
        <div className="people" aria-label="People on this board">
          <span className="avatar me" style={{ background: user.color }} title={`${user.name} (you)`}>
            {user.name[0]}
          </span>
          {peers.map(([id, p]) => (
            <span key={id} className="avatar" style={{ background: p.user.color }} title={p.user.name}>
              {p.bot ? "🤖" : p.user.name[0]}
            </span>
          ))}
          <span className="count">{peers.length + 1} online</span>
        </div>
        <div className="actions">
          <button className={bot.active ? "on" : ""} onClick={bot.toggle}>
            {bot.active ? "Stop bot" : "🤖 Invite a bot"}
          </button>
          <button onClick={() => window.open(location.href, "_blank")}>Open 2nd tab</button>
          <button onClick={share}>{copied ? "Link copied ✓" : "Copy link"}</button>
          <button className="ghost" onClick={resetBoard}>Reset</button>
        </div>
      </header>

      {room ? (
        <Board
          room={room}
          shapes={shapes}
          peers={peers}
          tool={tool}
          setTool={setTool}
          color={color}
          ink={ink}
          selection={selection}
          setSelection={setSelection}
        />
      ) : (
        <div className="loading">Connecting to the board…</div>
      )}

      <Toolbar
        tool={tool}
        setTool={setTool}
        color={color}
        setColor={(c) => applyColor(c, "fill")}
        ink={ink}
        setInk={(c) => applyColor(c, "ink")}
        onUndo={() => room?.undo.undo()}
        onRedo={() => room?.undo.redo()}
        onDelete={
          selection.length
            ? () => {
                room?.doc.transact(() => selection.forEach((id) => room.shapes.delete(id)));
                setSelection([]);
              }
            : undefined
        }
      />

      <aside className="hint">
        Drag to move · double-click to edit · scroll to pan · ⌘/Ctrl + scroll to zoom · edits sync live between tabs
        (CRDT) and persist in your browser
      </aside>
    </div>
  );
}
