import { useCallback, useEffect, useRef, useState, type ChangeEvent } from "react";
import { useNavigate, useParams } from "react-router";
import type { ApiMessage, ChatMessage, StoredAssistantPayload } from "~/components/chat/types";
import { getAuthToken } from "~/utils/auth";
import { API_BASE } from "~/utils/api";

const BRAND_NAME = "AutoMatch";
const NEW_CHAT_KEY = "__new__";
const PENDING_CONVERSATIONS_STORAGE_KEY = "automatch_pending_conversations";

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

export function useChat() {
    const { id: conversationId } = useParams<{ id: string }>();
    const navigate = useNavigate();

    const [prompt, setPrompt] = useState("");
    const [isLoadingMessages, setIsLoadingMessages] = useState(false);
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [sendingConversations, setSendingConversations] = useState<Record<string, number>>({});
    const [pendingConversationKeys, setPendingConversationKeys] = useState<Record<string, boolean>>(
        () => readPendingConversationKeys()
    );
    const [typedBrand, setTypedBrand] = useState("");
    const [isBrandVisible, setIsBrandVisible] = useState(false);
    const [brandAnimationCycle, setBrandAnimationCycle] = useState(0);
    const [showEmptyState, setShowEmptyState] = useState(true);

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
    const isEmptyState = messages.length === 0 && !isLoadingMessages && !isSendingCurrent;
    const hasChatContent = isLoadingMessages || isSendingCurrent || messages.length > 0;

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

    const restartBrandAnimation = useCallback(() => {
        setIsBrandVisible(false);
        setTypedBrand("");
        setBrandAnimationCycle((prev) => prev + 1);
    }, []);

    const loadMessages = useCallback(async (convId: string) => {
        const token = getAuthToken();
        if (!token) {
            return;
        }

        const requestConversationKey = getConversationKey(convId);
        const requestSequence = ++loadSequenceRef.current;

        setIsLoadingMessages(true);
        setMessages([]);

        try {
            const response = await fetch(`${API_BASE}/conversations/${convId}/messages`, {
                headers: { Authorization: `Bearer ${token}` },
            });

            if (!response.ok) {
                return;
            }

            const data = await response.json() as ApiMessage[];

            if (
                currentConversationKeyRef.current !== requestConversationKey ||
                loadSequenceRef.current !== requestSequence
            ) {
                return;
            }

            setMessages(data.map(mapApiMessage));

            const lastMessage = data[data.length - 1];
            if (lastMessage?.role === "assistant") {
                clearConversationPending(convId);
            }
        } catch {
        } finally {
            if (
                currentConversationKeyRef.current === requestConversationKey &&
                loadSequenceRef.current === requestSequence
            ) {
                setIsLoadingMessages(false);
            }
        }
    }, [clearConversationPending]);

    useEffect(() => {
        if (isEmptyState) {
            setShowEmptyState(true);
            return;
        }

        const timeoutId = window.setTimeout(() => {
            setShowEmptyState(false);
        }, 620);

        return () => window.clearTimeout(timeoutId);
    }, [isEmptyState]);

    useEffect(() => {
        if (!isNewChat) {
            setIsBrandVisible(true);
            return;
        }

        const timeoutId = window.setTimeout(() => {
            setIsBrandVisible(true);
        }, 80);

        return () => window.clearTimeout(timeoutId);
    }, [brandAnimationCycle, isNewChat]);

    useEffect(() => {
        if (!isEmptyState) {
            setTypedBrand(BRAND_NAME);
            return;
        }

        if (!isBrandVisible) {
            setTypedBrand("");
            return;
        }

        if (!isNewChat) {
            setTypedBrand(BRAND_NAME);
            return;
        }

        setTypedBrand("");
        let nextIndex = 0;

        const intervalId = window.setInterval(() => {
            nextIndex += 1;
            setTypedBrand(BRAND_NAME.slice(0, nextIndex));

            if (nextIndex >= BRAND_NAME.length) {
                window.clearInterval(intervalId);
            }
        }, 110);

        return () => window.clearInterval(intervalId);
    }, [brandAnimationCycle, isBrandVisible, isEmptyState, isNewChat]);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    }, [messages, isSendingCurrent]);

    useEffect(() => {
        currentConversationKeyRef.current = currentConversationKey;
        currentViewVersionRef.current += 1;
        setPrompt("");

        if (textareaRef.current) {
            textareaRef.current.style.height = "auto";
        }

        if (isNewChat) {
            restartBrandAnimation();
            setMessages([]);
            setIsLoadingMessages(false);
            return;
        }

        if (currentConversationId) {
            void loadMessages(currentConversationId);
        }
    }, [currentConversationId, currentConversationKey, isNewChat, loadMessages, restartBrandAnimation]);

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
            restartBrandAnimation();

            if (textareaRef.current) {
                textareaRef.current.style.height = "auto";
            }
        }

        window.addEventListener("automatch:new-chat", handleNewChatReset);
        return () => window.removeEventListener("automatch:new-chat", handleNewChatReset);
    }, [clearSendingState, restartBrandAnimation, syncPendingConversationKeys]);

    const handlePromptChange = useCallback((event: ChangeEvent<HTMLTextAreaElement>) => {
        setPrompt(event.target.value);

        const element = textareaRef.current;
        if (element) {
            element.style.height = "auto";
            element.style.height = `${element.scrollHeight}px`;
        }
    }, []);

    const createConversation = useCallback(async (title: string, token: string) => {
        const response = await fetch(`${API_BASE}/conversations`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ title }),
        });

        if (!response.ok) {
            throw new Error("Erro ao criar conversa");
        }

        const data = await response.json() as { id: string };
        const refreshSidebar = (window as unknown as Record<string, unknown>).__sidebarRefreshConversations;

        if (typeof refreshSidebar === "function") {
            (refreshSidebar as () => void)();
        }

        return data.id;
    }, []);

    const handleSend = useCallback(async () => {
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

            const response = await fetch(`${API_BASE}/chat/ask`, {
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

            if (!response.ok) {
                throw new Error("Erro na resposta do servidor");
            }

            const data = await response.json() as {
                reply?: string;
                cars?: ChatMessage["cars"];
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

            if (currentConversationKeyRef.current === resolvedConversationId) {
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
    }, [
        clearConversationPending,
        createConversation,
        currentConversationId,
        currentConversationKey,
        isSendingCurrent,
        loadMessages,
        markConversationPending,
        navigate,
        prompt,
        syncPendingConversationKeys,
        updateSendingState,
    ]);

    return {
        bottomRef,
        handlePromptChange,
        handleSend,
        isBrandVisible,
        isEmptyState,
        isLoadingMessages,
        isSendingCurrent,
        hasChatContent,
        messages,
        prompt,
        showEmptyState,
        textareaRef,
        typedBrand,
    };
}
