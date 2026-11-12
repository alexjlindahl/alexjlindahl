import { createHash, randomUUID } from "node:crypto";
import { getDb } from "./db";
import { today } from "./dates";
import { CHOICES, type Choice, type Counts } from "./scoring";
import { getTake } from "./takes";

export const VOTER_COOKIE = "gt_voter";
/** Votes allowed per take from one IP (offices and phones behind one NAT share an address). */
export const MAX_VOTES_PER_IP = Number(process.env.MAX_VOTES_PER_IP ?? 5);

export function hashIp(ip: string): string {
  const salt = process.env.IP_HASH_SALT ?? "gtmtakes-dev-salt";
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex").slice(0, 32);
}

export function newVoterId(): string {
  return randomUUID();
}

export type VoteResult =
  | { ok: true; counts: Counts; choice: Choice; duplicate: boolean }
  | { ok: false; status: number; error: string };

export interface VoteInput {
  takeId: number;
  choice: string;
  voterId: string;
  ip: string;
  /** injectable for tests */
  day?: string;
}

/**
 * Records one vote. Rules:
 * - voting is only open on the day a take is scheduled
 * - one vote per browser (cookie id) per take; a repeat returns the original vote
 * - at most MAX_VOTES_PER_IP votes per take from one hashed IP
 */
export async function castVote(input: VoteInput): Promise<VoteResult> {
  if (!CHOICES.includes(input.choice as Choice)) return { ok: false, status: 400, error: "choice must be hot, not or depends" };
  if (!Number.isInteger(input.takeId)) return { ok: false, status: 400, error: "bad take id" };
  const take = await getTake(input.takeId);
  if (!take || !take.day) return { ok: false, status: 404, error: "take not found" };
  const day = input.day ?? today();
  if (take.day !== day) return { ok: false, status: 409, error: take.day < day ? "voting has closed for this take" : "this take is not open yet" };

  const db = await getDb();
  const ipHash = hashIp(input.ip);
  const prior = await db.get<{ choice: Choice }>("SELECT choice FROM votes WHERE take_id = ? AND voter_id = ?", [take.id, input.voterId]);
  if (prior) return { ok: true, counts: take.counts, choice: prior.choice, duplicate: true };

  const fromIp = await db.get<{ n: unknown }>("SELECT COUNT(*) AS n FROM votes WHERE take_id = ? AND ip_hash = ?", [take.id, ipHash]);
  if (Number(fromIp?.n ?? 0) >= MAX_VOTES_PER_IP) return { ok: false, status: 429, error: "too many votes on this take from your network" };

  const r = await db.run(
    "INSERT INTO votes (take_id, choice, voter_id, ip_hash, source, created_at) VALUES (?, ?, ?, ?, 'live', ?) ON CONFLICT DO NOTHING",
    [take.id, input.choice, input.voterId, ipHash, new Date().toISOString()],
  );
  const after = (await getTake(take.id))!;
  if (r.changes === 0) {
    // Lost a race with the same voter's other request.
    const row = await db.get<{ choice: Choice }>("SELECT choice FROM votes WHERE take_id = ? AND voter_id = ?", [take.id, input.voterId]);
    return { ok: true, counts: after.counts, choice: row?.choice ?? (input.choice as Choice), duplicate: true };
  }
  return { ok: true, counts: after.counts, choice: input.choice as Choice, duplicate: false };
}

export async function votesByVoter(voterId: string | undefined, takeIds: number[]): Promise<Record<number, Choice>> {
  if (!voterId || takeIds.length === 0) return {};
  const db = await getDb();
  const rows = await db.all<{ take_id: unknown; choice: Choice }>(
    `SELECT take_id, choice FROM votes WHERE voter_id = ? AND take_id IN (${takeIds.map(() => "?").join(",")})`,
    [voterId, ...takeIds],
  );
  return Object.fromEntries(rows.map((r) => [Number(r.take_id), r.choice]));
}
