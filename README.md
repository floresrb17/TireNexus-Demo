# WGI POS Demo

Portfolio demonstration of **WGI POS** — a proprietary tire shop point-of-sale and inventory management system built for real-world shop operations.

> **Looking for TireNexus?** TireNexus is a cloud point-of-sale, inventory, quotation and customer-record system for tire shops, with Philippine peso pricing: **[www.tirenexus.co](https://www.tirenexus.co)**. This repository is a sanitized portfolio demo of the desktop edition (WGI POS), not the cloud product.

> **Important:** This repository is a sanitized demo for portfolio and evaluation purposes only. The full production application, business logic, integrations, and customer data are **not** publicly available.

## Project Overview

WGI POS streamlines daily tire shop workflows: sales, inventory, service tickets, customer records, receipts, and operational reporting. This demo showcases the user experience and core capabilities using **fictional sample data only**.

## Feature Highlights

- PIN and password-based login (Admin, Cashier, Mechanic roles)
- Dashboard with sales overview and active service queue
- Customer and vehicle record management
- Tire and service catalog with barcode lookup
- Checkout workflow for tires and shop services
- Service tickets, odometer capture, and active client tracking
- Receipt history and sales reporting (revenue-focused demo view)
- Price checker with barcode scanning support
- Mechanic-oriented simplified navigation

## Screenshots

| Dashboard | Checkout | Inventory |
| --- | --- | --- |
| _Add screenshot here_ | _Add screenshot here_ | _Add screenshot here_ |

| Active Clients | Sales Report | Price Checker |
| --- | --- | --- |
| _Add screenshot here_ | _Add screenshot here_ | _Add screenshot here_ |

## Technology Stack

- **Frontend:** React, TypeScript, Vite, Tailwind CSS
- **State/Data:** TanStack Query, OpenAPI-generated client
- **Demo API:** Node.js HTTP server with local JSON storage
- **Production (private):** Electron desktop app, proprietary local API, Windows installer pipeline

## Quick Start (Demo)

### Requirements

- Node.js 20+
- pnpm 9+

### Run locally

```powershell
cd WGI-POS-Demo
corepack enable
pnpm install

# Terminal 1 — demo API
node demo-api.cjs

# Terminal 2 — frontend
$env:VITE_DEMO_MODE = "1"
pnpm --filter @workspace/tireshop-pos run dev
```

Open `http://127.0.0.1:23865/`

### Demo credentials

| Role | Username | Password |
| --- | --- | --- |
| Admin | `admin` | `demo1234` |
| Cashier | `cashier` | `demo1234` |
| Mechanic | `mechanic` | `demo1234` |

## Demo Limitations

This public build intentionally excludes:

- Proprietary pricing, margin, and profit algorithms
- BIR/tax compliance, Z-reading, and fiscal invoice modules
- Cloud sync, Supabase integrations, and production updater
- Code signing, mechanic station installer, and desktop release pipeline
- Full data export/backup and user administration
- Real customer, supplier, or shop data

Financial margin views are hidden in demo mode. All records are resettable sample data.

## Future Roadmap (Production)

- Compiled distribution for Windows installers
- Planned tablet/mobile companion experiences
- Optional cloud price-checker sync (separate demo infrastructure)
- Hardened authentication and role-based API controls

## Contact

**Robert Flores**  
Portfolio / licensing inquiries: contact via GitHub profile [floresrb17](https://github.com/floresrb17)

## Legal Notice

WGI POS is a **proprietary commercial solution** developed for tire shop operations.

Copyright © Robert Flores. All rights reserved.

Unauthorized copying, modification, distribution, or commercial use of the production software is prohibited without written permission. This public repository is provided solely for demonstration and portfolio purposes.

See `LICENSE-DEMO.md` for demo repository terms.
