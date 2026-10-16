import { createRoom, nextZ, uid, type Room } from "./room";
import { COLORS, type Presence, type Shape } from "./types";

const IDEAS = [
  "Automate release notes",
  "Add Storybook for UI kit",
  "Weekly demo on Fridays",
  "Fix onboarding drop-off",
  "Dark mode for the app",
  "Cache API responses",
  "Write e2e for checkout",
  "Celebrate small wins 🎉",
];

/**
 * A simulated teammate for the demo. It is a *real* second peer: its own
 * Yjs document and awareness, synced through the same transport as any
 * browser tab — so everything you see it do went through the CRDT.
 */
export class Bot {
  private room: Room;
  private timer = 0;
  private raf = 0;
  private cursor = { x: 600, y: 300 };
  private target = { x: 600, y: 300 };
  private step = 0;

  constructor(roomId: string, name = "Mila (bot)", color = "#8b5cf6") {
    this.room = createRoom(roomId, { name, color }, { persist: false, bot: true });
    this.animate();
    this.timer = window.setInterval(() => this.act(), 2600);
  }

  private presence(patch: Partial<Presence>) {
    const current = this.room.awareness.getLocalState() as Presence;
    this.room.awareness.setLocalState({ ...current, ...patch });
  }

  /** Smooth cursor movement towards the current target */
  private animate = () => {
    this.cursor.x += (this.target.x - this.cursor.x) * 0.08;
    this.cursor.y += (this.target.y - this.cursor.y) * 0.08;
    this.presence({ cursor: { x: Math.round(this.cursor.x), y: Math.round(this.cursor.y) } });
    this.raf = window.setTimeout(this.animate, 80) as unknown as number;
  };

  private act() {
    const shapes = [...this.room.shapes.values()];
    const stickies = shapes.filter((s) => s.type === "sticky");
    this.step++;

    if (this.step % 3 === 1) {
      // Add an idea in the "Action items" column (or near the middle of the board)
      const x = 740 + Math.random() * 120;
      const y = 200 + Math.random() * 260;
      this.target = { x: x + 60, y: y + 50 };
      window.setTimeout(() => {
        const id = uid();
        const shape: Shape = {
          id,
          type: "sticky",
          x,
          y,
          w: 160,
          h: 120,
          color: COLORS[Math.floor(Math.random() * COLORS.length)],
          text: IDEAS[Math.floor(Math.random() * IDEAS.length)],
          z: nextZ(this.room.shapes),
          author: "bot",
        };
        this.room.shapes.set(id, shape);
        this.presence({ selection: [id] });
      }, 1200);
    } else if (stickies.length) {
      // Pick a sticky and nudge it a little, like someone tidying the board
      const s = stickies[Math.floor(Math.random() * stickies.length)];
      this.target = { x: s.x + s.w / 2, y: s.y + s.h / 2 };
      window.setTimeout(() => {
        const fresh = this.room.shapes.get(s.id);
        if (!fresh) return;
        this.presence({ selection: [s.id] });
        this.room.shapes.set(s.id, { ...fresh, x: fresh.x + (Math.random() - 0.5) * 60, y: fresh.y + (Math.random() - 0.5) * 40 });
      }, 1300);
    }
  }

  destroy() {
    clearInterval(this.timer);
    clearTimeout(this.raf);
    this.room.destroy();
  }
}
