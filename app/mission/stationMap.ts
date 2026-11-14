import { ZONES, ZONE_ORDER } from "@/lib/game";
import type { ZoneId } from "@/lib/game";

/** Where each zone sits on the station map (viewBox 620 x 404). The hub is the dock; far zones sit on the outer ring. */
export const HUB = { x: 310, y: 190 };

export const ZONE_POS: Record<ZoneId, { x: number; y: number }> = (() => {
  const out = {} as Record<ZoneId, { x: number; y: number }>;
  const others = ZONE_ORDER.filter((z) => z !== "dock");
  out.dock = HUB;
  others.forEach((id, i) => {
    const a = ((-160 + i * (320 / (others.length - 1))) * Math.PI) / 180;
    const rad = ZONES[id].far ? 158 : 98;
    out[id] = { x: HUB.x + Math.cos(a) * rad * 1.45, y: HUB.y + Math.sin(a) * rad * 0.95 };
  });
  return out;
})();
