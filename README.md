# CNJ Boxing / Kick Boxing / Muay Thai — Static Website

This is a fast, free-to-host static site for your gym.

## Edit the Content
- Open `index.html` and replace placeholder text (name, address, phone, emails, prices).
- Replace images in `/images` with your own photos (use same filenames or update `src` paths).
- Adjust colours in `styles.css` (see `:root` variables).

## Free Hosting Options
### Cloudflare Pages (free, very fast) — required for the contact form
1. Create a Cloudflare account and connect your GitHub repo.
2. Add a new **Pages** project, select the repo, and deploy with no build command.
3. Map a custom domain (optional) in Cloudflare DNS.
4. Add a `RESEND_API_KEY` environment variable in the Pages project settings so `functions/api/contact.js` can send the enquiry email via Resend.

### GitHub Pages (free)
1. Create a GitHub account (if needed).
2. Make a new repository (e.g., `iron-tiger-site`).
3. Upload all files (keep the same folder structure).
4. In **Settings → Pages**, set **Source** to **Deploy from a branch**, choose `main` and `/root`.
5. Your site will be live at `https://<your-username>.github.io/iron-tiger-site/`.
6. **Note:** GitHub Pages only serves static files — it can't run `functions/api/contact.js`, so the contact form won't send email here. Point the form elsewhere or accept it won't work on this host.

### Netlify / Vercel (free tiers)
- Drag-and-drop the folder to Netlify/Vercel dashboard, or connect via GitHub for auto-deploys.
- **Note:** the contact form's `/api/contact` endpoint is written as a Cloudflare Pages Function and won't run as-is on Netlify/Vercel — it would need to be rewritten in their function formats.

## Custom Domain (optional)
- Buy a domain (e.g., via Cloudflare Registrar or Namecheap).
- Point DNS to your chosen host (GitHub Pages or Cloudflare Pages docs explain exact records).
- Set your primary URL in host settings and add redirects if needed.

## Contact Form
- The form on the Contact section submits to `/api/contact`, a Cloudflare Pages Function (`functions/api/contact.js`) that sends the enquiry via the Resend email API.
- This only works when deployed on Cloudflare Pages with the `functions/` folder included and a `RESEND_API_KEY` environment variable set (see Hosting Options above).
- On hosts that can't run that function (GitHub Pages, plain Netlify/Vercel), swap in a hosted form service instead (e.g. Formspree, Netlify Forms) or rewrite the function for that platform.

## Analytics & SEO
- Add a Google Analytics tag (optional).
- Update `<meta name="description">` in `index.html`.
- Add `social-card.jpg` and Open Graph tags for rich link previews.

## Local Preview
Open `index.html` in your browser, or serve locally with Python:
```
python3 -m http.server 8080
```
Visit http://localhost:8080
