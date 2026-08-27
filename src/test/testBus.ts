/**
 * The message bus test mode uses in place of Daily's data channel.
 *
 * In test mode nobody actually joins a Daily room — there's no call, no
 * camera, no network. Each simulated player gets its own bus, and a message
 * one player sends is delivered to every *other* bus, which is exactly how
 * Daily's `sendAppMessage` behaves (the sender never receives its own
 * message). Because of that, the game code above it can't tell the
 * difference.
 *
 * Delivery is in two parts:
 *
 * 1. In-page, via the module-level registry below — that's the case that
 *    matters, since test mode's whole point is several players living in one
 *    page on one device.
 * 2. Across tabs, via a BroadcastChannel — so opening the test site twice
 *    (two windows side by side, phone and laptop on the same browser) also
 *    works, without a second real device.
 *
 * Anything arriving over the channel that this page sent is dropped: step 1
 * already delivered it locally, and BroadcastChannel would otherwise deliver
 * it a second time to every other bus in this page.
 */

export interface TestBusMessage {
  /** Session id of the simulated player who sent it. */
  from: string;
  /** A session id, or "*" for everyone — mirrors Daily's `target`. */
  target: string;
  data: unknown;
}

const CHANNEL_NAME = "family-games-test-bus";

export function testId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `t-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
}

/** Identifies this page, so we can ignore our own cross-tab echoes. */
const PAGE_ID = testId();

interface Bus {
  id: string;
  dispatch: (msg: TestBusMessage) => void;
}

const buses = new Set<Bus>();

let channel: BroadcastChannel | null = null;
if (typeof BroadcastChannel !== "undefined") {
  channel = new BroadcastChannel(CHANNEL_NAME);
  channel.onmessage = (ev: MessageEvent) => {
    const envelope = ev.data as { pageId: string; msg: TestBusMessage };
    if (!envelope || envelope.pageId === PAGE_ID) return;
    deliverInPage(envelope.msg);
  };
}

function deliverInPage(msg: TestBusMessage) {
  for (const bus of buses) {
    if (bus.id === msg.from) continue;
    if (msg.target !== "*" && msg.target !== bus.id) continue;
    // Deliver on a later tick, never inline. A real message crosses the
    // network before anyone reacts to it, so game code is written assuming
    // it can answer a message from inside its own handler — delivering
    // synchronously would turn that answer into unbounded recursion.
    const target = bus;
    setTimeout(() => {
      // The player may have been removed in the meantime.
      if (buses.has(target)) target.dispatch(msg);
    }, 0);
  }
}

export interface TestBusHandle {
  post: (target: string, data: unknown) => void;
  close: () => void;
}

export function createTestBus(
  id: string,
  onMessage: (msg: TestBusMessage) => void
): TestBusHandle {
  const bus: Bus = { id, dispatch: onMessage };
  buses.add(bus);

  return {
    post(target, data) {
      const msg: TestBusMessage = { from: id, target, data };
      deliverInPage(msg);
      channel?.postMessage({ pageId: PAGE_ID, msg });
    },
    close() {
      buses.delete(bus);
    },
  };
}
