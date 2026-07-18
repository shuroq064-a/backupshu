import NextAuth from "next-auth";
import { authOptions } from "./options";

const handler = NextAuth(authOptions) as any;

export { handler as GET, handler as POST };