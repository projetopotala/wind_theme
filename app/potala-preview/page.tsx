import type { Metadata } from "next";

import { PotalaExperience } from "@/features/potala-journey/components/PotalaExperience";

export const metadata: Metadata = {
  title: "Potala Experience — Preview",
  description: "Percorra o Ecossistema Potala: cuidado, conhecimento, atividades, pessoas, cultura e inspiração.",
};

export default function PotalaPreviewPage() {
  return (
    <main className="potala-preview-page">
      <PotalaExperience />
    </main>
  );
}
