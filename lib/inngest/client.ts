import { Inngest } from "inngest";

// Inngest Client for Aegis Health Companion
// Powers durable background job orchestration for clinical extractions
export const inngest = new Inngest({
  id: "healthtech",
  name: "Aegis Health Companion",
});
