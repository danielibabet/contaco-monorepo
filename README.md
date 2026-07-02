# ContaCo Monorepo

¡Bienvenido al repositorio oficial de **ContaCo**!

ContaCo es una plataforma moderna y completa para la gestión contable, diseñada para simplificar la administración financiera de múltiples empresas (multi-tenant) con una interfaz limpia, rápida y preparada para el futuro.

## Estructura del Proyecto

Este repositorio utiliza una arquitectura de monorepo gestionada por **npm workspaces**. Contiene los siguientes módulos principales:

- **`/frontend`**: Aplicación web desarrollada con **Next.js 15**, React, Tailwind CSS y Lucide Icons. Autenticación gestionada mediante NextAuth. Desplegado y optimizado para funcionar en **Vercel**.
- **`/backend`**: (Próximamente/En migración) Lógica de negocio y procesamiento de datos, incluyendo la extracción mediante OCR (AWS Textract) y la conexión a las bases de datos.
- **`/infrastructure`**: (Opcional/AWS CDK) Infraestructura como código para desplegar servicios auxiliares en la nube de AWS.

## Características Principales

- 🎨 **Diseño Moderno y Premium**: Interfaz fluida y responsive, soporte para **Modo Oscuro**, microinteracciones y componentes UI consistentes.
- 🏢 **Arquitectura Multi-Empresa**: Capacidad para gestionar las finanzas de múltiples organizaciones de forma aislada.
- 🔐 **Autenticación Segura**: Integración completa con NextAuth.
- 📄 **Visor y Procesador de Documentos**: Interfaz para visualizar facturas y automatizar su procesamiento contable mediante OCR.
- ⚡ **Rendimiento Máximo**: Renderizado híbrido con Next.js (App Router), Server Components y optimización avanzada de imágenes.

## Entorno de Desarrollo Local

Para arrancar el proyecto en tu entorno local:

1. **Instalar dependencias globales**:
   En la raíz del proyecto, ejecuta:
   ```bash
   npm install
   ```

2. **Variables de entorno**:
   Asegúrate de configurar el archivo `.env.local` en la carpeta `/frontend` con tus credenciales de base de datos (`POSTGRES_URL`) y autenticación (`NEXTAUTH_SECRET`, `NEXTAUTH_URL`).

3. **Arrancar el Servidor de Desarrollo**:
   Para iniciar el frontend:
   ```bash
   npm run dev --workspace=frontend
   ```
   Abre [http://localhost:3000](http://localhost:3000) en tu navegador para ver la aplicación en funcionamiento.

## Despliegue

La plataforma (frontend) está configurada para integrarse y desplegarse automáticamente a través de **Vercel**. Cualquier push a la rama `main` iniciará una construcción de producción para el entorno en vivo.

---

**Desarrollado con ❤️ por el equipo de ContaCo.**
