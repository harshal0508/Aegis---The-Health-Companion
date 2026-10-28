import type { Metadata } from "next";
import { EmergencyCardManager } from "@/components/emergency/EmergencyCardManager";

export const metadata: Metadata = {
  title: "Emergency Card | MedAnchor",
  description: "Secure, patient-controlled emergency medical profile for first responders",
};

export default function EmergencyPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
      <EmergencyCardManager />
    </div>
  );
}

