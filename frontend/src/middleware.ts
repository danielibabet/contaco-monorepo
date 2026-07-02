import { withAuth } from "next-auth/middleware";

export default withAuth({
  pages: {
    signIn: "/login",
  },
});

export const config = {
  matcher: ["/((?!login|register|forgot-password|reset-password|verify|api|_next/static|_next/image|assets|logo.*|favicon.ico).*)"],
};
