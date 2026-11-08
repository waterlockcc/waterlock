import type { SessionClaims } from "./session.js";

/** One message the human typed. An object so it can gain fields (id, role, source...) later. */
export interface UserMessage {
  text: string;
  at?: Date;
}

/** A page of user messages. An object so it can gain fields (hasMore, cursor...) later. */
export interface UserMessages {
  items: UserMessage[];
}

/** Points at a session. Grows with new identifiers without breaking stores. */
export interface SessionRef {
  sid: string;
}

/**
 * Pluggable session storage. Every method is optional: implement one and the gateway uses
 * the feature it unlocks. No store at all = stateless signed tokens, no extras.
 * Methods take a single input object so new fields never break existing stores.
 *
 * Trust: this is the gateway's view of the truth. Only trusted code (your front door /
 * backend) may write to it, never the agent. A store that returns agent-written data
 * lets a rogue agent forge context.
 */
export interface SessionStore {
  /** Record what the human said. Called by your trusted front door via `sessions.addUserMessage`. */
  addUserMessage?(input: {
    session: SessionRef;
    message: UserMessage;
  }): Promise<void>;
  /**
   * Messages the human typed in this session, oldest first. When implemented, `checkPrompt`
   * reads them (via the `store` handed to `check`) and adds them as intent context.
   * Must return only messages written by trusted code (filter out assistant/tool/agent rows).
   * `limit`: return at most the last N.
   */
  getUserMessages?(input: {
    session: SessionClaims;
    limit?: number;
  }): Promise<UserMessages>;
}

/** In-process store. One gateway process only; data is lost on restart. */
export function memoryStore(
  opts: { maxMessagesPerSession?: number } = {},
): Required<SessionStore> {
  const max = opts.maxMessagesPerSession ?? 50;
  const messages = new Map<string, UserMessage[]>();
  return {
    async addUserMessage({ session, message }) {
      const list = messages.get(session.sid) ?? [];
      list.push({ ...message, at: message.at ?? new Date() });
      if (list.length > max) list.splice(0, list.length - max);
      messages.set(session.sid, list);
    },
    async getUserMessages({ session, limit }) {
      const list = messages.get(session.sid) ?? [];
      return {
        items: (limit === undefined ? list : list.slice(-limit)).map((m) => ({
          ...m,
        })),
      };
    },
  };
}
