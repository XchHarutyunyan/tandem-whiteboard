export type Tool = "select" | "hand" | "sticky" | "rect" | "ellipse" | "text" | "pen";

export type ShapeType = "sticky" | "rect" | "ellipse" | "text" | "path";

export type Shape = {
  id: string;
  type: ShapeType;
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
  text?: string;
  /** Freehand points relative to x/y: [x0, y0, x1, y1, …] */
  points?: number[];
  z: number;
  author: string;
};

export type User = { name: string; color: string };

/** What each participant shares through awareness (not stored in the document) */
export type Presence = {
  user: User;
  cursor: { x: number; y: number } | null;
  selection: string[];
  bot?: boolean;
};

export const COLORS = ["#fde68a", "#fbcfe8", "#bfdbfe", "#bbf7d0", "#ddd6fe", "#fed7aa"];
export const INK = ["#111827", "#ef4444", "#3b82f6", "#10b981", "#8b5cf6", "#f97316"];
