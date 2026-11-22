import type { Result } from './run';

export interface Entry {
  name: string;
  score: number;
  /** Stage reached, counted from 1. */
  stage: number;
  cleared: boolean;
}

export interface Board {
  entries: Entry[];
  /** True when the list came from the server and is shared by all players. */
  online: boolean;
  /** Position of the entry just submitted, counted from 0. -1 if it is not on the list. */
  rank: number;
}

export const BOARD_SIZE = 10;
const URL = 'api/scores';
const LOCAL_KEY = 'nightshift.scores';
const NAME_KEY = 'nightshift.name';
const TIMEOUT_MS = 2500;

function readLocal(): Entry[] {
  try {
    const list = JSON.parse(localStorage.getItem(LOCAL_KEY) ?? '[]') as Entry[];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function writeLocal(list: Entry[]): void {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(list));
  } catch {
    // Private windows may refuse storage. The table then lasts for this session only.
  }
}

async function request(init?: RequestInit): Promise<{ entries: Entry[]; rank?: number }> {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(URL, { ...init, signal: abort.signal });
    if (!res.ok) throw new Error(`scores: ${res.status}`);
    const body = (await res.json()) as { entries: Entry[]; rank?: number };
    if (!Array.isArray(body.entries)) throw new Error('scores: bad reply');
    return body;
  } finally {
    clearTimeout(timer);
  }
}

/** The score table: from the server if it answers, otherwise the one kept in this browser. */
export async function loadBoard(): Promise<Board> {
  try {
    const { entries } = await request();
    return { entries: entries.slice(0, BOARD_SIZE), online: true, rank: -1 };
  } catch {
    return { entries: readLocal().slice(0, BOARD_SIZE), online: false, rank: -1 };
  }
}

/** Adds a result to the table and returns the table with the new entry's position. */
export async function submitScore(name: string, result: Result): Promise<Board> {
  const entry: Entry = { name, score: result.score, stage: result.stage, cleared: result.cleared };
  rememberName(name);
  try {
    const { entries, rank } = await request({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(entry) });
    return { entries: entries.slice(0, BOARD_SIZE), online: true, rank: rank ?? -1 };
  } catch {
    const list = readLocal();
    list.push(entry);
    list.sort((a, b) => b.score - a.score);
    writeLocal(list.slice(0, 50));
    const rank = list.indexOf(entry);
    return { entries: list.slice(0, BOARD_SIZE), online: false, rank: rank < BOARD_SIZE ? rank : -1 };
  }
}

/** The initials used last time, as the starting point for the next entry. */
export function lastName(): string {
  try {
    const name = localStorage.getItem(NAME_KEY) ?? '';
    return /^[A-Z0-9 ]{3}$/.test(name) ? name : 'AAA';
  } catch {
    return 'AAA';
  }
}

function rememberName(name: string): void {
  try {
    localStorage.setItem(NAME_KEY, name);
  } catch {
    // See writeLocal.
  }
}
