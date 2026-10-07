# ContaCo - Multi-Tenant Cloud Accounting Platform

<p align="center">
  <img src="https://img.shields.io/badge/Next.js_15-000000?style=for-the-badge&logo=nextdotjs&logoColor=white" alt="Next.js 15"/>
  <img src="https://img.shields.io/badge/React_19-61DAFB?style=for-the-badge&logo=react&logoColor=black" alt="React 19"/>
  <img src="https://img.shields.io/badge/Tailwind_CSS-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white" alt="Tailwind CSS"/>
  <img src="https://img.shields.io/badge/AWS_CDK-FF9900?style=for-the-badge&logo=amazon-aws&logoColor=white" alt="AWS CDK"/>
  <img src="https://img.shields.io/badge/AWS_Textract-232F3E?style=for-the-badge&logo=amazon-aws&logoColor=white" alt="AWS Textract"/>
  <img src="https://img.shields.io/badge/NextAuth.js-blueviolet?style=for-the-badge&logo=auth0&logoColor=white" alt="NextAuth"/>
</p>

ContaCo is a modern, enterprise-ready **multi-tenant financial and accounting management platform** designed to simplify invoice processing, ledger tracking, and multi-organization administration through AI-driven OCR automation and high-speed web interfaces.

---

## Monorepo Architecture

This project is managed as an **npm workspaces monorepo**:

- **/frontend**: Web client built with **Next.js 15 (App Router)**, React 19, Tailwind CSS, and Lucide Icons. Secure session handling with NextAuth. Deployed and edge-optimized on Vercel.
- **/backend**: Business logic, database interactions, and invoice data extraction engine leveraging **AWS Textract OCR**.
- **/infrastructure**: Infrastructure as Code (IaC) powered by **AWS CDK** for automated provisioning of cloud services.

---

## Key Features

- 🏢 **Multi-Tenant Organization:** Isolate and manage accounts, balance sheets, and entries for distinct companies seamlessly.
- 📄 **Smart Invoice OCR:** Automated document scanning and parsing to minimize manual data entry.
- 🌙 **Modern UI with Dark Mode:** Polished glassmorphism design, fluid animations, and high accessibility standards.
- ⚡ **High-Speed Rendering:** Hybrid Server Components, streaming SSR, and edge image optimization.

---

## Local Setup

`ash
# 1. Install root & workspace dependencies
npm install

# 2. Run frontend development server
npm run dev --workspace=frontend

# 3. Build all workspaces
npm run build --workspaces
`

---

## Author

- **Daniel Ibáñez** - [@danielibabet](https://github.com/danielibabet)