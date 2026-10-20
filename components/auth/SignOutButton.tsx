"use client";

import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";
import { useState } from "react";

export function SignOutButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const supabase = createClient();

  const handleSignOut = async () => {
    setLoading(true);
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  };

  return (
    <Button
      variant="outline"
      onClick={handleSignOut}
      disabled={loading}
      className="w-full flex items-center justify-center gap-2 text-gray-700 hover:text-gray-900 border-gray-300"
    >
      <LogOut className="h-4 w-4" />
      <span>{loading ? "Signing out…" : "Sign out"}</span>
    </Button>
  );
}
