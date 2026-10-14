export type ConversationState = {
  handoffAt?: number;
  pendingHandoff?: boolean;
  city?: string;
  product?: string;
};

export function extractFactsSmart(text: string): { name: string; city: string; uf: string; product: string };
export function isReadyForHandoff(conversation: ConversationState, text: string): boolean;
export function missingQuestions(conversation: ConversationState): string[];
export function requestedPietra(text: string): boolean;
export function wantsHumanSmart(text: string): boolean;
export function wantsPortfolio(text: string): boolean;
