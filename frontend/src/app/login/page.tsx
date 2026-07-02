"use client";

import { useState, Suspense, useEffect } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { LogIn, Mail, Lock, Loader2, CheckCircle2 } from "lucide-react";
import logoImg from "../../assets/logo.png";

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const verified = searchParams.get("verified") === "true";
  const reset = searchParams.get("reset") === "true";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    const res = await signIn("credentials", {
      username: email,
      password: password,
      redirect: false,
    });

    if (res?.error) {
      setError(res.error);
      setLoading(false);
    } else {
      router.push("/");
      router.refresh();
    }
  };

  return (
    <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl shadow-xl border border-slate-200 dark:border-slate-800 p-8 transform transition-all">
      <div className="flex justify-center mb-8">
        <div className="bg-white p-4 rounded-2xl dark:shadow-md">
          <Image src={logoImg} alt="ContaCo Logo" width={220} className="object-contain" priority />
        </div>
      </div>

      {verified && (
        <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-400 text-sm p-4 rounded-xl mb-6 flex items-center justify-center gap-2 font-medium">
          <CheckCircle2 className="w-5 h-5" />
          ¡Cuenta verificada con éxito! Ya puedes iniciar sesión.
        </div>
      )}

      {reset && (
        <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-400 text-sm p-4 rounded-xl mb-6 flex items-center justify-center gap-2 font-medium">
          <CheckCircle2 className="w-5 h-5" />
          ¡Contraseña actualizada! Ya puedes iniciar sesión.
        </div>
      )}

      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 text-sm p-4 rounded-xl mb-6 text-center font-medium">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">Correo Electrónico</label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Mail className="w-5 h-5 text-slate-400" />
            </div>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full pl-10 pr-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all font-medium"
              placeholder="tu@email.com"
            />
          </div>
        </div>

        <div>
          <div className="flex justify-between mb-2">
            <label className="block text-sm font-bold text-slate-700 dark:text-slate-300">Contraseña</label>
            <a href="/forgot-password" className="text-sm text-indigo-600 dark:text-indigo-400 hover:underline font-medium">
              ¿Olvidaste tu contraseña?
            </a>
          </div>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Lock className="w-5 h-5 text-slate-400" />
            </div>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full pl-10 pr-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all font-medium"
              placeholder="••••••••"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full flex justify-center items-center py-3 px-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-sm shadow-md transition-all disabled:opacity-70"
        >
          {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : "Iniciar Sesión"}
        </button>
      </form>

      <div className="mt-6 text-center text-sm text-slate-600 dark:text-slate-400">
        ¿No tienes cuenta? <a href="/register" className="text-indigo-600 dark:text-indigo-400 font-bold hover:underline">Regístrate aquí</a>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 p-4">
      <Suspense fallback={<div className="flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-indigo-500" /></div>}>
        <LoginContent />
      </Suspense>
    </div>
  );
}
