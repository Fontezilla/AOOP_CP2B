type ChatEmptyStateProps = {
    isBrandVisible: boolean;
    typedBrand: string;
};

export default function ChatEmptyState({
    isBrandVisible,
    typedBrand,
}: ChatEmptyStateProps) {
    return (
        <div
            className={`flex items-center justify-center transition-all duration-700 ease-out ${isBrandVisible
                ? "translate-y-0 scale-100 opacity-100"
                : "translate-y-4 scale-95 opacity-0"
                }`}
        >
            <div className="flex items-center gap-4 rounded-full border border-[#D8C19A] bg-white/90 px-2 py-2 shadow-lg shadow-[#8C7343]/10 backdrop-blur sm:gap-6 sm:px-8">
                <img className="h-24 w-24 sm:h-28 sm:w-28" src="/logo.png" alt="AutoMatch logo" />
                <div className="flex items-center">
                    <span className="min-w-[6.5ch] text-3xl font-semibold tracking-[0.18em] text-[#8C7343] sm:text-5xl">
                        {typedBrand}
                    </span>
                </div>
            </div>
        </div>
    );
}
