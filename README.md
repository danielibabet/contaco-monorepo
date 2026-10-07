# ContaCo - Multi-Tenant Cloud Accounting Platform

<p align="center">
  <img src="https://img.shields.io/badge/Next.js_15-000000?style=for-the-badge&logo=nextdotjs&logoColor=white" alt="Next.js 15"/>
  <img src="https://img.shields.io/badge/React_19-61DAFB?style=for-the-badge&logo=react&logoColor=black" alt="React 19"/>
  <img src="https://img.shields.io/badge/Tailwind_CSS-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white" alt="Tailwind CSS"/>
  <img src="https://img.shields.io/badge/AWS_CDK-FF9900?style=for-the-badge&logo=amazon-aws&logoColor=white" alt="AWS CDK"/>
  <img src="https://img.shields.io/badge/AWS_Textract-232F3E?style=for-the-badge&logo=amazon-aws&logoColor=white" alt="AWS Textract"/>
  <img src="https://img.shields.io/badge/Deployed_on_Vercel-000000?style=for-the-badge&logo=vercel&logoColor=white" alt="Vercel"/>
</p>

<p align="center">
  <a href="https://contaco.vercel.app/">
    <img src="https://img.shields.io/badge/Live_Demo-contaco.vercel.app-000000?style=for-the-badge&logo=vercel&logoColor=white" alt="Live Demo"/>
  </a>
</p>

<p align="center">
  <a href="https://buymeacoffee.com/dibanezb">
    <img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy Me A Coffee" height="42" width="150" />
  </a>
</p>

ContaCo is a modern, enterprise-ready **multi-tenant financial and accounting management platform** designed to simplify invoice processing, ledger tracking, and multi-organization administration through AI-driven OCR automation and high-speed web interfaces.

> 🌐 **Live Application:** [contaco.vercel.app](https://contaco.vercel.app/)

---

## Monorepo Architecture

Managed with **npm workspaces**:

- **`/frontend`**: Web client built with **Next.js 15 (App Router)**, React 19, Tailwind CSS, and Lucide Icons. Secure authentication handled by NextAuth. Deployed live on **[Vercel](https://contaco.vercel.app/)**.
- **`/backend`**: Business logic, database interactions, and invoice data extraction engine leveraging **AWS Textract OCR**.
- **`/infrastructure`**: Infrastructure as Code (IaC) powered by **AWS CDK** for automated provisioning of cloud services.

---

## Key Features

- **Multi-Tenant Organization:** Isolate and manage accounts, balance sheets, and entries for distinct companies seamlessly.
- **Smart Invoice OCR:** Automated document scanning and parsing to minimize manual data entry.
- **Modern UI with Dark Mode:** Polished glassmorphism design, fluid animations, and high accessibility standards.
- **High-Speed Rendering:** Hybrid Server Components, streaming SSR, and edge image optimization.

---

## Local Setup

```bash
# 1. Install root & workspace dependencies
npm install

# 2. Run frontend development server
npm run dev --workspace=frontend

# 3. Build all workspaces
npm run build --workspaces
```

---

## Support & Author

- **Daniel Ibáñez** - [@danielibabet](https://github.com/danielibabet)
- If you find this project helpful, consider supporting: [![Buy Me A Coffee](https://img.shields.io/badge/Buy%20Me%20A%20Coffee-Donate-yellow.svg?style=flat&logo=buy-me-a-coffee)](https://buymeacoffee.com/dibanezb)
