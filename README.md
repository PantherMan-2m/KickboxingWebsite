# Iron Tiger Kickboxing — Static Website

This is a fast, free-to-host static site for your gym.

## Edit the Content
- Open `index.html` and replace placeholder text (name, address, phone, emails, prices).
- Replace images in `/images` with your own photos (use same filenames or update `src` paths).
- Adjust colours in `styles.css` (see `:root` variables).

## Free Hosting Options
### GitHub Pages (free)
1. Create a GitHub account (if needed).
2. Make a new repository (e.g., `iron-tiger-site`).
3. Upload all files (keep the same folder structure).
4. In **Settings → Pages**, set **Source** to **Deploy from a branch**, choose `main` and `/root`.
5. Your site will be live at `https://<your-username>.github.io/iron-tiger-site/`.

### Cloudflare Pages (free, very fast)
1. Create a Cloudflare account and connect your GitHub repo.
2. Add a new **Pages** project, select the repo, and deploy with no build command.
3. Map a custom domain (optional) in Cloudflare DNS.

### Netlify / Vercel (free tiers)
- Drag-and-drop the folder to Netlify/Vercel dashboard, or connect via GitHub for auto-deploys.

## Custom Domain (optional)
- Buy a domain (e.g., via Cloudflare Registrar or Namecheap).
- Point DNS to your chosen host (GitHub Pages or Cloudflare Pages docs explain exact records).
- Set your primary URL in host settings and add redirects if needed.

## Contact Form Options
- Static `mailto:` is included for simplicity.
- For real form delivery without a backend, add a free form service (e.g., Netlify Forms, Formspree) later.

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
