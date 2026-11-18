import { Amplify } from 'aws-amplify';
import { fetchAuthSession, signOut } from 'aws-amplify/auth';
import { Hub } from 'aws-amplify/utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cognitoAuth, configureAmplify } from './cognito-auth';

vi.mock('aws-amplify', () => ({ Amplify: { configure: vi.fn() } }));
vi.mock('aws-amplify/auth', () => ({ fetchAuthSession: vi.fn(), signOut: vi.fn() }));
vi.mock('aws-amplify/auth/enable-oauth-listener', () => ({}));
vi.mock('aws-amplify/utils', () => ({ Hub: { listen: vi.fn() } }));

/** Imita lo que devuelve fetchAuthSession con sesión iniciada. */
function session({ name, groups }: { name?: string; groups?: string[] } = {}) {
  return {
    tokens: {
      accessToken: {
        payload: { sub: 'user-1', 'cognito:groups': groups },
        toString: () => 'eyJ.access.token',
      },
      idToken: { payload: { email: 'ana@correo.com', name }, toString: () => 'eyJ.id.token' },
    },
  } as unknown as Awaited<ReturnType<typeof fetchAuthSession>>;
}

describe('cognitoAuth', () => {
  beforeEach(() => vi.clearAllMocks());

  // Va primero: el módulo recuerda que ya configuró Amplify.
  it('configura Amplify una sola vez, con código + PKCE y las URLs de la tienda', () => {
    configureAmplify();
    configureAmplify();
    expect(Amplify.configure).toHaveBeenCalledTimes(1);

    const config = vi.mocked(Amplify.configure).mock.calls[0]?.[0] as {
      Auth: { Cognito: { loginWith: { oauth: Record<string, unknown> } } };
    };
    expect(config.Auth.Cognito.loginWith.oauth).toMatchObject({
      responseType: 'code',
      redirectSignIn: ['http://localhost:3000/auth/callback'],
      redirectSignOut: ['http://localhost:3000'],
    });
  });

  it('arma el usuario con los datos del ID token y los grupos del access token', async () => {
    vi.mocked(fetchAuthSession).mockResolvedValue(
      session({ name: 'Ana María', groups: ['admin'] }),
    );
    expect(await cognitoAuth.currentUser()).toEqual({
      id: 'user-1',
      email: 'ana@correo.com',
      name: 'Ana María',
      isAdmin: true,
    });
    expect(await cognitoAuth.accessToken()).toBe('eyJ.access.token');
    expect(await cognitoAuth.idToken()).toBe('eyJ.id.token');
  });

  it('sin nombre usa el correo; sin grupos no es admin', async () => {
    vi.mocked(fetchAuthSession).mockResolvedValue(session());
    expect(await cognitoAuth.currentUser()).toMatchObject({
      name: 'ana@correo.com',
      isAdmin: false,
    });
  });

  it('sin sesión devuelve null', async () => {
    vi.mocked(fetchAuthSession).mockResolvedValue({ tokens: undefined } as never);
    expect(await cognitoAuth.currentUser()).toBeNull();
    expect(await cognitoAuth.accessToken()).toBeNull();
    expect(await cognitoAuth.idToken()).toBeNull();
  });

  it('cierra la sesión con Amplify', async () => {
    await cognitoAuth.signOut();
    expect(signOut).toHaveBeenCalled();
  });

  it('solo avisa con los eventos que cambian la sesión', () => {
    const onChange = vi.fn();
    cognitoAuth.subscribe(onChange);
    const listener = vi.mocked(Hub.listen).mock.calls[0]?.[1] as (data: {
      payload: { event: string };
    }) => void;

    listener({ payload: { event: 'signedIn' } });
    listener({ payload: { event: 'tokenRefresh' } });
    listener({ payload: { event: 'signedOut' } });
    expect(onChange).toHaveBeenCalledTimes(2);
  });
});
