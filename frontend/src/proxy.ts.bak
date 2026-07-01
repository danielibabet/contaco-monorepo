import { withAuth } from "next-auth/middleware"

export default withAuth({
  // Se requiere NextAuth secret, se leerá de NEXTAUTH_SECRET en .env.local
})

export const config = {
  // Protege todas las rutas excepto la API y archivos estáticos
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
}
