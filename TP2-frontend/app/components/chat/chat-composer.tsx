import type { ChangeEvent, KeyboardEvent, RefObject } from "react";
import { FileText, Paperclip, Send } from "lucide-react";

type ChatComposerProps = {
    documentError: string;
    documentName: string | null;
    fileInputRef: RefObject<HTMLInputElement | null>;
    isBrandVisible: boolean;
    isEmptyState: boolean;
    isSendingCurrent: boolean;
    isUploadingDocument: boolean;
    prompt: string;
    textareaRef: RefObject<HTMLTextAreaElement | null>;
    onDocumentChange: (event: ChangeEvent<HTMLInputElement>) => void;
    onPickDocument: () => void;
    onPromptChange: (event: ChangeEvent<HTMLTextAreaElement>) => void;
    onSend: () => Promise<void>;
};

export default function ChatComposer({
    documentError,
    documentName,
    fileInputRef,
    isBrandVisible,
    isEmptyState,
    isSendingCurrent,
    isUploadingDocument,
    prompt,
    textareaRef,
    onDocumentChange,
    onPickDocument,
    onPromptChange,
    onSend,
}: ChatComposerProps) {
    function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
        if (isUploadingDocument) {
            return;
        }

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
                {(documentName || documentError || isUploadingDocument) && (
                    <div className="mb-2 flex min-h-8 items-center gap-2 text-xs text-gray-600">
                        {isUploadingDocument ? (
                            <span className="rounded-full border border-[#d7c2a0] bg-white px-3 py-1 text-[#8C7343] shadow-sm">
                                A analisar PDF...
                            </span>
                        ) : documentName ? (
                            <span className="inline-flex max-w-full items-center gap-2 rounded-full border border-[#d7c2a0] bg-white px-3 py-1 text-[#6f5528] shadow-sm">
                                <FileText size={14} />
                                <span className="truncate">{documentName}</span>
                            </span>
                        ) : null}

                        {documentError && <span className="text-red-600">{documentError}</span>}
                    </div>
                )}

                <div className="flex items-end gap-3 rounded-3xl border border-[#8C7343] bg-white px-4 py-3 shadow-md">
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept="application/pdf,.pdf"
                        onChange={onDocumentChange}
                        className="hidden"
                    />

                    <button
                        type="button"
                        onClick={onPickDocument}
                        disabled={isUploadingDocument}
                        className="mb-0.5 rounded-full p-2 text-[#8C7343] transition hover:bg-gray-100 hover:text-gray-800 disabled:opacity-50"
                        title="Adicionar PDF"
                        aria-label="Adicionar PDF"
                    >
                        <Paperclip size={20} />
                    </button>

                    <textarea
                        ref={textareaRef}
                        value={prompt}
                        onChange={onPromptChange}
                        onKeyDown={handleKeyDown}
                        placeholder="Encontre o seu Match..."
                        rows={1}
                        className="no-scrollbar mb-1 max-h-40 flex-1 resize-none overflow-y-auto bg-transparent py-1 text-base text-gray-800 outline-none placeholder:text-gray-400"
                    />

                    <div className="mb-0.5 flex shrink-0 items-center rounded-full bg-gray-100 p-1.5">
                        <button
                            type="button"
                            onClick={() => void onSend()}
                            disabled={isSendingCurrent || isUploadingDocument || prompt.trim().length === 0}
                            className="rounded-full p-1 text-[#8C7343] transition hover:bg-gray-200 hover:text-gray-800 disabled:opacity-50"
                            title={isUploadingDocument ? "Aguarde a analise do PDF" : "Enviar"}
                        >
                            <Send size={18} />
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
