import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/admin-auth";
import { LoginForm } from "./LoginForm";

export default async function LoginPage() {
  if (await isAuthenticated()) redirect("/admin");
  return (
    <div className="login">
      <h1>michi admin</h1>
      <LoginForm />
    </div>
  );
}
