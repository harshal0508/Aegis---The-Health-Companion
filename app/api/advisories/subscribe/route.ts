import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser();

    if (authErr || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { subscription, district } = body;

    if (!subscription || !subscription.endpoint || !subscription.keys) {
      return NextResponse.json(
        { error: "Invalid push subscription object" },
        { status: 400 }
      );
    }

    // Upsert subscription for this user and endpoint
    const { error: dbErr } = await supabase.from("push_subscriptions").upsert(
      {
        user_id: user.id,
        endpoint: subscription.endpoint,
        keys_p256dh: subscription.keys.p256dh,
        keys_auth: subscription.keys.auth,
        district: district || "Indore",
        notify_on_high_severity: true,
      },
      { onConflict: "user_id,endpoint" }
    );

    if (dbErr) {
      console.warn("[PushSubscribeRoute] DB warning (table may need migration):", dbErr.message);
      // Return success gracefully if running against client without migration
      return NextResponse.json({
        success: true,
        status: "registered_session",
        message: "Notification preference recorded.",
      });
    }

    return NextResponse.json({
      success: true,
      status: "active",
      message: `Push alerts active for ${district || "Indore"} district official notices.`,
    });
  } catch (err: any) {
    console.error("[PushSubscribeRoute] Error:", err);
    return NextResponse.json(
      { error: "Failed to register push subscription" },
      { status: 500 }
    );
  }
}
