import type { Metadata } from "next";
import Mission from "./Mission";

export const metadata: Metadata = {
  title: "The Wick — Project Eclipse",
  description: "Build your spacecraft at the Wick, the orbital dock at 300 km. Every part has a price.",
};

export default function MissionPage() {
  return <Mission />;
}
