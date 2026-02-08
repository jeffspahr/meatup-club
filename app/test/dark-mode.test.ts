import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Dark Mode System Tests
 *
 * These tests ensure the CSS variable-based dark mode system is properly configured.
 * For visual regression testing, use Playwright or similar browser-based testing.
 */
describe('Dark Mode CSS System', () => {

  describe('CSS Variables Configuration', () => {
    let cssContent: string;

    // Read the actual CSS file
    try {
      cssContent = readFileSync(join(__dirname, '../app/app.css'), 'utf-8');
    } catch (e) {
      cssContent = '';
    }

    it('should define CSS variables in :root', () => {
      expect(cssContent).toContain(':root {');
      expect(cssContent).toContain('--background:');
      expect(cssContent).toContain('--foreground:');
      expect(cssContent).toContain('--card:');
      expect(cssContent).toContain('--muted:');
      expect(cssContent).toContain('--muted-foreground:');
      expect(cssContent).toContain('--border:');
    });

    it('should have light mode media query (dark-first pattern)', () => {
      // The CSS uses dark-first: :root has dark colors, light media query overrides
      expect(cssContent).toContain('@media (prefers-color-scheme: light)');
    });

    it('should override background colors to use CSS variables', () => {
      expect(cssContent).toContain('.bg-white');
      expect(cssContent).toContain('.bg-gray-50');
      expect(cssContent).toContain('.bg-gray-100');
      expect(cssContent).toContain('.bg-gray-700');
      expect(cssContent).toContain('.bg-gray-800');
    });

    it('should override text colors to use CSS variables', () => {
      expect(cssContent).toContain('.text-gray-900');
      expect(cssContent).toContain('.text-gray-700');
      expect(cssContent).toContain('.text-gray-600');
      expect(cssContent).toContain('.text-gray-500');
      expect(cssContent).toContain('.text-gray-400');
      expect(cssContent).toContain('.text-gray-300');
      expect(cssContent).toContain('.text-gray-200');
      expect(cssContent).toContain('.text-gray-100');
    });

    it('should override border colors to use CSS variables', () => {
      expect(cssContent).toContain('.border-gray-200');
      expect(cssContent).toContain('.border-gray-300');
      expect(cssContent).toContain('.border-gray-600');
      expect(cssContent).toContain('.border-gray-700');
    });

    it('should use rgb(var(...)) pattern for colors', () => {
      // All overrides should use the CSS variable pattern
      expect(cssContent).toContain('rgb(var(--foreground))');
      expect(cssContent).toContain('rgb(var(--background))');
      expect(cssContent).toContain('rgb(var(--muted))');
      expect(cssContent).toContain('rgb(var(--border))');
    });

    it('should define dark colors in :root and light overrides in media query', () => {
      const lines = cssContent.split('\n');

      // Dark-first pattern: :root has dark colors
      // Verify :root defines the core variables (dark palette)
      const rootStart = lines.findIndex(line => line.includes(':root {'));
      expect(rootStart).toBeGreaterThan(-1);

      // Find the light mode media query
      const lightModeStart = lines.findIndex(line =>
        line.includes('@media (prefers-color-scheme: light)')
      );
      expect(lightModeStart).toBeGreaterThan(-1);

      // Find the closing brace of the light media query
      let braceCount = 0;
      let lightModeEnd = lightModeStart;
      for (let i = lightModeStart; i < lines.length; i++) {
        braceCount += (lines[i].match(/{/g) || []).length;
        braceCount -= (lines[i].match(/}/g) || []).length;
        if (braceCount === 0 && i > lightModeStart) {
          lightModeEnd = i;
          break;
        }
      }

      const lightModeSection = lines.slice(lightModeStart, lightModeEnd + 1).join('\n');

      // Light mode should redefine the variables
      expect(lightModeSection).toContain('--background:');
      expect(lightModeSection).toContain('--foreground:');
    });
  });

  describe('Contrast Ratios (Documented Values)', () => {
    /**
     * Calculate relative luminance for a color
     * Formula from WCAG 2.1 spec
     */
    function getLuminance(r: number, g: number, b: number): number {
      const [rs, gs, bs] = [r, g, b].map(c => {
        c = c / 255;
        return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
      });
      return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
    }

    /**
     * Calculate contrast ratio between two colors
     * WCAG 2.1 formula
     */
    function getContrastRatio(rgb1: [number, number, number], rgb2: [number, number, number]): number {
      const lum1 = getLuminance(...rgb1);
      const lum2 = getLuminance(...rgb2);
      const lighter = Math.max(lum1, lum2);
      const darker = Math.min(lum1, lum2);
      return (lighter + 0.05) / (darker + 0.05);
    }

    it('light mode: foreground on background meets WCAG AA (4.5:1)', () => {
      // Light mode: --foreground: 17 17 24, --background: 255 255 255
      const foreground: [number, number, number] = [17, 17, 24];
      const background: [number, number, number] = [255, 255, 255];

      const ratio = getContrastRatio(foreground, background);
      expect(ratio).toBeGreaterThanOrEqual(4.5);
    });

    it('light mode: muted-foreground on background meets WCAG AA for large text (3:1)', () => {
      // Light mode: --muted-foreground: 107 114 128, --background: 255 255 255
      const mutedForeground: [number, number, number] = [107, 114, 128];
      const background: [number, number, number] = [255, 255, 255];

      const ratio = getContrastRatio(mutedForeground, background);
      expect(ratio).toBeGreaterThanOrEqual(3.0);
    });

    it('dark mode: foreground on background meets WCAG AA (4.5:1)', () => {
      // Dark mode: --foreground: 229 231 235, --background: 10 10 15
      const foreground: [number, number, number] = [229, 231, 235];
      const background: [number, number, number] = [10, 10, 15];

      const ratio = getContrastRatio(foreground, background);
      expect(ratio).toBeGreaterThanOrEqual(4.5);
    });

    it('dark mode: muted-foreground on background meets WCAG AA for large text (3:1)', () => {
      // Dark mode: --muted-foreground: 140 143 155, --background: 10 10 15
      const mutedForeground: [number, number, number] = [140, 143, 155];
      const background: [number, number, number] = [10, 10, 15];

      const ratio = getContrastRatio(mutedForeground, background);
      expect(ratio).toBeGreaterThanOrEqual(3.0);
    });

    it('light mode: card foreground on card background meets WCAG AA', () => {
      // Light mode: --card-foreground: 17 17 24, --card: 249 250 251
      const cardForeground: [number, number, number] = [17, 17, 24];
      const card: [number, number, number] = [249, 250, 251];

      const ratio = getContrastRatio(cardForeground, card);
      expect(ratio).toBeGreaterThanOrEqual(4.5);
    });

    it('dark mode: card foreground on card background meets WCAG AA', () => {
      // Dark mode: --card-foreground: 229 231 235, --card: 17 17 24
      const cardForeground: [number, number, number] = [229, 231, 235];
      const card: [number, number, number] = [17, 17, 24];

      const ratio = getContrastRatio(cardForeground, card);
      expect(ratio).toBeGreaterThanOrEqual(4.5);
    });
  });

  describe('Component Best Practices', () => {
    it('DoodleView should use semantic color classes', () => {
      // Read the DoodleView component
      const doodleViewPath = join(__dirname, '../app/components/DoodleView.tsx');
      const content = readFileSync(doodleViewPath, 'utf-8');

      // Should use semantic color classes instead of hardcoded gray values
      expect(content).toContain('text-foreground');
      expect(content).toContain('bg-muted');
      expect(content).toContain('border-border');
      expect(content).toContain('text-muted-foreground');

      // Should NOT have manual dark: overrides for semantic gray/neutral colors
      // (Color-specific ones like blue/green are ok for specific highlights)
      const semanticDarkClasses = content.match(/dark:text-foreground|dark:bg-muted|dark:border-border/g) || [];

      // Semantic classes should not need dark: overrides since CSS variables handle it
      expect(semanticDarkClasses.length).toBe(0);

      // But color-specific dark: classes for highlights are allowed
      expect(content).toContain('dark:bg-blue-900/30');
      expect(content).toContain('dark:text-blue-400');
      expect(content).toContain('dark:bg-green-900/30');
      expect(content).toContain('dark:text-green-400');
    });
  });
});
