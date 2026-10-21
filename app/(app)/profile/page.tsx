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
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Profile</h1>
        <p className="mt-1 text-base text-muted-foreground">
          Your personal information
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{profile.full_name}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <ProfileRow label="Email" value={user.email ?? "—"} />
          <Separator />
          <ProfileRow
            label="Date of birth"
            value={profile.dob ?? "Not provided"}
          />
          <ProfileRow
            label="Blood group"
            value={profile.blood_group ?? "Not provided"}
          />
          {process.env.NODE_ENV === "development" && (
            <>
              <Separator />
              <ProfileRow
                label="Account ID (Dev Only)"
                value={user.id}
              />
            </>
          )}
          <Separator />
          <p className="text-sm font-medium text-gray-700">Emergency contact</p>
          <ProfileRow
            label="Name"
            value={profile.emergency_contact_name ?? "Not provided"}
          />
          <ProfileRow
            label="Phone"
            value={profile.emergency_contact_phone ?? "Not provided"}
          />
        </CardContent>
      </Card>

      <Card className="hover:border-teal-300 transition-colors">
        <CardContent className="p-4">
          <Link
            href="/about"
            className="flex items-center justify-between text-sm font-semibold text-teal-800 hover:text-teal-900"
          >
            <span>What this app is &amp; isn&apos;t (Clinical Scope)</span>
            <span className="text-gray-400 font-normal">→</span>
          </Link>
        </CardContent>
      </Card>

      <div className="pt-2">
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
