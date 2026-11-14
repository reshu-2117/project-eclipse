import type { Metadata } from "next";
import StationQuest from "./StationQuest";

export const metadata: Metadata = {
  title: "The Station Mission — Project Eclipse",
  description: "You have docked at Lantern 17. Find out why it is dying, prove it, and warn the world before the ice hits.",
};

export default function StationPage() {
  return <StationQuest />;
}
