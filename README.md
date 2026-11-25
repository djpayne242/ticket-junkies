# 🎟️ TicketJunkies.com

An Eventbrite-style ticketing website for **DJ Payne / Dj Payne Events** in Nassau, Bahamas. People discover events and buy tickets; organizers create events and sell tickets; you run everything from the Admin Panel.

This repository has **two versions of the same website**:

| Folder | What it is | Use it for |
|---|---|---|
| [`wordpress-plugin/ticketjunkies`](wordpress-plugin/ticketjunkies) | The **WordPress + Elementor** version (a plugin) | Running TicketJunkies on your WordPress site |
| [`dist/ticketjunkies-wordpress-plugin.zip`](dist/ticketjunkies-wordpress-plugin.zip) | The same plugin, ready to upload | **Plugins → Add New → Upload Plugin** in WordPress |
| [`html-snippets`](html-snippets) | Copy-and-paste HTML and shortcodes for every piece of the site | Elementor *HTML* widgets or WordPress *Custom HTML* blocks |
| [`node-site`](node-site) | The original stand-alone website (Node.js) | Hosting without WordPress (Render, Railway, a VPS…) |
| [`tools`](tools) | Build scripts that turn the Node site's pages into the plugin | Developers only |

## Put it on WordPress (the short version)
1. Install the free **Elementor** plugin and the **Hello Elementor** theme.
2. Download [`dist/ticketjunkies-wordpress-plugin.zip`](dist/ticketjunkies-wordpress-plugin.zip). In WordPress, go to **Plugins → Add New → Upload Plugin**, choose the zip, and click **Activate**.
3. Open **🎟️ TicketJunkies → Start here**. All pages (Home, Event, Checkout, dashboards, Admin Panel, Log in, Create account) are created for you as Elementor pages.
4. Set **Settings → Reading → Homepage** to *Home*, **Settings → Permalinks** to *Post name*, and **Settings → General → Timezone** to *Nassau*.

Step-by-step guide: [`WORDPRESS-INSTALL.md`](WORDPRESS-INSTALL.md)

## Features
- Events with flyers, several organizers, several venues, maps and weather
- Shows 1, 2 or 3 times a day (Morning, Midday, Evening), on one day, several days, or any mix of days and times. Each show has its own tickets
- Ticket types (public or private), free tickets, complimentary tickets, fees of 3.5% + $0.99
- Account required at checkout. QR-code tickets by email and text, PDF ticket downloads, resend tickets
- Attendee dashboard, organizer dashboard with check-in, and an Admin Panel (users, organizers, venues, events, orders, reports, emails and texts, sandbox, settings)
- Reports with PDF, Word, Excel and CSV downloads
- Light, dark and automatic themes; works on phones, tablets and computers
- **Fast:** compressed files, browser caching, lazy-loaded images, automatic flyer resizing, scripts that don't block the page
- **Social media ready:** link previews for Facebook, WhatsApp, Instagram, X, LinkedIn and iMessage, share buttons on every event, and Google "Event" rich results
- **Works in all modern browsers:** Chrome, Safari (Mac, iPhone, iPad), Firefox, Edge and Samsung Internet, with fallbacks for older Safari

## Privacy
Customer accounts, orders and uploaded images are **not** stored in this repository (see `.gitignore`). Full card numbers are never stored anywhere.

## Run the stand-alone version
```
cd node-site
node server.mjs 4321
```
Then open http://localhost:4321. It needs Node.js 20 or newer, with no extra packages.
