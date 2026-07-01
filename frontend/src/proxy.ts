import { withAuth } from "next-auth/middleware";

export default withAuth({
  pages: {
    signIn: "/login",
  },
});

export const config = {
  // Protege todas las rutas excepto login, la API y archivos estáticos
  matcher: ["/((?!api/auth|_next/static|_next/image|favicon.ico|login).*)"],
};
