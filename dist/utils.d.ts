export declare const toMilliunits: (decimal: number) => number;
export declare const fromMilliunits: (milliunits: number) => number;
export declare const normalizeDate: (dateStr: string) => string;
export declare const dateDiffDays: (a: string, b: string) => number;
export declare const subtractDays: (dateStr: string, days: number) => string;
export declare const formatYnabError: (e: unknown) => string;
export declare const currentMonthISO: () => string;
export declare const ok: (data: unknown) => {
    content: {
        type: "text";
        text: string;
    }[];
};
export declare const err: (message: string) => {
    content: {
        type: "text";
        text: string;
    }[];
    isError: boolean;
};
//# sourceMappingURL=utils.d.ts.map