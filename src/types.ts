export interface ParticipantTile {
  sessionId: string;
  userName: string;
  isLocal: boolean;
  videoTrack: MediaStreamTrack | null;
  audioTrack: MediaStreamTrack | null;
}

export interface ChatAppMessage {
  kind: "chat";
  id: string;
  text: string;
  sender: string;
  ts: number;
}

export interface GameAppMessage<T = unknown> {
  kind: "game";
  gameId: string;
  type: string;
  payload: T;
  sender: string;
  senderId: string;
}

export type AppMessage = ChatAppMessage | GameAppMessage;

export interface ChatMessage {
  id: string;
  sender: string;
  text: string;
  ts: number;
  isLocal: boolean;
}

export interface FamilyProfile {
  name: string;
  roomUrl: string;
}
