import { serverMessageSchema } from "@belote/protocol";
export type Room = {
  code: string;
  ownerId: string;
  phase: "LOBBY" | "PLAYING";
  participants: Array<{
    id: string;
    nickname: string;
    seat: 0 | 1 | 2 | 3;
    team: "A" | "B";
    connected: boolean;
  }>;
};
const base = import.meta.env.VITE_API_URL || window.location.origin;
export async function roomRequest(path: string, body: unknown) {
  const response = await fetch(`${base}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.code ?? "SERVER_UNAVAILABLE");
  return data as {
    code: string;
    participantId: string;
    token: string;
    room: Room;
  };
}
export function getWsUrl(code: string) {
  return (
    (import.meta.env.VITE_WS_URL ||
      window.location.origin.replace(/^http/, "ws")) + `/rooms/${code}/ws`
  );
}
export class RoomSocket {
  private socket: WebSocket | null = null;
  private closed = false;
  constructor(
    private readonly code: string,
    private readonly token: string,
    private readonly onMessage: (message: unknown) => void,
    private readonly onStatus: (status: string) => void,
  ) {}
  connect() {
    this.closed = false;
    this.socket = new WebSocket(getWsUrl(this.code));
    this.socket.onopen = () => {
      this.onStatus("connected");
      this.socket?.send(JSON.stringify({ type: "AUTH", token: this.token }));
    };
    this.socket.onmessage = (event) => {
      const parsed = serverMessageSchema.safeParse(JSON.parse(event.data));
      if (parsed.success) this.onMessage(parsed.data);
    };
    this.socket.onclose = () => {
      this.onStatus("disconnected");
      if (!this.closed) window.setTimeout(() => this.connect(), 1000);
    };
    this.socket.onerror = () => this.onStatus("disconnected");
  }
  send(message: unknown) {
    if (this.socket?.readyState !== WebSocket.OPEN)
      throw new Error("DISCONNECTED");
    this.socket.send(JSON.stringify(message));
  }
  close() {
    this.closed = true;
    this.socket?.close();
  }
}
export function saveSession(value: {
  code: string;
  participantId: string;
  token: string;
}) {
  sessionStorage.setItem("belote-session", JSON.stringify(value));
}
export function loadSession() {
  try {
    return JSON.parse(sessionStorage.getItem("belote-session") ?? "null") as {
      code: string;
      participantId: string;
      token: string;
    } | null;
  } catch {
    return null;
  }
}
export function clearSession() {
  sessionStorage.removeItem("belote-session");
}
