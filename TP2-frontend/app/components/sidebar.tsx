import { Link, useLocation, useNavigate } from "react-router";
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import AddIcon from "@mui/icons-material/Add";
import { ChevronDown, EllipsisVertical, LogOut, PanelLeftClose, Pencil, Trash2 } from "lucide-react";
import { clearClientAuth, getAuthToken } from "~/utils/auth";

type Conversation = {
    id: string;
    title: string;
    created_at: string;
};

type DropdownPos = { top: number; left: number };

function getDisplayNameFromStorageUser(user: Record<string, unknown> | null) {
    if (!user) return null;

    const userMetadata =
        user.user_metadata && typeof user.user_metadata === "object"
            ? (user.user_metadata as Record<string, unknown>)
            : null;

    const nameCandidates = [
        user.nomeCompleto, user.name, user.full_name, user.fullName,
        user.display_name, user.displayName, user.username,
        userMetadata?.nomeCompleto, userMetadata?.name, userMetadata?.full_name,
        userMetadata?.fullName, userMetadata?.display_name, userMetadata?.displayName,
        userMetadata?.username,
    ];

    for (const candidate of nameCandidates) {
        if (typeof candidate === "string" && candidate.trim().length > 0) {
            const n = candidate.trim();
            if (!n.includes("@")) return n;
        }
    }
    return null;
}

const API_BASE = "http://localhost:3001/api";
const DROPDOWN_WIDTH = 160;

