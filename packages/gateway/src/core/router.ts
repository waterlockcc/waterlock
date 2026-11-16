import type { GatewayError } from "./provider.js";

/** What a router gets: the request, minus the session token. */
export interface RouteInput {
  /** Uppercased. */
  method: string;
  /** Path and query are forwarded upstream as-is. */
  url: URL;
  headers: Headers;
  /** Unread. The router reads what it needs and returns what to forward. */
  body: ReadableStream<Uint8Array> | null;
  /** The gateway's `maxBodyBytes`. */
  maxBodyBytes: number;
}

/**
 * Body to forward upstream. A stream is forwarded as it arrives; on deny the
 * gateway drains it before responding.
 */
export type ForwardBody = Uint8Array | string | ReadableStream<Uint8Array>;

/** A request the router matched to an action. */
export interface Routed {
  ok: true;
  action: string;
  /** Typed params, as rules see them. */
  params: Record<string, unknown>;
  /** Fields read from the body, as rules see them. */
  context: object;
  body: ForwardBody | null;
  /** Request headers to forward on top of the gateway's fixed set. */
  forwardHeaders?: readonly string[];
  /** Request headers to set, overriding what the client sent. */
  setHeaders?: Readonly<Record<string, string>>;
  /**
   * Writes errors for this request from here on, e.g. a policy deny in a
   * protocol-specific shape. Default: the provider's or router's.
   */
  formatError?: (error: GatewayError) => Response;
}

/** A request the router refused. */
export interface RouteFailure {
  ok: false;
  status: number;
  /** Default `policy_denied`. */
  code?: string;
  reason: string;
  /** Set when the action was known before the request was refused. */
  action?: string;
}

export type RouteResult = Routed | RouteFailure;

/**
 * Turns a request into an action, params and context for policy, and says
 * what to forward. One per protocol: REST, GraphQL, git, or your own.
 */
export interface Router {
  /** Throwing denies the request. */
  route(input: RouteInput): Promise<RouteResult>;
  /**
   * Error shape the protocol's clients understand. A provider's own
   * `formatError` takes precedence.
   */
  formatError(error: GatewayError): Response;
  /**
   * Optional. The response to a request without a valid session token, when
   * this router recognizes the path. The provider isn't known yet (the token
   * names it), so the gateway asks every router; the first answer wins, else
   * the generic REST error. E.g. git needs a `WWW-Authenticate` challenge
   * before it sends Basic credentials.
   */
  unauthenticated?(url: URL, error: GatewayError): Response | undefined;
}
