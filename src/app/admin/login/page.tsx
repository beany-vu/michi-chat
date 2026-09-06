import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/admin-auth";
import { LoginForm } from "./LoginForm";

export default async function LoginPage() {
  if (await isAuthenticated()) redirect("/admin");
  return (
    <div className="login">
      <div className="login-brand">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/michi-shield.png" alt="" width={26} height={35} />
        <h1>michi admin</h1>
      </div>
      <LoginForm />
    </div>
  );
}
