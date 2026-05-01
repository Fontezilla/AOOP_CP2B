export type Car = {
    id: string | number;
    title: string;
    price: number;
    year: number;
    mileage: number;
    fuel: string;
    image_url: string;
    url: string;
    brand?: string | null;
    model?: string | null;
    month?: string | null;
    transmission?: string | null;
    cilindrada?: string | null;
    power_cv?: number | null;
    color?: string | null;
    doors?: number | null;
    seats?: number | null;
    traction?: string | null;
    section?: string | null;
    vehicle_type?: string | null;
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
