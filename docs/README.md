# Meatup.Club Documentation

This folder contains feature documentation and a slideshow presentation for Meatup.Club.

## Contents

- `FEATURES.md` - Markdown feature guide with screenshot placeholders
- `slideshow.html` - Interactive HTML slideshow (open in browser)
- `screenshots/` - Screenshot images (add manually, see below)

## Viewing the Slideshow

Open `slideshow.html` in any modern browser. Navigate using:
- Arrow keys (left/right)
- Spacebar (next)
- Click Previous/Next buttons
- Click progress dots

## Adding Screenshots

The slideshow expects the following screenshots in the `screenshots/` folder:

| Filename | Description | PII Redaction |
|----------|-------------|---------------|
| `01-landing.png` | Landing page hero | None needed |
| `02-landing-features.png` | Landing page feature cards | None needed |
| `03-dashboard.png` | Dashboard home | Redact user name in welcome |
| `04-quick-actions.png` | Dashboard quick actions | None needed |
| `05-events.png` | Events list page | None needed |
| `06-restaurants.png` | Restaurants list | Redact "Suggested by [Name]" |
| `07-polls.png` | Polls page | None needed |
| `08-members.png` | Members directory | **Redact all names, emails, photos** |
| `09-profile.png` | Profile settings | Redact name, email |
| `10-admin.png` | Admin panel | None needed |

## PII Redaction Guide

### What to Redact

1. **Names** - Replace with "Member A", "Member B", etc.
2. **Email addresses** - Replace with `member@example.com`
3. **Phone numbers** - Replace with `(555) 555-0100`
4. **Profile photos** - Blur or replace with generic avatars

### Recommended Tools

- **macOS Preview** - Markup tools for basic redaction
- **Pixelmator** - More advanced image editing
- **ImageMagick** - Command-line bulk processing
- **Figma** - Design tool with easy shape overlays

### Redaction Colors

Use these colors for consistency:
- **Gray block**: `#6B7280` - For covering text
- **Avatar background**: `#E5E7EB` - For profile photos
- **Avatar text**: `#374151` - For initials

### Example ImageMagick Commands

```bash
# Add a gray rectangle to cover a name
convert input.png -fill '#6B7280' -draw 'rectangle 100,200 300,230' output.png

# Blur a region (for photos)
convert input.png -region 100x100+50+50 -blur 0x8 output.png
```

## Capturing New Screenshots

1. Navigate to https://meatup.club
2. Log in with a test account
3. Use browser screenshot tools or:
   - macOS: `Cmd + Shift + 4`
   - Chrome DevTools: `Cmd + Shift + P` → "Capture screenshot"
4. Recommended dimensions: 1400x800 or similar 16:9 ratio
5. Apply PII redaction before saving to `screenshots/`

## File Size Guidelines

- Optimize PNGs with tools like `pngquant` or `optipng`
- Target ~100-300KB per screenshot
- Use JPEG for photos if file size is critical

```bash
# Optimize PNG
pngquant --quality=80-90 screenshot.png

# Convert to optimized JPEG
convert screenshot.png -quality 85 screenshot.jpg
```
