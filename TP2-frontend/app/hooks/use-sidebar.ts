import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import type { Conversation, DropdownPos } from "~/components/sidebar/types";
import { clearClientAuth, getAuthToken } from "~/utils/auth";
import { API_BASE } from "~/utils/api";

function getDisplayNameFromStorageUser(user: Record<string, unknown> | null) {
    if (!user) {
        return null;
    }

    const userMetadata =
        user.user_metadata && typeof user.user_metadata === "object"
            ? (user.user_metadata as Record<string, unknown>)
            : null;

    const nameCandidates = [
        user.nomeCompleto,
        user.name,
        user.full_name,
        user.fullName,
        user.display_name,
        user.displayName,
        user.username,
        userMetadata?.nomeCompleto,
        userMetadata?.name,
        userMetadata?.full_name,
        userMetadata?.fullName,
        userMetadata?.display_name,
        userMetadata?.displayName,
        userMetadata?.username,
    ];

    for (const candidate of nameCandidates) {
        if (typeof candidate === "string" && candidate.trim().length > 0) {
            const name = candidate.trim();
            if (!name.includes("@")) {
                return name;
            }
        }
    }

    return null;
}

export function useSidebar() {
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
        if (!token) {
            return;
        }

        setIsLoadingConversations(true);

        try {
            const response = await fetch(`${API_BASE}/conversations`, {
                headers: { Authorization: `Bearer ${token}` },
            });

            if (!response.ok) {
                return;
            }

            const data = await response.json() as Conversation[];
            setConversations(data);
        } catch {
        } finally {
            setIsLoadingConversations(false);
        }
    }, []);

    useEffect(() => {
        void fetchConversations();
    }, [fetchConversations]);

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

                if (!rawUser) {
                    setDisplayName("Utilizador");
                    return;
                }

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
        if (editingConversationId) {
            renameInputRef.current?.focus();
            renameInputRef.current?.select();
        }
    }, [editingConversationId]);

    useEffect(() => {
        if (!isOpen) {
            setIsProfileMenuOpen(false);
        }
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

        if (parts.length === 0) {
            return "U";
        }

        if (parts.length === 1) {
            return parts[0][0].toUpperCase();
        }

        return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
    }, [displayName]);

    const handleLogout = useCallback(() => {
        clearClientAuth();
        setIsProfileMenuOpen(false);
        navigate("/");
    }, [navigate]);

    const handleNewConversation = useCallback(() => {
        setOpenConversationMenuId(null);
        setDropdownPos(null);
        navigate("/chat/new");
        window.dispatchEvent(new Event("automatch:new-chat"));
    }, [navigate]);

    const handleDeleteConversation = useCallback(async (conversationId: string) => {
        const token = getAuthToken();

        setConversations((prev) => prev.filter((conversation) => conversation.id !== conversationId));
        setOpenConversationMenuId(null);
        setDropdownPos(null);

        if (location.pathname === `/chat/${conversationId}`) {
            navigate("/chat/new");
        }

        if (!token) {
            return;
        }

        try {
            await fetch(`${API_BASE}/conversations/${conversationId}`, {
                method: "DELETE",
                headers: { Authorization: `Bearer ${token}` },
            });
        } catch {
        }
    }, [location.pathname, navigate]);

    const handleStartRenameConversation = useCallback((conversationId: string) => {
        const targetConversation = conversations.find((conversation) => conversation.id === conversationId);

        if (!targetConversation) {
            return;
        }

        setEditingConversationId(conversationId);
        setEditingTitle(targetConversation.title);
        setOpenConversationMenuId(null);
        setDropdownPos(null);
    }, [conversations]);

    const handleCancelRenameConversation = useCallback(() => {
        setEditingConversationId(null);
        setEditingTitle("");
    }, []);

    const handleSaveRenameConversation = useCallback(async (conversationId: string) => {
        const trimmedTitle = editingTitle.trim();

        if (!trimmedTitle) {
            handleCancelRenameConversation();
            return;
        }

        setConversations((prev) =>
            prev.map((conversation) => (
                conversation.id === conversationId
                    ? { ...conversation, title: trimmedTitle }
                    : conversation
            ))
        );

        handleCancelRenameConversation();

        const token = getAuthToken();
        if (!token) {
            return;
        }

        try {
            await fetch(`${API_BASE}/conversations/${conversationId}`, {
                method: "PATCH",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({ title: trimmedTitle }),
            });
        } catch {
        }
    }, [editingTitle, handleCancelRenameConversation]);

    const handleToggleConversationMenu = useCallback((
        conversationId: string,
        button: HTMLButtonElement
    ) => {
        if (openConversationMenuId === conversationId) {
            setOpenConversationMenuId(null);
            setDropdownPos(null);
            return;
        }

        const rect = button.getBoundingClientRect();
        setDropdownPos({
            top: rect.bottom + 4,
            left: rect.right - 160,
        });
        setOpenConversationMenuId(conversationId);
    }, [openConversationMenuId]);

    const handleToggleConversationsExpanded = useCallback(() => {
        setIsConversationsExpanded((prev) => !prev);
    }, []);

    const handleToggleProfileMenu = useCallback(() => {
        if (!isOpen) {
            return;
        }

        setIsProfileMenuOpen((prev) => !prev);
    }, [isOpen]);

    return {
        contentVisibility,
        conversations,
        currentPathname: location.pathname,
        displayName,
        dropdownPos,
        editingConversationId,
        editingTitle,
        initials,
        isConversationsExpanded,
        isLoadingConversations,
        isOpen,
        isProfileMenuOpen,
        openConversationMenuId,
        profileMenuRef,
        renameInputRef,
        onCancelRenameConversation: handleCancelRenameConversation,
        onCloseSidebar: () => setIsOpen(false),
        onDeleteConversation: handleDeleteConversation,
        onEditingTitleChange: setEditingTitle,
        onLogout: handleLogout,
        onNewConversation: handleNewConversation,
        onOpenSidebar: () => setIsOpen(true),
        onSaveRenameConversation: handleSaveRenameConversation,
        onStartRenameConversation: handleStartRenameConversation,
        onToggleConversationMenu: handleToggleConversationMenu,
        onToggleConversationsExpanded: handleToggleConversationsExpanded,
        onToggleProfileMenu: handleToggleProfileMenu,
    };
}
