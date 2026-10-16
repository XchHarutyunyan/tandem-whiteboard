import * as awarenessProtocol from "y-protocols/awareness";
import * as Y from "yjs";

/**
 * Minimal Yjs transport over BroadcastChannel: syncs a document and its
 * awareness (cursors, selections) between tabs and in-page peers such as
 * the demo bot. Same interface idea as y-websocket, so a network provider
 * (e.g. Liveblocks or y-websocket) can replace it without touching the UI.
 */
type Message =
  | { t: "sync-step-1"; from: number; sv: Uint8Array; reply: boolean }
  | { t: "sync-step-2"; to: number; update: Uint8Array }
  | { t: "update"; update: Uint8Array }
  | { t: "awareness"; update: Uint8Array }
  | { t: "awareness-query" };

export class BroadcastProvider {
  private channel: BroadcastChannel;
  private origin = Symbol("broadcast-provider");
  private doc: Y.Doc;
  awareness: awarenessProtocol.Awareness;

  constructor(room: string, doc: Y.Doc, awareness: awarenessProtocol.Awareness) {
    this.doc = doc;
    this.awareness = awareness;
    this.channel = new BroadcastChannel(`tandem:${room}`);
    this.channel.onmessage = (e: MessageEvent<Message>) => this.onMessage(e.data);
    doc.on("update", this.onDocUpdate);
    awareness.on("update", this.onAwarenessUpdate);
    window.addEventListener("beforeunload", this.onUnload);

    // Ask peers for what we're missing and for their presence
    this.post({ t: "sync-step-1", from: doc.clientID, sv: Y.encodeStateVector(doc), reply: false });
    this.post({ t: "awareness-query" });
  }

  private post(msg: Message) {
    this.channel.postMessage(msg);
  }

  private onMessage(msg: Message) {
    switch (msg.t) {
      case "sync-step-1":
        this.post({ t: "sync-step-2", to: msg.from, update: Y.encodeStateAsUpdate(this.doc, msg.sv) });
        // Ask the newcomer for anything we don't have yet — only once, otherwise peers ping-pong forever
        if (!msg.reply) this.post({ t: "sync-step-1", from: this.doc.clientID, sv: Y.encodeStateVector(this.doc), reply: true });
        break;
      case "sync-step-2":
        if (msg.to === this.doc.clientID) Y.applyUpdate(this.doc, msg.update, this.origin);
        break;
      case "update":
        Y.applyUpdate(this.doc, msg.update, this.origin);
        break;
      case "awareness":
        awarenessProtocol.applyAwarenessUpdate(this.awareness, msg.update, this.origin);
        break;
      case "awareness-query":
        this.post({ t: "awareness", update: awarenessProtocol.encodeAwarenessUpdate(this.awareness, [this.doc.clientID]) });
        break;
    }
  }

  private onDocUpdate = (update: Uint8Array, origin: unknown) => {
    if (origin !== this.origin) this.post({ t: "update", update });
  };

  private onAwarenessUpdate = ({ added, updated, removed }: { added: number[]; updated: number[]; removed: number[] }, origin: unknown) => {
    if (origin === this.origin) return;
    const changed = [...added, ...updated, ...removed];
    this.post({ t: "awareness", update: awarenessProtocol.encodeAwarenessUpdate(this.awareness, changed) });
  };

  private onUnload = () => {
    awarenessProtocol.removeAwarenessStates(this.awareness, [this.doc.clientID], "unload");
  };

  destroy() {
    this.onUnload();
    this.doc.off("update", this.onDocUpdate);
    this.awareness.off("update", this.onAwarenessUpdate);
    window.removeEventListener("beforeunload", this.onUnload);
    this.channel.close();
  }
}
