export type PersonalizedCustomerMessageInput = {
  customerName?: string | null;
  responsibleName?: string | null;
  publicProtocol?: string | null;
};

export function personalizedCustomerMessage(input?: PersonalizedCustomerMessageInput): string;
export function handoffLink(
  targetE164: string,
  publicProtocol: string,
  messageOrContext?: string | PersonalizedCustomerMessageInput
): string;
