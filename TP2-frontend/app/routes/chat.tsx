import { useEffect, useRef, useState, useCallback } from "react";
import { type MetaArgs, useParams, useNavigate } from "react-router";
import { CarFront, Send } from "lucide-react";
import type { Route } from "./+types/chat";
import { requireAuth, getAuthToken } from "~/utils/auth";
import Sidebar from "~/components/sidebar";

export function meta({ }: MetaArgs) {
    return [{ title: "AutoMatch" }];
}

export function loader({ request }: Route.LoaderArgs) {
    requireAuth(request);
    return null;
}

const API_BASE = "http://localhost:3001/api";
const NEW_CHAT_KEY = "__new__";
const PENDING_CONVERSATIONS_STORAGE_KEY = "automatch_pending_conversations";

type Car = {
    id: string | number;
    title: string;
    price: number;
    year: number;
    mileage: number;
    fuel: string;
    image_url: string;
    url: string;
};

type ChatMessage = {
    id: string | number;
    role: "user" | "assistant";
    content?: string;
    cars?: Car[];
};

type ApiMessage = {
    id: string;
    role: "user" | "assistant";
    content: string;
};

type StoredAssistantPayload = {
    text?: string;
    cars?: Car[];
};

function getConversationKey(conversationId?: string) {
    return !conversationId || conversationId === "new" ? NEW_CHAT_KEY : conversationId;
}

function readPendingConversationKeys() {
    if (typeof window === "undefined") {
        return {};
    }

    try {
        const raw = window.sessionStorage.getItem(PENDING_CONVERSATIONS_STORAGE_KEY);

        if (!raw) {
            return {};
        }

        const parsed = JSON.parse(raw) as Record<string, boolean>;
        return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
        return {};
    }
}

function writePendingConversationKeys(keys: Record<string, boolean>) {
    if (typeof window === "undefined") {
        return;
    }

    try {
        window.sessionStorage.setItem(PENDING_CONVERSATIONS_STORAGE_KEY, JSON.stringify(keys));
    } catch {
    }
}

function parseAssistantPayload(content: string) {
    try {
        const parsed = JSON.parse(content) as StoredAssistantPayload;

        if (!parsed || typeof parsed !== "object") {
            return null;
        }

        return {
            content: typeof parsed.text === "string" ? parsed.text : content,
            cars: Array.isArray(parsed.cars) && parsed.cars.length > 0 ? parsed.cars : undefined,
        };
    } catch {
        return null;
    }
}

function mapApiMessage(message: ApiMessage): ChatMessage {
    if (message.role !== "assistant") {
        return {
            id: message.id,
            role: message.role,
            content: message.content,
        };
    }

    const parsedPayload = parseAssistantPayload(message.content);

    if (!parsedPayload) {
        return {
            id: message.id,
            role: message.role,
            content: message.content,
        };
    }

    return {
        id: message.id,
        role: message.role,
        content: parsedPayload.content,
        cars: parsedPayload.cars,
    };
}

