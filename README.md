# LeadFlow — Local Business Lead Scraper & WhatsApp Outreach

LeadFlow is an edge-to-edge Next.js application that automates local business lead generation via Apify's Google Maps Scraper and enables semi-automated WhatsApp outreach paired with macOS Contacts (.vcf) synchronization.

Designed following strict visual design standards (flat dark architecture, Geist typography, Tailwind CSS, nested corner radius, and RFC 2426 vCard 3.0 export).

---

## Features

- **Apify Google Maps Lead Scraper**:
  - Dynamically runs the Google Maps scraper actor (`compass~google-maps-scraper` / `compass~crawler-google-places`) via the Apify API.
  - Automatically validates business titles and filters for verified 7–15 digit phone numbers.
  - Deduplicates incoming leads by normalized phone digits.

- **Dynamic macOS Contact Naming (`[Title] [Location] [Serial #]`)**:
  - Automatically extracts and title-cases the target city/location from the search query (e.g. `"cafes in hanumangarh"` → `"Hanumangarh"`).
  - Formats each lead's contact name sequentially (e.g., `Brew House Hanumangarh 1`, `Brew House Hanumangarh 2`, `Cafe Coffee Day Hanumangarh 3`).
  - Supports custom location overrides with one-click reset to auto-detected mode.

- **macOS Contacts (.vcf) Export**:
  - Exports RFC 2426 compliant vCard 3.0 (`.vcf`) files formatted specifically for Apple Contacts.
  - Double-clicking the file imports all contacts into macOS Contacts in seconds, preserving sender trust and preventing WhatsApp spam flags.

- **Semi-Automated WhatsApp Outreach**:
  - Customizable pitch template supporting dynamic `{cafe_name}` variable interpolation.
  - One-click **Open app and prefill** action per lead triggering the native macOS WhatsApp protocol:
    `whatsapp://send?phone={phone}&text={encodedMessage}`
  - Visual tracking of contacted / opened leads.

- **UI & Design System**:
  - Deep flat dark palette (`#000000`, `#181818`, `#1F1F1F`, `#272727`) with emerald accents.
  - Next.js `Geist` font family for typography and `Geist_Mono` for data/telephony.
  - Custom skeleton loading states and responsive table filtering.

---

## Tech Stack

- **Framework**: Next.js 16 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS v4
- **Icons**: Lucide React
- **Scraper**: Apify Google Maps Scraper Actor

---

## Getting Started

### 1. Clone & Install Dependencies
```bash
git clone https://github.com/Jashandeepsingh855/lead-scrapper-.git
cd lead-scrapper-
npm install
```

### 2. Configure Environment Variables
Copy `.env.local.example` to `.env.local` and add your Apify API Token:
```bash
cp .env.local.example .env.local
```

Inside `.env.local`:
```env
APIFY_API_TOKEN=your_apify_api_token_here
```

> Get your token at: [https://console.apify.com/account/integrations](https://console.apify.com/account/integrations)

### 3. Start the Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## Scripts

- `npm run dev` - Start local Turbopack development server
- `npm run build` - Build production Next.js application
- `npm run lint` - Run ESLint checks
- `npm run start` - Start production server

---

## License

MIT
