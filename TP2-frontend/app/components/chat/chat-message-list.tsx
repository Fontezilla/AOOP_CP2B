import { useEffect, useRef, useState } from "react";
import type { Car, ChatMessage } from "~/components/chat/types";
import ThinkingAnimation from "~/components/chat/thinking-animation";

type ChatMessageListProps = {
    isLoadingMessages: boolean;
    isSendingCurrent: boolean;
    messages: ChatMessage[];
};

const currencyFormatter = new Intl.NumberFormat("pt-PT", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
});

const numberFormatter = new Intl.NumberFormat("pt-PT");

function formatPrice(price?: number | null) {
    if (typeof price !== "number" || !Number.isFinite(price)) {
        return "Preço sob consulta";
    }

    return currencyFormatter.format(price);
}

function formatMileage(mileage?: number | null) {
    if (typeof mileage !== "number" || !Number.isFinite(mileage)) {
        return "n/d";
    }

    return `${numberFormatter.format(mileage)} km`;
}

// Otimizado: Sem Marca/Modelo (já estão no título) e limitado a 10 slots
function buildFeatures(car: Car) {
    const features = [
        { label: "Mês/Ano", value: car.month ? `${car.month}/${car.year}` : (car.year ? String(car.year) : null) },
        { label: "Km", value: formatMileage(car.mileage) },
        { label: "Combustível", value: car.fuel || null },
        { label: "Caixa", value: car.transmission || null },
        { label: "Potência", value: car.power_cv ? `${car.power_cv} cv` : null },
        { label: "Cilindrada", value: car.cilindrada || null },
        { label: "Cor", value: car.color || null },
        { label: "Portas", value: car.doors ? String(car.doors) : null },
        { label: "Lugares", value: car.seats ? String(car.seats) : null },
        { label: "Tração", value: car.traction || null },
    ].filter((item) => item.value);

    // Garante que nunca passa de 10 elementos para não quebrar o layout estático
    return features.slice(0, 10) as { label: string; value: string }[];
}

function ChatCars({ message }: { message: ChatMessage }) {
    const carouselRef = useRef<HTMLDivElement | null>(null);
    const [canScrollLeft, setCanScrollLeft] = useState(false);
    const [canScrollRight, setCanScrollRight] = useState(false);

    const updateArrows = () => {
        const node = carouselRef.current;
        if (!node) {
            setCanScrollLeft(false);
            setCanScrollRight(false);
            return;
        }

        const maxScrollLeft = node.scrollWidth - node.clientWidth;
        setCanScrollLeft(node.scrollLeft > 4);
        setCanScrollRight(node.scrollLeft < maxScrollLeft - 4);
    };

    const scrollByCards = (direction: "left" | "right") => {
        const node = carouselRef.current;
        if (!node) {
            return;
        }

        const amount = Math.max(node.clientWidth * 0.8, 260);
        node.scrollBy({
            left: direction === "right" ? amount : -amount,
            behavior: "smooth",
        });
    };

    useEffect(() => {
        updateArrows();

        const node = carouselRef.current;
        if (!node) {
            return;
        }

        const onScroll = () => updateArrows();
        node.addEventListener("scroll", onScroll);

        window.addEventListener("resize", updateArrows);

        return () => {
            node.removeEventListener("scroll", onScroll);
            window.removeEventListener("resize", updateArrows);
        };
    }, [message.cars]);

    if (!message.cars || message.cars.length === 0) {
        return null;
    }

    return (
        <div className="relative mt-3">
            {canScrollLeft && (
                <button
                    type="button"
                    onClick={() => scrollByCards("left")}
                    className="absolute left-2 top-1/2 z-10 -translate-y-1/2 rounded-full border border-[#8A6B3C] bg-white/90 px-3 py-2 text-lg font-bold text-[#8A6B3C] shadow-sm hover:bg-white"
                    aria-label="Ver carros anteriores"
                >
                    {"<"}
                </button>
            )}

            <div
                ref={carouselRef}
                className="flex gap-4 overflow-x-auto pb-4 pt-1 px-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
            >
                {message.cars.map((car) => (
                    <CarCard key={car.id} car={car} />
                ))}
            </div>

            {canScrollRight && (
                <button
                    type="button"
                    onClick={() => scrollByCards("right")}
                    className="absolute right-2 top-1/2 z-10 -translate-y-1/2 rounded-full border border-[#8A6B3C] bg-white/90 px-3 py-2 text-lg font-bold text-[#8A6B3C] shadow-sm hover:bg-white"
                    aria-label="Ver mais carros"
                >
                    {">"}
                </button>
            )}
        </div>
    );
}

function FeatureItem({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex min-w-0 flex-col rounded-lg border border-[#eadbc4] bg-[#fffaf3] px-2 py-1.5">
            <span className="truncate text-[9px] font-bold uppercase tracking-wider text-[#a18158]">{label}</span>
            <span className="mt-0.5 truncate text-xs font-semibold text-[#543b1c]">{value}</span>
        </div>
    );
}

function CarCard({ car }: { car: Car }) {
    const features = buildFeatures(car);

    return (
        < article className="relative flex h-150 w-100 shrink-0 flex-col overflow-hidden rounded-3xl border border-[#d7c2a0] bg-[#fdfbf7]  transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_12px_25px_rgba(97,67,27,0.12)]" >

            <div className="relative h-44 shrink-0">
                {car.image_url ? (
                    <img
                        src={car.image_url}
                        alt={car.title}
                        className="h-full w-full object-cover"
                    />
                ) : (
                    <div className="flex h-full w-full items-end bg-linear-to-br from-[#d8c1a0] via-[#b58b54] to-[#6a4721] p-4">
                        <p className="text-sm font-medium text-white/90">Imagem indisponível</p>
                    </div>
                )}

                <div className="absolute inset-x-0 bottom-0 h-16 bg-linear-to-t from-[#1d140c]/60 to-transparent" />
                <a
                    href={car.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="absolute bottom-3 right-3 z-10 rounded-full border border-[#b58b54] bg-[#fff8ef] px-3 py-1.5 text-[11px] font-semibold text-[#8b632d] shadow-sm transition-colors hover:bg-[#f7ead7]"
                >
                    Ver anúncio
                </a>
            </div>

            <div className="flex flex-1 flex-col px-4 pt-4 pb-4 overflow-hidden">
                <h3 className="line-clamp-2 mt-2 mb-2 shrink-0 text-[1.35rem] font-bold leading-tight tracking-tight text-[#24180d]">
                    {car.title}
                </h3>

                <div className="mt-4 grid grid-cols-2 gap-2 content-start">
                    {features.map((feature) => (
                        <FeatureItem key={`${car.id}-${feature.label}`} label={feature.label} value={feature.value} />
                    ))}
                </div>
            </div>

            <div className="shrink-0 border-t border-[#eadbc4]/60 bg-linear-to-b from-white to-[#fdfaf5] px-5 py-4 flex items-center justify-between mt-auto">
                <span className="text-xs font-bold uppercase tracking-wider text-[#a18158]">
                    Preço
                </span>
                <span className="text-xl font-black tracking-tight text-[#704f24]">
                    {formatPrice(car.price)}
                </span>
            </div>
        </article >
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
        <div className="flex flex-col gap-8">
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
        </div>
    );
}