export default function Chat() {
    const { id: conversationId } = useParams<{ id: string }>();
    const navigate = useNavigate();

    const [prompt, setPrompt] = useState("");
    const [isLoadingMessages, setIsLoadingMessages] = useState(false);
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [sendingConversations, setSendingConversations] = useState<Record<string, number>>({});
    const [pendingConversationKeys, setPendingConversationKeys] = useState<Record<string, boolean>>(
        () => readPendingConversationKeys()
    );

    const bottomRef = useRef<HTMLDivElement | null>(null);
    const textareaRef = useRef<HTMLTextAreaElement | null>(null);
    const currentConversationKeyRef = useRef(getConversationKey(conversationId));
    const currentViewVersionRef = useRef(0);
    const loadSequenceRef = useRef(0);

    const currentConversationKey = getConversationKey(conversationId);
    const currentConversationId = conversationId && conversationId !== "new" ? conversationId : null;
    const isSendingCurrent = Boolean(
        sendingConversations[currentConversationKey] ||
        (currentConversationId && pendingConversationKeys[currentConversationId])
    );
    const isNewChat = currentConversationKey === NEW_CHAT_KEY;

    const updateSendingState = useCallback((conversationKey: string, delta: 1 | -1) => {
        setSendingConversations((prev) => {
            const nextCount = Math.max((prev[conversationKey] ?? 0) + delta, 0);

            if (nextCount === 0) {
                const next = { ...prev };
                delete next[conversationKey];
                return next;
            }

            return {
                ...prev,
                [conversationKey]: nextCount,
            };
        });
    }, []);

    const syncPendingConversationKeys = useCallback(() => {
        setPendingConversationKeys(readPendingConversationKeys());
    }, []);

    const markConversationPending = useCallback((conversationKey: string) => {
        const next = {
            ...readPendingConversationKeys(),
            [conversationKey]: true,
        };

        writePendingConversationKeys(next);
        setPendingConversationKeys(next);
    }, []);

    const clearConversationPending = useCallback((conversationKey: string) => {
        const next = { ...readPendingConversationKeys() };
        delete next[conversationKey];
        writePendingConversationKeys(next);
        setPendingConversationKeys(next);
    }, []);

    const clearSendingState = useCallback((conversationKey: string) => {
        setSendingConversations((prev) => {
            if (!(conversationKey in prev)) {
                return prev;
            }

            const next = { ...prev };
            delete next[conversationKey];
            return next;
        });
    }, []);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    }, [messages, isSendingCurrent]);

    const loadMessages = useCallback(async (convId: string) => {
        const token = getAuthToken();
        if (!token) return;

        const requestConversationKey = getConversationKey(convId);
        const requestSequence = ++loadSequenceRef.current;

        setIsLoadingMessages(true);
        setMessages([]);

        try {
            const res = await fetch(`${API_BASE}/conversations/${convId}/messages`, {
                headers: { Authorization: `Bearer ${token}` },
            });

            if (!res.ok) {
                return;
            }

            const data = await res.json() as ApiMessage[];

            if (
                currentConversationKeyRef.current !== requestConversationKey ||
                loadSequenceRef.current !== requestSequence
            ) {
                return;
            }

            const mappedMessages = data.map(mapApiMessage);
            setMessages(mappedMessages);

            const lastMessage = data[data.length - 1];
            if (lastMessage?.role === "assistant") {
                clearConversationPending(convId);
            }
        } catch {
            // silently fail
        } finally {
            if (
                currentConversationKeyRef.current === requestConversationKey &&
                loadSequenceRef.current === requestSequence
            ) {
                setIsLoadingMessages(false);
            }
        }
    }, []);

    useEffect(() => {
        currentConversationKeyRef.current = currentConversationKey;
        currentViewVersionRef.current += 1;

        setPrompt("");

        if (textareaRef.current) {
            textareaRef.current.style.height = "auto";
        }

        if (isNewChat) {
            setMessages([]);
            setIsLoadingMessages(false);
            return;
        }

        if (currentConversationId) {
            void loadMessages(currentConversationId);
        }
    }, [currentConversationId, currentConversationKey, isNewChat, loadMessages]);

    useEffect(() => {
        function handleNewChatReset() {
            if (currentConversationKeyRef.current !== NEW_CHAT_KEY) {
                return;
            }

            currentViewVersionRef.current += 1;
            setPrompt("");
            setMessages([]);
            setIsLoadingMessages(false);
            clearSendingState(NEW_CHAT_KEY);
            syncPendingConversationKeys();

            if (textareaRef.current) {
                textareaRef.current.style.height = "auto";
            }
        }

        window.addEventListener("automatch:new-chat", handleNewChatReset);
        return () => window.removeEventListener("automatch:new-chat", handleNewChatReset);
    }, [clearSendingState, syncPendingConversationKeys]);

    const handleChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
        setPrompt(event.target.value);

        const el = textareaRef.current;
        if (el) {
            el.style.height = "auto";
            el.style.height = `${el.scrollHeight}px`;
        }
    };

    async function createConversation(title: string, token: string) {
        const res = await fetch(`${API_BASE}/conversations`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ title }),
        });

        if (!res.ok) {
            throw new Error("Erro ao criar conversa");
        }

        const data = await res.json() as { id: string };

        const refreshSidebar = (window as unknown as Record<string, unknown>).__sidebarRefreshConversations;
        if (typeof refreshSidebar === "function") {
            (refreshSidebar as () => void)();
        }

        return data.id;
    }

    async function handleSend() {
        const promptText = prompt.trim();

        if (!promptText || isSendingCurrent) {
            return;
        }

        const token = getAuthToken();
        const requestConversationKey = currentConversationKey;
        const requestViewVersion = currentViewVersionRef.current;
        let pendingConversationId: string | null = null;

        setPrompt("");
        updateSendingState(requestConversationKey, 1);

        if (textareaRef.current) {
            textareaRef.current.style.height = "auto";
        }

        setMessages((prev) => [
            ...prev,
            {
                id: Date.now(),
                role: "user",
                content: promptText,
            },
        ]);

        try {
            let requestConversationId = currentConversationId;
            let createdConversationId: string | null = null;

            if (!requestConversationId && token) {
                createdConversationId = await createConversation(promptText.slice(0, 60), token);
                requestConversationId = createdConversationId;
            }

            if (requestConversationId) {
                pendingConversationId = requestConversationId;
                markConversationPending(requestConversationId);
            }

            const res = await fetch(`${API_BASE}/chat/ask`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token ?? ""}`,
                },
                body: JSON.stringify({
                    message: promptText,
                    conversation_id: requestConversationId ?? undefined,
                }),
            });

            if (!res.ok) {
                throw new Error("Erro na resposta do servidor");
            }

            const data = await res.json() as {
                reply?: string;
                cars?: Car[];
                conversation_id?: string;
            };

            const resolvedConversationId = data.conversation_id ?? requestConversationId;
            const isSameView = currentViewVersionRef.current === requestViewVersion;

            if (data.conversation_id) {
                const refreshSidebar = (window as unknown as Record<string, unknown>).__sidebarRefreshConversations;
                if (typeof refreshSidebar === "function") {
                    (refreshSidebar as () => void)();
                }
            }

            if (!resolvedConversationId) {
                return;
            }

            clearConversationPending(resolvedConversationId);

            if (
                createdConversationId &&
                isSameView &&
                currentConversationKeyRef.current === NEW_CHAT_KEY
            ) {
                navigate(`/chat/${resolvedConversationId}`, { replace: true });
                return;
            }

            if (!currentConversationId) {
                if (isSameView) {
                    navigate(`/chat/${resolvedConversationId}`, { replace: true });
                }
                return;
            }

            if (
                currentConversationKeyRef.current === resolvedConversationId
            ) {
                if (isSameView) {
                    setMessages((prev) => [
                        ...prev,
                        {
                            id: `assistant-${Date.now()}`,
                            role: "assistant",
                            content: data.reply || "Sem resposta",
                            cars: Array.isArray(data.cars) && data.cars.length > 0 ? data.cars : undefined,
                        },
                    ]);
                } else {
                    void loadMessages(resolvedConversationId);
                }
            }
        } catch {
            if (pendingConversationId) {
                clearConversationPending(pendingConversationId);
            }

            if (
                currentViewVersionRef.current === requestViewVersion &&
                currentConversationKeyRef.current === requestConversationKey
            ) {
                setMessages((prev) => [
                    ...prev,
                    {
                        id: `assistant-error-${Date.now()}`,
                        role: "assistant",
                        content: "Erro ao comunicar com o servidor.",
                    },
                ]);
            }
        } finally {
            updateSendingState(requestConversationKey, -1);
            syncPendingConversationKeys();
        }
    }

    return (
        <div className="flex min-h-screen bg-white">
            <Sidebar />

            <main className="flex h-screen flex-1 flex-col">
                <div className="flex-1 overflow-y-auto px-4 py-6 no-scrollbar">
                    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
                        {messages.length === 0 && !isLoadingMessages && !isSendingCurrent && (
                            <div className="mt-16 rounded-2xl border border-gray-200 bg-white p-8 text-center shadow-sm">
                                <h1 className="text-2xl font-semibold text-gray-800">
                                    Como posso ajudar hoje?
                                </h1>
                                <p className="mt-2 text-sm text-gray-500">
                                    Escreve a tua prompt em baixo para comecar a conversa.
                                </p>
                            </div>
                        )}

                        {isLoadingMessages && (
                            <div className="mt-16 flex justify-center">
                                <p className="text-sm text-gray-400">A carregar mensagens...</p>
                            </div>
                        )}

                        {!isLoadingMessages && messages.map((message) => (
                            <div
                                key={message.id}
                                className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
                            >
                                <div
                                    className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-sm ${message.role === "user"
                                        ? "bg-[#af7f36] text-white"
                                        : "border border-gray-200 bg-white text-gray-800"
                                        }`}
                                >
                                    {message.content && (
                                        <p className="whitespace-pre-wrap wrap-break-word">{message.content}</p>
                                    )}

                                    {message.cars && message.cars.length > 0 && (
                                        <div className="mt-3 grid gap-3">
                                            {message.cars.map((car) => (
                                                <div key={car.id} className="rounded-lg border p-3">
                                                    <img
                                                        src={car.image_url}
                                                        alt={car.title}
                                                        className="h-40 w-full rounded object-cover"
                                                    />
                                                    <h3 className="mt-2 font-semibold">{car.title}</h3>
                                                    <p className="text-sm text-gray-600">
                                                        {car.year} • {car.mileage} km • {car.fuel}
                                                    </p>
                                                    <p className="font-bold text-[#af7f36]">{car.price} €</p>
                                                    <a
                                                        href={car.url}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="text-sm text-blue-500"
                                                    >
                                                        Ver anuncio
                                                    </a>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}

                        {isSendingCurrent && (
                            <div className="flex justify-start">
                                <div className="car-loader-pill">
                                    <div className="car-loader-icon" aria-hidden="true">
                                        <CarFront size={17} strokeWidth={2.2} />
                                    </div>
                                    <div className="car-loader-bars" aria-hidden="true">
                                        <span className="car-loader-bar" />
                                        <span className="car-loader-bar" />
                                        <span className="car-loader-bar" />
                                    </div>
                                    <span className="sr-only">A gerar resposta</span>
                                </div>
                            </div>
                        )}

                        <div ref={bottomRef} />
                    </div>
                </div>

                <div className="mb-3 px-4 py-4">
                    <div className="mx-auto w-full max-w-3xl">
                        <div className="flex items-end gap-3 rounded-3xl border border-[#8C7343] bg-white px-4 py-3 shadow-md">
                            <textarea
                                ref={textareaRef}
                                value={prompt}
                                onChange={handleChange}
                                onKeyDown={(event) => {
                                    if (event.key === "Enter" && !event.shiftKey) {
                                        event.preventDefault();
                                        void handleSend();
                                    }
                                }}
                                placeholder="Encontre o seu Match..."
                                rows={1}
                                className="mb-1 flex-1 resize-none bg-transparent py-1 text-base text-gray-800 outline-none placeholder:text-gray-400 max-h-40 overflow-y-auto no-scrollbar"
                            />

                            <div className="mb-0.5 flex shrink-0 items-center gap-2 rounded-full bg-gray-100 p-1.5">
                                <button
                                    type="button"
                                    onClick={() => void handleSend()}
                                    disabled={isSendingCurrent || prompt.trim().length === 0}
                                    className="rounded-full p-1 text-[#8C7343] transition hover:bg-gray-200 hover:text-gray-800 disabled:opacity-50"
                                >
                                    <Send size={18} />
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
}
