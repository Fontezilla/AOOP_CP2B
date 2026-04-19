export type Car = {
    id: string | number;
    title: string;
    price: number;
    year: number;
    mileage: number;
    fuel: string;
    image_url: string;
    url: string;
};

export type ChatMessage = {
    id: string | number;
    role: "user" | "assistant";
    content?: string;
    cars?: Car[];
};

export type ApiMessage = {
    id: string;
    role: "user" | "assistant";
    content: string;
};

export type StoredAssistantPayload = {
    text?: string;
    cars?: Car[];
};
