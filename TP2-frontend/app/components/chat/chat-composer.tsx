import type { ChangeEvent, KeyboardEvent, RefObject } from "react";
import { Send } from "lucide-react";

type ChatComposerProps = {
    isBrandVisible: boolean;
    isEmptyState: boolean;
    isSendingCurrent: boolean;
    prompt: string;
    textareaRef: RefObject<HTMLTextAreaElement | null>;
    onPromptChange: (event: ChangeEvent<HTMLTextAreaElement>) => void;
    onSend: () => Promise<void>;
};

export default function ChatComposer({
    isBrandVisible,
    isEmptyState,
    isSendingCurrent,
    prompt,
    textareaRef,
    onPromptChange,
    onSend,
}: ChatComposerProps) {
    function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
        if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            void onSend();
        }
    }

    return (
        <div
            className={`px-4 transition-[opacity,margin,padding] duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] ${isEmptyState
                ? "pb-6"
                : "mb-3 py-4"
                } ${isEmptyState && !isBrandVisible
                ? "opacity-0"
                : "opacity-100"
                }`}
        >
            <div className="mx-auto w-full max-w-3xl">
                <div className="flex items-end gap-3 rounded-3xl border border-[#8C7343] bg-white px-4 py-3 shadow-md">
                    <textarea
                        ref={textareaRef}
                        value={prompt}
                        onChange={onPromptChange}
                        onKeyDown={handleKeyDown}
                        placeholder="Encontre o seu Match..."
                        rows={1}
                        className="no-scrollbar mb-1 max-h-40 flex-1 resize-none overflow-y-auto bg-transparent py-1 text-base text-gray-800 outline-none placeholder:text-gray-400"
                    />

                    <div className="mb-0.5 flex shrink-0 items-center gap-2 rounded-full bg-gray-100 p-1.5">
                        <button
                            type="button"
                            onClick={() => void onSend()}
                            disabled={isSendingCurrent || prompt.trim().length === 0}
                            className="rounded-full p-1 text-[#8C7343] transition hover:bg-gray-200 hover:text-gray-800 disabled:opacity-50"
                        >
                            <Send size={18} />
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
