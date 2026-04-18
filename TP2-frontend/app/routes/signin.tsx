import { useState } from "react";
import { Link, useNavigate, type MetaArgs } from "react-router";
import { getCurrentYear } from "~/utils/index";
import { setClientAuth } from "~/utils/auth";

export function meta({ }: MetaArgs) {
  return [
    { title: "Login" },
    { name: "description", content: "Iniciar sessão no AutoMatch" },
  ];
}

export default function Signin() {
  const navigate = useNavigate();

  const [formData, setFormData] = useState({
    email: "",
    password: "",
  });

  const [erro, setErro] = useState("");
  const [sucesso, setSucesso] = useState("");
  const [loading, setLoading] = useState(false);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setFormData((prev) => ({
      ...prev,
      [e.target.name]: e.target.value,
    }));
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErro("");
    setSucesso("");
    setLoading(true);

    try {
      const response = await fetch("http://localhost:3001/api/auth/signin", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: formData.email,
          password: formData.password,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setErro(data.error || "Não foi possível iniciar sessão.");
        return;
      }

      const tokenDuration = typeof data.session?.expires_in === "number" ? data.session.expires_in : undefined;

      setClientAuth(data.session.access_token, tokenDuration);
      localStorage.setItem("refresh_token", data.session.refresh_token);
      localStorage.setItem("user", JSON.stringify(data.user));

      setSucesso("Sessão iniciada com sucesso.");

      setTimeout(() => {
        navigate("/chat/new");
      }, 1000);
    } catch {
      setErro("Erro ao ligar ao backend.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative min-h-screen flex items-center justify-center px-6 lg:px-8 bg-[url('/backgroundSignIn.png')] bg-cover bg-center">
      <div className="absolute inset-0 bg-black opacity-60"></div>

      <div className="relative w-full max-w-137.5">
        <div className="rounded-[25px] border-[3px] border-[#8C7343] bg-white p-6 shadow-md text-center">
          <div className="flex items-center justify-center gap-1 mb-8">
            <img className="h-24 w-24" src="/logo.png" alt="Logo" />
            <p className="text-2xl font-bold text-[#A68A56]">AutoMatch</p>
          </div>

          <div className="mt-10 border border-[#8C7343] bg-gray-100 rounded-[25px] p-6">
            <p className="mb-5 text-2xl font-bold text-[#8C7343]">Sign In</p>

            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <div className="flex items-center justify-between">
                  <label htmlFor="email" className="block text-sm/6 font-medium text-gray-500">
                    Email address
                  </label>
                </div>

                <div className="mt-2">
                  <input
                    id="email"
                    name="email"
                    type="email"
                    required
                    autoComplete="email"
                    value={formData.email}
                    onChange={handleChange}
                    className="block w-full rounded-[80px] bg-white px-3 py-1.5 text-base text-gray-900 outline-1 -outline-offset-1 outline-gray-300 placeholder:text-gray-400 focus:outline-2 focus:-outline-offset-2 focus:outline-[#A68A56] sm:text-sm/6"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <label htmlFor="password" className="block text-sm/6 font-medium text-gray-500">
                    Password
                  </label>
                </div>

                <div className="mt-2">
                  <input
                    id="password"
                    name="password"
                    type="password"
                    required
                    autoComplete="current-password"
                    value={formData.password}
                    onChange={handleChange}
                    className="block w-full rounded-[80px] bg-white px-3 py-1.5 text-base text-gray-900 outline-1 -outline-offset-1 outline-gray-300 placeholder:text-gray-400 focus:outline-2 focus:-outline-offset-2 focus:outline-[#A68A56] sm:text-sm/6"
                  />
                </div>
              </div>

              {erro && (
                <p className="text-sm text-red-600">{erro}</p>
              )}

              {sucesso && (
                <p className="text-sm text-green-600">{sucesso}</p>
              )}

              <div className="flex justify-center items-center">
                <button
                  type="submit"
                  disabled={loading}
                  className="w-50 text-center justify-center rounded-[80px] bg-[#A68A56] px-3 py-1.5 text-sm/6 font-semibold text-white shadow-xs hover:bg-[#8A6B3C] disabled:opacity-70"
                >
                  {loading ? "A entrar..." : "Sign in"}
                </button>
              </div>

              <div>
                <p className="text-sm text-gray-500">
                  Não tem uma conta?{" "}
                  <Link
                    to="/signup"
                    className="font-semibold text-[#A68A56] hover:text-[#8A6B3C]"
                  >
                    Sign up
                  </Link>
                </p>
              </div>
            </form>
          </div>
        </div>
      </div>

      <footer className="absolute bottom-0 w-full py-4 text-center text-sm text-gray-200">
        <p>@{getCurrentYear()} AutoMatch. Prova de Conceito!</p>
      </footer>
    </div>
  );
}