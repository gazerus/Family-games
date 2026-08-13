// Swap this to change the whole maze's look — every color the renderer
// uses comes from here.
export interface MazeTheme {
  background: string; // CSS gradient for the page behind the canvases
  floor: string;
  wall: string;
  exit: string;
  trail: string;
}

export const THEMES: Record<"ocean" | "jungle" | "space", MazeTheme> = {
  ocean: {
    background: "linear-gradient(160deg, #0c4a6e, #0369a1 45%, #38bdf8)",
    floor: "#e0f2fe",
    wall: "#075985",
    exit: "#22c55e",
    trail: "#38bdf8",
  },
  jungle: {
    background: "linear-gradient(160deg, #14532d, #166534 45%, #4ade80)",
    floor: "#ecfccb",
    wall: "#14532d",
    exit: "#facc15",
    trail: "#4ade80",
  },
  space: {
    background: "linear-gradient(160deg, #0f0620, #1e1b4b 45%, #4c1d95)",
    floor: "#ede9fe",
    wall: "#312e81",
    exit: "#f472b6",
    trail: "#a78bfa",
  },
};

export const ACTIVE_THEME: MazeTheme = THEMES.ocean;
