import type { ChangeEvent } from "react";

type AuthFieldProps = {
    autoComplete: string;
    id: string;
    label: string;
    name: string;
    onChange: (event: ChangeEvent<HTMLInputElement>) => void;
    required?: boolean;
    type: string;
    value: string;
};

export default function AuthField({
    autoComplete,
    id,
    label,
    name,
    onChange,
    required = true,
    type,
    value,
}: AuthFieldProps) {
    return (
        <div>
            <div className="flex items-center justify-between">
                <label htmlFor={id} className="block text-sm/6 font-medium text-gray-500">
                    {label}
                </label>
            </div>

            <div className="mt-2">
                <input
                    id={id}
                    name={name}
                    type={type}
                    required={required}
                    autoComplete={autoComplete}
                    value={value}
                    onChange={onChange}
                    className="block w-full rounded-[80px] bg-white px-3 py-1.5 text-base text-gray-900 outline-1 -outline-offset-1 outline-gray-300 placeholder:text-gray-400 focus:outline-2 focus:-outline-offset-2 focus:outline-[#A68A56] sm:text-sm/6"
                />
            </div>
        </div>
    );
}