export default function Sidebar() {
    const location = useLocation();
    const navigate = useNavigate();

    const [isOpen, setIsOpen] = useState(true);
    const [isConversationsExpanded, setIsConversationsExpanded] = useState(true);
    const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
    const [openConversationMenuId, setOpenConversationMenuId] = useState<string | null>(null);
    const [dropdownPos, setDropdownPos] = useState<DropdownPos | null>(null);
    const [editingConversationId, setEditingConversationId] = useState<string | null>(null);
    const [editingTitle, setEditingTitle] = useState("");
    const [conversations, setConversations] = useState<Conversation[]>([]);
    const [displayName, setDisplayName] = useState("Utilizador");
    const [isLoadingConversations, setIsLoadingConversations] = useState(false);

    const profileMenuRef = useRef<HTMLDivElement | null>(null);
    const renameInputRef = useRef<HTMLInputElement | null>(null);

    const contentVisibility = isOpen
        ? "translate-x-0 opacity-100"
        : "pointer-events-none -translate-x-2 opacity-0";

    const fetchConversations = useCallback(async () => {
        const token = getAuthToken();
        if (!token) return;
        setIsLoadingConversations(true);
        try {
            const res = await fetch(`${API_BASE}/conversations`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (!res.ok) return;
            const data: Conversation[] = await res.json();
            setConversations(data);
        } catch {
        } finally {
            setIsLoadingConversations(false);
        }
    }, []);

    useEffect(() => { fetchConversations(); }, [fetchConversations]);

    useEffect(() => {
        (window as unknown as Record<string, unknown>).__sidebarRefreshConversations = fetchConversations;
        return () => {
            delete (window as unknown as Record<string, unknown>).__sidebarRefreshConversations;
        };
    }, [fetchConversations]);

    useEffect(() => {
        function syncUserFromStorage() {
            try {
                const rawUser = localStorage.getItem("user");
                if (!rawUser) { setDisplayName("Utilizador"); return; }
                const parsed = JSON.parse(rawUser) as Record<string, unknown>;
                setDisplayName(getDisplayNameFromStorageUser(parsed) ?? "Utilizador");
            } catch {
                setDisplayName("Utilizador");
            }
        }
        syncUserFromStorage();
        window.addEventListener("storage", syncUserFromStorage);
        return () => window.removeEventListener("storage", syncUserFromStorage);
    }, []);

    useEffect(() => {
        if (!editingConversationId) return;
        renameInputRef.current?.focus();
        renameInputRef.current?.select();
    }, [editingConversationId]);

    useEffect(() => {
        if (!isOpen) setIsProfileMenuOpen(false);
    }, [isOpen]);

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (profileMenuRef.current && !profileMenuRef.current.contains(event.target as Node)) {
                setIsProfileMenuOpen(false);
            }
            const target = event.target as HTMLElement;
            const clickedMenu = target.closest("[data-conversation-menu-root='true']");
            const clickedDropdown = target.closest("[data-conversation-dropdown='true']");
            if (!clickedMenu && !clickedDropdown) {
                setOpenConversationMenuId(null);
                setDropdownPos(null);
            }
        }
        function handleEscape(event: KeyboardEvent) {
            if (event.key === "Escape") {
                setIsProfileMenuOpen(false);
                setOpenConversationMenuId(null);
                setDropdownPos(null);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        document.addEventListener("keydown", handleEscape);
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
            document.removeEventListener("keydown", handleEscape);
        };
    }, []);

    const initials = useMemo(() => {
        const parts = displayName.trim().split(/\s+/).filter(Boolean);
        if (parts.length === 0) return "U";
        if (parts.length === 1) return parts[0][0].toUpperCase();
        return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
    }, [displayName]);

    function handleLogout() {
        clearClientAuth();
        setIsProfileMenuOpen(false);
        navigate("/");
    }

    function handleNewConversation() {
        setOpenConversationMenuId(null);
        setDropdownPos(null);
        navigate("/chat/new");
        window.dispatchEvent(new Event("automatch:new-chat"));
    }

    async function handleDeleteConversation(conversationId: string) {
        const token = getAuthToken();
        setConversations((prev) => prev.filter((c) => c.id !== conversationId));
        setOpenConversationMenuId(null);
        setDropdownPos(null);

        if (location.pathname === `/chat/${conversationId}`) {
            navigate("/chat/new");
        }

        if (!token) return;
        try {
            await fetch(`${API_BASE}/conversations/${conversationId}`, {
                method: "DELETE",
                headers: { Authorization: `Bearer ${token}` },
            });
        } catch {
        }
    }

    function handleStartRenameConversation(conversationId: string) {
        const target = conversations.find((c) => c.id === conversationId);
        if (!target) return;
        setEditingConversationId(conversationId);
        setEditingTitle(target.title);
        setOpenConversationMenuId(null);
        setDropdownPos(null);
    }

    function handleCancelRenameConversation() {
        setEditingConversationId(null);
        setEditingTitle("");
    }

    async function handleSaveRenameConversation(conversationId: string) {
        const trimmedTitle = editingTitle.trim();
        if (!trimmedTitle) { handleCancelRenameConversation(); return; }
        setConversations((prev) =>
            prev.map((c) => c.id === conversationId ? { ...c, title: trimmedTitle } : c)
        );
        handleCancelRenameConversation();
        const token = getAuthToken();
        if (!token) return;
        try {
            await fetch(`${API_BASE}/conversations/${conversationId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                body: JSON.stringify({ title: trimmedTitle }),
            });
        } catch {
        }
    }

    function handleToggleMenu(conversationId: string, btn: HTMLButtonElement) {
        if (openConversationMenuId === conversationId) {
            setOpenConversationMenuId(null);
            setDropdownPos(null);
            return;
        }
        const rect = btn.getBoundingClientRect();
        setDropdownPos({
            top: rect.bottom + 4,
            left: rect.right - DROPDOWN_WIDTH,
        });
        setOpenConversationMenuId(conversationId);
    }

    return (
        <>
            {openConversationMenuId && dropdownPos && (
                <div
                    data-conversation-dropdown="true"
                    style={{
                        position: "fixed",
                        top: dropdownPos.top,
                        left: dropdownPos.left,
                        width: DROPDOWN_WIDTH,
                        zIndex: 9999,
                    }}
                >
                    <div className="rounded-lg border-2 border-[#92743b] bg-white p-1 shadow-xl ring-1 ring-black/10">
                        <button
                            type="button"
                            onClick={() => handleStartRenameConversation(openConversationMenuId)}
                            className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm text-gray-700 transition hover:bg-[#92743b]/30"
                        >
                            <Pencil size={14} />
                            <span>Renomear</span>
                        </button>
                        <button
                            type="button"
                            onClick={() => void handleDeleteConversation(openConversationMenuId)}
                            className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm text-red-500 transition hover:bg-red-300/30"
                        >
                            <Trash2 size={14} />
                            <span>Eliminar</span>
                        </button>
                    </div>
                </div>
            )}

            <aside
                className={`${isOpen ? "w-72" : "w-20"} sticky top-0 h-screen shrink-0 border-r border-amber-950/20 bg-[#af7f36] text-white shadow-xl transition-[width,box-shadow] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${isOpen ? "shadow-2xl shadow-amber-950/20" : "shadow-lg shadow-amber-950/10"}`}
            >
                <div className="flex h-full flex-col">

                    <div className={`flex items-center ${isOpen ? "justify-between" : "justify-center"} px-3 py-4`}>
                        {isOpen ? (
                            <>
                                <img className="ml-1 h-12 w-12 rounded-lg object-cover transition-transform duration-500 ease-out hover:scale-[1.03]" src="/logo.png" alt="Logo" />
                                <button
                                    type="button"
                                    onClick={() => setIsOpen(false)}
                                    className="mr-2 rounded-xl p-2 text-white transition-all duration-300 hover:bg-white/15 hover:rotate-[-8deg]"
                                    aria-label="Fechar sidebar"
                                >
                                    <PanelLeftClose size={20} className="transition-transform duration-300" />
                                </button>
                            </>
                        ) : (
                            <button
                                type="button"
                                onClick={() => setIsOpen(true)}
                                className="rounded-xl p-1 text-white transition-all duration-300 hover:bg-white/15 hover:scale-105"
                                aria-label="Abrir sidebar"
                            >
                                <img className="h-12 w-12 rounded-lg object-cover transition-transform duration-300 hover:rotate-3" src="/logo.png" alt="Logo" />
                            </button>
                        )}
                    </div>

                    <div className="px-3">
                        <button
                            type="button"
                            onClick={handleNewConversation}
                            className={`flex w-full items-center justify-center rounded-xl border border-white/15 bg-white/10 py-3 text-sm font-medium text-amber-50 transition-all duration-300 hover:bg-white/20 ${isOpen ? "gap-3 px-4" : "px-2"}`}
                        >
                            <AddIcon fontSize="small" />
                            <span className={`whitespace-nowrap transition-all duration-300 ease-out ${isOpen ? "max-w-35 translate-x-0 opacity-100" : "max-w-0 -translate-x-1 opacity-0"} overflow-hidden`}>
                                Nova conversa
                            </span>
                        </button>
                    </div>

                    <div className="mt-4 flex-1 overflow-y-auto px-3 pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                        <div className={`transition-all duration-300 ease-out ${contentVisibility}`}>
                            <button
                                type="button"
                                onClick={() => setIsConversationsExpanded((prev) => !prev)}
                                aria-expanded={isConversationsExpanded}
                                className="mb-2 mt-2 flex w-full items-center justify-start gap-1.5 rounded-lg px-2 py-1.5 text-xs font-bold uppercase tracking-[0.16em] text-white transition hover:bg-white/10"
                            >
                                <span>Conversas</span>
                                <ChevronDown
                                    size={14}
                                    className={`transition-transform duration-300 ${isConversationsExpanded ? "rotate-0" : "-rotate-90"}`}
                                />
                            </button>

                            <div className={`grid transition-all duration-300 ease-out ${isConversationsExpanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}>
                                <div className="space-y-2 overflow-hidden">
                                    {isLoadingConversations && (
                                        <p className="px-2 py-2 text-xs text-white/50">A carregar...</p>
                                    )}
                                    {!isLoadingConversations && conversations.length === 0 && (
                                        <p className="px-2 py-2 text-xs text-white/50">Sem conversas ainda.</p>
                                    )}
                                    {conversations.map((conversation) => {
                                        const path = `/chat/${conversation.id}`;
                                        const isActive = location.pathname === path;

                                        return (
                                            <div
                                                key={conversation.id}
                                                className={`group relative flex items-center rounded-xl px-2 py-1 text-sm transition-all duration-200 ${isActive
                                                    ? "bg-white/25 font-medium text-white shadow-sm ring-1 ring-white/20"
                                                    : "text-white/80 hover:bg-white/15 hover:text-white"
                                                    }`}
                                            >
                                                {editingConversationId === conversation.id ? (
                                                    <div className="flex min-w-0 flex-1 items-center px-1 py-0.5">
                                                        <input
                                                            ref={renameInputRef}
                                                            value={editingTitle}
                                                            onChange={(e) => setEditingTitle(e.target.value)}
                                                            onKeyDown={(e) => {
                                                                if (e.key === "Enter") { e.preventDefault(); void handleSaveRenameConversation(conversation.id); }
                                                                if (e.key === "Escape") { e.preventDefault(); handleCancelRenameConversation(); }
                                                            }}
                                                            className="h-7 min-w-0 flex-1 rounded-md border border-white/25 bg-black/15 px-2 text-sm text-white outline-none ring-0 placeholder:text-white/50 focus:border-white/40"
                                                            maxLength={80}
                                                        />
                                                    </div>
                                                ) : (
                                                    <Link
                                                        to={path}
                                                        className="block min-w-0 flex-1 px-2 py-0.5"
                                                        title={conversation.title}
                                                    >
                                                        <span className="block truncate">{conversation.title}</span>
                                                    </Link>
                                                )}

                                                <div data-conversation-menu-root="true">
                                                    <button
                                                        type="button"
                                                        onClick={(e) => handleToggleMenu(conversation.id, e.currentTarget)}
                                                        aria-expanded={openConversationMenuId === conversation.id}
                                                        aria-haspopup="menu"
                                                        className={`inline-flex items-center justify-center self-center rounded-md p-1 text-white/80 transition hover:bg-white/15 hover:text-white ${editingConversationId === conversation.id
                                                            ? "pointer-events-none opacity-0"
                                                            : openConversationMenuId === conversation.id
                                                                ? "opacity-100"
                                                                : "opacity-0 group-hover:opacity-100 focus:opacity-100"
                                                            }`}
                                                        aria-label="Opções da conversa"
                                                    >
                                                        <EllipsisVertical size={16} />
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="relative mb-1.5 flex items-center justify-center border-t border-white/15 bg-[#af7f36]" ref={profileMenuRef}>
                        <div
                            className={`absolute bottom-full z-30 pb-2 transition-all duration-200 ${isOpen ? "left-1/2 w-[calc(100%-1.5rem)] -translate-x-1/2" : "left-full ml-2 w-48"} ${isProfileMenuOpen ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-2 opacity-0"}`}
                        >
                            <div className="rounded-xl border border-white/20 bg-red-500 p-1.5 shadow-xl ring-1 ring-black/10 backdrop-blur-sm">
                                <button
                                    type="button"
                                    onClick={handleLogout}
                                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-white transition hover:bg-white/15"
                                >
                                    <LogOut size={16} />
                                    <span className="whitespace-nowrap">Terminar sessão</span>
                                </button>
                            </div>
                        </div>
                        <button
                            type="button"
                            onClick={() => { if (!isOpen) return; setIsProfileMenuOpen((prev) => !prev); }}
                            disabled={!isOpen}
                            aria-expanded={isProfileMenuOpen}
                            aria-haspopup="menu"
                            className={`flex items-center py-2 transition-all duration-300 ${isOpen ? "px-3" : "justify-center px-2"}`}
                        >
                            <div className={`flex items-center rounded-xl transition-all duration-300 hover:bg-white/15 ${isOpen ? "gap-3 px-3 py-1" : "justify-center px-2 py-1.5"}`}>
                                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-800/70 font-semibold text-white ring-1 ring-white/20">
                                    {initials}
                                </div>
                                <div className={`min-w-0 overflow-hidden whitespace-nowrap transition-all duration-300 ease-out ${isOpen ? "max-w-45 opacity-100" : "max-w-0 opacity-0"}`}>
                                    <p className="truncate text-sm font-medium text-white" title={displayName}>
                                        {displayName}
                                    </p>
                                </div>
                            </div>
                        </button>
                    </div>

                </div>
            </aside>
        </>
    );
}
