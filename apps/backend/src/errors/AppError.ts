export abstract class AppError extends Error {
  abstract readonly statusCode: number;
  abstract readonly code: string;

  constructor(
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = this.constructor.name;
  }
}

export class ValidationError extends AppError {
  readonly statusCode = 400;
  readonly code = "VALIDATION_ERROR";
}

export class NotFoundError extends AppError {
  readonly statusCode = 404;
  readonly code = "NOT_FOUND";
}

/**
 * El negocio existe pero su suscripción está suspendida (mora) — docs/PANEL-OPERADOR.md §5.
 * 403 (no 404) en las superficies HTTP: la reserva/compra se corta con un aviso,
 * no se finge que el negocio no existe. Reversible al instante cambiando `status`.
 */
export class BusinessSuspendedError extends AppError {
  readonly statusCode = 403;
  readonly code = "BUSINESS_SUSPENDED";
}

export class PaymentError extends AppError {
  readonly statusCode = 402;
  readonly code = "PAYMENT_ERROR";
}

export class AvailabilityError extends AppError {
  readonly statusCode = 409;
  readonly code = "AVAILABILITY_ERROR";
}

export class WebhookVerificationError extends AppError {
  readonly statusCode = 401;
  readonly code = "WEBHOOK_VERIFICATION_ERROR";
}

export class GiftCardAlreadyRedeemedError extends AppError {
  readonly statusCode = 409;
  readonly code = "GIFT_CARD_ALREADY_REDEEMED";
}

export class UnauthorizedError extends AppError {
  readonly statusCode = 401;
  readonly code = "UNAUTHORIZED";
}
