import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Privacidad',
  description: 'Qué datos guarda CharanaTech, para qué y cómo borrarlos.',
};

const REPO_ISSUES = 'https://github.com/isnayder-charana/charana-ecommerce/issues';

/**
 * Política de privacidad. Google la pide para publicar el inicio de sesión con
 * Google (pantalla de consentimiento en "Producción"), y es lo correcto en
 * cualquier tienda que guarde un correo.
 */
export default function PrivacyPage() {
  return (
    <article className="mx-auto flex max-w-2xl flex-col gap-5 rounded-card bg-surface px-5 py-8 sm:px-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold">Política de privacidad</h1>
        <p className="text-sm text-muted">Última actualización: 20 de noviembre de 2026</p>
      </header>

      <p>
        CharanaTech es una <strong>tienda de demostración</strong>, parte de un portafolio de
        desarrollo. No vende productos reales ni cobra dinero: los pagos usan el modo de prueba de
        Stripe.
      </p>

      <Section title="Qué datos guardamos">
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong>Tu cuenta</strong>: correo y nombre. Si entras con Google, guardamos solo tu
            correo y tu nombre (permisos <code>openid</code>, <code>email</code> y{' '}
            <code>profile</code>). Nunca vemos tu contraseña de Google.
          </li>
          <li>
            <strong>Tus pedidos</strong>: productos, montos, estados y los correos que la tienda te
            envía sobre ellos.
          </li>
          <li>
            <strong>Tu carrito</strong>: en una cookie de tu navegador, solo con los productos y
            cantidades.
          </li>
        </ul>
      </Section>

      <Section title="Para qué los usamos">
        <p>
          Solo para que la tienda funcione: iniciar tu sesión, mostrarte tus pedidos y avisarte por
          correo cuando cambian. No enviamos publicidad, no vendemos datos y no usamos herramientas
          de analítica ni de seguimiento.
        </p>
      </Section>

      <Section title="Quién más los procesa">
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong>Amazon Web Services</strong> (región de Ohio, EE. UU.): cuentas (Cognito),
            pedidos (DynamoDB) y correos (SES).
          </li>
          <li>
            <strong>Stripe</strong>: la página de pago. Los datos de la tarjeta los recibe Stripe,
            nunca esta tienda. Usa solo tarjetas de prueba, como <code>4242 4242 4242 4242</code>.
          </li>
          <li>
            <strong>Vercel</strong>: aloja la tienda web.
          </li>
          <li>
            <strong>Google</strong>: solo si eliges entrar con Google.
          </li>
        </ul>
      </Section>

      <Section title="Cuánto tiempo">
        <p>
          Los correos guardados de cada pedido se borran solos a los 90 días. La cuenta y los
          pedidos se guardan mientras exista este proyecto de demostración, o hasta que pidas
          borrarlos.
        </p>
      </Section>

      <Section title="Borrar tus datos">
        <p>
          Puedes pedir que borremos tu cuenta y tus pedidos{' '}
          <a href={REPO_ISSUES} className="font-semibold text-action hover:underline">
            abriendo un issue en el repositorio del proyecto
          </a>{' '}
          con el asunto «Borrar mis datos». No escribas tu correo en el issue: te contactaremos
          desde ahí para confirmarlo. Si entraste con Google, también puedes quitarle el acceso a
          CharanaTech desde tu cuenta de Google, en «Seguridad → Conexiones con terceros».
        </p>
      </Section>

      <Link href="/" className="text-sm font-semibold text-action hover:underline">
        Volver a la tienda
      </Link>
    </article>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-lg font-bold">{title}</h2>
      {children}
    </section>
  );
}
