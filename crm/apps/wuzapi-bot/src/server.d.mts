export type ConversationState = {
  handoffAt?: number;
  pendingHandoff?: boolean;
  purchaseIntent?: boolean;
  commercialHandoffRequested?: boolean;
  awaitingField?: string;
  name?: string;
  city?: string;
  uf?: string;
  product?: string;
  messages?: Array<{ from: string; text: string; at?: string }>;
};

export function appendCrmCaseLink(message: string, baseUrl: string, caseId: string): string;
export function calculateReplyDelayMs(
  text: string,
  randomValue?: number,
  options?: { minimum?: number; maximum?: number; perCharacter?: number; jitter?: number }
): number;
export function commercialQualificationReply(conversation: ConversationState): string;
export function conversationalPunctuation(value: string): string;
export function enforceCommercialBoundaries(reply: string, conversation: ConversationState): string;
export function extractFactsSmart(text: string): { name: string; city: string; uf: string; product: string };
export function greetingReply(text: string): string;
export function handoffSummary(conversation: ConversationState): string;
export function hasQualificationDetail(conversation: ConversationState): boolean;
export function isReadyForHandoff(conversation: ConversationState, text: string): boolean;
export function missingQuestions(conversation: ConversationState): string[];
export function purchaseInterestReply(conversation: ConversationState): string;
export function qualificationReply(conversation: ConversationState): string;
export function requestedPietra(text: string): boolean;
export function resolveNamedOperator(text: string, sellers?: Array<Record<string, unknown>>): { name: string; phone: string; userId: string | null } | null;
export function wantsHumanSmart(text: string): boolean;
export function wantsPortfolio(text: string): boolean;
export function wantsPurchase(text: string): boolean;
export function wantsQuote(text: string): boolean;
