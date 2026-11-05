/** Thrown by every checkout path while PAID_CHECKOUT_ENABLED is off. The web shows it as a friendly notice. */
export const COMING_SOON = 'Paid features are coming soon. Free land, editing, chat and clans are open now.';

export class HttpError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export const badRequest = (message: string, details?: unknown) => new HttpError(400, 'bad_request', message, details);
export const unauthorized = (message = 'Sign in to continue') => new HttpError(401, 'unauthorized', message);
export const forbidden = (message = 'You do not have access to this') => new HttpError(403, 'forbidden', message);
export const notFound = (what = 'Resource') => new HttpError(404, 'not_found', `${what} not found`);
export const conflict = (message: string, details?: unknown) => new HttpError(409, 'conflict', message, details);
export const paymentRequired = (message: string) => new HttpError(402, 'payment_required', message);
export const tooMany = (message = 'Too many requests, slow down a little') => new HttpError(429, 'rate_limited', message);

export const comingSoon = (what = COMING_SOON) => new HttpError(403, 'coming_soon', what);
