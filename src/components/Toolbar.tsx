import { COLORS, INK, type Tool } from "../lib/types";

const TOOLS: { id: Tool; label: string; key: string; icon: string }[] = [
  { id: "select", label: "Select", key: "V", icon: "↖" },
  { id: "hand", label: "Pan", key: "H", icon: "✋" },
  { id: "sticky", label: "Sticky note", key: "S", icon: "▤" },
  { id: "rect", label: "Rectangle", key: "R", icon: "▭" },
  { id: "ellipse", label: "Ellipse", key: "O", icon: "◯" },
  { id: "text", label: "Text", key: "T", icon: "T" },
  { id: "pen", label: "Pen", key: "P", icon: "✎" },
];

type Props = {
  tool: Tool;
  setTool: (t: Tool) => void;
  color: string;
  setColor: (c: string) => void;
  ink: string;
  setInk: (c: string) => void;
  onUndo: () => void;
  onRedo: () => void;
  onDelete?: () => void;
};

export function Toolbar({ tool, setTool, color, setColor, ink, setInk, onUndo, onRedo, onDelete }: Props) {
  const usesInk = tool === "pen" || tool === "text";
  return (
    <div className="toolbar" role="toolbar" aria-label="Drawing tools">
      {TOOLS.map((t) => (
        <button key={t.id} className={tool === t.id ? "active" : ""} onClick={() => setTool(t.id)} title={`${t.label} (${t.key})`} aria-label={t.label} aria-pressed={tool === t.id}>
          <span className={t.id === "text" ? "serif" : ""}>{t.icon}</span>
        </button>
      ))}
      <span className="sep" />
      {(usesInk ? INK : COLORS).map((c) => (
        <button
          key={c}
          className={`swatch${(usesInk ? ink : color) === c ? " active" : ""}`}
          style={{ background: c }}
          onClick={() => (usesInk ? setInk(c) : setColor(c))}
          aria-label={`Colour ${c}`}
        />
      ))}
      <span className="sep" />
      <button onClick={onUndo} title="Undo (⌘Z)" aria-label="Undo">↶</button>
      <button onClick={onRedo} title="Redo (⇧⌘Z)" aria-label="Redo">↷</button>
      {onDelete && (
        <button onClick={onDelete} title="Delete (⌫)" aria-label="Delete selection">🗑</button>
      )}
    </div>
  );
}
