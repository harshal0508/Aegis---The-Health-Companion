import { redirect } from "next/navigation";

// Root path redirects to /home — the middleware will redirect to /login
// if the user is not authenticated.
export default function RootPage() {
  redirect("/home");
}
