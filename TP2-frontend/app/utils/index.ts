export function getNextYear(currentYear?: number): number {
    const year = currentYear ?? new Date().getFullYear();
    return year + 1;
}

export function getCurrentYear(): number {
    return new Date().getFullYear();
}