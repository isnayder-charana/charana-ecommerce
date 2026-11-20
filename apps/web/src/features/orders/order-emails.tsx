'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useAuth } from '@/features/auth/auth-provider';
import type { SessionUser } from '@/features/auth/session';
import { expectedEmails, formatDate, MAX_EMAIL_CHECKS, type Order } from './order';
import { orderEmailsQuery } from './orders.queries';

/**
 * "Correos de este pedido": lo que la tienda le escribió al cliente.
 *
 * Amazon SES está en sandbox y solo envía a correos verificados. Un reclutador
 * que compra con su correo no recibe nada, así que aquí ve "el correo que te
 * habríamos enviado", con el mismo texto que se envía de verdad.
 */
export function OrderEmails({ user, order }: { user: SessionUser; order: Order }) {
  const { getAccessToken } = useAuth();
  const expected = expectedEmails(order);
  const { data: emails = [] } = useQuery({
    ...orderEmailsQuery(user.id, order.id, expected, getAccessToken),
    // Si el pedido no cambió de estado, no hay correo nuevo que pedir.
    enabled: expected > 0,
    // Al cambiar de estado se pide la lista nueva sin borrar la que ya se ve.
    placeholderData: keepPreviousData,
    // El worker escribe el correo unos segundos después del cambio de estado:
    // preguntamos hasta que llegue (con un límite, por si el pedido no tiene correo).
    refetchInterval: (q) =>
      (q.state.data?.length ?? 0) < expected && q.state.dataUpdateCount < MAX_EMAIL_CHECKS
        ? 5000
        : false,
  });

  if (emails.length === 0) return null;
  const anySkipped = emails.some((email) => !email.delivered);

  return (
    <section
      aria-labelledby="titulo-correos"
      className="flex flex-col gap-3 rounded-card bg-surface p-4 sm:p-6"
    >
      <h2 id="titulo-correos" className="font-bold">
        Correos de este pedido
      </h2>
      {anySkipped && (
        <p className="text-sm text-muted">
          Esta tienda es una demo: Amazon SES solo envía a correos verificados. Aquí ves el correo
          que te habríamos enviado.
        </p>
      )}
      <ul className="flex flex-col gap-2">
        {emails.map((email) => (
          <li key={`${email.occurredAt}-${email.subject}`}>
            <details className="group rounded-control border border-line">
              <summary className="flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
                <span className="font-semibold">{email.subject}</span>
                <span className="rounded-control bg-sunken px-2 py-0.5 text-xs font-semibold">
                  {email.delivered ? 'Enviado a tu correo' : 'No enviado (demo)'}
                </span>
                <span className="text-xs text-muted sm:ml-auto">
                  {formatDate(email.occurredAt)}
                </span>
              </summary>
              <pre className="whitespace-pre-wrap break-words border-t border-line px-3 py-3 font-sans text-sm">
                {email.text}
              </pre>
            </details>
          </li>
        ))}
      </ul>
    </section>
  );
}
