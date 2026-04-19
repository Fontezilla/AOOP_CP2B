import { useCallback, useState, type ChangeEvent, type FormEvent } from "react";
import { useNavigate } from "react-router";
import { API_BASE } from "~/utils/api";

type SignupFormData = {
    nomeCompleto: string;
    email: string;
    password: string;
};

export function useSignupForm() {
    const navigate = useNavigate();

    const [formData, setFormData] = useState<SignupFormData>({
        nomeCompleto: "",
        email: "",
        password: "",
    });
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");
    const [loading, setLoading] = useState(false);

    const handleChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
        setFormData((prev) => ({
            ...prev,
            [event.target.name]: event.target.value,
        }));
    }, []);

    const handleSubmit = useCallback(async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setError("");
        setSuccess("");
        setLoading(true);

        try {
            const response = await fetch(`${API_BASE}/auth/signup`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(formData),
            });

            const data = await response.json();

            if (!response.ok) {
                setError(data.error || "Nao foi possivel criar conta.");
                return;
            }

            if (data.needsEmailConfirmation) {
                setSuccess("Conta criada. Confirma o email antes de iniciar sessao.");
            } else {
                setSuccess("Conta criada com sucesso.");
            }

            window.setTimeout(() => {
                navigate("/signin");
            }, 1200);
        } catch {
            setError("Erro ao ligar ao backend.");
        } finally {
            setLoading(false);
        }
    }, [formData, navigate]);

    return {
        error,
        formData,
        handleChange,
        handleSubmit,
        loading,
        success,
    };
}
