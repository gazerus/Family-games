import type { ComponentType } from "react";

export interface GameProps {
  onExit: () => void;
}

export interface GameDefinition {
  id: string;
  name: string;
  icon: string;
  description: string;
  minPlayers: number;
  component: ComponentType<GameProps>;
}
