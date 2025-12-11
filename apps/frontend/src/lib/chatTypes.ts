export type Role = 'user' | 'assistant';

export type Message = {
    id: string;
    role: Role;
    content: string;
    sources?: any[];
};

export type SessionSummary = {
    id: string;
    title: string;
};
