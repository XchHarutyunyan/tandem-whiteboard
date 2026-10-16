import { useCallback, useEffect, useRef, useState, type PointerEvent as RPointerEvent } from "react";
import { nextZ, uid, type Room } from "../lib/room";
import type { Presence, Shape, Tool } from "../lib/types";

type View = { x: number; y: number; k: number };
type Drag =
  | { kind: "pan"; startX: number; startY: number; view: View }
  | { kind: "move"; start: { x: number; y: number }; origin: Record<string, { x: number; y: number }> }
  | { kind: "resize"; id: string; start: { x: number; y: number }; w: number; h: number }
  | { kind: "draw"; points: number[] }
  | { kind: "create"; id: string; start: { x: number; y: number } };

type Props = {
  room: Room;
  shapes: Shape[];
  peers: [number, Presence][];
  tool: Tool;
  setTool: (t: Tool) => void;
  color: string;
  ink: string;
  selection: string[];
  setSelection: (ids: string[]) => void;
};

/** Infinite SVG whiteboard bound to a Yjs map of shapes */
export function Board({ room, shapes, peers, tool, setTool, color, ink, selection, setSelection }: Props) {
  const svg = useRef<SVGSVGElement>(null);
  const [view, setView] = useState<View>({ x: 40, y: 20, k: 0.9 });
  const [drag, setDrag] = useState<Drag | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [space, setSpace] = useState(false);
  const pendingCursor = useRef<{ x: number; y: number } | null>(null);

  const toWorld = useCallback(
    (clientX: number, clientY: number) => {
      const r = svg.current!.getBoundingClientRect();
      return { x: (clientX - r.left - view.x) / view.k, y: (clientY - r.top - view.y) / view.k };
    },
    [view]
  );

  const setPresence = useCallback(
    (patch: Partial<Presence>) => {
      const current = room.awareness.getLocalState() as Presence;
      room.awareness.setLocalState({ ...current, ...patch });
    },
    [room]
  );

  useEffect(() => setPresence({ selection }), [selection, setPresence]);

  const update = (id: string, patch: Partial<Shape>) => {
    const s = room.shapes.get(id);
    if (s) room.shapes.set(id, { ...s, ...patch });
  };

  const create = (shape: Omit<Shape, "id" | "z" | "author">) => {
    const id = uid();
    room.shapes.set(id, { ...shape, id, z: nextZ(room.shapes), author: (room.awareness.getLocalState() as Presence).user.name });
    return id;
  };

  // Keyboard: delete, undo/redo, duplicate, space-to-pan, tool shortcuts
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (editing || (e.target as HTMLElement).closest("input, textarea")) return;
      const mod = e.metaKey || e.ctrlKey;
      if (e.code === "Space") setSpace(true);
      if ((e.key === "Delete" || e.key === "Backspace") && selection.length) {
        room.doc.transact(() => selection.forEach((id) => room.shapes.delete(id)));
        setSelection([]);
      } else if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) room.undo.redo();
        else room.undo.undo();
      } else if (mod && e.key.toLowerCase() === "d" && selection.length) {
        e.preventDefault();
        const ids: string[] = [];
        room.doc.transact(() =>
          selection.forEach((id) => {
            const s = room.shapes.get(id);
            if (s) ids.push(create({ ...s, x: s.x + 24, y: s.y + 24 }));
          })
        );
        setSelection(ids);
      } else if (!mod) {
        const map: Record<string, Tool> = { v: "select", h: "hand", s: "sticky", r: "rect", o: "ellipse", t: "text", p: "pen" };
        if (map[e.key.toLowerCase()]) setTool(map[e.key.toLowerCase()]);
      }
    };
    const up = (e: KeyboardEvent) => e.code === "Space" && setSpace(false);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  });

  // Wheel: pan; ctrl/⌘ + wheel or pinch: zoom around the cursor
  useEffect(() => {
    const el = svg.current!;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        const r = el.getBoundingClientRect();
        const px = e.clientX - r.left;
        const py = e.clientY - r.top;
        setView((v) => {
          const k = Math.min(3, Math.max(0.2, v.k * Math.exp(-e.deltaY * 0.01)));
          return { k, x: px - ((px - v.x) * k) / v.k, y: py - ((py - v.y) * k) / v.k };
        });
      } else {
        setView((v) => ({ ...v, x: v.x - e.deltaX, y: v.y - e.deltaY }));
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const onPointerDown = (e: RPointerEvent<SVGSVGElement>) => {
    if (editing) return;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    const p = toWorld(e.clientX, e.clientY);
    const target = (e.target as Element).closest("[data-id]") as HTMLElement | null;
    const handle = (e.target as Element).closest("[data-handle]") as HTMLElement | null;

    if (tool === "hand" || space || e.button === 1) {
      setDrag({ kind: "pan", startX: e.clientX, startY: e.clientY, view });
      return;
    }
    if (handle) {
      const s = room.shapes.get(handle.dataset.handle!)!;
      setDrag({ kind: "resize", id: s.id, start: p, w: s.w, h: s.h });
      return;
    }
    if (tool === "pen") {
      setDrag({ kind: "draw", points: [p.x, p.y] });
      return;
    }
    if (tool === "sticky" || tool === "text") {
      const id =
        tool === "sticky"
          ? create({ type: "sticky", x: p.x - 80, y: p.y - 60, w: 160, h: 120, color, text: "" })
          : create({ type: "text", x: p.x, y: p.y - 20, w: 260, h: 44, color: ink, text: "" });
      setSelection([id]);
      setEditing(id);
      setTool("select");
      return;
    }
    if (tool === "rect" || tool === "ellipse") {
      const id = create({ type: tool, x: p.x, y: p.y, w: 1, h: 1, color });
      setSelection([id]);
      setDrag({ kind: "create", id, start: p });
      return;
    }

    // Select tool
    if (target) {
      const id = target.dataset.id!;
      const ids = e.shiftKey ? (selection.includes(id) ? selection.filter((x) => x !== id) : [...selection, id]) : selection.includes(id) ? selection : [id];
      setSelection(ids);
      const origin: Record<string, { x: number; y: number }> = {};
      ids.forEach((sid) => {
        const s = room.shapes.get(sid);
        if (s) origin[sid] = { x: s.x, y: s.y };
      });
      setDrag({ kind: "move", start: p, origin });
    } else {
      setSelection([]);
      setDrag({ kind: "pan", startX: e.clientX, startY: e.clientY, view });
    }
  };

  const onPointerMove = (e: RPointerEvent<SVGSVGElement>) => {
    const p = toWorld(e.clientX, e.clientY);
    // Share the cursor at most once per frame
    if (!pendingCursor.current) {
      requestAnimationFrame(() => {
        setPresence({ cursor: pendingCursor.current });
        pendingCursor.current = null;
      });
    }
    pendingCursor.current = { x: Math.round(p.x), y: Math.round(p.y) };

    if (!drag) return;
    if (drag.kind === "pan") {
      setView({ ...drag.view, x: drag.view.x + e.clientX - drag.startX, y: drag.view.y + e.clientY - drag.startY });
    } else if (drag.kind === "move") {
      const dx = p.x - drag.start.x;
      const dy = p.y - drag.start.y;
      room.doc.transact(() => Object.entries(drag.origin).forEach(([id, o]) => update(id, { x: o.x + dx, y: o.y + dy })));
    } else if (drag.kind === "resize") {
      update(drag.id, { w: Math.max(40, drag.w + p.x - drag.start.x), h: Math.max(30, drag.h + p.y - drag.start.y) });
    } else if (drag.kind === "create") {
      update(drag.id, {
        x: Math.min(p.x, drag.start.x),
        y: Math.min(p.y, drag.start.y),
        w: Math.abs(p.x - drag.start.x),
        h: Math.abs(p.y - drag.start.y),
      });
    } else if (drag.kind === "draw") {
      setDrag({ ...drag, points: [...drag.points, p.x, p.y] });
    }
  };

  const onPointerUp = () => {
    if (drag?.kind === "draw" && drag.points.length > 4) {
      const xs = drag.points.filter((_, i) => i % 2 === 0);
      const ys = drag.points.filter((_, i) => i % 2 === 1);
      const x = Math.min(...xs);
      const y = Math.min(...ys);
      create({
        type: "path",
        x,
        y,
        w: Math.max(...xs) - x,
        h: Math.max(...ys) - y,
        color: ink,
        points: drag.points.map((v, i) => Math.round(v - (i % 2 === 0 ? x : y))),
      });
    }
    if (drag?.kind === "create") {
      const s = room.shapes.get(drag.id);
      if (s && s.w < 10 && s.h < 10) update(drag.id, { x: s.x - 90, y: s.y - 60, w: 180, h: 120 });
      setTool("select");
    }
    setDrag(null);
  };

  const cursor = tool === "hand" || space ? (drag?.kind === "pan" ? "grabbing" : "grab") : tool === "select" ? "default" : "crosshair";
  const single = selection.length === 1 ? shapes.find((s) => s.id === selection[0]) : null;

  return (
    <svg
      ref={svg}
      className="board"
      style={{ cursor }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={() => setPresence({ cursor: null })}
      onDoubleClick={(e) => {
        const target = (e.target as Element).closest("[data-id]") as HTMLElement | null;
        const s = target && room.shapes.get(target.dataset.id!);
        if (s && s.type !== "path") setEditing(s.id);
      }}
    >
      <defs>
        <pattern id="grid" width={24 * view.k} height={24 * view.k} patternUnits="userSpaceOnUse" x={view.x} y={view.y}>
          <circle cx={1} cy={1} r={1} fill="#d4d4d8" />
        </pattern>
        <filter id="shadow" x="-20%" y="-20%" width="140%" height="160%">
          <feDropShadow dx="0" dy="4" stdDeviation="5" floodOpacity="0.15" />
        </filter>
      </defs>
      <rect width="100%" height="100%" fill="url(#grid)" />

      <g transform={`translate(${view.x} ${view.y}) scale(${view.k})`}>
        {shapes.map((s) => (
          <ShapeView key={s.id} s={s} editing={editing === s.id} onCommit={(text) => { update(s.id, { text }); setEditing(null); }} />
        ))}

        {drag?.kind === "draw" && (
          <polyline points={pointsToString(drag.points)} fill="none" stroke={ink} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
        )}

        {/* Other people's selections */}
        {peers.flatMap(([cid, p]) =>
          p.selection.map((id) => {
            const s = shapes.find((x) => x.id === id);
            return s ? <rect key={`${cid}-${id}`} x={s.x - 6} y={s.y - 6} width={s.w + 12} height={s.h + 12} rx={8} fill="none" stroke={p.user.color} strokeWidth={2 / view.k} strokeDasharray={`${6 / view.k} ${4 / view.k}`} /> : null;
          })
        )}

        {/* My selection */}
        {selection.map((id) => {
          const s = shapes.find((x) => x.id === id);
          return s ? <rect key={`sel-${id}`} x={s.x - 4} y={s.y - 4} width={s.w + 8} height={s.h + 8} rx={6} fill="none" stroke="#6366f1" strokeWidth={2 / view.k} pointerEvents="none" /> : null;
        })}
        {single && !editing && (
          <rect data-handle={single.id} x={single.x + single.w - 2} y={single.y + single.h - 2} width={12 / view.k} height={12 / view.k} rx={2} fill="#fff" stroke="#6366f1" strokeWidth={2 / view.k} style={{ cursor: "nwse-resize" }} />
        )}

        {/* Live cursors */}
        {peers.map(([cid, p]) =>
          p.cursor ? (
            <g key={`c-${cid}`} transform={`translate(${p.cursor.x} ${p.cursor.y}) scale(${1 / view.k})`} pointerEvents="none" className="peer-cursor">
              <path d="M0 0 L0 18 L5 13 L9 22 L12 21 L8 12 L15 12 Z" fill={p.user.color} stroke="#fff" strokeWidth={1.5} />
              <g transform="translate(14 20)">
                <rect rx={6} height={22} width={p.user.name.length * 7.4 + 16} fill={p.user.color} />
                <text x={8} y={15} fontSize={12} fontWeight={600} fill="#fff">{p.user.name}</text>
              </g>
            </g>
          ) : null
        )}
      </g>
    </svg>
  );
}

const pointsToString = (pts: number[]) => pts.reduce((s, v, i) => s + (i % 2 === 0 ? `${v},` : `${v} `), "");

function ShapeView({ s, editing, onCommit }: { s: Shape; editing: boolean; onCommit: (text: string) => void }) {
  const common = { "data-id": s.id } as Record<string, string>;
  const label = (cls: string) => (
    <foreignObject x={s.x} y={s.y} width={s.w} height={s.h} {...common}>
      {editing ? (
        <textarea
          className={`edit ${cls}`}
          defaultValue={s.text}
          ref={(el) => {
            // Focus after the creating pointer event has finished
            if (el && document.activeElement !== el) setTimeout(() => el.focus(), 0);
          }}
          onPointerDown={(e) => e.stopPropagation()}
          onBlur={(e) => onCommit(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape" || (e.key === "Enter" && (e.metaKey || e.ctrlKey))) (e.target as HTMLTextAreaElement).blur();
          }}
          style={cls === "text" ? { color: s.color } : undefined}
        />
      ) : (
        <div className={`label ${cls}`} style={cls === "text" ? { color: s.color } : undefined}>
          {s.text || (cls === "text" ? "Text" : "")}
        </div>
      )}
    </foreignObject>
  );

  switch (s.type) {
    case "sticky":
      return (
        <g>
          <rect x={s.x} y={s.y} width={s.w} height={s.h} rx={6} fill={s.color} filter="url(#shadow)" {...common} />
          {label("sticky")}
        </g>
      );
    case "rect":
      return (
        <g>
          <rect x={s.x} y={s.y} width={s.w} height={s.h} rx={14} fill={s.color} fillOpacity={0.45} stroke={s.color} strokeWidth={2} {...common} />
          {(s.text || editing) && label("shape")}
        </g>
      );
    case "ellipse":
      return (
        <g>
          <ellipse cx={s.x + s.w / 2} cy={s.y + s.h / 2} rx={s.w / 2} ry={s.h / 2} fill={s.color} fillOpacity={0.55} stroke={s.color} strokeWidth={2} {...common} />
          {(s.text || editing) && label("shape")}
        </g>
      );
    case "text":
      return label("text");
    case "path":
      return (
        <g {...common}>
          <rect x={s.x - 6} y={s.y - 6} width={s.w + 12} height={s.h + 12} fill="transparent" />
          <polyline
            points={pointsToString((s.points ?? []).map((v, i) => v + (i % 2 === 0 ? s.x : s.y)))}
            fill="none"
            stroke={s.color}
            strokeWidth={3}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </g>
      );
  }
}

