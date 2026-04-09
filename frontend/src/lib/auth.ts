import { Amplify } from 'aws-amplify';
import {
  signIn as amplifySignIn,
  signUp as amplifySignUp,
  signOut as amplifySignOut,
  fetchAuthSession,
  confirmSignUp as amplifyConfirmSignUp,
} from '@aws-amplify/auth';

// Configure Amplify once — called from the root layout
export function configureAmplify() {
  Amplify.configure({
    Auth: {
      Cognito: {
        userPoolId:       process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID!,
        userPoolClientId: process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID!,
      },
    },
  });
}

export async function signUp(email: string, password: string, orgName: string) {
  return amplifySignUp({
    username: email,
    password,
    options: {
      userAttributes: {
        email,
        'custom:orgName': orgName,
      },
    },
  });
}

export async function confirmSignUp(email: string, code: string) {
  return amplifyConfirmSignUp({ username: email, confirmationCode: code });
}

export async function signIn(email: string, password: string) {
  return amplifySignIn({ username: email, password });
}

export async function signOut() {
  return amplifySignOut();
}

/** Returns the current access token, or null if not signed in. */
export async function getAccessToken(): Promise<string | null> {
  try {
    const session = await fetchAuthSession();
    return session.tokens?.accessToken?.toString() ?? null;
  } catch {
    return null;
  }
}
