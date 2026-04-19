import type { RefObject } from "react";
import { LogOut } from "lucide-react";

type SidebarProfileSectionProps = {
    displayName: string;
    initials: string;
    isOpen: boolean;
    isProfileMenuOpen: boolean;
    profileMenuRef: RefObject<HTMLDivElement | null>;
    onLogout: () => void;
    onToggleProfileMenu: () => void;
};

export default function SidebarProfileSection({
    displayName,
    initials,
    isOpen,
    isProfileMenuOpen,
    profileMenuRef,
    onLogout,
    onToggleProfileMenu,
}: SidebarProfileSectionProps) {
    return (
        <div
            className="relative mb-1.5 flex items-center justify-center border-t border-white/15 bg-[#333b4500]"
            ref={profileMenuRef}
        >
            <div
                className={`absolute bottom-full z-30 pb-2 transition-all duration-200 ${isOpen
                    ? "left-1/2 w-[calc(100%-1.5rem)] -translate-x-1/2"
                    : "left-full ml-2 w-48"
                    } ${isProfileMenuOpen
                    ? "translate-y-0 opacity-100"
                    : "pointer-events-none translate-y-2 opacity-0"
                    }`}
            >
                <div className="rounded-xl border border-white/20 bg-red-300 p-1.5 shadow-xl ring-1 ring-black/10 backdrop-blur-sm">
                    <button
                        type="button"
                        onClick={onLogout}
                        className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-white transition hover:bg-white/15"
                    >
                        <LogOut size={16} />
                        <span className="whitespace-nowrap">Terminar sessao</span>
                    </button>
                </div>
            </div>

            <button
                type="button"
                onClick={onToggleProfileMenu}
                disabled={!isOpen}
                aria-expanded={isProfileMenuOpen}
                aria-haspopup="menu"
                className={`flex items-center py-2 transition-all duration-300 ${isOpen ? "px-3" : "justify-center px-2"}`}
            >
                <div className={`flex items-center rounded-xl transition-all duration-300 hover:bg-white/15 ${isOpen
                    ? "gap-3 px-3 py-1"
                    : "justify-center px-2 py-1.5"
                    }`}
                >
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#a68a56] font-semibold text-white ring-1 ring-[#8A6B3C]">
                        {initials}
                    </div>
                    <div
                        className={`min-w-0 overflow-hidden whitespace-nowrap transition-all duration-300 ease-out ${isOpen
                            ? "max-w-45 opacity-100"
                            : "max-w-0 opacity-0"
                            }`}
                    >
                        <p className="truncate text-sm font-medium text-white" title={displayName}>
                            {displayName}
                        </p>
                    </div>
                </div>
            </button>
        </div>
    );
}
