import type { FamilyProfile } from "../types";

const KEY = "family-games:profile";

export function loadProfile(): FamilyProfile | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<FamilyProfile>;
    if (!parsed.name || !parsed.roomUrl) return null;
    return { name: parsed.name, roomUrl: parsed.roomUrl };
  } catch {
    return null;
  }
}

export function saveProfile(profile: FamilyProfile): void {
  localStorage.setItem(KEY, JSON.stringify(profile));
}

export function clearProfile(): void {
  localStorage.removeItem(KEY);
}
