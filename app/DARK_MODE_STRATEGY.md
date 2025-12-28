# Dark Mode Strategy - Systemic Solution

## Problem
Pages use explicit `dark:` prefixes everywhere (e.g., `text-gray-600 dark:text-gray-400`), which:
- Creates maintenance burden
- Leads to inconsistent contrast
- Doesn't scale across the app
- Easy to miss cases or make mistakes

## Current System (Already in Place!)
We have CSS variables in `app.css` that automatically handle dark mode:

```css
:root {
  --foreground: gray-900 (light) → gray-100 (dark)
  --muted-foreground: gray-500 (light) → gray-400 (dark)
  --card: white (light) → gray-800 (dark)
  --border: gray-200 (light) → gray-700 (dark)
}
```

The `@layer base` overrides make standard Tailwind classes automatically dark-mode aware.

## The Fix: Use Semantic Classes

### ❌ Old Way (Manual dark: everywhere)
```tsx
<div className="bg-white dark:bg-gray-800">
  <h1 className="text-gray-900 dark:text-gray-100">Title</h1>
  <p className="text-gray-600 dark:text-gray-400">Text</p>
</div>
```

### ✅ New Way (Semantic, auto dark mode)
```tsx
<div className="bg-card">
  <h1 className="text-foreground">Title</h1>
  <p className="text-muted-foreground">Text</p>
</div>
```

## Semantic Class Reference

| Use Case | Class | Light | Dark |
|----------|-------|-------|------|
| Page background | `bg-background` | gray-50 | gray-900 |
| Card/panel background | `bg-card` | white | gray-800 |
| Primary text | `text-foreground` | gray-900 | gray-100 |
| Secondary text | `text-muted-foreground` | gray-500 | gray-400 |
| Muted background | `bg-muted` | gray-100 | gray-700 |
| Borders | `border-border` | gray-200 | gray-700 |

## Auto-Converted Classes (via @layer base)

These work automatically without `dark:` prefix:
- `bg-white` → auto switches to card color
- `bg-gray-50/100` → auto switches to muted
- `text-gray-900/800/700` → auto switches to foreground
- `text-gray-600/500` → auto switches to muted-foreground
- `border-gray-200/300` → auto switches to border

## Migration Strategy

1. **Remove all `dark:` classes** - They override the base layer
2. **Use semantic classes** first (bg-card, text-foreground, etc.)
3. **Use auto-converted gray classes** as fallback (text-gray-900, bg-white, etc.)
4. **Never use both modes** - Don't do `text-gray-500 dark:text-gray-500` (this is a bug!)

## Contrast Requirements (WCAG AA)

- Normal text: 4.5:1 minimum
- Large text (18pt+): 3:1 minimum
- Interactive elements: 3:1 minimum

Our semantic colors meet these requirements in both modes.

## Implementation Checklist

- [ ] Update dashboard.polls.tsx
- [ ] Update other dashboard routes
- [ ] Update components
- [ ] Document pattern for new code
- [ ] Remove all `dark:text-gray-500` bugs (same color in both modes)
