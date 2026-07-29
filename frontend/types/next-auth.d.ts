declare module "next-auth" {
  export interface User {
    id?: string;
    name?: string | null;
    email?: string | null;
    image?: string | null;
  }

  export interface Session {
    user?: User;
    expires: string;
  }

  export interface NextAuthOptions {
    providers: unknown[];
    callbacks?: Record<string, unknown>;
    pages?: Record<string, string>;
    secret?: string;
  }

  export default function NextAuth(options: NextAuthOptions): unknown;
}

declare module "next-auth/react" {
  export function SessionProvider(props: any): any;
  export function signIn(provider?: string, options?: Record<string, unknown>): Promise<unknown>;
  export function useSession(): { data: any; status: "loading" | "authenticated" | "unauthenticated" };
  export function getSession(): Promise<any>;
}

declare module "next-auth/providers/google" {
  const GoogleProvider: any;
  export default GoogleProvider;
}

declare module "next-auth/providers/facebook" {
  const FacebookProvider: any;
  export default FacebookProvider;
}

declare module "next-auth/providers/apple" {
  const AppleProvider: any;
  export default AppleProvider;
}
