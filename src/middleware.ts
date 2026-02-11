import NextAuth from "next-auth";

/**
 * Minimal NextAuth config for Edge middleware only. Do NOT import @/lib/auth here:
 * that module pulls in Prisma and the pg adapter, which cannot run in the Edge runtime.
 * Session is JWT, so we only need to verify the cookie—no DB or credentials in Edge.
 */
const { auth } = NextAuth({
  providers: [],
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  callbacks: {
    async jwt({ token, user }) {
      if (user) token.id = user.id;
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.id) {
        session.user.id = token.id as string;
      }
      return session;
    },
  },
});

export { auth as middleware };
export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|login|register).*)",
  ],
};
