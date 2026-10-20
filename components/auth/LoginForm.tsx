"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const authSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

type AuthFormData = z.infer<typeof authSchema>;

export function LoginForm() {
  const router = useRouter();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [serverError, setServerError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const supabase = createClient();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<AuthFormData>({
    resolver: zodResolver(authSchema),
  });

  const onSubmit = async (data: AuthFormData) => {
    setServerError(null);
    setSuccessMessage(null);

    if (mode === "signup") {
      const { data: signUpData, error } = await supabase.auth.signUp({
        email: data.email,
        password: data.password,
      });

      if (error) {
        if (error.message?.includes("fetch") || error.message?.includes("NetworkError")) {
          setServerError(
            "Could not connect to Supabase. Check that NEXT_PUBLIC_SUPABASE_URL is set in .env.local and that you restarted 'npm run dev'."
          );
        } else {
          setServerError(error.message);
        }
        return;
      }

      if (signUpData.session) {
        // Direct session created — move directly to onboarding
        router.push("/onboarding");
      } else {
        // Supabase has email confirmation enabled
        setSuccessMessage(
          "Confirmation link sent! Please check your email inbox to verify your account, or sign in if already confirmed."
        );
      }
    } else {
      const { error } = await supabase.auth.signInWithPassword({
        email: data.email,
        password: data.password,
      });

      if (error) {
        if (error.message?.includes("fetch") || error.message?.includes("NetworkError")) {
          setServerError(
            "Could not connect to Supabase. Check that NEXT_PUBLIC_SUPABASE_URL is set in .env.local and that you restarted 'npm run dev'."
          );
        } else {
          setServerError("Incorrect email or password. If you don't have an account yet, click 'Create Account' above.");
        }
        return;
      }

      // Check if profile exists
      const { data: profile } = await supabase
        .from("profiles")
        .select("id")
        .single();

      if (!profile) {
        router.push("/onboarding");
      } else {
        router.push("/home");
      }
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex border-b border-gray-200">
        <button
          type="button"
          onClick={() => {
            setMode("signin");
            setServerError(null);
            setSuccessMessage(null);
          }}
          className={`flex-1 pb-3 text-sm font-medium border-b-2 transition-colors ${
            mode === "signin"
              ? "border-teal-600 text-teal-600"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          Sign In
        </button>
        <button
          type="button"
          onClick={() => {
            setMode("signup");
            setServerError(null);
            setSuccessMessage(null);
          }}
          className={`flex-1 pb-3 text-sm font-medium border-b-2 transition-colors ${
            mode === "signup"
              ? "border-teal-600 text-teal-600"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          Create Account
        </button>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <div className="space-y-2">
          <Label htmlFor="email">Email address</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            {...register("email")}
            aria-invalid={!!errors.email}
          />
          {errors.email && (
            <p className="text-sm text-destructive">{errors.email.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
            placeholder="At least 8 characters"
            {...register("password")}
            aria-invalid={!!errors.password}
          />
          {errors.password && (
            <p className="text-sm text-destructive">{errors.password.message}</p>
          )}
        </div>

        {serverError && (
          <div
            role="alert"
            className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"
          >
            {serverError}
          </div>
        )}

        {successMessage && (
          <div
            role="status"
            className="rounded-xl border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-teal-800"
          >
            {successMessage}
          </div>
        )}

        <Button type="submit" className="w-full bg-teal-600 hover:bg-teal-700 text-white" disabled={isSubmitting}>
          {isSubmitting
            ? mode === "signup"
              ? "Creating account…"
              : "Signing in…"
            : mode === "signup"
            ? "Create account"
            : "Sign in"}
        </Button>
      </form>
    </div>
  );
}
