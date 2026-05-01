import type { ChangeEvent, RefObject } from "react";
import Sidebar from "~/components/sidebar";
import ChatComposer from "~/components/chat/chat-composer";
import ChatEmptyState from "~/components/chat/chat-empty-state";
import ChatMessageList from "~/components/chat/chat-message-list";
import type { ChatMessage } from "~/components/chat/types";

type ChatViewProps = {
    bottomRef: RefObject<HTMLDivElement | null>;
    documentError: string;
    documentName: string | null;
    fileInputRef: RefObject<HTMLInputElement | null>;
    handleDocumentChange: (event: ChangeEvent<HTMLInputElement>) => void;
    handlePickDocument: () => void;
    handlePromptChange: (event: ChangeEvent<HTMLTextAreaElement>) => void;
    handleSend: () => Promise<void>;
    hasChatContent: boolean;
    isBrandVisible: boolean;
    isEmptyState: boolean;
    isLoadingMessages: boolean;
    isSendingCurrent: boolean;
    isUploadingDocument: boolean;
    messages: ChatMessage[];
    prompt: string;
    showEmptyState: boolean;
    textareaRef: RefObject<HTMLTextAreaElement | null>;
    typedBrand: string;
};

export default function ChatView({
    bottomRef,
    documentError,
    documentName,
    fileInputRef,
    handleDocumentChange,
    handlePickDocument,
    handlePromptChange,
    handleSend,
    hasChatContent,
    isBrandVisible,
    isEmptyState,
    isLoadingMessages,
    isSendingCurrent,
    isUploadingDocument,
    messages,
    prompt,
    showEmptyState,
    textareaRef,
    typedBrand,
}: ChatViewProps) {
    return (
        <div className="flex min-h-screen bg-gray-100">
            <Sidebar />

            <main className="flex h-screen flex-1 flex-col">
                <div className="no-scrollbar flex-1 overflow-y-auto px-4 py-6">
                    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
                        <div
                            className={`relative overflow-hidden transition-[height,margin] duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] ${isEmptyState
                                ? "mt-36 h-40 sm:mt-44 sm:h-44"
                                : "mt-0 h-0"
                                }`}
                        >
                            {showEmptyState && (
                                <div
                                    className={`absolute inset-x-0 top-0 transition-all duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] ${isEmptyState
                                        ? "translate-y-0 scale-100 opacity-100"
                                        : "-translate-y-4 scale-[0.98] opacity-0"
                                        }`}
                                >
                                    <ChatEmptyState isBrandVisible={isBrandVisible} typedBrand={typedBrand} />
                                </div>
                            )}
                        </div>

                        {isEmptyState && (
                            <ChatComposer
                                isBrandVisible={isBrandVisible}
                                isEmptyState={isEmptyState}
                                isSendingCurrent={isSendingCurrent}
                                isUploadingDocument={isUploadingDocument}
                                documentError={documentError}
                                documentName={documentName}
                                fileInputRef={fileInputRef}
                                prompt={prompt}
                                textareaRef={textareaRef}
                                onDocumentChange={handleDocumentChange}
                                onPickDocument={handlePickDocument}
                                onPromptChange={handlePromptChange}
                                onSend={handleSend}
                            />
                        )}

                        <div
                            className={`transition-all duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] ${hasChatContent
                                ? "translate-y-0 opacity-100"
                                : "translate-y-5 opacity-0"
                                }`}
                        >
                            <ChatMessageList
                                isLoadingMessages={isLoadingMessages}
                                isSendingCurrent={isSendingCurrent}
                                messages={messages}
                            />
                        </div>

                        <div ref={bottomRef} />
                    </div>
                </div>

                {!isEmptyState && (
                    <ChatComposer
                        isBrandVisible={isBrandVisible}
                        isEmptyState={isEmptyState}
                        isSendingCurrent={isSendingCurrent}
                        isUploadingDocument={isUploadingDocument}
                        documentError={documentError}
                        documentName={documentName}
                        fileInputRef={fileInputRef}
                        prompt={prompt}
                        textareaRef={textareaRef}
                        onDocumentChange={handleDocumentChange}
                        onPickDocument={handlePickDocument}
                        onPromptChange={handlePromptChange}
                        onSend={handleSend}
                    />
                )}
            </main>
        </div>
    );
}
