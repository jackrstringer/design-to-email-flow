# Email Campaign Creator - Figma Plugin

Create email campaigns directly from Figma frames.

## Features

- Select a brand from your database
- Select a frame in Figma
- Add slice lines to divide the email
- Drag to exclude footer section
- AI-generated alt text and link suggestions
- Create campaign with one click
- Get a direct link to view the campaign

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Build the plugin:
   ```bash
   npm run build
   ```

3. Load in Figma:
   - Open Figma Desktop
   - Go to **Plugins → Development → Import plugin from manifest**
   - Select the `manifest.json` file from this folder

## Development

Watch mode for development:
```bash
npm run watch
```

## Usage

1. Open a Figma file with your email design
2. Select a frame containing your email design
3. Run the plugin: **Plugins → Email Campaign Creator**
4. Select your brand from the dropdown
5. Click "Continue to Slicing"
6. Click on the image to add slice lines where you want to divide sections
7. Drag the red footer handle to exclude the footer
8. Click "Process Slices"
9. Review and edit alt text/links for each slice
10. Enter a campaign name and click "Create Campaign"
11. Copy the campaign URL or click to view

## Project Structure

```
figma-plugin/
├── manifest.json       # Plugin configuration
├── package.json        # Dependencies
├── tsconfig.json       # TypeScript config
├── esbuild.config.js   # Build script
├── src/
│   ├── code.ts         # Figma sandbox code (selection, export)
│   ├── ui.tsx          # Main UI component
│   ├── api.ts          # API calls to Supabase
│   └── components/
│       ├── BrandSelector.tsx
│       ├── SliceEditor.tsx
│       ├── SliceResults.tsx
│       └── SuccessScreen.tsx
└── dist/               # Built output (generated)
```

## Configuration

Update `src/components/SuccessScreen.tsx` with your production app URL:
```typescript
const APP_URL = 'https://your-app.lovable.app';
```

Update `src/api.ts` with your Supabase credentials if they change.
