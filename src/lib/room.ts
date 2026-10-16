import { IndexeddbPersistence } from "y-indexeddb";
import { Awareness } from "y-protocols/awareness";
import * as Y from "yjs";
import { BroadcastProvider } from "./broadcastProvider";
import type { Presence, Shape, User } from "./types";

export type Room = {
  id: string;
  doc: Y.Doc;
  shapes: Y.Map<Shape>;
  awareness: Awareness;
  undo: Y.UndoManager;
  provider: BroadcastProvider;
  ready: Promise<void>;
  destroy: () => void;
};

/** One shared board: CRDT document + presence + persistence + transport */
export function createRoom(id: string, user: User, { persist = true, bot = false } = {}): Room {
  const doc = new Y.Doc();
  const shapes = doc.getMap<Shape>("shapes");
  const awareness = new Awareness(doc);
  awareness.setLocalState({ user, cursor: null, selection: [], bot } satisfies Presence);

  const persistence = persist ? new IndexeddbPersistence(`tandem:${id}`, doc) : null;
  const provider = new BroadcastProvider(id, doc, awareness);
  const undo = new Y.UndoManager(shapes, { captureTimeout: 400 });

  return {
    id,
    doc,
    shapes,
    awareness,
    undo,
    provider,
    ready: persistence ? persistence.whenSynced.then(() => undefined) : Promise.resolve(),
    destroy() {
      provider.destroy();
      persistence?.destroy();
      undo.destroy();
      doc.destroy();
    },
  };
}

export const uid = () => Math.random().toString(36).slice(2, 10);

export const nextZ = (shapes: Y.Map<Shape>) => {
  let z = 0;
  shapes.forEach((s) => (z = Math.max(z, s.z)));
  return z + 1;
};

/** A friendly starter board for an empty room */
export function seedBoard(room: Room, author: string) {
  const items: Omit<Shape, "id" | "z" | "author">[] = [
    { type: "text", x: 80, y: 40, w: 520, h: 60, color: "#111827", text: "Team retro · Sprint 14" },
    { type: "rect", x: 60, y: 120, w: 300, h: 380, color: "#bbf7d0" },
    { type: "rect", x: 390, y: 120, w: 300, h: 380, color: "#fbcfe8" },
    { type: "rect", x: 720, y: 120, w: 300, h: 380, color: "#bfdbfe" },
    { type: "text", x: 80, y: 130, w: 260, h: 40, color: "#065f46", text: "What went well" },
    { type: "text", x: 410, y: 130, w: 260, h: 40, color: "#9d174d", text: "What to improve" },
    { type: "text", x: 740, y: 130, w: 260, h: 40, color: "#1e40af", text: "Action items" },
    { type: "sticky", x: 90, y: 190, w: 160, h: 120, color: "#fde68a", text: "Shipped the iOS release on time 🚀" },
    { type: "sticky", x: 170, y: 330, w: 160, h: 120, color: "#fde68a", text: "Pair programming sessions helped" },
    { type: "sticky", x: 420, y: 190, w: 160, h: 120, color: "#fed7aa", text: "Too many meetings on Monday" },
    { type: "sticky", x: 500, y: 330, w: 160, h: 120, color: "#fed7aa", text: "Flaky e2e tests" },
    { type: "sticky", x: 750, y: 190, w: 160, h: 120, color: "#ddd6fe", text: "Move stand-up to async notes" },
  ];
  room.doc.transact(() => {
    items.forEach((s, i) => {
      const id = uid();
      room.shapes.set(id, { ...s, id, z: i + 1, author });
    });
  }, "seed");
}
