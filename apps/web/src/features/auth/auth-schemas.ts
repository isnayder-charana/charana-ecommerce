import { z } from 'zod';

const email = z.string().trim().toLowerCase().pipe(z.email('Escribe un correo válido.'));

/** La misma política que el User Pool (infra/terraform/cognito.tf). */
const newPassword = z
  .string()
  .min(8, 'Mínimo 8 caracteres.')
  .regex(/[a-z]/, 'Incluye al menos una minúscula.')
  .regex(/[A-Z]/, 'Incluye al menos una mayúscula.')
  .regex(/\d/, 'Incluye al menos un número.');

export const signInSchema = z.object({
  email,
  password: z.string().min(1, 'Escribe tu contraseña.'),
});

export const signUpSchema = z.object({
  name: z.string().trim().min(1, 'Escribe tu nombre.').max(100, 'Máximo 100 caracteres.'),
  email,
  password: newPassword,
});

export const confirmSchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, 'El código tiene 6 números.'),
});

export type SignInValues = z.infer<typeof signInSchema>;
export type SignUpValues = z.infer<typeof signUpSchema>;
export type ConfirmValues = z.infer<typeof confirmSchema>;
