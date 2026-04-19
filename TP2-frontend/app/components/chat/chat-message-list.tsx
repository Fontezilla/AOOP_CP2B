import type { ChatMessage } from "~/components/chat/types";
import ThinkingAnimation from "~/components/chat/thinking-animation";

type ChatMessageListProps = {
    isLoadingMessages: boolean;
    isSendingCurrent: boolean;
    messages: ChatMessage[];
};

function ChatCars({ message }: { message: ChatMessage }) {
    if (!message.cars || message.cars.length === 0) {
        return null;
    }

    return (
        <div className="mt-3 grid gap-3">
            {message.cars.map((car) => (
                <div
                    key={car.id}
                    className="flex h-full flex-col justify-between rounded-2xl border-2 border-[#8A6B3C] bg-white p-4 shadow-sm"
                >
                    <div className="relative">
                        <img
                            src={car.image_url}
                            alt={car.title}
                            className="h-56 w-full rounded-xl border border-[#A68A56] object-cover"
                        />
                        <a
                            href={car.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="absolute bottom-2 right-2 rounded-md border border-[#8A6B3C] bg-white px-2 py-1 text-xs text-[#af7f36] hover:underline"
                        >
                            Ver anuncio
                        </a>
                    </div>

                    <div className="mt-3">
                        <h3 className="text-xl font-bold text-gray-800">{car.title}</h3>
                        <div className="mt-2 flex flex-col gap-1 text-sm text-gray-600">
                            <p><span className="font-semibold">Ano:</span> {car.year}</p>
                            <p><span className="font-semibold">Km:</span> {car.mileage} km</p>
                            <p><span className="font-semibold">Comb:</span> {car.fuel}</p>
                        </div>
                    </div>

                    <div className="mt-3 text-right">
                        <span className="text-2xl font-bold text-[#af7f36]">{car.price} EUR</span>
                    </div>
                </div>
            ))}
        </div>
    );
}

export default function ChatMessageList({
    isLoadingMessages,
    isSendingCurrent,
    messages,
}: ChatMessageListProps) {
    if (isLoadingMessages) {
        return (
            <div className="mt-16 flex justify-center">
                <p className="text-sm text-gray-400">A carregar mensagens...</p>
            </div>
        );
    }

    return (
        <>
            {messages.map((message) => (
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
                        <ChatCars message={message} />
                    </div>
                </div>
            ))}

            {isSendingCurrent && (
                <div className="flex justify-start">
                    <div className="h-30 w-30">
                        <ThinkingAnimation />
                    </div>
                </div>
            )}
        </>
    );
}
