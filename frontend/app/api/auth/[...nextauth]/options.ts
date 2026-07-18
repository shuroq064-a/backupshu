import { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import FacebookProvider from "next-auth/providers/facebook";
import AppleProvider from "next-auth/providers/apple";
import { API_BASE_URL } from "@/lib/config";

interface AuthCallbackUser {
  email?: string | null;
  name?: string | null;
  image?: string | null;
  backendId?: string;
  backendToken?: string;
}

interface AuthCallbackAccount {
  provider: string;
  providerAccountId?: string;
}

const BASE_URL = API_BASE_URL;
const nextAuthSecret = process.env.NEXTAUTH_SECRET;

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
    FacebookProvider({
      clientId: process.env.FACEBOOK_CLIENT_ID!,
      clientSecret: process.env.FACEBOOK_CLIENT_SECRET!,
    }),
    AppleProvider({
      clientId: process.env.APPLE_CLIENT_ID!,
      clientSecret: process.env.APPLE_CLIENT_SECRET!,
    }),
  ],

  callbacks: {
    async signIn({ user, account }: { user: AuthCallbackUser; account: AuthCallbackAccount | null }) {
      if (!account || !user.email) return false;
      try {
        const res = await fetch(`${BASE_URL}/users/oauth-login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: user.email,
            name: user.name ?? "",
            avatar: user.image ?? "",
            provider: account.provider,
            provider_id: account.providerAccountId,
          }),
        });
        if (!res.ok) return false;
        const data = await res.json();
        user.backendId = data.id;
        user.backendToken = data.access_token || data.token || "";
        return true;
      } catch {
        return false;
      }
    },

    async jwt({ token, user }: { token: Record<string, any>; user?: AuthCallbackUser }) {
      if (user) {
        token.backendId = user.backendId;
        token.backendToken = user.backendToken;
      }
      return token;
    },

    async session({ session, token }: { session: Record<string, any>; token: Record<string, any> }) {
      session.user = { ...(session.user || {}), id: token.backendId };
      session.backendToken = token.backendToken;
      return session;
    },
  },

  pages: {
    signIn: "/auth",
    error: "/auth",
  },

  secret: nextAuthSecret,
};
