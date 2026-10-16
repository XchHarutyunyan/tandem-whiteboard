import { useEffect, useRef, useState } from "react";
import { Bot } from "../lib/bot";
import { createRoom, seedBoard, type Room } from "../lib/room";
import type { Presence, Shape, User } from "../lib/types";

const NAMES = ["Curious Fox", "Brave Otter", "Swift Falcon", "Calm Panda", "Bright Lynx", "Happy Koala"];
const CURSOR_COLORS = ["#ef4444", "#f97316", "#10b981", "#3b82f6", "#ec4899", "#14b8a6"];

/** A name and colour per browser tab, so two tabs show up as two people */
export function loadUser(): User {
  try {
    const saved = sessionStorage.getItem("tandem.user");
    if (saved) return JSON.parse(saved);
  } catch {
    // ignore unavailable storage
  }
  const i = Math.floor(Math.random() * NAMES.length);
  const user = { name: NAMES[i], color: CURSOR_COLORS[i] };
  try {
    sessionStorage.setItem("tandem.user", JSON.stringify(user));
  } catch {
    // ignore
  }
  return user;
}

export function useRoom(roomId: string, user: User) {
  const [room, setRoom] = useState<Room | null>(null);

  useEffect(() => {
    const r = createRoom(roomId, user);
    let cancelled = false;
    r.ready.then(() => {
      if (cancelled) return;
      // Give other tabs a moment to sync before seeding an empty board
      setTimeout(() => {
        if (!cancelled && r.shapes.size === 0) seedBoard(r, user.name);
      }, 400);
      setRoom(r);
    });
    return () => {
      cancelled = true;
      r.destroy();
      setRoom(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);

  return room;
}

/** Shapes as a plain array sorted by z-order, updated on every document change */
export function useShapes(room: Room | null): Shape[] {
  const [shapes, setShapes] = useState<Shape[]>([]);
  useEffect(() => {
    if (!room) return;
    const update = () => setShapes([...room.shapes.values()].sort((a, b) => a.z - b.z));
    update();
    room.shapes.observe(update);
    return () => room.shapes.unobserve(update);
  }, [room]);
  return shapes;
}

/** Everyone else in the room (from awareness) */
export function usePeers(room: Room | null) {
  const [peers, setPeers] = useState<[number, Presence][]>([]);
  useEffect(() => {
    if (!room) return;
    const update = () => {
      const list: [number, Presence][] = [];
      room.awareness.getStates().forEach((state, clientId) => {
        if (clientId !== room.doc.clientID && state.user) list.push([clientId, state as Presence]);
      });
      setPeers(list);
    };
    update();
    room.awareness.on("change", update);
    return () => room.awareness.off("change", update);
  }, [room]);
  return peers;
}

/** The demo bot: a second, fully synced peer that can be switched on and off */
export function useBot(roomId: string) {
  const bot = useRef<Bot | null>(null);
  const [active, setActive] = useState(false);
  useEffect(() => () => bot.current?.destroy(), []);
  return {
    active,
    toggle: () => {
      if (bot.current) {
        bot.current.destroy();
        bot.current = null;
        setActive(false);
      } else {
        bot.current = new Bot(roomId);
        setActive(true);
      }
    },
  };
}
