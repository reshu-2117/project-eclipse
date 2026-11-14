import type { Metadata } from "next";
import Lab from "./Lab";

export const metadata: Metadata = {
  title: "Mission Lab — Project Eclipse",
  description:
    "The game engine behind Project Eclipse, running live: every handbook number re-derived, a working hangar calculator, and full missions played by scripted crews.",
  robots: { index: false },
};

export default function LabPage() {
  return <Lab />;
}
