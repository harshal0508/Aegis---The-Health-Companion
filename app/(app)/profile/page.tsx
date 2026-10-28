import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { SignOutButton } from "@/components/auth/SignOutButton";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Profile",
};

export default async function ProfilePage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select(
      "full_name, dob, blood_group, emergency_contact_name, emergency_contact_phone, created_at"
    )
    .single();

  if (!profile) redirect("/onboarding");

  return (
    <div className="space-y-4 pt-1">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-slate-900">Profile</h1>
        <p className="text-[11px] text-slate-500 font-medium">
          Personal identification &amp; emergency settings
        </p>
      </div>

      <div className="apple-card p-4 space-y-3">
        <div className="flex items-center gap-3 border-b border-slate-100 pb-3">
          <div className="h-12 w-12 rounded-full bg-teal-100 text-teal-800 font-bold text-base flex items-center justify-center border-2 border-teal-200/80">
            {profile.full_name ? profile.full_name.charAt(0).toUpperCase() : "P"}
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-900">{profile.full_name}</h2>
            <p className="text-xs text-slate-500">{user.email ?? "—"}</p>
          </div>
        </div>

        <div className="space-y-2 text-xs">
          <ProfileRow
            label="Date of birth"
            value={profile.dob ?? "Not provided"}
          />
          <ProfileRow
            label="Blood group"
            value={profile.blood_group ?? "Not provided"}
          />
          {process.env.NODE_ENV === "development" && (
            <ProfileRow
              label="Account ID (Dev)"
              value={user.id.slice(0, 8) + "..."}
            />
          )}
        </div>

        <div className="pt-2 border-t border-slate-100">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
            Emergency ICE Contact
          </p>
          <div className="space-y-1.5 text-xs">
            <ProfileRow
              label="Contact Name"
              value={profile.emergency_contact_name ?? "Not provided"}
            />
            <ProfileRow
              label="Contact Phone"
              value={profile.emergency_contact_phone ?? "Not provided"}
            />
          </div>
        </div>
      </div>

      <div className="apple-card p-3.5 hover:border-teal-300 transition-colors">
        <Link
          href="/about"
          className="flex items-center justify-between text-xs font-semibold text-teal-800 hover:text-teal-900"
        >
          <span>What this app is &amp; isn&apos;t (Clinical Scope)</span>
          <span className="text-slate-400 font-normal">→</span>
        </Link>
      </div>

      <div className="pt-1">
        <SignOutButton />
      </div>
    </div>
  );
}

function ProfileRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-base text-muted-foreground">{label}</span>
      <span className="text-base font-medium text-gray-900 text-right">
        {value}
      </span>
    </div>
  );
}
