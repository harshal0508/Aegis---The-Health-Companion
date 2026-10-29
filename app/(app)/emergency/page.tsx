import type { Metadata } from "next";
import { EmergencyCardManager } from "@/components/emergency/EmergencyCardManager";

export const metadata: Metadata = {
  title: "Emergency Card | Aegis",
  description: "Secure, patient-controlled emergency medical profile for first responders",
};

export default function EmergencyPage() {
  return (
    <div className="space-y-4 pt-1">
      <EmergencyCardManager />
    </div>
  );
}

