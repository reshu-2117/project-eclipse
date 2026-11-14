import type { Metadata } from "next";
import Lab from "./Lab";

export const metadata: Metadata = {
  title: "Mission Lab — Project Eclipse",
  description:
    "The engine behind Project Eclipse, in the open: every physics number re-derived, ships against routes, and nine crews flying whole missions to eight endings.",
};

export default function LabPage() {
  return <Lab />;
}
