import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID as string,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
    }),
  ],
  callbacks: {
    async signIn({ user }) {
      if (user.email && user.email.endsWith("@bici.cc")) {
        return true;
      } else {
        return false; // Reject sign-ins from other domains
      }
    },
    async session({ session }) {
      return session;
    },
  },
  pages: {
    signIn: '/login', // Custom login page
    error: '/login', // Error page (e.g., unauthorized domain)
  },
  session: {
    strategy: "jwt",
  },
};
