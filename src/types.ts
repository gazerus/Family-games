export interface ParticipantTile {
  sessionId: string;
  userName: string;
  isLocal: boolean;
  videoTrack: MediaStreamTrack | null;
  audioTrack: MediaStreamTrack | null;
}

export interface GameAppMessage<T = unknown> {
  kind: "game";
  gameId: string;
  type: string;
  payload: T;
  sender: string;
  senderId: string;
}

export type AppMessage = GameAppMessage;

export interface FamilyProfile {
  name: string;
  roomUrl: string;
}
