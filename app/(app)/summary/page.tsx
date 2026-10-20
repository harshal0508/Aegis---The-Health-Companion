import type { Metadata } from "next";
import { HealthSummaryView } from "@/components/summary/HealthSummaryView";

export const metadata: Metadata = {
  title: "Health Summary",
};

export default function SummaryPage() {
  return <HealthSummaryView />;
}
